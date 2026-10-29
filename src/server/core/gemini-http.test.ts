import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchGeminiWithRetry, formatGeminiHttpError } from './gemini-http.ts';

await test('retries a transient Gemini 503 once and then returns success', async () => {
  let calls = 0;
  let waits = 0;
  const response = await fetchGeminiWithRetry('https://generativelanguage.googleapis.com/test', { method: 'POST' }, {
    timeoutMs: 100,
    wait: async () => { waits += 1; },
    fetcher: async () => {
      calls += 1;
      return calls === 1 ? new Response('busy', { status: 503 }) : new Response('ok', { status: 200 });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal(waits, 1);
});

await test('does not retry billing or not-found errors and retains safe Google diagnostics', async () => {
  let calls = 0;
  const response = await fetchGeminiWithRetry('https://generativelanguage.googleapis.com/test', { method: 'POST' }, {
    timeoutMs: 100,
    wait: async () => undefined,
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { status: 'PAYMENT_REQUIRED', message: 'Prepay balance is depleted' } }), { status: 402 });
    },
  });
  const error = await formatGeminiHttpError(response);
  assert.equal(calls, 1);
  assert.match(error.message, /gemini_http_402:payment_required:Prepay balance is depleted/);
});

await test('redacts Google API key shaped values from provider error messages', async () => {
  const response = new Response(JSON.stringify({ error: { message: 'Invalid key AIza123456789012345678901234567890123456' } }), { status: 400 });
  const error = await formatGeminiHttpError(response);
  assert.match(error.message, /\[redacted\]/);
  assert.doesNotMatch(error.message, /AIza123456789/);
});
