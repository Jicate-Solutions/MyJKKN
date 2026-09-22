import { describe, expect, it } from 'vitest';
import { corsHeaders, preflight, resolveAllowedOrigin } from '@/lib/services/hr/public-careers/cors';
import { clientIp, createRateLimiter } from '@/lib/services/hr/public-careers/rate-limit';

describe('resolveAllowedOrigin', () => {
  it.each(['https://jkkn.ac.in', 'https://www.jkkn.ac.in', 'https://pharmacy.jkkn.ac.in', 'https://JKKN.AC.IN'])(
    'allows %s', (o) => expect(resolveAllowedOrigin(o, [])).toBe(o),
  );
  it.each([
    'http://jkkn.ac.in', 'https://evil-jkkn.ac.in', 'https://jkkn.ac.in.evil.com',
    'https://a.b.jkkn.ac.in', 'https://jkkn.ac.in:8443', 'null', '',
  ])('rejects %s', (o) => expect(resolveAllowedOrigin(o, [])).toBeNull());
  it('rejects a missing origin', () => expect(resolveAllowedOrigin(null, [])).toBeNull());
  it('allows configured extra origins exactly', () => {
    expect(resolveAllowedOrigin('http://localhost:3000', ['http://localhost:3000'])).toBe('http://localhost:3000');
    expect(resolveAllowedOrigin('http://localhost:3001', ['http://localhost:3000'])).toBeNull();
  });
});

describe('corsHeaders / preflight', () => {
  it('reflects an allowed origin and varies on Origin', () => {
    const h = corsHeaders('https://jkkn.ac.in');
    expect(h['Access-Control-Allow-Origin']).toBe('https://jkkn.ac.in');
    expect(h.Vary).toBe('Origin');
    expect(h['Access-Control-Allow-Credentials']).toBeUndefined();
  });
  it('emits no allow-origin for a disallowed origin', () => {
    expect(corsHeaders(null)['Access-Control-Allow-Origin']).toBeUndefined();
  });
  it('answers preflight with 204', () => {
    const res = preflight(new Request('https://x/api', { method: 'OPTIONS', headers: { Origin: 'https://jkkn.ac.in' } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
  });
});

describe('rate limiter', () => {
  it('allows `limit` hits per window, then blocks, then resets', () => {
    const hit = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(hit('ip', 0)).toBe(true);
    expect(hit('ip', 10)).toBe(true);
    expect(hit('ip', 20)).toBe(false);
    expect(hit('other', 20)).toBe(true);
    expect(hit('ip', 1001)).toBe(true);
  });
  it('keys on the proxy-appended (rightmost) hop, never the client-supplied leftmost one', () => {
    expect(clientIp(new Request('https://x', { headers: { 'x-forwarded-for': 'spoofed, 1.2.3.4' } }))).toBe('1.2.3.4');
    expect(clientIp(new Request('https://x', { headers: { 'x-real-ip': '5.6.7.8', 'x-forwarded-for': 'spoofed' } }))).toBe('5.6.7.8');
    expect(clientIp(new Request('https://x'))).toBe('unknown');
  });
});
