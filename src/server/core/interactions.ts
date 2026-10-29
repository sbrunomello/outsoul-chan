import { context, redis, reddit, scheduler, settings } from '@devvit/web/server';
import { RichTextBuilder } from '@devvit/reddit';
import type { OnCommentCreateRequest, OnPostCreateRequest } from '@devvit/web/shared';
import {
  defaultSettings,
  clampNumericSetting,
  decideInteraction,
  fallbackDecision,
  getInvocation,
  isAllowedCommunity,
  isHumanAccount,
  MAX_DIRECT_REPLIES_PER_USER_PER_DAY,
  MAX_SPONTANEOUS_REPLIES_PER_DAY,
  mayConsiderSpontaneousReply,
  withinDailyLimit,
  type ReactionDecision,
  type OutsoulSettings,
} from '../../shared/outsoul';
import { askGemini } from './gemini';
import { selectReaction } from './reactions';
import { PostPerceptionService, type PostImageCandidate } from './post-perception';
import { loadRedditPostContext, postImagesOrUrl } from './post-context';
import { formatConversationContext, loadConversationHistory } from './conversation';
import { readRecentReplies, rememberRecentReply } from './reply-memory';

const REPLY_MEMORY_SECONDS = 86_400;
const DEFERRED_REPLY_MAX_AGE_SECONDS = 86_400;
const DEFERRED_REPLY_RETENTION_SECONDS = DEFERRED_REPLY_MAX_AGE_SECONDS + 300;
const DEFERRED_REPLY_JOB = 'outsoul-deferred-direct-reply';

type InteractionEvent = {
  id: string;
  author: string;
  authorIsHuman: boolean;
  subreddit: string;
  postId: string;
  parentId: string;
  body: string;
  postText: string;
  kind: 'comment' | 'post';
  hasVisualMedia: boolean;
  imageCandidates: PostImageCandidate[];
  queuedAt?: number;
};

type DeferredReplyRecord = { queuedAt: number; event: InteractionEvent };

const authorQueueKey = (author: string): string =>
  `outsoul:pending-direct-author:${author.toLowerCase().replace(/[^a-z0-9_-]/gu, '').slice(0, 80)}`;

const deferredReplyKey = (eventId: string): string =>
  `outsoul:pending-direct-event:${eventId.replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 80)}`;

const parseDeferredReply = (raw: string): DeferredReplyRecord | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || !('queuedAt' in value) || typeof value.queuedAt !== 'number' ||
      !('event' in value) || typeof value.event !== 'object' || value.event === null) return undefined;
  const event = value.event;
  if (!('id' in event) || typeof event.id !== 'string' || !('author' in event) || typeof event.author !== 'string' ||
      !('authorIsHuman' in event) || typeof event.authorIsHuman !== 'boolean' || !('subreddit' in event) || typeof event.subreddit !== 'string' ||
      !('postId' in event) || typeof event.postId !== 'string' || !('parentId' in event) || typeof event.parentId !== 'string' ||
      !('body' in event) || typeof event.body !== 'string' || !('postText' in event) || typeof event.postText !== 'string' ||
      !('kind' in event) || (event.kind !== 'comment' && event.kind !== 'post') || !('hasVisualMedia' in event) || typeof event.hasVisualMedia !== 'boolean' ||
      !('imageCandidates' in event) || !Array.isArray(event.imageCandidates)) return undefined;
  const imageCandidates: PostImageCandidate[] = [];
  for (const candidate of event.imageCandidates) {
    if (typeof candidate !== 'object' || candidate === null || !('url' in candidate) || typeof candidate.url !== 'string') return undefined;
    imageCandidates.push({
      url: candidate.url,
      ...('width' in candidate && typeof candidate.width === 'number' ? { width: candidate.width } : {}),
      ...('height' in candidate && typeof candidate.height === 'number' ? { height: candidate.height } : {}),
    });
  }
  const queuedEventAt = 'queuedAt' in event && typeof event.queuedAt === 'number' ? event.queuedAt : undefined;
  return {
    queuedAt: value.queuedAt,
    event: {
      id: event.id,
      author: event.author,
      authorIsHuman: event.authorIsHuman,
      subreddit: event.subreddit,
      postId: event.postId,
      parentId: event.parentId,
      body: event.body,
      postText: event.postText,
      kind: event.kind,
      hasVisualMedia: event.hasVisualMedia,
      imageCandidates,
      ...(queuedEventAt !== undefined ? { queuedAt: queuedEventAt } : {}),
    },
  };
};

const readSettings = async (): Promise<OutsoulSettings> => {
  const [
    mode, enabled, directInvocations, spontaneousReplies, maxSpontaneousPerDay,
    maxDirectPerUserPerDay, userCooldownMinutes, reactionImages, imageFrequency,
    model, enableLlm, fallbackResponses, dryRun, allowedSubreddit,
  ] = await Promise.all([
    settings.get<string>('mode'), settings.get<boolean>('enabled'),
    settings.get<boolean>('directInvocations'), settings.get<boolean>('spontaneousReplies'),
    settings.get<number>('maxSpontaneousPerDay'), settings.get<number>('maxDirectPerUserPerDay'),
    settings.get<number>('userCooldownMinutes'), settings.get<boolean>('reactionImages'),
    settings.get<number>('imageFrequency'), settings.get<string>('model'),
    settings.get<boolean>('enableLlm'), settings.get<boolean>('fallbackResponses'),
    settings.get<boolean>('dryRun'), settings.get<string>('allowedSubreddit'),
  ]);
  return {
    mode: mode === 'OFF' || mode === 'SEMI_AUTONOMOUS' ? mode : 'INVOCATION_ONLY',
    enabled: enabled ?? defaultSettings.enabled,
    directInvocations: directInvocations ?? defaultSettings.directInvocations,
    spontaneousReplies: spontaneousReplies ?? defaultSettings.spontaneousReplies,
    maxSpontaneousPerDay: clampNumericSetting(maxSpontaneousPerDay, defaultSettings.maxSpontaneousPerDay, 0, MAX_SPONTANEOUS_REPLIES_PER_DAY),
    maxDirectPerUserPerDay: clampNumericSetting(maxDirectPerUserPerDay, defaultSettings.maxDirectPerUserPerDay, 0, MAX_DIRECT_REPLIES_PER_USER_PER_DAY),
    userCooldownMinutes: clampNumericSetting(userCooldownMinutes, defaultSettings.userCooldownMinutes, 0, 1440),
    reactionImages: reactionImages ?? defaultSettings.reactionImages,
    imageFrequency: clampNumericSetting(imageFrequency, defaultSettings.imageFrequency, 0, 100),
    model: model && model.length > 0 ? model : defaultSettings.model,
    enableLlm: enableLlm ?? defaultSettings.enableLlm,
    fallbackResponses: fallbackResponses ?? defaultSettings.fallbackResponses,
    dryRun: dryRun ?? defaultSettings.dryRun,
    allowedSubreddit: allowedSubreddit?.toLowerCase().replace(/^r\//, '') ?? '',
  };
};

const dayKey = (): string => new Date().toISOString().slice(0, 10);
const cooldownRemainingSeconds = async (author: string, cooldownSeconds: number): Promise<number> => {
  if (cooldownSeconds === 0) return 0;
  const savedAtValue = await redis.get(`outsoul:cooldown:${author.toLowerCase()}`);
  if (!savedAtValue) return 0;
  const savedAt = Number(savedAtValue);
  if (!Number.isFinite(savedAt) || savedAt <= 0) return cooldownSeconds;
  return Math.max(0, Math.ceil((savedAt + cooldownSeconds * 1000 - Date.now()) / 1000));
};

const saveCooldown = async (author: string, cooldownSeconds: number): Promise<void> => {
  if (cooldownSeconds > 0) {
    await redis.set(`outsoul:cooldown:${author.toLowerCase()}`, String(Date.now()), {
      expiration: new Date(Date.now() + cooldownSeconds * 1000),
    });
  }
};

const enqueueDeferredReply = async (event: InteractionEvent, remainingSeconds: number): Promise<void> => {
  const now = Date.now();
  const queuedAt = event.queuedAt ?? now;
  if (now - queuedAt > DEFERRED_REPLY_MAX_AGE_SECONDS * 1000) {
    console.info(JSON.stringify({ eventId: event.id, community: event.subreddit, decision: 'cooldown_queue_expired' }));
    return;
  }
  const eventId = event.id.replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 80);
  const markerKey = authorQueueKey(event.author);
  const recordKey = deferredReplyKey(eventId);
  const expiration = new Date(now + DEFERRED_REPLY_RETENTION_SECONDS * 1000);
  const queuedEvent: InteractionEvent = {
    ...event,
    body: event.body.slice(0, 5_000),
    postText: event.postText.slice(0, 5_000),
    imageCandidates: event.imageCandidates.slice(0, 4),
    queuedAt,
  };
  const marker = await redis.set(markerKey, eventId, { nx: true, expiration });
  if (marker !== 'OK') {
    console.info(JSON.stringify({ eventId, community: event.subreddit, decision: 'cooldown_queue_full' }));
    return;
  }
  try {
    await redis.set(recordKey, JSON.stringify({ queuedAt, event: queuedEvent } satisfies DeferredReplyRecord), { expiration });
    await scheduler.runJob({
      name: DEFERRED_REPLY_JOB,
      data: { eventId },
      runAt: new Date(now + Math.max(1, remainingSeconds) * 1_000),
    });
    console.info(JSON.stringify({ eventId, community: event.subreddit, decision: 'user_cooldown_queued', delaySeconds: remainingSeconds }));
  } catch (error) {
    await redis.del(markerKey);
    await redis.del(recordKey);
    console.error(JSON.stringify({ eventId, community: event.subreddit, decision: 'cooldown_queue_failed', error: error instanceof Error ? error.name : 'unknown' }));
  }
};

export const handleDeferredReply = async (eventId: string): Promise<void> => {
  const recordKey = deferredReplyKey(eventId);
  const raw = await redis.get(recordKey);
  const record = raw ? parseDeferredReply(raw) : undefined;
  if (!record) {
    console.info(JSON.stringify({ eventId, decision: 'cooldown_queue_missing' }));
    return;
  }
  const markerKey = authorQueueKey(record.event.author);
  if (await redis.get(markerKey) !== eventId) return;
  await redis.del(markerKey);
  await redis.del(recordKey);
  if (Date.now() - record.queuedAt > DEFERRED_REPLY_MAX_AGE_SECONDS * 1000) {
    console.info(JSON.stringify({ eventId, community: record.event.subreddit, decision: 'cooldown_queue_expired' }));
    return;
  }
  await handleEvent({ ...record.event, queuedAt: record.queuedAt });
};

const redditTid = (id: string): `t1_${string}` | `t3_${string}` =>
  id.startsWith('t1_') ? `t1_${id.slice(3)}` : `t3_${id.replace(/^t3_/, '')}`;

const loadPostContext = (postId: string) => loadRedditPostContext(postId, async (id) => {
  const post = await reddit.getPostById(id);
  return {
    title: post.title,
    body: post.body ?? '',
    images: postImagesOrUrl(
      post.gallery.map((image) => ({ url: image.url, width: image.width, height: image.height })),
      post.url,
    ),
  };
});

const loadThreadContext = (parentId: string) => loadConversationHistory(parentId, async (id) => {
  const comment = await reddit.getCommentById(id);
  return { authorName: comment.authorName, body: comment.body, parentId: comment.parentId };
});

const replyMemoryKey = (postId: string): string =>
  `outsoul:recent-replies:${postId.replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 80)}`;

const getRecentReplies = async (postId: string): Promise<string[]> => {
  try {
    return readRecentReplies(await redis.get(replyMemoryKey(postId)));
  } catch {
    return [];
  }
};

const rememberReply = async (postId: string, reply: string): Promise<void> => {
  try {
    const key = replyMemoryKey(postId);
    const previous = await redis.get(key);
    await redis.set(key, rememberRecentReply(previous, reply), {
      expiration: new Date(Date.now() + REPLY_MEMORY_SECONDS * 1000),
    });
  } catch {
    // Reply memory is only a diversity hint; it must not block a published reply.
  }
};

const publish = async (
  parentId: string,
  text: string,
  emotion: Parameters<typeof selectReaction>[0],
  intensity: number,
  config: OutsoulSettings
): Promise<{ reactionImageIncluded: boolean; reactionImageReason?: string }> => {
  let mediaUrl: string | undefined;
  let reactionImageReason: string | undefined;
  if (!config.reactionImages) {
    reactionImageReason = 'images_disabled';
  } else if (Math.random() * 100 >= config.imageFrequency) {
    reactionImageReason = 'chance_roll';
  } else {
    const recent = (await redis.get('outsoul:recent-reactions'))?.split(',') ?? [];
    const reaction = await selectReaction(emotion, intensity, recent);
    if (reaction?.mediaUrl) {
      mediaUrl = reaction.mediaUrl;
      await redis.set('outsoul:recent-reactions', [...recent.slice(-7), reaction.id].join(','), {
        expiration: new Date(Date.now() + 86_400_000),
      });
    } else {
      reactionImageReason = 'no_provisioned_asset_for_emotion';
    }
  }
  if (mediaUrl) {
    const richtext = new RichTextBuilder()
      .paragraph((paragraph) => paragraph.text({ text }))
      .paragraph((paragraph) => paragraph.image({ mediaUrl }));
    await reddit.submitComment({ id: redditTid(parentId), richtext });
  } else {
    await reddit.submitComment({ id: redditTid(parentId), text });
  }
  return { reactionImageIncluded: mediaUrl !== undefined, reactionImageReason };
};

const handleEvent = async (event: InteractionEvent): Promise<void> => {
  const config = await readSettings();
  const eventId = event.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const community = event.subreddit.toLowerCase().replace(/^r\//, '');
  const allowedSubreddit = config.allowedSubreddit;
  const communityAllowed = isAllowedCommunity(allowedSubreddit, community);
  if (!config.enabled || !communityAllowed || config.mode === 'OFF') {
    const reason = !config.enabled ? 'replies_disabled' : !communityAllowed ? 'community_not_authorized' : 'mode_off';
    console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'community_or_mode_gate', reason, mode: config.mode }));
    return;
  }
  if (!event.id || !event.author || !event.authorIsHuman || event.author.toLowerCase().endsWith('-bot')) return;
  const invocation = event.kind === 'comment' ? getInvocation(event.body) : undefined;
  const shouldInspectPost = (event.kind === 'comment' && invocation !== undefined && config.directInvocations) ||
    (event.kind === 'post' && config.mode === 'SEMI_AUTONOMOUS' && config.spontaneousReplies);
  if (shouldInspectPost && (!event.hasVisualMedia || event.imageCandidates.length === 0 || event.postText.trim() === '')) {
    const postContext = await loadPostContext(event.postId);
    if (postContext) {
      const postText = [postContext.title, postContext.body].filter(Boolean).join('\n');
      if (postText) event.postText = postText;
      if (postContext.images.length > 0) {
        event.hasVisualMedia = true;
        event.imageCandidates = postContext.images;
        console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'visual_media_detected', imageCount: postContext.images.length }));
      }
    } else {
      console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'post_context_unavailable' }));
    }
  }
  if (event.imageCandidates.length > 0) event.hasVisualMedia = true;
  const spontaneousCandidate = event.kind === 'post'
    ? (event.hasVisualMedia || mayConsiderSpontaneousReply(event.postText))
    : false;
  const interaction = decideInteraction({
    mode: config.mode,
    directInvocation: invocation !== undefined,
    directEnabled: config.directInvocations,
    spontaneousCandidate,
    spontaneousEnabled: config.spontaneousReplies,
  });
  const direct = interaction === 'direct';
  if (!interaction) {
    if (event.kind === 'post') {
      console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'spontaneous_not_eligible', mode: config.mode, spontaneousEnabled: config.spontaneousReplies, dailyLimit: config.maxSpontaneousPerDay, candidate: spontaneousCandidate }));
    }
    return;
  }

  const remainingCooldown = await cooldownRemainingSeconds(event.author, config.userCooldownMinutes * 60);
  if (remainingCooldown > 0) {
    if (direct) await enqueueDeferredReply(event, remainingCooldown);
    else console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'user_cooldown' }));
    return;
  }
  const duplicateKey = `outsoul:event:${eventId}`;
  const claimed = await redis.set(duplicateKey, 'processing', { nx: true, expiration: new Date(Date.now() + 86_400_000) });
  if (claimed !== 'OK') return;
  const day = dayKey();
  const userKey = `outsoul:direct:${event.author.toLowerCase()}:${day}`;
  const dailyKey = `outsoul:spontaneous:${day}`;
  const quotaKey = direct ? userKey : dailyKey;
  if (direct) {
    const count = await redis.incrBy(userKey, 1);
    if (!withinDailyLimit(count, config.maxDirectPerUserPerDay)) {
      await redis.incrBy(userKey, -1);
      console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'daily_direct_limit', limit: config.maxDirectPerUserPerDay }));
      return;
    }
    await redis.expire(userKey, 172_800);
  } else {
    const count = await redis.incrBy(dailyKey, 1);
    if (!withinDailyLimit(count, config.maxSpontaneousPerDay)) {
      await redis.incrBy(dailyKey, -1);
      console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'daily_spontaneous_limit', limit: config.maxSpontaneousPerDay }));
      return;
    }
    await redis.expire(dailyKey, 172_800);
  }
  let quotaReserved = true;
  const releaseQuota = async (): Promise<void> => {
    if (!quotaReserved) return;
    await redis.incrBy(quotaKey, -1);
    quotaReserved = false;
  };

  const userMessage = direct
    ? (invocation ?? event.body.replace(/^\s*!outsoul\s*/i, '').trim())
    : event.body.trim();
  const history = direct && event.kind === 'comment' ? await loadThreadContext(event.parentId) : [];
  const recentReplies = await getRecentReplies(event.postId);
  const contextWithConversation = formatConversationContext({ postContext: event.postText, history, recentReplies });
  const prompt = [`Current user message: ${userMessage || '(no additional text)'}`, contextWithConversation]
    .filter(Boolean).join('\n\n').slice(0, 5000);
  let apiKey: string | undefined;
  let decision: ReactionDecision | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  const startedAt = Date.now();
  try {
    apiKey = await settings.get<string>('geminiApiKey');
    if (event.hasVisualMedia) {
      if (!config.enableLlm || !apiKey) {
        console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'visual_unavailable', reason: 'gemini_not_configured' }));
        await releaseQuota();
        return;
      }
      const service = new PostPerceptionService({
        cache: redis,
        loadImages: async (postId) => {
          if (event.imageCandidates.length > 0) return event.imageCandidates;
          try {
            const postContext = await loadPostContext(postId);
            if (postContext && postContext.images.length > 0) return postContext.images;
          } catch {
            // Use ordered media URLs supplied by the official PostCreate/CommentCreate event as fallback.
          }
          return event.imageCandidates;
        },
      });
      const perception = await service.analyze({
        postId: event.postId,
        title: event.postText.split('\n', 1)[0] ?? '',
        body: userMessage,
        context: contextWithConversation,
        key: apiKey,
        model: config.model,
      });
      if (!perception) {
        console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: direct ? 'visual_unavailable_text_fallback' : 'visual_unavailable' }));
        if (!direct) {
          await releaseQuota();
          return;
        }
        const result = await askGemini(
          `${prompt}\n\nVisual analysis was unavailable. Respond only to the user's text and the post title/text. Do not claim to have seen, analyzed, or describe the image.`,
          apiKey,
          config.model,
        );
        decision = result.decision;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
      } else {
        decision = perception.decision;
        console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'visual_analyzed', imageCount: perception.imageCount, confidence: perception.scene.confidence, memePotential: perception.scene.memePotential }));
      }
    } else if (config.enableLlm && apiKey) {
      const result = await askGemini(prompt, apiKey, config.model);
      decision = result.decision;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    } else {
      decision = config.fallbackResponses ? fallbackDecision(prompt) : undefined;
    }
  } catch (error) {
    console.error(JSON.stringify({ eventId, community, kind: event.kind, model: config.model, error: error instanceof Error ? error.message : 'llm_error' }));
    if (!event.hasVisualMedia && config.fallbackResponses) decision = fallbackDecision(prompt);
  }
  if (!decision || !decision.shouldReply) {
    await releaseQuota();
    if (decision && !decision.shouldReply) console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'model_skipped_reply' }));
    return;
  }
  if (config.dryRun) {
    console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'dry_run', model: config.enableLlm && apiKey ? config.model : 'fallback', latencyMs: Date.now() - startedAt, inputTokens, outputTokens, emotion: decision.emotion, replyLength: decision.reply.length }));
    await releaseQuota();
    return;
  }
  try {
    const result = await publish(event.kind === 'comment' ? event.id : event.postId, decision.reply, decision.emotion, decision.intensity, config);
    await rememberReply(event.postId, decision.reply);
    await saveCooldown(event.author, config.userCooldownMinutes * 60);
    console.info(JSON.stringify({ eventId, community, kind: event.kind, decision: 'published', model: config.enableLlm && apiKey ? config.model : 'fallback', latencyMs: Date.now() - startedAt, inputTokens, outputTokens, emotion: decision.emotion, reactionImageIncluded: result.reactionImageIncluded, reactionImageReason: result.reactionImageReason }));
  } catch (error) {
    console.error(JSON.stringify({ eventId, community, kind: event.kind, decision: 'publish_failed', error: error instanceof Error ? error.name : 'unknown' }));
    await releaseQuota();
  }
};

export const handleComment = async (input: OnCommentCreateRequest): Promise<void> => {
  const comment = input.comment;
  if (!comment?.id || !comment.body || !comment.postId) return;
  await handleEvent({
    id: comment.id,
    author: input.author?.name ?? '',
    authorIsHuman: input.author ? isHumanAccount(input.author.accountType) : false,
    subreddit: input.subreddit?.name ?? context.subredditName ?? '',
    postId: comment.postId,
    parentId: comment.parentId || comment.postId,
    body: comment.body,
    postText: input.post?.title ? `${input.post.title}\n${input.post.selftext ?? ''}` : '',
    kind: 'comment',
    hasVisualMedia: Boolean(input.post && !input.post.isVideo && (input.post.isImage || input.post.isGallery || input.post.mediaUrls.length > 0)),
    imageCandidates: input.post
      ? (input.post.galleryImages.length > 0 ? input.post.galleryImages : input.post.mediaUrls).map((url) => ({ url }))
      : [],
  });
};

export const handlePost = async (input: OnPostCreateRequest): Promise<void> => {
  const post = input.post;
  if (!post?.id) return;
  const title = post.title ?? '';
  const body = post.selftext ?? '';
  await handleEvent({
    id: post.id,
    author: input.author?.name ?? '',
    authorIsHuman: input.author ? isHumanAccount(input.author.accountType) : false,
    subreddit: input.subreddit?.name ?? context.subredditName ?? '',
    postId: post.id,
    parentId: post.id,
    body,
    postText: `${title}\n${body}`,
    kind: 'post',
    hasVisualMedia: !post.isVideo && (post.isImage || post.isGallery || post.mediaUrls.length > 0),
    imageCandidates: (post.galleryImages.length > 0 ? post.galleryImages : post.mediaUrls).map((url) => ({ url })),
  });
};
