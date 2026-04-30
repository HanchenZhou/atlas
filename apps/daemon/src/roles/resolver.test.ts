import { describe, it, expect } from 'bun:test';
import { RoleResolver } from './resolver';

describe('RoleResolver.resolve', () => {
  it('returns empty when nothing is configured', () => {
    const r = new RoleResolver({}, {});
    expect(r.resolve('title')).toEqual({});
  });

  it('falls back to defaults when role is unset', () => {
    const r = new RoleResolver({ providerId: 'kimi', model: 'k2' }, {});
    expect(r.resolve('title')).toEqual({ providerId: 'kimi', model: 'k2' });
  });

  it('lets role override individual fields, falling back to defaults for the rest', () => {
    const r = new RoleResolver(
      { providerId: 'kimi', model: 'k2' },
      { title: { model: 'k2-fast' } },
    );
    expect(r.resolve('title')).toEqual({ providerId: 'kimi', model: 'k2-fast' });
  });

  it('lets role override providerId fully', () => {
    const r = new RoleResolver(
      { providerId: 'kimi', model: 'k2' },
      { compaction: { providerId: 'openai', model: 'gpt-4o-mini' } },
    );
    expect(r.resolve('compaction')).toEqual({
      providerId: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('treats unknown role names as falling back to defaults', () => {
    const r = new RoleResolver({ providerId: 'kimi' }, {});
    expect(r.resolve('does-not-exist')).toEqual({ providerId: 'kimi' });
  });
});
