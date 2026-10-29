import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, reddit } from '@devvit/web/server';
import { createPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const username = context.username?.toLowerCase();
    if (!username) return c.json<UiResponse>({ showToast: 'Moderator access required' }, 403);
    const moderators = await reddit.getModerators({ subredditName: context.subredditName, limit: 100 }).all();
    if (!moderators.some((moderator) => moderator.username.toLowerCase() === username)) {
      return c.json<UiResponse>({ showToast: 'Moderator access required' }, 403);
    }
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});
