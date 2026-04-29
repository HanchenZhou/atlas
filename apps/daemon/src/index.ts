import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3001);

console.log(`atlas daemon listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
