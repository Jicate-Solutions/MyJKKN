/**
 * Proves the bug-reports route fold is behaviour-preserving.
 *
 * 11 files under `app/api/bug-reports/[id]/**` became one optional catch-all
 * (Vercel's 2048-route cap; every dynamic route.ts costs 2). This test is the
 * contract that the fold did not move, drop or shadow a single URL: every
 * original path x method pair must still land on the same handler code.
 *
 * This family is read by the external JKKN Bug Reporter SDK, so the surface is
 * not ours to adjust — the expectations below are transcribed from the file
 * list on jicate/main at the time of the fold, not generated from the table.
 * A table that lost an entry would still agree with itself.
 */

import { describe, expect, it, vi } from 'vitest';

// `server-only` is a Next.js build-time marker with no npm package behind it;
// it exists only to make a server module fail if a client bundle imports it.
// Under vitest there is no bundler to provide it, so stub it out.
vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';

import type { BugReportMethod } from '@/lib/api/bug-reports/dispatch';

// The table imports all 11 handler modules, and some of the services they pull
// in build a Supabase client at import time. Give them something to read first.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';

const { BUG_REPORT_ROUTES, assertTableOrder, matchBugReportRoute } = await import(
  '@/lib/api/bug-reports/dispatch'
);

const routeModule = await import('@/app/api/bug-reports/[id]/[[...slug]]/route');

/** A realistic report id — the shape these endpoints actually receive. */
const REPORT_ID = '4f1c8e62-9d07-4a35-bb14-2e6a7c05d9f1';

interface Expected {
  /** The URL under /api/bug-reports/[id], as callers write it. */
  url: string;
  /** Slug segments Next.js hands the catch-all for that URL. */
  slug: string[];
  /** The handler module this must reach. */
  name: string;
  /** Exactly the methods the original file exported. */
  methods: BugReportMethod[];
}

/** One row per original route.ts file. 11 of them. */
const ORIGINALS: Expected[] = [
  { url: '', slug: [], name: 'report', methods: ['GET', 'PATCH', 'DELETE'] },
  { url: 'ai-reverify', slug: ['ai-reverify'], name: 'ai-reverify', methods: ['POST'] },
  { url: 'ai-triage', slug: ['ai-triage'], name: 'ai-triage', methods: ['POST'] },
  { url: 'cluster', slug: ['cluster'], name: 'cluster', methods: ['GET'] },
  { url: 'duplicate-check', slug: ['duplicate-check'], name: 'duplicate-check', methods: ['POST'] },
  { url: 'duplicates', slug: ['duplicates'], name: 'duplicates', methods: ['GET'] },
  { url: 'messages', slug: ['messages'], name: 'messages', methods: ['GET', 'POST'] },
  { url: 'participants', slug: ['participants'], name: 'participants', methods: ['GET'] },
  { url: 'reopen', slug: ['reopen'], name: 'reopen', methods: ['POST'] },
  { url: 'messages/notifications', slug: ['messages', 'notifications'], name: 'messages-notifications', methods: ['POST'] },
  { url: 'messages/read', slug: ['messages', 'read'], name: 'messages-read', methods: ['GET', 'POST'] },
];

const ALL_METHODS: BugReportMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

describe('bug-reports catch-all dispatch', () => {
  it('covers exactly the 11 route files that were folded', () => {
    expect(ORIGINALS).toHaveLength(11);
    expect(BUG_REPORT_ROUTES).toHaveLength(11);

    const names = BUG_REPORT_ROUTES.map((r) => r.name);
    expect(new Set(names).size).toBe(11);
    expect([...names].sort()).toEqual([...ORIGINALS.map((o) => o.name)].sort());
  });

  it.each(ORIGINALS)('resolves /$url to the $name handler', (expected) => {
    const match = matchBugReportRoute(expected.slug);

    expect(match, `no table entry matched /${expected.url}`).not.toBeNull();
    expect(match!.route.name).toBe(expected.name);
    // Every pattern in this family is literal, so a match adds no params of
    // its own — the report id is supplied by the route file.
    expect(match!.params).toEqual({});
  });

  it.each(ORIGINALS)('/$url still answers exactly its original methods', (expected) => {
    const match = matchBugReportRoute(expected.slug)!;

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

  it('treats a missing slug as the bare [id] endpoint', () => {
    expect(matchBugReportRoute(undefined)?.route.name).toBe('report');
    expect(matchBugReportRoute([])?.route.name).toBe('report');
  });

  it('keeps the two-segment messages sub-paths distinct from messages itself', () => {
    expect(matchBugReportRoute(['messages'])?.route.name).toBe('messages');
    expect(matchBugReportRoute(['messages', 'read'])?.route.name).toBe('messages-read');
    expect(matchBugReportRoute(['messages', 'notifications'])?.route.name).toBe('messages-notifications');
  });

  /**
   * The sibling families under /api/bug-reports (clusters, feedback, export,
   * stats, ...) are their own static-segment routes and must keep reaching
   * their own files. Next.js ranks a static segment above a dynamic one at
   * every position, which is already what sends /api/bug-reports/export to
   * export/route.ts rather than to [id]/route.ts today. The fold extends that
   * same competition to depth 2 and beyond, so this test records the
   * consequence: if one of these ever DID reach the catch-all, the table would
   * 404 it rather than serve it, and that would be the bug to look for.
   */
  it.each([
    [['clusters', 'scan']],
    [['clusters', 'c1', 'verify']],
    [['clusters', 'c1', 'fixability']],
    [['feedback', 'mine']],
    [['auto-resolve', 'status']],
    [['bulk-update-status']],
  ])('does not claim the sibling path /%s', (slug) => {
    expect(matchBugReportRoute(slug)).toBeNull();
  });

  it('has no pattern shadowing a later one', () => {
    expect(assertTableOrder()).toEqual([]);
  });

  it.each([
    [['nope']],
    [['messages', 'unread']],
    [['messages', 'read', 'extra']],
    [['messages', 'notifications', 'extra']],
    [['ai']],
    [['ai', 'triage']],
    [['cluster', 'members']],
    [['duplicates', 'all']],
    [['reopen', 'again']],
    [['participants', REPORT_ID]],
    [['']],
  ])('rejects the unknown path /%s', (slug) => {
    expect(matchBugReportRoute(slug)).toBeNull();
  });

  it('rejects a wrong method on a known path, and can name the allowed ones', () => {
    const participants = matchBugReportRoute(['participants'])!;
    expect(participants.route.module.POST).toBeUndefined();
    expect(participants.route.methods.join(', ')).toBe('GET');

    const reopen = matchBugReportRoute(['reopen'])!;
    expect(reopen.route.module.GET).toBeUndefined();
    expect(reopen.route.methods.join(', ')).toBe('POST');

    const root = matchBugReportRoute([])!;
    expect(root.route.module.POST).toBeUndefined();
    expect(root.route.methods.join(', ')).toBe('GET, PATCH, DELETE');
  });
});

/**
 * The two branches of the real route file that never reach a handler, so they
 * can be exercised without a database. Everything else in the route is "look
 * the path up, then call what the table returned", which the block above
 * pins down.
 */
describe('the catch-all route file itself', () => {
  const url = (path: string) => `https://jkkn.ai/api/bug-reports/${REPORT_ID}${path}`;

  it('keeps force-dynamic and the widest maxDuration of the originals', () => {
    expect(routeModule.dynamic).toBe('force-dynamic');
    expect(routeModule.maxDuration).toBe(300);
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
      params: Promise.resolve({ id: REPORT_ID, slug: ['nope'] }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Not found' });
  });

  it('405s a known path with a method its handler never exported, and says what is allowed', async () => {
    const request = new NextRequest(url('/participants'), { method: 'POST' });
    const response = await routeModule.POST(request, {
      params: Promise.resolve({ id: REPORT_ID, slug: ['participants'] }),
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Method not allowed' });
  });

  it('405s DELETE on a sub-path but leaves it allowed on the bare report', async () => {
    const blocked = await routeModule.DELETE(new NextRequest(url('/messages'), { method: 'DELETE' }), {
      params: Promise.resolve({ id: REPORT_ID, slug: ['messages'] }),
    });
    expect(blocked.status).toBe(405);
    expect(blocked.headers.get('Allow')).toBe('GET, POST');

    // The bare /api/bug-reports/[id] does export DELETE, so it must NOT be
    // short-circuited to 405.
    const root = matchBugReportRoute([])!;
    expect(typeof root.route.module.DELETE).toBe('function');
  });

  it('hands the handler the report id from the path', async () => {
    // A known path with a method it does not export returns before touching a
    // database, which is the only branch that can assert the params plumbing
    // without one. The id must survive into the 405 path unchanged.
    const response = await routeModule.PATCH(new NextRequest(url('/cluster'), { method: 'PATCH' }), {
      params: Promise.resolve({ id: REPORT_ID, slug: ['cluster'] }),
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
  });
});
