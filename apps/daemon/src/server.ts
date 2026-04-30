import { app } from './index';

const port = Number(process.env.PORT ?? 3001);
console.log(`atlas daemon listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
