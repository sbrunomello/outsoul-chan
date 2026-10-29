import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_IMAGE_BYTES,
  PostPerceptionService,
  inspectImage,
  type PostImage,
  type PostImageCandidate,
  type PostPerceptionCache,
} from './post-perception.ts';
import type { PostPerception } from '../../shared/outsoul.ts';

const png = (marker: number, width = 1, height = 1): Uint8Array => {
  const bytes = new Uint8Array(34);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  bytes[33] = marker;
  return bytes;
};

const scene = (summary: string): PostPerception['scene'] => ({
  visualObservations: [summary],
  apparentActions: [],
  humorElements: [summary],
  uncertainInterpretations: [],
  memePotential: 'high',
  confidence: 0.92,
  visualSummary: summary,
});

const decision = (reply: string): PostPerception['decision'] => ({
  shouldReply: true,
  reply,
  emotion: 'mockery_laughter',
  intensity: 3,
  visualStyle: 'comedy',
  useImage: true,
});

const memoryCache = (): PostPerceptionCache => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key),
    set: async (key, value) => { values.set(key, value); },
  };
};

const candidates = (...urls: string[]): PostImageCandidate[] => urls.map((url) => ({ url }));
const runInput = { postId: 't3_mock123', title: '💀', body: '', context: '', key: 'test-key', model: 'test-model' };
const redditUrl = (name: string): string => `https://i.redd.it/${name}.png`;

const replyFromImageMarker = async (input: { images: PostImage[] }): Promise<PostPerception> => {
  const marker = input.images[0]?.data[33] ?? 0;
  const summary = marker === 7 ? 'anime hero inexplicably holding a giant fish' : 'anime character dramatically staring at a toaster';
  const reply = marker === 7 ? 'o protagonista pescou o jantar no meio do arco final' : 'o vilão final era a torradeira esse tempo todo';
  return { scene: scene(summary), decision: decision(reply), imageCount: input.images.length };
};

await test('visual perception and character response change when the supplied image bytes change', async () => {
  const analyzeFor = (image: Uint8Array) => new PostPerceptionService({
    cache: memoryCache(),
    loadImages: async () => candidates(redditUrl('single')),
    fetchImage: async () => new Response(Buffer.from(image), { headers: { 'content-type': 'image/png' } }),
    callGemini: replyFromImageMarker,
  }).analyze(runInput);

  const fish = await analyzeFor(png(7));
  const toaster = await analyzeFor(png(9));
  assert.equal(fish?.scene.visualSummary, 'anime hero inexplicably holding a giant fish');
  assert.equal(fish?.decision.reply, 'o protagonista pescou o jantar no meio do arco final');
  assert.equal(toaster?.scene.visualSummary, 'anime character dramatically staring at a toaster');
  assert.equal(toaster?.decision.reply, 'o vilão final era a torradeira esse tempo todo');
  assert.notEqual(fish?.decision.reply, toaster?.decision.reply);
});

await test('gallery images are downloaded and sent in their original order, then cached by post', async () => {
  const order: string[] = [];
  let geminiCalls = 0;
  const service = new PostPerceptionService({
    cache: memoryCache(),
    loadImages: async () => candidates(redditUrl('first'), redditUrl('second')),
    fetchImage: async (url) => {
      order.push(new URL(String(url)).pathname);
      return new Response(Buffer.from(png(String(url).includes('first') ? 7 : 9)), { headers: { 'content-type': 'image/png' } });
    },
    callGemini: async ({ images }) => {
      geminiCalls += 1;
      return { scene: scene(`ordered markers ${images.map((image) => image.data[33]).join(',')}`), decision: decision('galeria analisada'), imageCount: images.length };
    },
  });

  const first = await service.analyze(runInput);
  const second = await service.analyze(runInput);
  assert.deepEqual(order, ['/first.png', '/second.png']);
  assert.equal(first?.scene.visualSummary, 'ordered markers 7,9');
  assert.equal(first?.imageCount, 2);
  assert.deepEqual(second, first);
  assert.equal(geminiCalls, 1);
});

await test('different comments on the same post get separate answers and cache entries', async () => {
  let geminiCalls = 0;
  const service = new PostPerceptionService({
    cache: memoryCache(),
    loadImages: async () => candidates(redditUrl('same-post-image')),
    fetchImage: async () => new Response(Buffer.from(png(7)), { headers: { 'content-type': 'image/png' } }),
    callGemini: async ({ prompt }) => {
      geminiCalls += 1;
      const reply = prompt.includes('te amo')
        ? 'também te amo, mas trago meu próprio lanchinho pro arco final'
        : 'a imagem parece um abraço apertado de anime antes da cena final';
      return { scene: scene('anime scene with two characters'), decision: decision(reply), imageCount: 1 };
    },
  });

  const first = await service.analyze({ ...runInput, body: 'o que acha disso?' });
  const second = await service.analyze({ ...runInput, body: 'te amo' });

  assert.equal(first?.decision.reply, 'a imagem parece um abraço apertado de anime antes da cena final');
  assert.equal(second?.decision.reply, 'também te amo, mas trago meu próprio lanchinho pro arco final');
  assert.equal(geminiCalls, 2);
});

await test('image bytes are signature-checked for PNG, JPEG and WebP', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9]);
  const webp = new Uint8Array(30);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  webp.set([0x56, 0x50, 0x38, 0x58], 12);
  assert.equal(inspectImage(png(1))?.mimeType, 'image/png');
  assert.equal(inspectImage(jpeg)?.mimeType, 'image/jpeg');
  assert.equal(inspectImage(webp)?.mimeType, 'image/webp');
});

await test('non-Reddit image hosts, unsupported formats and oversized images fail closed', async () => {
  let geminiCalls = 0;
  const makeService = (url: string, bytes: Uint8Array) => new PostPerceptionService({
    cache: memoryCache(),
    loadImages: async () => candidates(url),
    fetchImage: async () => new Response(Buffer.from(bytes), { headers: { 'content-type': 'image/png' } }),
    callGemini: replyFromImageMarker,
  });
  const allowedService = new PostPerceptionService({
    cache: memoryCache(),
    loadImages: async () => candidates(redditUrl('valid')),
    fetchImage: async () => new Response(Buffer.from(png(1)), { headers: { 'content-type': 'image/png' } }),
    callGemini: async (input) => { geminiCalls += 1; return replyFromImageMarker(input); },
  });

  assert.equal(await makeService('https://example.com/image.png', png(1)).analyze(runInput), undefined);
  assert.equal(await makeService(redditUrl('bad'), new Uint8Array([1, 2, 3])).analyze(runInput), undefined);
  assert.equal(await makeService(redditUrl('huge'), png(1, 9000, 2)).analyze(runInput), undefined);
  assert.ok(MAX_IMAGE_BYTES > 1_000_000);
  assert.ok(await allowedService.analyze(runInput));
  assert.equal(geminiCalls, 1);
});

await test('a generic title is not treated as visual analysis when the Reddit image cannot be retrieved', async () => {
  let geminiCalls = 0;
  const service = new PostPerceptionService({
    cache: memoryCache(),
    loadImages: async () => candidates(redditUrl('missing')),
    fetchImage: async () => new Response('not found', { status: 404 }),
    callGemini: async (input) => { geminiCalls += 1; return replyFromImageMarker(input); },
  });
  const result = await service.analyze(runInput);
  assert.equal(result, undefined);
  assert.equal(geminiCalls, 0);
});
