import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export type AppConfig = {
  home: string;
  daemon: { port: number };
  defaults: { providerId?: string; model?: string };
  sessions: { dir: string };
  credentialsPath: string;
};

const DEFAULT_PORT = 3001;

export function resolveAtlasHome(
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.ATLAS_HOME;
  if (override && override.length > 0) return override;
  return join(homedir(), '.atlas');
}

export async function loadConfig(home?: string): Promise<AppConfig> {
  const root = home ?? resolveAtlasHome();
  const file = join(root, 'config.json');
  const raw = await readFile(file, 'utf8').catch((err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  });

  let parsed: RawConfig = {};
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw) as RawConfig;
    } catch (err) {
      throw new Error(
        `failed to parse ${file}: ${(err as Error).message}`,
      );
    }
  }

  const sessionsDir = parsed.sessions?.dir
    ? isAbsolute(parsed.sessions.dir)
      ? parsed.sessions.dir
      : join(root, parsed.sessions.dir)
    : join(root, 'sessions');

  return {
    home: root,
    daemon: { port: parsed.daemon?.port ?? DEFAULT_PORT },
    defaults: {
      providerId: parsed.defaults?.providerId,
      model: parsed.defaults?.model,
    },
    sessions: { dir: sessionsDir },
    credentialsPath: join(root, 'credentials.json'),
  };
}

type RawConfig = {
  daemon?: { port?: number };
  defaults?: { providerId?: string; model?: string };
  sessions?: { dir?: string };
};
