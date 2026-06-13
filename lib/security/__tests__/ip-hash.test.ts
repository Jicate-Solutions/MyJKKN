import { describe, it, expect } from 'vitest';
import { hashIp } from '../ip-hash';

describe('hashIp', () => {
  it('returns a 64-char hex string', () => {
    const result = hashIp('203.0.113.42');
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same IP within a day', () => {
    expect(hashIp('1.2.3.4')).toBe(hashIp('1.2.3.4'));
  });

  it('returns different hashes for different IPs', () => {
    expect(hashIp('1.1.1.1')).not.toBe(hashIp('2.2.2.2'));
  });

  it('handles empty/null input gracefully', () => {
    expect(hashIp('')).toBe('');
    expect(hashIp(null as unknown as string)).toBe('');
  });

  it('takes only the first IP if comma-separated (x-forwarded-for)', () => {
    const single = hashIp('1.2.3.4');
    const multi  = hashIp('1.2.3.4, 5.6.7.8');
    expect(single).toBe(multi);
  });
});
