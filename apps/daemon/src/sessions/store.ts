import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type SessionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type Session = {
  id: string;
  title: string;
  providerId: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  messages: SessionMessage[];
};

export type SessionSummary = Omit<Session, 'messages'>;

export type CreateSessionInput = {
  providerId: string;
  model?: string;
  title?: string;
};

const TITLE_MAX = 60;

export class FileSessionStore {
  constructor(private readonly dir: string) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const now = new Date().toISOString();
    const session: Session = {
      id: crypto.randomUUID(),
      title: input.title ?? '',
      providerId: input.providerId,
      model: input.model,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await this.write(session);
    return session;
  }

  async get(id: string): Promise<Session | undefined> {
    try {
      const raw = await readFile(this.fileFor(id), 'utf8');
      return JSON.parse(raw) as Session;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  }

  async list(): Promise<SessionSummary[]> {
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const summaries: SessionSummary[] = [];
    for (const f of entries) {
      if (!f.endsWith('.json')) continue;
      const raw = await readFile(join(this.dir, f), 'utf8');
      const s = JSON.parse(raw) as Session;
      const { messages: _omit, ...summary } = s;
      summaries.push(summary);
    }
    summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return summaries;
  }

  async appendMessage(id: string, msg: SessionMessage): Promise<Session> {
    const session = await this.get(id);
    if (!session) throw new Error(`session not found: ${id}`);
    session.messages.push(msg);
    if (!session.title && msg.role === 'user') {
      session.title = msg.content.slice(0, TITLE_MAX);
    }
    session.updatedAt = new Date().toISOString();
    await this.write(session);
    return session;
  }

  async delete(id: string): Promise<void> {
    try {
      await unlink(this.fileFor(id));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }

  private fileFor(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  private async write(session: Session): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const target = this.fileFor(session.id);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(session, null, 2));
    await rename(tmp, target);
  }
}
