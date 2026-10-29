import { Hono } from 'hono';
import type {
  OnCommentCreateRequest,
  OnPostCreateRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import { handleComment, handleDeferredReply, handlePost } from '../core/interactions';

export const triggers = new Hono();

triggers.post('/on-comment-create', async (c) => {
  try {
    await handleComment(await c.req.json<OnCommentCreateRequest>());
    return c.json<TriggerResponse>({ status: 'ok' }, 200);
  } catch (error) {
    console.error(JSON.stringify({ event: 'comment_trigger_failed', error: error instanceof Error ? error.name : 'unknown' }));
    return c.json<TriggerResponse>({ status: 'error' }, 500);
  }
});

triggers.post('/on-post-create', async (c) => {
  try {
    await handlePost(await c.req.json<OnPostCreateRequest>());
    return c.json<TriggerResponse>({ status: 'ok' }, 200);
  } catch (error) {
    console.error(JSON.stringify({ event: 'post_trigger_failed', error: error instanceof Error ? error.name : 'unknown' }));
    return c.json<TriggerResponse>({ status: 'error' }, 500);
  }
});

triggers.post('/scheduler/deferred-reply', async (c) => {
  try {
    const request = await c.req.json<TaskRequest<{ eventId: string }>>();
    const eventId = request.data?.eventId;
    if (!eventId || !/^[a-zA-Z0-9_-]{1,80}$/u.test(eventId)) {
      return c.json<TaskResponse>({}, 400);
    }
    await handleDeferredReply(eventId);
    return c.json<TaskResponse>({}, 200);
  } catch (error) {
    console.error(JSON.stringify({ event: 'deferred_reply_job_failed', error: error instanceof Error ? error.name : 'unknown' }));
    return c.json<TaskResponse>({}, 500);
  }
});
