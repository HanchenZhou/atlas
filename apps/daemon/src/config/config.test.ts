import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, resolveAtlasHome } from './index';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'atlas-cfg-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('resolveAtlasHome', () => {
  it('falls back to ~/.atlas when ATLAS_HOME is unset', () => {
    expect(resolveAtlasHome({})).toBe(join(homedir(), '.atlas'));
  });

  it('honours ATLAS_HOME when set', () => {
    expect(resolveAtlasHome({ ATLAS_HOME: '/tmp/xyz' })).toBe('/tmp/xyz');
  });

  it('treats empty ATLAS_HOME as unset', () => {
    expect(resolveAtlasHome({ ATLAS_HOME: '' })).toBe(join(homedir(), '.atlas'));
  });
});

describe('loadConfig', () => {
  it('returns defaults when config.json is absent', async () => {
    const cfg = await loadConfig(home);
    expect(cfg.home).toBe(home);
    expect(cfg.daemon.port).toBe(3001);
    expect(cfg.defaults).toEqual({});
    expect(cfg.sessions.dir).toBe(join(home, 'sessions'));
    expect(cfg.credentialsPath).toBe(join(home, 'credentials.json'));
    expect(cfg.roles).toEqual({});
  });

  it('reads role overrides from config.json', async () => {
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({
        roles: {
          title: { model: 'k2-fast' },
          compaction: { providerId: 'openai', model: 'gpt-4o-mini' },
        },
      }),
    );
    const cfg = await loadConfig(home);
    expect(cfg.roles.title).toEqual({ model: 'k2-fast' });
    expect(cfg.roles.compaction).toEqual({
      providerId: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('reads daemon.port from config.json', async () => {
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ daemon: { port: 4000 } }),
    );
    const cfg = await loadConfig(home);
    expect(cfg.daemon.port).toBe(4000);
  });

  it('resolves a relative sessions.dir against home', async () => {
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ sessions: { dir: 'data/chats' } }),
    );
    const cfg = await loadConfig(home);
    expect(cfg.sessions.dir).toBe(join(home, 'data/chats'));
  });

  it('keeps an absolute sessions.dir as-is', async () => {
    const abs = mkdtempSync(join(tmpdir(), 'atlas-sessions-'));
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ sessions: { dir: abs } }),
    );
    const cfg = await loadConfig(home);
    expect(cfg.sessions.dir).toBe(abs);
    rmSync(abs, { recursive: true, force: true });
  });

  it('exposes defaults.providerId and model when set', async () => {
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ defaults: { providerId: 'kimi', model: 'k2' } }),
    );
    const cfg = await loadConfig(home);
    expect(cfg.defaults.providerId).toBe('kimi');
    expect(cfg.defaults.model).toBe('k2');
  });

  it('throws a clear error when config.json is malformed', async () => {
    writeFileSync(join(home, 'config.json'), '{not json');
    await expect(loadConfig(home)).rejects.toThrow(/config\.json/);
  });
});
