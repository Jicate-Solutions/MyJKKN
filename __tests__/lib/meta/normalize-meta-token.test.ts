import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphRequest, normalizeMetaToken } from '@/lib/meta/graph-api-client';

// graphRequest wraps fetch in a Sentry span; run the callback directly so the
// test exercises only the Authorization header the client builds.
vi.mock('@sentry/nextjs', () => ({
  startSpan: (_ctx: unknown, cb: () => unknown) => cb(),
}));

/**
 * Regression guard for the ig-stories-poll outage.
 *
 * The production Meta token was pasted into its Vercel env var with a line
 * break in the MIDDLE (~129 characters survive after it; see
 * redact-credentials.test.ts and ig-stories-poll/route.ts), so Headers.append
 * rejected the Bearer header and every Graph call failed. .trim() cannot fix a
 * mid-value break; Meta tokens never contain whitespace, so all of it goes.
 */

// Shaped like a Meta token (same fixture as redact-credentials.test.ts); not a live credential.
const CLEAN = 'EAAGNeb4CWZCUBRgixZCZAioTE3vC1OAzhpG0VE8IF8DEBFFGa3bFw9pZA0biHtWayFOoZD';
const WRAPPED = `${CLEAN.slice(0, 32)}\n${CLEAN.slice(32)}`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('normalizeMetaToken', () => {
  it('removes a line break in the middle of the token (the wrapped-paste case)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizeMetaToken(WRAPPED, 'test:mid-newline')).toBe(CLEAN);
  });

  it('removes CRLF, tabs and spaces anywhere in the token', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const messy = ` ${CLEAN.slice(0, 10)}\r\n${CLEAN.slice(10, 40)}\t ${CLEAN.slice(40)}\n`;
    expect(normalizeMetaToken(messy, 'test:crlf')).toBe(CLEAN);
  });

  it('returns a clean token unchanged and does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizeMetaToken(CLEAN, 'test:clean')).toBe(CLEAN);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns undefined for empty, whitespace-only, null and undefined', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizeMetaToken('', 'test:empty')).toBeUndefined();
    expect(normalizeMetaToken(' \n\r\t', 'test:empty')).toBeUndefined();
    expect(normalizeMetaToken(null, 'test:empty')).toBeUndefined();
    expect(normalizeMetaToken(undefined)).toBeUndefined();
  });

  it('warns with the env var chain and the removed count, never any token characters', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeMetaToken(WRAPPED); // default source: the IG env var chain
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('META_IG_SYSTEM_USER_TOKEN');
    expect(message).toContain('Removed 1 whitespace character');
    expect(message).toContain('printf');
    // No run of 5 consecutive token characters may appear in the message.
    const leaked: string[] = [];
    for (let i = 0; i + 5 <= CLEAN.length; i++) {
      const window = CLEAN.slice(i, i + 5);
      if (message.includes(window)) leaked.push(window);
    }
    expect(leaked).toEqual([]);
  });

  it('warns only once per source, however many requests reuse the token', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeMetaToken(WRAPPED, 'test:repeat');
    normalizeMetaToken(WRAPPED, 'test:repeat');
    normalizeMetaToken(WRAPPED, 'test:repeat');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('graphRequest with a wrapped token', () => {
  it('the raw wrapped token is an invalid header value (the production failure)', () => {
    expect(() => new Headers({ Authorization: `Bearer ${WRAPPED}` })).toThrow();
  });

  it('sends a clean Bearer header instead of throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ id: '17841400000000000' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await graphRequest<{ id: string }>({ endpoint: '/me', accessToken: WRAPPED });

    expect(res.data.id).toBe('17841400000000000');
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${CLEAN}`);
    // What fetch does with that header in production must no longer throw.
    expect(() => new Headers(headers)).not.toThrow();
  });
});
