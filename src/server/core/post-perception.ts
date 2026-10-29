import type { PostPerception, PostScene, ReactionDecision } from '../../shared/outsoul.ts';
import { validateDecision } from '../../shared/outsoul.ts';
import { personalityPrompt } from './personality.ts';
import { fetchGeminiWithRetry, formatGeminiHttpError } from './gemini-http.ts';

export const MAX_POST_IMAGES = 4;
export const MAX_IMAGE_BYTES = 2_500_000;
export const MAX_TOTAL_IMAGE_BYTES = 10_000_000;
export const MAX_IMAGE_EDGE = 8192;
export const MAX_IMAGE_PIXELS = 12_000_000;
export const POST_PERCEPTION_CACHE_SECONDS = 21_600;
const IMAGE_TIMEOUT_MS = 3_500;
const GEMINI_TIMEOUT_MS = 8_000;
const POST_LOOKUP_TIMEOUT_MS = 2_000;
const ALLOWED_MEDIA_HOSTS = new Set([
  'i.redd.it',
  'preview.redd.it',
  'external-preview.redd.it',
  'i.redditmedia.com',
  'preview.redditmedia.com',
]);

const fingerprint = (value: string): string => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
};

export type PostImageCandidate = { url: string; width?: number; height?: number };
export type PostImage = { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; data: Uint8Array };
export type PostPerceptionCache = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options: { expiration: Date }): Promise<unknown>;
};
export type PostPerceptionDependencies = {
  loadImages(postId: string): Promise<PostImageCandidate[]>;
  cache: PostPerceptionCache;
  fetchImage?: typeof fetch;
  callGemini?: (input: { prompt: string; key: string; model: string; images: PostImage[] }) => Promise<PostPerception>;
};

export interface AnimatedMediaFrameAnalyzer {
  analyzeFrames(input: { postId: string; mediaUrl: string; mimeType: 'image/gif' | 'video/mp4'; maxFrames: number }): Promise<Array<{ index: number; timestampMs: number; image: PostImage }>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type ImageDimensions = { width: number; height: number };
type LoadedImage = PostImage & { width: number; height: number };

const byte = (bytes: Uint8Array, offset: number): number => bytes[offset] ?? 0;
const readUint24 = (bytes: Uint8Array, offset: number): number =>
  byte(bytes, offset) | (byte(bytes, offset + 1) << 8) | (byte(bytes, offset + 2) << 16);

const jpegDimensions = (bytes: Uint8Array): ImageDimensions | undefined => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (byte(bytes, offset) !== 0xff) { offset += 1; continue; }
    const marker = byte(bytes, offset + 1);
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (byte(bytes, offset) << 8) | byte(bytes, offset + 1);
    if (length < 2 || offset + length > bytes.length) return undefined;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (byte(bytes, offset + 3) << 8) | byte(bytes, offset + 4), width: (byte(bytes, offset + 5) << 8) | byte(bytes, offset + 6) };
    }
    offset += length;
  }
  return undefined;
};

export const inspectImage = (bytes: Uint8Array): (ImageDimensions & { mimeType: PostImage['mimeType'] }) | undefined => {
  if (bytes.length >= 33 && byte(bytes, 0) === 0x89 && byte(bytes, 1) === 0x50 && byte(bytes, 2) === 0x4e && byte(bytes, 3) === 0x47 &&
      byte(bytes, 12) === 0x49 && byte(bytes, 13) === 0x48 && byte(bytes, 14) === 0x44 && byte(bytes, 15) === 0x52) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { mimeType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    if (bytes.length < 30) return undefined;
    const chunk = String.fromCharCode(byte(bytes, 12), byte(bytes, 13), byte(bytes, 14), byte(bytes, 15));
    if (chunk === 'VP8X') return { mimeType: 'image/webp', width: readUint24(bytes, 24) + 1, height: readUint24(bytes, 27) + 1 };
    if (chunk === 'VP8 ' && bytes.length >= 30 && byte(bytes, 23) === 0x9d && byte(bytes, 24) === 0x01 && byte(bytes, 25) === 0x2a) {
      return { mimeType: 'image/webp', width: ((byte(bytes, 26) | (byte(bytes, 27) << 8)) & 0x3fff), height: ((byte(bytes, 28) | (byte(bytes, 29) << 8)) & 0x3fff) };
    }
    if (chunk === 'VP8L' && byte(bytes, 20) === 0x2f) {
      const b1 = byte(bytes, 21); const b2 = byte(bytes, 22); const b3 = byte(bytes, 23); const b4 = byte(bytes, 24);
      return { mimeType: 'image/webp', width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) };
    }
    return undefined;
  }
  const jpeg = jpegDimensions(bytes);
  return jpeg ? { ...jpeg, mimeType: 'image/jpeg' } : undefined;
};

const permittedImageUrl = (value: string): URL | undefined => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !ALLOWED_MEDIA_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || (url.port !== '' && url.port !== '443')) return undefined;
    return url;
  } catch {
    return undefined;
  }
};

const readBounded = async (response: Response, maxBytes: number): Promise<Uint8Array> => {
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw new Error('image_too_large');
  if (!response.body) throw new Error('image_empty');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('image_too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
};

const fetchRedditImage = async (candidate: PostImageCandidate, fetcher: typeof fetch): Promise<LoadedImage> => {
  const initialUrl = permittedImageUrl(candidate.url);
  if (!initialUrl) throw new Error('image_host_not_allowed');
  let url: URL = initialUrl;
  const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
  let response: Response | undefined;
  for (let redirect = 0; redirect <= 2; redirect += 1) {
    response = await fetcher(url, { method: 'GET', redirect: 'manual', signal, headers: { accept: 'image/png,image/jpeg,image/webp' } });
    if (response.status < 300 || response.status >= 400) break;
    const locationHeader: string | null = response.headers.get('location');
    const nextUrl: URL | undefined = locationHeader ? permittedImageUrl(new URL(locationHeader, url).toString()) : undefined;
    if (!nextUrl) throw new Error('image_redirect_not_allowed');
    url = nextUrl;
  }
  if (!response?.ok) throw new Error(`image_http_${response?.status ?? 'unknown'}`);
  const bytes = await readBounded(response, MAX_IMAGE_BYTES);
  const info = inspectImage(bytes);
  if (!info) throw new Error('image_format_unsupported');
  if (info.width < 1 || info.height < 1 || info.width > MAX_IMAGE_EDGE || info.height > MAX_IMAGE_EDGE || info.width * info.height > MAX_IMAGE_PIXELS) {
    throw new Error('image_resolution_exceeded');
  }
  return { ...info, data: bytes };
};

const stringArray = (value: unknown, maxItems = 8): string[] | undefined => {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return undefined;
    strings.push(item.trim().slice(0, 240));
  }
  return strings;
};

const validateScene = (value: unknown): PostScene | undefined => {
  if (!isRecord(value)) return undefined;
  const record = value;
  const visualObservations = stringArray(record.visualObservations);
  const apparentActions = stringArray(record.apparentActions);
  const humorElements = stringArray(record.humorElements);
  const uncertainInterpretations = stringArray(record.uncertainInterpretations);
  if (!visualObservations || !apparentActions || !humorElements || !uncertainInterpretations) return undefined;
  if (record.memePotential !== 'low' && record.memePotential !== 'medium' && record.memePotential !== 'high') return undefined;
  if (typeof record.confidence !== 'number' || !Number.isFinite(record.confidence) || typeof record.visualSummary !== 'string') return undefined;
  return {
    visualObservations,
    apparentActions,
    humorElements,
    uncertainInterpretations,
    memePotential: record.memePotential,
    confidence: Math.max(0, Math.min(1, record.confidence)),
    visualSummary: record.visualSummary.trim().slice(0, 600),
  };
};

const sceneSchema = {
  type: 'OBJECT',
  properties: {
    visualObservations: { type: 'ARRAY', items: { type: 'STRING' } },
    apparentActions: { type: 'ARRAY', items: { type: 'STRING' } },
    humorElements: { type: 'ARRAY', items: { type: 'STRING' } },
    uncertainInterpretations: { type: 'ARRAY', items: { type: 'STRING' } },
    memePotential: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    confidence: { type: 'NUMBER' },
    visualSummary: { type: 'STRING' },
  },
  required: ['visualObservations', 'apparentActions', 'humorElements', 'uncertainInterpretations', 'memePotential', 'confidence', 'visualSummary'],
};
const decisionSchema = {
  type: 'OBJECT',
  properties: {
    shouldReply: { type: 'BOOLEAN' },
    reply: { type: 'STRING' },
    emotion: { type: 'STRING', enum: ['joy', 'anger', 'dramatic_sadness', 'fear_shock', 'embarrassment', 'bored_judgment', 'mockery_laughter', 'confidence_sigma'] },
    intensity: { type: 'INTEGER' },
    visualStyle: { type: 'STRING', enum: ['chibi', 'cinematic_anime', 'dramatic_manga', 'meme', 'comedy'] },
    useImage: { type: 'BOOLEAN' },
  },
  required: ['shouldReply', 'reply', 'emotion', 'intensity', 'visualStyle', 'useImage'],
};

const parseGeminiPerception = async (input: { prompt: string; key: string; model: string; images: PostImage[] }): Promise<PostPerception> => {
  const parts = [
    { text: `${input.prompt.slice(0, 6000)}\n\nUnderstand the scene internally, then answer the CURRENT USER MESSAGE first. Use conversation history to resolve references and continue the exchange; never recycle a previous Outsoul joke, metaphor, or wording. If the current message is affection, a greeting, or a reaction, respond to that message rather than returning to the image or repeating a caption. Keep the reply short, casual Brazilian Portuguese, with shitpost humor only when it fits. Avoid technical language, analysis narration, elaborate metaphors, forced memes, and explaining the joke. Use the image as context only when relevant. Separate visible facts from uncertain interpretations in the structured scene. If the image or request is unclear, set shouldReply=false. Never claim details that are not visible.` },
    ...input.images.flatMap((image, index) => [
      { text: `Image ${index + 1} of ${input.images.length} (gallery order).` },
      { inline_data: { mime_type: image.mimeType, data: Buffer.from(image.data).toString('base64') } },
    ]),
  ];
  const response = await fetchGeminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: personalityPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { scene: sceneSchema, decision: decisionSchema }, required: ['scene', 'decision'] }, temperature: 0.8, maxOutputTokens: 700 },
      }),
    },
    { timeoutMs: GEMINI_TIMEOUT_MS },
  );
  if (!response.ok) throw await formatGeminiHttpError(response);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !('candidates' in payload) || !Array.isArray(payload.candidates)) throw new Error('gemini_invalid_envelope');
  const first = payload.candidates[0];
  if (!isRecord(first) || !('content' in first) || !isRecord(first.content) || !('parts' in first.content) || !Array.isArray(first.content.parts)) throw new Error('gemini_invalid_candidate');
  const textPart = first.content.parts.find((part) => typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string');
  if (!isRecord(textPart) || typeof textPart.text !== 'string') throw new Error('gemini_missing_text');
  let parsed: unknown;
  try { parsed = JSON.parse(textPart.text); } catch { throw new Error('gemini_invalid_json'); }
  if (!isRecord(parsed)) throw new Error('gemini_invalid_contract');
  const record = parsed;
  const scene = validateScene(record.scene);
  const decision = validateDecision(record.decision);
  if (!scene || !decision) throw new Error('gemini_invalid_contract');
  return { scene, decision, imageCount: input.images.length };
};

const isPerception = (value: unknown): value is PostPerception => {
  if (!isRecord(value)) return false;
  const record = value;
  const scene = validateScene(record.scene);
  const decision = validateDecision(record.decision);
  return Boolean(scene && decision && typeof record.imageCount === 'number' && Number.isInteger(record.imageCount) && record.imageCount > 0 && record.imageCount <= MAX_POST_IMAGES);
};

export class PostPerceptionService {
  readonly #dependencies: PostPerceptionDependencies;
  constructor(dependencies: PostPerceptionDependencies) { this.#dependencies = dependencies; }

  async analyze(input: { postId: string; title: string; body: string; context: string; key: string; model: string }): Promise<PostPerception | undefined> {
    const postKey = input.postId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const requestKey = fingerprint(`${input.model}\n${input.title}\n${input.body}\n${input.context}`);
    const cacheKey = `outsoul:perception:${postKey}:${requestKey}`;
    try {
      const cached = await this.#dependencies.cache.get(cacheKey);
      if (cached) {
        let parsed: unknown;
        try { parsed = JSON.parse(cached); } catch { parsed = undefined; }
        if (isPerception(parsed)) return parsed;
      }
      let lookupTimer: ReturnType<typeof setTimeout> | undefined;
      const lookupTimeout = new Promise<PostImageCandidate[]>((_, reject) => {
        lookupTimer = setTimeout(() => reject(new Error('post_media_lookup_timeout')), POST_LOOKUP_TIMEOUT_MS);
      });
      let loadedCandidates: PostImageCandidate[];
      try {
        loadedCandidates = await Promise.race([this.#dependencies.loadImages(input.postId), lookupTimeout]);
      } finally {
        if (lookupTimer !== undefined) clearTimeout(lookupTimer);
      }
      const candidates = loadedCandidates.slice(0, MAX_POST_IMAGES);
      if (candidates.length === 0) return undefined;
      const fetcher = this.#dependencies.fetchImage ?? fetch;
      const images: LoadedImage[] = await Promise.all(candidates.map((candidate) => fetchRedditImage(candidate, fetcher)));
      const total = images.reduce((sum, image) => sum + image.data.byteLength, 0);
      if (total > MAX_TOTAL_IMAGE_BYTES) throw new Error('gallery_too_large');
      const result = await (this.#dependencies.callGemini ?? parseGeminiPerception)({
        prompt: [`Post title: ${input.title.slice(0, 300)}`, `Current user message: ${input.body.slice(0, 1_000)}`, `Post context: ${input.context.slice(0, 4_000)}`].join('\n'),
        key: input.key,
        model: input.model,
        images: images.map(({ mimeType, data }) => ({ mimeType, data })),
      });
      if (!isPerception(result)) throw new Error('gemini_invalid_contract');
      await this.#dependencies.cache.set(cacheKey, JSON.stringify(result), { expiration: new Date(Date.now() + POST_PERCEPTION_CACHE_SECONDS * 1000) });
      return result;
    } catch (error) {
      console.warn(JSON.stringify({ event: 'post_perception_unavailable', error: error instanceof Error ? error.message : 'unknown' }));
      return undefined;
    }
  }
}

export const validatePostDecision = (value: unknown): ReactionDecision | undefined => validateDecision(value);
