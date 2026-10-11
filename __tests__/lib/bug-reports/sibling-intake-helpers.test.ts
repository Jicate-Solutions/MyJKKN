/**
 * Pure helpers of the college-app bug intake (lib/bug-reports/sibling-intake.ts):
 * the caller key every limit shares, and the byte caps that bound a stored row.
 */
import { describe, it, expect } from 'vitest';
import { boundedJson, callerKeyFromIp, jsonBytes, newestEntriesWithin } from '@/lib/bug-reports/sibling-intake';

describe('callerKeyFromIp', () => {
  it.each([
    ['203.0.113.9', '203.0.113.9'],
    // IPv4-mapped IPv6 is the IPv4 caller, in either spelling
    ['::ffff:203.0.113.9', '203.0.113.9'],
    ['0:0:0:0:0:ffff:cb00:7109', '203.0.113.9'],
    ['::FFFF:198.51.100.7', '198.51.100.7'],
    // IPv6 by its /64, fully expanded, leading zeros dropped
    ['2001:db8:aa:bb:1:2:3:4', '2001:db8:aa:bb::/64'],
    ['2001:0db8:00aa:00bb::9', '2001:db8:aa:bb::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['[2001:db8:aa:bb::1]', '2001:db8:aa:bb::/64'],
    ['fe80::1%en0', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
  ])('%s → %s', (ip, key) => {
    expect(callerKeyFromIp(ip)).toBe(key);
  });

  it('keeps an unparseable address whole instead of merging it with others', () => {
    expect(callerKeyFromIp('2001:db8::1::2')).toBe('raw:2001:db8::1::2');
    expect(callerKeyFromIp('::ffff:999.1.1.1')).toBe('raw:::ffff:999.1.1.1');
  });

  it('two mapped strangers are two callers, not one shared ::/64', () => {
    expect(callerKeyFromIp('::ffff:203.0.113.9')).not.toBe(callerKeyFromIp('::ffff:198.51.100.7'));
  });
});

describe('byte caps', () => {
  it('jsonBytes counts UTF-8 bytes of the JSON', () => {
    expect(jsonBytes('語')).toBe(5); // two quotes + three bytes
    expect(jsonBytes(undefined)).toBe(0);
  });

  it('boundedJson keeps a value that fits and drops one that does not', () => {
    expect(boundedJson({ a: 1 }, 100)).toEqual({ a: 1 });
    expect(boundedJson({ a: 'x'.repeat(200) }, 100)).toBeNull();
    expect(boundedJson(undefined, 100)).toBeNull();
  });

  it('newestEntriesWithin keeps the newest entries that fit, in order, and skips one too big alone', () => {
    const entries = [{ n: 1 }, { n: 2 }, { big: 'x'.repeat(500) }, { n: 3 }, { n: 4 }];
    const kept = newestEntriesWithin(entries, 20)!;
    expect(kept).toEqual([{ n: 3 }, { n: 4 }]);
    expect(jsonBytes(kept)).toBeLessThanOrEqual(20);
    expect(newestEntriesWithin([], 30)).toBeNull();
    expect(newestEntriesWithin(null, 30)).toBeNull();
  });
});
