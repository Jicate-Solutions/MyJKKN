/**
 * Proves the tournament route fold is behaviour-preserving.
 *
 * 11 files under `app/api/events/tournament/[eventId]/**` became one optional
 * catch-all (Vercel's 2048-route cap; production failed at 2061). This test is
 * the contract that the fold did not move, drop or shadow a single URL: every
 * original path x method pair must still land on the same handler code.
 *
 * The expectations below are transcribed from the file list on jicate/main at
 * the time of the fold, not generated from the table — a table that lost an
 * entry would still agree with itself.
 */

import { describe, expect, it, vi } from 'vitest';

// `server-only` is a Next.js build-time marker with no npm package behind it;
// it exists only to make a server module fail if a client bundle imports it.
// Under vitest there is no bundler to provide it, so stub it out.
vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';

import type { TournamentMethod } from '@/lib/api/events/tournament/dispatch';

// The table imports all 11 handler modules, and some of the services they pull
// in build a Supabase client at import time. Give them something to read first
// — same pattern as __tests__/resource-management/download-resource-template.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';

const { TOURNAMENT_ROUTES, assertTableOrder, matchTournamentRoute } = await import(
  '@/lib/api/events/tournament/dispatch'
);

const routeModule = await import('@/app/api/events/tournament/[eventId]/[[...slug]]/route');

/** Realistic segment values — the shapes these endpoints actually receive. */
const EVENT_ID = '7c9f2a10-4b3d-4e51-9f80-1a2b3c4d5e6f';
const ENTRY_ID = 'b31f4d62-0c8a-4a77-9e10-5d6f7a8b9c0d';
const MATCH_ID = 'e4a1c8f3-2b56-4d90-8c31-7f0e9a2b4d6c';

interface Expected {
  /** The URL under /api/events/tournament/[eventId], as callers write it. */
  url: string;
  /** Slug segments Next.js hands the catch-all for that URL. */
  slug: string[];
  /** The handler module this must reach. */
  name: string;
  /** Dynamic params the handler will read (eventId is added by the route). */
  params: Record<string, string>;
  /** Exactly the methods the original file exported. */
  methods: TournamentMethod[];
}

/** One row per original route.ts file. 11 of them. */
const ORIGINALS: Expected[] = [
  { url: 'award', slug: ['award'], name: 'award', params: {}, methods: ['POST'] },
  { url: 'entries', slug: ['entries'], name: 'entries', params: {}, methods: ['GET'] },
  {
    url: `entries/${ENTRY_ID}`,
    slug: ['entries', ENTRY_ID],
    name: 'entries-entry',
    params: { entryId: ENTRY_ID },
    methods: ['PATCH', 'DELETE'],
  },
  {
    url: `entries/${ENTRY_ID}/pay`,
    slug: ['entries', ENTRY_ID, 'pay'],
    name: 'entries-entry-pay',
    params: { entryId: ENTRY_ID },
    methods: ['POST'],
  },
  { url: 'fixtures', slug: ['fixtures'], name: 'fixtures', params: {}, methods: ['POST'] },
  { url: 'matches', slug: ['matches'], name: 'matches', params: {}, methods: ['GET'] },
  {
    url: `matches/${MATCH_ID}`,
    slug: ['matches', MATCH_ID],
    name: 'matches-match',
    params: { matchId: MATCH_ID },
    methods: ['PATCH'],
  },
  {
    url: `matches/${MATCH_ID}/result`,
    slug: ['matches', MATCH_ID, 'result'],
    name: 'matches-match-result',
    params: { matchId: MATCH_ID },
    methods: ['POST'],
  },
  {
    url: 'payment/callback',
    slug: ['payment', 'callback'],
    name: 'payment-callback',
    params: {},
    methods: ['POST'],
  },
  {
    url: 'public-register',
    slug: ['public-register'],
    name: 'public-register',
    params: {},
    methods: ['POST'],
  },
  { url: 'qr/generate', slug: ['qr', 'generate'], name: 'qr-generate', params: {}, methods: ['GET'] },
];

const ALL_METHODS: TournamentMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

describe('tournament catch-all dispatch', () => {
  it('covers exactly the 11 route files that were folded', () => {
    expect(ORIGINALS).toHaveLength(11);
    expect(TOURNAMENT_ROUTES).toHaveLength(11);

    const names = TOURNAMENT_ROUTES.map((r) => r.name);
    expect(new Set(names).size).toBe(11);
    expect([...names].sort()).toEqual([...ORIGINALS.map((o) => o.name)].sort());
  });

  it.each(ORIGINALS)('resolves /$url to the $name handler', (expected) => {
    const match = matchTournamentRoute(expected.slug);

    expect(match, `no table entry matched /${expected.url}`).not.toBeNull();
    expect(match!.route.name).toBe(expected.name);
    expect(match!.params).toEqual(expected.params);
  });

  it.each(ORIGINALS)('/$url still answers exactly its original methods', (expected) => {
    const match = matchTournamentRoute(expected.slug)!;

    // Declared methods match the original file's exports...
    expect([...match.route.methods].sort()).toEqual([...expected.methods].sort());

    // ...and the module really exports a function for each one, so the
    // dispatcher cannot 405 a path that used to work.
    for (const method of expected.methods) {
      expect(typeof match.route.module[method], `${expected.url} ${method}`).toBe('function');
    }

    // Every other verb must be absent, so the dispatcher 405s exactly where
    // Next.js used to.
    for (const method of ALL_METHODS.filter((m) => !expected.methods.includes(m))) {
      expect(match.route.module[method], `${expected.url} ${method} should not exist`).toBeUndefined();
    }
  });

  it('builds the params the handler will read, eventId included', () => {
    const entry = matchTournamentRoute(['entries', ENTRY_ID, 'pay'])!;
    expect({ eventId: EVENT_ID, ...entry.params }).toEqual({
      eventId: EVENT_ID,
      entryId: ENTRY_ID,
    });

    const fixture = matchTournamentRoute(['matches', MATCH_ID, 'result'])!;
    expect({ eventId: EVENT_ID, ...fixture.params }).toEqual({
      eventId: EVENT_ID,
      matchId: MATCH_ID,
    });
  });

  it('leaves the bare [eventId] URL unrouted, exactly as before the fold', () => {
    // No app/api/events/tournament/[eventId]/route.ts ever existed, so this
    // URL was a 404 and must stay one. The optional catch-all now receives it,
    // which is why the table must NOT carry an empty-segment entry.
    expect(matchTournamentRoute(undefined)).toBeNull();
    expect(matchTournamentRoute([])).toBeNull();
  });

  it('prefers the literal two-segment paths over the dynamic id patterns', () => {
    expect(matchTournamentRoute(['payment', 'callback'])?.route.name).toBe('payment-callback');
    expect(matchTournamentRoute(['qr', 'generate'])?.route.name).toBe('qr-generate');
    expect(matchTournamentRoute(['entries', 'anything'])?.route.name).toBe('entries-entry');
    expect(matchTournamentRoute(['matches', 'anything'])?.route.name).toBe('matches-match');
  });

  it('has no pattern shadowing a later one', () => {
    expect(assertTableOrder()).toEqual([]);
  });

  it.each([
    [[]],
    [['nope']],
    [['payment']],
    [['qr']],
    [['entries', ENTRY_ID, 'nope']],
    [['entries', ENTRY_ID, 'pay', 'extra']],
    [['matches', MATCH_ID, 'nope']],
    [['matches', MATCH_ID, 'result', 'extra']],
    [['payment', 'callback', 'extra']],
    [['qr', 'generate', 'extra']],
    [['award', 'extra']],
    [['public-register', 'extra']],
    [['fixtures', 'extra']],
  ])('rejects the unknown path /%s', (slug) => {
    expect(matchTournamentRoute(slug)).toBeNull();
  });

  it('rejects a wrong method on a known path, and can name the allowed ones', () => {
    const list = matchTournamentRoute(['entries'])!;
    expect(list.route.module.POST).toBeUndefined();
    expect(list.route.methods.join(', ')).toBe('GET');

    const register = matchTournamentRoute(['public-register'])!;
    expect(register.route.module.GET).toBeUndefined();
    expect(register.route.methods.join(', ')).toBe('POST');

    const entry = matchTournamentRoute(['entries', ENTRY_ID])!;
    expect(entry.route.module.GET).toBeUndefined();
    expect(entry.route.methods.join(', ')).toBe('PATCH, DELETE');
  });
});

/**
 * The two branches of the real route file that never reach a handler, so they
 * can be exercised without a database. Everything else in the route is "look
 * the path up, then call what the table returned", which the block above
 * pins down.
 */
describe('the catch-all route file itself', () => {
  const url = (path: string) => `https://jkkn.ai/api/events/tournament/${EVENT_ID}${path}`;

  it('keeps force-dynamic and the widest maxDuration of the originals', () => {
    expect(routeModule.dynamic).toBe('force-dynamic');
    expect(routeModule.maxDuration).toBe(60);
  });

  it('exports the union of the methods the 11 originals exported', () => {
    expect(typeof routeModule.GET).toBe('function');
    expect(typeof routeModule.POST).toBe('function');
    expect(typeof routeModule.PATCH).toBe('function');
    expect(typeof routeModule.DELETE).toBe('function');
    // None of the originals had PUT, so Next.js keeps answering 405 itself.
    expect('PUT' in routeModule).toBe(false);
  });

  it('404s a path no original file served', async () => {
    const request = new NextRequest(url('/nope'));
    const response = await routeModule.GET(request, {
      params: Promise.resolve({ eventId: EVENT_ID, slug: ['nope'] }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Not found' });
  });

  it('404s the bare [eventId] URL the catch-all now receives', async () => {
    const request = new NextRequest(url(''));
    const response = await routeModule.GET(request, {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });

    expect(response.status).toBe(404);
  });

  it('405s a known path with a method its handler never exported, and says what is allowed', async () => {
    const request = new NextRequest(url('/entries'), { method: 'POST' });
    const response = await routeModule.POST(request, {
      params: Promise.resolve({ eventId: EVENT_ID, slug: ['entries'] }),
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Method not allowed' });
  });

  it('405s DELETE on a sibling but leaves it working on an entry', async () => {
    const blocked = await routeModule.DELETE(new NextRequest(url('/matches'), { method: 'DELETE' }), {
      params: Promise.resolve({ eventId: EVENT_ID, slug: ['matches'] }),
    });
    expect(blocked.status).toBe(405);
    expect(blocked.headers.get('Allow')).toBe('GET');

    // entries/[entryId] does export DELETE, so it must NOT be short-circuited.
    const entry = matchTournamentRoute(['entries', ENTRY_ID])!;
    expect(typeof entry.route.module.DELETE).toBe('function');
  });
});
