import { describe, it, expect } from 'vitest';
import { streamMatchPattern } from '@/lib/utils/bos/stream-filter';

// PostgREST `imatch` is Postgres `~*` (case-insensitive regex). A stream's
// punctuation must be matched LITERALLY: escaped, never deleted (W12 review,
// 24 Sep — deleting it turned "Arts (Hons)" into "Arts Hons").
// JS regex stands in for `~*` here: `[[:space:]]` → `\s`, flag `i`; the escapes
// used (backslash before punctuation) mean the same in both engines.
const asRegex = (p: string) => new RegExp(p.replace(/\[\[:space:\]\]/g, '\\s'), 'i');

describe('streamMatchPattern — punctuation is matched literally', () => {
  it.each([
    ['Arts (Hons)', ['Arts (Hons)', ' arts (hons) ', 'ARTS  (Hons)'], ['Arts Hons', 'Arts (Hons) X', 'ArtsHons']],
    ['B.Sc', ['B.Sc', 'b.sc'], ['BxSc', 'BSc']],
    ['Arts|.*', ['Arts|.*'], ['Arts', 'Science', '']],
    ['a+b?', ['a+b?'], ['aab', 'a']],
    ['[Science]{2}', ['[science]{2}'], ['S', 'Science2', 'ScienceScience']],
    ['Arts\\', ['Arts\\'], ['Arts']],
    ['50%_off', ['50%_off'], ['50off', '50x_off']],
    ['^Arts$', ['^Arts$'], ['Arts']],
  ])('%s', (input, matches, rejects) => {
    const p = streamMatchPattern(input)!;
    expect(p.startsWith('^[[:space:]]*')).toBe(true);
    expect(p.endsWith('[[:space:]]*$')).toBe(true);
    const re = asRegex(p);
    for (const m of matches) expect(re.test(m), `${input} should match ${JSON.stringify(m)}`).toBe(true);
    for (const r of rejects) expect(re.test(r), `${input} must not match ${JSON.stringify(r)}`).toBe(false);
  });

  it('only spaces → null (caller falls back to an exact match, never to no filter)', () => {
    expect(streamMatchPattern('   ')).toBeNull();
  });

  it('a value that is only metacharacters still filters, literally', () => {
    const re = asRegex(streamMatchPattern('.*()[]')!);
    expect(re.test('.*()[]')).toBe(true);
    expect(re.test('Arts')).toBe(false);
  });
});
