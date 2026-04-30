import { mkdir, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

export type Credential = Record<string, unknown>;

export const defaultCredentialsPath = (): string =>
  `${homedir()}/.atlas/credentials.json`;

export class CredentialStore {
  constructor(private readonly path: string = defaultCredentialsPath()) {}

  private async readAll(): Promise<Record<string, Credential>> {
    try {
      const raw = await readFile(this.path, 'utf8');
      return JSON.parse(raw) as Record<string, Credential>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  private async writeAll(all: Record<string, Credential>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(all, null, 2), {
      mode: 0o600,
    });
    await chmod(this.path, 0o600);
  }

  async get(providerId: string): Promise<Credential | undefined> {
    const all = await this.readAll();
    return all[providerId];
  }

  async set(providerId: string, credential: Credential): Promise<void> {
    const all = await this.readAll();
    all[providerId] = credential;
    await this.writeAll(all);
  }

  async delete(providerId: string): Promise<void> {
    const all = await this.readAll();
    if (!(providerId in all)) return;
    delete all[providerId];
    if (Object.keys(all).length === 0) {
      try {
        await unlink(this.path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      return;
    }
    await this.writeAll(all);
  }
}
