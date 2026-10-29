const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type GeminiHttpOptions = {
  timeoutMs: number;
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
};

const retryable = (status: number): boolean => status === 408 || status === 429 || status >= 500;

export const fetchGeminiWithRetry = async (
  url: string,
  init: RequestInit,
  options: GeminiHttpOptions,
): Promise<Response> => {
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs) });
    } catch (error) {
      if (attempt === 1) throw error;
      await wait(500 + Math.floor(Math.random() * 250));
      continue;
    }
    if (attempt === 1 || !retryable(response.status)) return response;
    if (response.body) await response.body.cancel().catch(() => undefined);
    await wait(500 + Math.floor(Math.random() * 250));
  }
  throw new Error('gemini_network_error');
};

export const formatGeminiHttpError = async (response: Response): Promise<Error> => {
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = undefined; }
  const details = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
  const status = details && typeof details.status === 'string' ? details.status : undefined;
  const message = details && typeof details.message === 'string'
    ? details.message.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]').replace(/[\r\n\t]+/g, ' ').slice(0, 240)
    : undefined;
  return new Error([
    `gemini_http_${response.status}`,
    status?.toLowerCase(),
    message,
  ].filter(Boolean).join(':'));
};
