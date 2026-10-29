import assert from 'node:assert/strict';
import test from 'node:test';
import { formatConversationContext, loadConversationHistory } from './conversation.ts';
import { readRecentReplies, rememberRecentReply } from './reply-memory.ts';

await test('loads a bounded comment ancestry and formats it oldest first', async () => {
  const comments = new Map([
    ['t1_c', { authorName: 'mello', body: 'e esse meme?', parentId: 't1_b' }],
    ['t1_b', { authorName: 'outsoul-chan', body: 'o cachorro tá de gala', parentId: 't1_a' }],
    ['t1_a', { authorName: 'mello', body: 'olha o doguinho', parentId: 't3_post' }],
  ]);
  const history = await loadConversationHistory('t1_c', async (id) => {
    const comment = comments.get(id);
    if (!comment) throw new Error('missing comment');
    return comment;
  });
  assert.deepEqual(history.map((comment) => comment.authorName), ['mello', 'outsoul-chan', 'mello']);
  assert.match(formatConversationContext({ postContext: 'um post', history, recentReplies: [] }), /Conversation so far \(oldest first\):[\s\S]*olha o doguinho[\s\S]*o cachorro tá de gala[\s\S]*e esse meme\?/u);
});

await test('caps the number of comment lookups used for context', async () => {
  let lookups = 0;
  const history = await loadConversationHistory('t1_recent', async () => {
    lookups += 1;
    return { authorName: 'u', body: 'mensagem', parentId: `t1_${lookups}` };
  }, 2);
  assert.equal(history.length, 2);
  assert.equal(lookups, 2);
});

await test('keeps only four recent replies and avoids storing immediate duplicates', () => {
  const memory = rememberRecentReply(undefined, '  A mesma piada  ');
  assert.deepEqual(readRecentReplies(rememberRecentReply(memory, 'a mesma piada')), ['a mesma piada']);
  let recent: string | undefined;
  for (const reply of ['1', '2', '3', '4', '5']) recent = rememberRecentReply(recent, reply);
  assert.deepEqual(readRecentReplies(recent), ['2', '3', '4', '5']);
});
