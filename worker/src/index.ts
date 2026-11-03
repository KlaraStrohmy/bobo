/** Worker entrypoint: `/api/*` via Hono (assets are served by Workers Static Assets), cron reminders. */
import { createApp } from './app';
import type { Env } from './env';
import { reminderJob } from './reminders';
import { voteReminderJob } from './voteReminders';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(Promise.all([reminderJob(env, now), voteReminderJob(env, now)]));
  },
} satisfies ExportedHandler<Env>;
