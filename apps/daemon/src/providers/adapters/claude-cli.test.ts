import { describe, it, expect } from 'bun:test';
import { parseAuthStatus } from './claude-cli';

describe('parseAuthStatus', () => {
  it('parses modern JSON output with max subscription', () => {
    const stdout = JSON.stringify({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      email: 'user@example.com',
      subscriptionType: 'max',
    });
    const result = parseAuthStatus(stdout);
    expect(result.loggedIn).toBe(true);
    expect(result.detail).toContain('max');
    expect(result.detail).toContain('user@example.com');
  });

  it('parses modern JSON output when not logged in', () => {
    const stdout = JSON.stringify({ loggedIn: false });
    const result = parseAuthStatus(stdout);
    expect(result.loggedIn).toBe(false);
  });

  it('parses legacy text output with subscription', () => {
    const stdout = 'Logged in as foo@bar.com (subscription: pro)\n';
    const result = parseAuthStatus(stdout);
    expect(result.loggedIn).toBe(true);
    expect(result.detail).toBe('subscription: pro');
  });

  it('returns loggedIn=false on garbage output', () => {
    const result = parseAuthStatus('???');
    expect(result.loggedIn).toBe(false);
  });
});
