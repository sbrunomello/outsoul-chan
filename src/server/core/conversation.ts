export type ConversationComment = {
  authorName: string;
  body: string;
  parentId: string;
};

export type ConversationLookup = (id: `t1_${string}`) => Promise<ConversationComment>;

export const MAX_THREAD_CONTEXT_COMMENTS = 6;
export const THREAD_CONTEXT_TIMEOUT_MS = 1_200;

const asCommentId = (id: string): `t1_${string}` =>
  id.startsWith('t1_') ? `t1_${id.slice(3)}` : `t1_${id}`;

export const loadConversationHistory = async (
  parentId: string,
  lookup: ConversationLookup,
  maxComments = MAX_THREAD_CONTEXT_COMMENTS,
  timeoutMs = THREAD_CONTEXT_TIMEOUT_MS,
): Promise<ConversationComment[]> => {
  const collected: ConversationComment[] = [];
  const visited = new Set<string>();
  const load = async (): Promise<ConversationComment[]> => {
    let nextId = parentId;
    while (nextId.startsWith('t1_') && collected.length < maxComments && !visited.has(nextId)) {
      visited.add(nextId);
      try {
        const comment = await lookup(asCommentId(nextId));
        if (comment.body.trim()) collected.push(comment);
        nextId = comment.parentId;
      } catch {
        break;
      }
    }
    return [...collected].reverse();
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ConversationComment[]>((resolve) => {
    timer = setTimeout(() => resolve([...collected].reverse()), timeoutMs);
  });
  try {
    return await Promise.race([load(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const formatConversationContext = (input: {
  postContext: string;
  history: ConversationComment[];
  recentReplies: string[];
}): string => {
  const sections = [`Post context: ${input.postContext.slice(0, 2_400)}`];
  const history = input.history
    .slice(-MAX_THREAD_CONTEXT_COMMENTS)
    .map((comment) => `${comment.authorName.slice(0, 60)}: ${comment.body.trim().slice(0, 450)}`)
    .join('\n');
  if (history) sections.push(`Conversation so far (oldest first):\n${history}`);
  const recentReplies = input.recentReplies.slice(-4).map((reply) => `- ${reply.slice(0, 240)}`).join('\n');
  if (recentReplies) sections.push(`Recent Outsoul replies on this post; do not reuse their joke or phrasing:\n${recentReplies}`);
  return sections.join('\n\n').slice(0, 4_800);
};
