import { redis } from '@devvit/web/server';
import type { Emotion, ReactionAsset } from '../../shared/outsoul';
import catalog from '../../shared/reactions/manifest.json';

const isReactionAsset = (value: unknown): value is ReactionAsset => {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && typeof value.id === 'string' &&
    'emotion' in value && typeof value.emotion === 'string' &&
    'style' in value && typeof value.style === 'string' &&
    'intensity' in value && typeof value.intensity === 'number' &&
    'tags' in value && Array.isArray(value.tags) &&
    'file' in value && typeof value.file === 'string' &&
    'sha256' in value && typeof value.sha256 === 'string' &&
    'approved' in value && typeof value.approved === 'boolean' &&
    'enabled' in value && typeof value.enabled === 'boolean';
};

const catalogData: unknown = catalog;
export const reactionCatalog: ReactionAsset[] = Array.isArray(catalogData)
  ? catalogData.filter(isReactionAsset)
  : [];

export const selectReaction = (
  emotion: Emotion,
  intensity: number,
  recentIds: string[],
  random: () => number = Math.random
): Promise<ReactionAsset | undefined> => chooseFromCachedCatalog(emotion, intensity, recentIds, random);

const chooseFromCachedCatalog = async (
  emotion: Emotion,
  intensity: number,
  recentIds: string[],
  random: () => number
): Promise<ReactionAsset | undefined> => {
  const candidates = await Promise.all(reactionCatalog
    .filter((asset) => asset.approved && asset.enabled && asset.emotion === emotion)
    .map(async (asset) => {
      const cached = await redis.get(`outsoul:media:${asset.id}`);
      if (!cached) return undefined;
      try {
        const parsed: unknown = JSON.parse(cached);
        if (typeof parsed !== 'object' || parsed === null || !('mediaUrl' in parsed) || typeof parsed.mediaUrl !== 'string' || !('sha256' in parsed) || parsed.sha256 !== asset.sha256) return undefined;
        return { ...asset, mediaUrl: parsed.mediaUrl };
      } catch {
        return undefined;
      }
    }));
  const available = candidates.filter((asset) => asset !== undefined);
  if (available.length === 0) return undefined;
  const fresh = available.filter((asset) => !recentIds.includes(asset.id));
  const pool = fresh.length > 0 ? fresh : available;
  const distance = Math.min(...pool.map((asset) => Math.abs(asset.intensity - intensity)));
  const nearest = pool.filter((asset) => Math.abs(asset.intensity - intensity) === distance);
  return nearest[Math.floor(random() * nearest.length)];
};
