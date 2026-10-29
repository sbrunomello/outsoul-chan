import { Hono } from 'hono';
import { context, media, redis, reddit, settings } from '@devvit/web/server';
import { reactionCatalog } from '../core/reactions';
export const api = new Hono();

const canManageReactions = async (): Promise<boolean> => {
  const allowedSubreddit = (await settings.get<string>('allowedSubreddit'))?.toLowerCase().replace(/^r\//, '');
  const currentSubreddit = context.subredditName.toLowerCase().replace(/^r\//, '');
  const username = context.username?.toLowerCase();
  if (!allowedSubreddit || currentSubreddit !== allowedSubreddit || !username) return false;
  const moderators = await reddit.getModerators({ subredditName: context.subredditName, limit: 100 }).all();
  return moderators.some((moderator) => moderator.username.toLowerCase() === username);
};

api.get('/reactions/permission', async (c) => {
  try {
    return c.json({ canSync: await canManageReactions() });
  } catch {
    return c.json({ canSync: false });
  }
});

api.post('/reactions/provision', async (c) => {
  if (!await canManageReactions()) {
    return c.json({ status: 'error', message: 'Moderator permission required.' }, 403);
  }
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ status: 'error', message: 'Invalid JSON.' }, 400);
  }
  if (typeof input !== 'object' || input === null || !('id' in input) || typeof input.id !== 'string' ||
      !('dataUrl' in input) || typeof input.dataUrl !== 'string' || !('sha256' in input) ||
      typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(input.sha256)) {
    return c.json({ status: 'error', message: 'Invalid asset payload.' }, 400);
  }
  const asset = reactionCatalog.find((entry) => entry.id === input.id && entry.approved && entry.enabled);
  if (!asset || !input.dataUrl.startsWith('data:image/png;base64,') || input.dataUrl.length > 3_700_000) {
    return c.json({ status: 'error', message: 'Unknown asset or invalid PNG.' }, 400);
  }
  const imageBytes = Uint8Array.from(atob(input.dataUrl.slice('data:image/png;base64,'.length)), (character) => character.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', imageBytes);
  const verifiedHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  if (verifiedHash !== asset.sha256 || input.sha256 !== asset.sha256) {
    return c.json({ status: 'error', message: 'Image does not match the approved asset.' }, 400);
  }
  const cacheKey = `outsoul:media:${asset.id}`;
  const current = await redis.get(cacheKey);
  if (current) {
    try {
      const parsed: unknown = JSON.parse(current);
      if (typeof parsed === 'object' && parsed !== null && 'sha256' in parsed && parsed.sha256 === input.sha256 && 'mediaUrl' in parsed && typeof parsed.mediaUrl === 'string') {
        return c.json({ status: 'ok', id: asset.id, mediaUrl: parsed.mediaUrl, cached: true });
      }
    } catch {
      // Replace a malformed cache record with a fresh media upload.
    }
  }
  const uploaded = await media.upload({ url: input.dataUrl, type: 'image' });
  await redis.set(cacheKey, JSON.stringify({ sha256: input.sha256, mediaId: uploaded.mediaId, mediaUrl: uploaded.mediaUrl }));
  return c.json({ status: 'ok', id: asset.id, mediaUrl: uploaded.mediaUrl, cached: false });
});

