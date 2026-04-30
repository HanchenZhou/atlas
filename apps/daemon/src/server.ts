import { loadConfig } from './config';
import { buildApp, createDefaultRegistry } from './index';
import { CredentialStore } from './providers/credentials';
import { FileSessionStore } from './sessions/store';

const config = await loadConfig();
const credentials = new CredentialStore(config.credentialsPath);
const sessions = new FileSessionStore(config.sessions.dir);
const registry = createDefaultRegistry(credentials);
const app = buildApp({ registry, sessions });

const port = Number(process.env.PORT ?? config.daemon.port);
console.log(`atlas daemon listening on :${port} (home: ${config.home})`);

export default {
  port,
  fetch: app.fetch,
};
