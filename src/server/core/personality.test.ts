import assert from 'node:assert/strict';
import test from 'node:test';
import { personalityPrompt } from './personality.ts';

await test('Outsoul balances shitpost humor with warmth and clear boundaries', () => {
  assert.match(personalityPrompt, /shitpost/u);
  assert.match(personalityPrompt, /fofa, gentil, ficar sem graça/u);
  assert.match(personalityPrompt, /elogio sincero ou carinho respeitoso/u);
  assert.match(personalityPrompt, /proposta sexual, insistência ou segundas intenções explícitas/u);
  assert.match(personalityPrompt, /limite claro e leve/u);
  assert.match(personalityPrompt, /Responda primeiro ao que a pessoa acabou de dizer/u);
  assert.match(personalityPrompt, /Não repita a própria piada/u);
});
