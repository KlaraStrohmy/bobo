/** Worker entrypoint: `/api/*` via Hono (assets are served by Workers Static Assets), cron reminders. */
import { createApp } from './app';
import type { Env } from './env';
import { reminderJob } from './reminders';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(reminderJob(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
