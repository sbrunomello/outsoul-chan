export type InteractionMode = 'OFF' | 'INVOCATION_ONLY' | 'SEMI_AUTONOMOUS';
export const interactionModes: InteractionMode[] = ['OFF', 'INVOCATION_ONLY', 'SEMI_AUTONOMOUS'];

export type Emotion =
  | 'joy'
  | 'anger'
  | 'dramatic_sadness'
  | 'fear_shock'
  | 'embarrassment'
  | 'bored_judgment'
  | 'mockery_laughter'
  | 'confidence_sigma';
export const emotions: Emotion[] = [
  'joy',
  'anger',
  'dramatic_sadness',
  'fear_shock',
  'embarrassment',
  'bored_judgment',
  'mockery_laughter',
  'confidence_sigma',
];

export type VisualStyle = 'chibi' | 'cinematic_anime' | 'dramatic_manga' | 'meme' | 'comedy';

export type ReactionDecision = {
  shouldReply: boolean;
  reply: string;
  emotion: Emotion;
  intensity: number;
  visualStyle: VisualStyle;
  useImage: boolean;
};

export type PostScene = {
  visualObservations: string[];
  apparentActions: string[];
  humorElements: string[];
  uncertainInterpretations: string[];
  memePotential: 'low' | 'medium' | 'high';
  confidence: number;
  visualSummary: string;
};

export type PostPerception = {
  scene: PostScene;
  decision: ReactionDecision;
  imageCount: number;
};

export type ReactionAsset = {
  id: string;
  emotion: Emotion;
  style: VisualStyle;
  intensity: number;
  tags: string[];
  file: string;
  sha256: string;
  approved: boolean;
  enabled: boolean;
  mediaUrl?: string;
};

export type OutsoulSettings = {
  mode: InteractionMode;
  enabled: boolean;
  directInvocations: boolean;
  spontaneousReplies: boolean;
  maxSpontaneousPerDay: number;
  maxDirectPerUserPerDay: number;
  userCooldownMinutes: number;
  reactionImages: boolean;
  imageFrequency: number;
  model: string;
  enableLlm: boolean;
  fallbackResponses: boolean;
  dryRun: boolean;
  allowedSubreddit: string;
};

export const defaultSettings: OutsoulSettings = {
  mode: 'INVOCATION_ONLY',
  enabled: true,
  directInvocations: true,
  spontaneousReplies: false,
  maxSpontaneousPerDay: 2,
  maxDirectPerUserPerDay: 5,
  userCooldownMinutes: 20,
  reactionImages: true,
  imageFrequency: 35,
  model: 'gemini-3.8-flash',
  enableLlm: true,
  fallbackResponses: true,
  dryRun: true,
  allowedSubreddit: '',
};

export const MAX_SPONTANEOUS_REPLIES_PER_DAY = 200;
export const MAX_DIRECT_REPLIES_PER_USER_PER_DAY = 500;

export const clampNumericSetting = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;

export const getInvocation = (body: string): string | undefined => {
  const command = /^\s*!outsoul(?=$|[\s,!:—?])(?:\s*[,!:—?]\s*|\s+)?([\s\S]*?)\s*$/iu.exec(body);
  if (command) return (command[1] ?? '').trim();
  const nameMention = /(^|[^\p{L}\p{N}_])outsoul-chan(?=$|[^\p{L}\p{N}_])/iu;
  return nameMention.test(body) ? body.trim() : undefined;
};

export const decideInteraction = (input: {
  mode: InteractionMode;
  directInvocation: boolean;
  directEnabled: boolean;
  spontaneousCandidate: boolean;
  spontaneousEnabled: boolean;
}): 'direct' | 'spontaneous' | undefined => {
  if (input.mode === 'OFF') return undefined;
  if (input.directInvocation && input.directEnabled) return 'direct';
  if (input.mode === 'SEMI_AUTONOMOUS' && input.spontaneousEnabled && input.spontaneousCandidate) return 'spontaneous';
  return undefined;
};

export const isAllowedCommunity = (configured: string, actual: string): boolean => {
  const target = configured.trim().replace(/^r\//i, '').toLowerCase();
  const community = actual.trim().replace(/^r\//i, '').toLowerCase();
  return target !== '' && target === community;
};

export const withinDailyLimit = (countAfterIncrement: number, maximum: number): boolean =>
  maximum > 0 && countAfterIncrement <= maximum;

export const isHumanAccount = (accountType: number): boolean => accountType === 1;

export const mayConsiderSpontaneousReply = (text: string): boolean => {
  const normalized = text.toLocaleLowerCase('pt-BR');
  const signals = [
    /\b(meme|shitpost|kkkk+|kkk|intank[aá]vel|que porra|wtf)\b/u,
    /\b(anime|mang[aá]|waifu|personagem)\b/u,
    /\b(opini[aã]o|o que acham|o que vocês acham|qual sua opini[aã]o)\b/u,
  ];
  const sensitive = /\b(suic[ií]d|auto.?les[aã]o|luto|abuso|estupro|amea[cç]a|emerg[eê]ncia|diagn[oó]stico|pol[ií]tica)\b/u;
  return !sensitive.test(normalized) && signals.some((signal) => signal.test(normalized));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const validateDecision = (value: unknown): ReactionDecision | undefined => {
  if (!isRecord(value)) return undefined;
  const record = value;
  const emotion = typeof record.emotion === 'string'
    ? emotions.find((candidate) => candidate === record.emotion)
    : undefined;
  const styles: VisualStyle[] = ['chibi', 'cinematic_anime', 'dramatic_manga', 'meme', 'comedy'];
  const visualStyle = typeof record.visualStyle === 'string'
    ? styles.find((candidate) => candidate === record.visualStyle)
    : undefined;
  if (
    typeof record.shouldReply !== 'boolean' ||
    typeof record.reply !== 'string' ||
    emotion === undefined ||
    typeof record.intensity !== 'number' ||
    !Number.isInteger(record.intensity) ||
    typeof record.useImage !== 'boolean' ||
    visualStyle === undefined
  ) return undefined;
  return {
    shouldReply: record.shouldReply,
    reply: record.reply.trim().slice(0, 500),
    emotion,
    intensity: Math.max(1, Math.min(5, record.intensity)),
    visualStyle,
    useImage: record.useImage,
  };
};

export const fallbackDecision = (prompt: string): ReactionDecision => {
  const text = prompt.toLocaleLowerCase('pt-BR');
  if (/namor|ficar com|casar|gosta de mim/u.test(text)) {
    return { shouldReply: true, reply: 'KKKKKK o cara tá dando em cima de IA', emotion: 'mockery_laughter', intensity: 3, visualStyle: 'comedy', useImage: true };
  }
  if (/bot|ia|inteligência artificial/u.test(text)) {
    return { shouldReply: true, reply: 'e mesmo assim você tá discutindo comigo', emotion: 'confidence_sigma', intensity: 2, visualStyle: 'meme', useImage: false };
  }
  return { shouldReply: true, reply: 'KKKKK não esperava por essa', emotion: 'bored_judgment', intensity: 2, visualStyle: 'comedy', useImage: false };
};

export const chooseReaction = (
  catalog: ReactionAsset[],
  emotion: Emotion,
  intensity: number,
  recentIds: string[],
  random: () => number = Math.random
): ReactionAsset | undefined => {
  const candidates = catalog.filter((asset) => asset.approved && asset.enabled && asset.emotion === emotion);
  if (candidates.length === 0) return undefined;
  const fresh = candidates.filter((asset) => !recentIds.includes(asset.id));
  const eligible = fresh.length > 0 ? fresh : candidates;
  const closest = Math.min(...eligible.map((asset) => Math.abs(asset.intensity - intensity)));
  const pool = eligible.filter((asset) => Math.abs(asset.intensity - intensity) === closest);
  return pool[Math.floor(random() * pool.length)];
};
