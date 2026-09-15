/**
 * Proves the marathon route fold is behaviour-preserving.
 *
 * 23 files under `app/api/events/marathon/[eventId]/**` became one optional
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

import type { MarathonMethod } from '@/lib/api/events/marathon/dispatch';

// The table imports all 23 handler modules, and some of the services they pull
// in build a Supabase client at import time. Give them something to read first
// — same pattern as __tests__/resource-management/download-resource-template.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';

const { MARATHON_ROUTES, assertTableOrder, matchMarathonRoute } = await import(
  '@/lib/api/events/marathon/dispatch'
);

const routeModule = await import('@/app/api/events/marathon/[eventId]/[[...slug]]/route');

/** Realistic segment values — the shapes these endpoints actually receive. */
const EVENT_ID = '7c9f2a10-4b3d-4e51-9f80-1a2b3c4d5e6f';
const TRANSACTION_ID = 'MRTHN_TXN_20260914_0042';
const BIB_NUMBER = '1042';
const PHONE = '9876543210';
const BIB = '1042';
const CERT_ID = 'cert_9a7b3c1d';

interface Expected {
  /** The URL under /api/events/marathon/[eventId], as callers write it. */
  url: string;
  /** Slug segments Next.js hands the catch-all for that URL. */
  slug: string[];
  /** The handler module this must reach. */
  name: string;
  /** Dynamic params the handler will read (eventId is added by the route). */
  params: Record<string, string>;
  /** Exactly the methods the original file exported. */
  methods: MarathonMethod[];
}

/** One row per original route.ts file. 23 of them. */
const ORIGINALS: Expected[] = [
  { url: '', slug: [], name: 'event-detail', params: {}, methods: ['GET'] },
  { url: 'bulk-register', slug: ['bulk-register'], name: 'bulk-register', params: {}, methods: ['GET', 'POST'] },
  { url: 'categories', slug: ['categories'], name: 'categories', params: {}, methods: ['GET'] },
  { url: 'committees', slug: ['committees'], name: 'committees', params: {}, methods: ['POST', 'PUT', 'PATCH'] },
  { url: 'ops/profile-map', slug: ['ops', 'profile-map'], name: 'ops-profile-map', params: {}, methods: ['GET'] },
  { url: 'participant-lookup', slug: ['participant-lookup'], name: 'participant-lookup', params: {}, methods: ['GET'] },
  { url: 'payment/callback', slug: ['payment', 'callback'], name: 'payment-callback', params: {}, methods: ['GET', 'POST'] },
  { url: 'payment/initiate', slug: ['payment', 'initiate'], name: 'payment-initiate', params: {}, methods: ['POST'] },
  { url: 'payment/pre-register', slug: ['payment', 'pre-register'], name: 'payment-pre-register', params: {}, methods: ['POST'] },
  {
    url: `payment/status/${TRANSACTION_ID}`,
    slug: ['payment', 'status', TRANSACTION_ID],
    name: 'payment-status',
    params: { transactionId: TRANSACTION_ID },
    methods: ['GET'],
  },
  {
    url: `qr/${BIB_NUMBER}`,
    slug: ['qr', BIB_NUMBER],
    name: 'qr-bib',
    params: { bibNumber: BIB_NUMBER },
    methods: ['GET'],
  },
  { url: 'qr/bulk', slug: ['qr', 'bulk'], name: 'qr-bulk', params: {}, methods: ['GET'] },
  { url: 'qr/generate', slug: ['qr', 'generate'], name: 'qr-generate', params: {}, methods: ['POST'] },
  { url: 'race/checkpoint', slug: ['race', 'checkpoint'], name: 'race-checkpoint', params: {}, methods: ['POST'] },
  { url: 'race/share', slug: ['race', 'share'], name: 'race-share', params: {}, methods: ['GET'] },
  { url: 'race/track', slug: ['race', 'track'], name: 'race-track', params: {}, methods: ['POST'] },
  { url: 'register', slug: ['register'], name: 'register', params: {}, methods: ['POST'] },
  {
    url: `registrations/${PHONE}`,
    slug: ['registrations', PHONE],
    name: 'registrations-phone',
    params: { phone: PHONE },
    methods: ['GET'],
  },
  { url: `results/${BIB}`, slug: ['results', BIB], name: 'results-bib', params: { bib: BIB }, methods: ['GET'] },
  { url: 'results', slug: ['results'], name: 'results', params: {}, methods: ['GET'] },
  { url: 'sponsors', slug: ['sponsors'], name: 'sponsors', params: {}, methods: ['GET'] },
  { url: 'stats', slug: ['stats'], name: 'stats', params: {}, methods: ['GET'] },
  {
    url: `verify/${CERT_ID}`,
    slug: ['verify', CERT_ID],
    name: 'verify-cert',
    params: { certId: CERT_ID },
    methods: ['GET'],
  },
];

const ALL_METHODS: MarathonMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

describe('marathon catch-all dispatch', () => {
  it('covers exactly the 23 route files that were folded', () => {
    expect(ORIGINALS).toHaveLength(23);
    expect(MARATHON_ROUTES).toHaveLength(23);

    const names = MARATHON_ROUTES.map((r) => r.name);
    expect(new Set(names).size).toBe(23);
    expect([...names].sort()).toEqual([...ORIGINALS.map((o) => o.name)].sort());
  });

  it.each(ORIGINALS)('resolves /$url to the $name handler', (expected) => {
    const match = matchMarathonRoute(expected.slug);

    expect(match, `no table entry matched /${expected.url}`).not.toBeNull();
    expect(match!.route.name).toBe(expected.name);
    expect(match!.params).toEqual(expected.params);
  });

  it.each(ORIGINALS)('/$url still answers exactly its original methods', (expected) => {
    const match = matchMarathonRoute(expected.slug)!;

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
    const match = matchMarathonRoute(['payment', 'status', TRANSACTION_ID])!;
    const params = { eventId: EVENT_ID, ...match.params };

    expect(params).toEqual({ eventId: EVENT_ID, transactionId: TRANSACTION_ID });
  });

  it('treats a missing slug as the bare [eventId] endpoint', () => {
    expect(matchMarathonRoute(undefined)?.route.name).toBe('event-detail');
    expect(matchMarathonRoute([])?.route.name).toBe('event-detail');
  });

  it('prefers the literal qr sub-paths over the dynamic bib number', () => {
    expect(matchMarathonRoute(['qr', 'bulk'])?.route.name).toBe('qr-bulk');
    expect(matchMarathonRoute(['qr', 'generate'])?.route.name).toBe('qr-generate');
    expect(matchMarathonRoute(['qr', '9001'])?.route.name).toBe('qr-bib');
  });

  it('has no pattern shadowing a later one', () => {
    expect(assertTableOrder()).toEqual([]);
  });

  it.each([
    [['nope']],
    [['payment']],
    [['payment', 'status']],
    [['payment', 'status', TRANSACTION_ID, 'extra']],
    [['qr']],
    [['results', BIB, 'splits']],
    [['ops']],
    [['ops', 'profile-map', 'x']],
    [['register', 'bulk']],
  ])('rejects the unknown path /%s', (slug) => {
    expect(matchMarathonRoute(slug)).toBeNull();
  });

  it('rejects a wrong method on a known path, and can name the allowed ones', () => {
    const stats = matchMarathonRoute(['stats'])!;
    expect(stats.route.module.POST).toBeUndefined();
    expect(stats.route.methods.join(', ')).toBe('GET');

    const register = matchMarathonRoute(['register'])!;
    expect(register.route.module.GET).toBeUndefined();
    expect(register.route.methods.join(', ')).toBe('POST');

    const committees = matchMarathonRoute(['committees'])!;
    expect(committees.route.module.GET).toBeUndefined();
    expect(committees.route.methods.join(', ')).toBe('POST, PUT, PATCH');
  });
});

/**
 * The two branches of the real route file that never reach a handler, so they
 * can be exercised without a database. Everything else in the route is "look
 * the path up, then call what the table returned", which the block above
 * pins down.
 */
describe('the catch-all route file itself', () => {
  const url = (path: string) => `https://jkkn.ai/api/events/marathon/${EVENT_ID}${path}`;

  it('keeps force-dynamic and the widest maxDuration of the originals', () => {
    expect(routeModule.dynamic).toBe('force-dynamic');
    expect(routeModule.maxDuration).toBe(120);
  });

  it('exports the union of the methods the 23 originals exported', () => {
    expect(typeof routeModule.GET).toBe('function');
    expect(typeof routeModule.POST).toBe('function');
    expect(typeof routeModule.PUT).toBe('function');
    expect(typeof routeModule.PATCH).toBe('function');
    // None of the originals had DELETE, so Next.js keeps answering 405 itself.
    expect('DELETE' in routeModule).toBe(false);
  });

  it('404s a path no original file served', async () => {
    const request = new NextRequest(url('/nope'));
    const response = await routeModule.GET(request, {
      params: Promise.resolve({ eventId: EVENT_ID, slug: ['nope'] }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Not found' });
  });

  it('405s a known path with a method its handler never exported, and says what is allowed', async () => {
    const request = new NextRequest(url('/stats'), { method: 'POST' });
    const response = await routeModule.POST(request, {
      params: Promise.resolve({ eventId: EVENT_ID, slug: ['stats'] }),
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Method not allowed' });
  });

  it('405s PUT on committees-only siblings but allows it on committees', async () => {
    const blocked = await routeModule.PUT(new NextRequest(url('/results'), { method: 'PUT' }), {
      params: Promise.resolve({ eventId: EVENT_ID, slug: ['results'] }),
    });
    expect(blocked.status).toBe(405);
    expect(blocked.headers.get('Allow')).toBe('GET');

    // committees does export PUT, so it must NOT be short-circuited to 405.
    const committees = matchMarathonRoute(['committees'])!;
    expect(typeof committees.route.module.PUT).toBe('function');
  });
});
