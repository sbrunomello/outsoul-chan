export const readRecentReplies = (value: string | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim().slice(0, 240)).filter(Boolean).slice(-4);
  } catch {
    return [];
  }
};

export const rememberRecentReply = (value: string | undefined, reply: string): string => {
  const normalized = reply.trim().replace(/\s+/gu, ' ').slice(0, 240);
  const recent = readRecentReplies(value).filter((entry) => entry.toLocaleLowerCase('pt-BR') !== normalized.toLocaleLowerCase('pt-BR'));
  return JSON.stringify([...recent, normalized].slice(-4));
};
