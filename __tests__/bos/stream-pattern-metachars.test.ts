import { describe, it, expect } from 'vitest';
import { streamMatchPattern } from '@/lib/utils/bos/stream-filter';

// W12 desk review question (24 Sep): PostgREST `imatch` is a POSIX regex, so a
// stream value carrying regex metacharacters must never reach the pattern.
describe('streamMatchPattern — regex metacharacters never reach imatch', () => {
  const META = /[.*+?()[\]{}|\\%_]/;
  const body = (p: string | null) =>
    (p ?? '').replace(/^\^\[\[:space:\]\]\*/, '').replace(/\[\[:space:\]\]\*\$$/, '').split('[[:space:]]+').join(' ');

  it.each([
    ['Arts (Hons)', 'Arts Hons'],
    ['B.Sc', 'BSc'],
    ['Arts|.*', 'Arts'],
    ['a+b?', 'ab'],
    ['[Science]{2}', 'Science2'],
    ['Arts\\', 'Arts'],
    ['50%_off', '50off'],
  ])('%s → literal text only', (input, expected) => {
    const p = streamMatchPattern(input);
    expect(body(p)).toBe(expected);
    expect(body(p)).not.toMatch(META);
    // The whole pattern compiles as a regex and is anchored.
    expect(() => new RegExp(p!.replace(/\[\[:space:\]\]/g, '\\s'))).not.toThrow();
    expect(p!.startsWith('^')).toBe(true);
    expect(p!.endsWith('$')).toBe(true);
  });

  it('only metacharacters → null (caller falls back to an exact match, never to no filter)', () => {
    expect(streamMatchPattern('.*()[]')).toBeNull();
  });
});
