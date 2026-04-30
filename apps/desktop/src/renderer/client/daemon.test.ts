import { describe, it, expect } from 'bun:test';
import { parseSseFrames } from './daemon';

describe('parseSseFrames', () => {
  it('parses a single complete event', () => {
    const out = parseSseFrames('event: text-delta\ndata: {"text":"hi"}\n\n');
    expect(out.events).toEqual([
      { type: 'text-delta', text: 'hi' },
    ]);
    expect(out.remaining).toBe('');
  });

  it('parses multiple events in one buffer', () => {
    const buf =
      'event: text-delta\ndata: {"text":"a"}\n\n' +
      'event: text-delta\ndata: {"text":"b"}\n\n' +
      'event: done\ndata: {}\n\n';
    const out = parseSseFrames(buf);
    expect(out.events).toEqual([
      { type: 'text-delta', text: 'a' },
      { type: 'text-delta', text: 'b' },
      { type: 'done' },
    ]);
    expect(out.remaining).toBe('');
  });

  it('keeps incomplete trailing frame in remaining', () => {
    const out = parseSseFrames(
      'event: text-delta\ndata: {"text":"a"}\n\nevent: text-delta\ndata: {"tex',
    );
    expect(out.events).toEqual([{ type: 'text-delta', text: 'a' }]);
    expect(out.remaining).toBe('event: text-delta\ndata: {"tex');
  });

  it('handles \\r\\n line endings', () => {
    const out = parseSseFrames(
      'event: text-delta\r\ndata: {"text":"x"}\r\n\r\n',
    );
    expect(out.events).toEqual([{ type: 'text-delta', text: 'x' }]);
  });

  it('drops malformed frames without crashing', () => {
    const out = parseSseFrames(
      'event: text-delta\ndata: not-json\n\nevent: done\ndata: {}\n\n',
    );
    expect(out.events).toEqual([{ type: 'done' }]);
    expect(out.remaining).toBe('');
  });
});
