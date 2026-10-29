import type { PostImageCandidate } from './post-perception.ts';

export type RedditPostContext = { title: string; body: string; images: PostImageCandidate[] };
export type RedditPostLookup = (postId: `t3_${string}`) => Promise<RedditPostContext>;

const REDDIT_IMAGE_HOSTS = new Set(['i.redd.it', 'preview.redd.it', 'external-preview.redd.it', 'i.redditmedia.com', 'preview.redditmedia.com']);

export const postImagesOrUrl = (gallery: PostImageCandidate[], postUrl: string): PostImageCandidate[] => {
  const available = gallery.filter((image) => typeof image.url === 'string' && image.url.length > 0);
  if (available.length > 0) return available;
  try {
    const url = new URL(postUrl);
    return url.protocol === 'https:' && REDDIT_IMAGE_HOSTS.has(url.hostname.toLowerCase()) ? [{ url: url.href }] : [];
  } catch {
    return [];
  }
};

export const normalizePostId = (postId: string): `t3_${string}` => {
  const suffix = postId.startsWith('t3_') ? postId.slice(3) : postId;
  return `t3_${suffix}`;
};

export const loadRedditPostContext = async (
  postId: string,
  lookup: RedditPostLookup,
  timeoutMs = 2_000,
): Promise<RedditPostContext | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  try {
    return await Promise.race([lookup(normalizePostId(postId)), timeout]);
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
