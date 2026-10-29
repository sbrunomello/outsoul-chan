import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRedditPostContext, normalizePostId, postImagesOrUrl, type RedditPostContext } from './post-context.ts';

await test('normalizes comment post IDs for the official Reddit post lookup', () => {
  assert.equal(normalizePostId('abc123'), 't3_abc123');
  assert.equal(normalizePostId('t3_abc123'), 't3_abc123');
});

await test('hydrates missing trigger context from the ordered gallery in the official post model', async () => {
  const context = await loadRedditPostContext('abc123', async (postId) => {
    assert.equal(postId, 't3_abc123');
    return {
      title: '💀',
      body: '',
      images: [{ url: 'https://preview.redd.it/first.webp' }, { url: 'https://preview.redd.it/second.webp' }],
    };
  });
  assert.equal(context?.title, '💀');
  assert.deepEqual(context?.images.map((image) => image.url), [
    'https://preview.redd.it/first.webp',
    'https://preview.redd.it/second.webp',
  ]);
});

await test('post metadata lookup fails closed on errors and timeout', async () => {
  assert.equal(await loadRedditPostContext('bad', async () => { throw new Error('lookup failed'); }), undefined);
  assert.equal(await loadRedditPostContext('slow', async () => new Promise<RedditPostContext>(() => undefined), 5), undefined);
});

await test('uses the official Reddit post URL when a single-image post has no gallery entries', () => {
  assert.deepEqual(postImagesOrUrl([], 'https://i.redd.it/example-image.jpg'), [
    { url: 'https://i.redd.it/example-image.jpg' },
  ]);
  assert.deepEqual(postImagesOrUrl([], 'https://example.com/image.jpg'), []);
  assert.deepEqual(postImagesOrUrl([{ url: 'https://i.redd.it/first.jpg' }], 'https://i.redd.it/fallback.jpg'), [
    { url: 'https://i.redd.it/first.jpg' },
  ]);
});
