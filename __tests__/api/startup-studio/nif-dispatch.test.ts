/**
 * Startup Studio NIF candidate routes — dispatch table.
 *
 * 12 dynamic route files under app/api/startup-studio/nif/[id]/** folded into
 * one optional catch-all to get 22 routes back under Vercel's 2048 cap. The
 * fold is only safe if every URL that worked before still reaches the same
 * handler with the same methods, so that is what this file pins down.
 *
 * The table is imported on its own — no handler module is loaded — so these
 * assertions need neither Supabase nor a Next.js request.
 */

import { existsSync, readdirSync } from 'fs';
import path from 'path';

import { NextRequest } from 'next/server';
import { describe, it, expect } from 'vitest';

import {
  DELETE as routeDELETE,
  GET as routeGET,
  OPTIONS as routeOPTIONS,
  POST as routePOST,
} from '@/app/api/startup-studio/nif/[id]/[[...slug]]/route';
import {
  ROUTE_TABLE,
  allowHeader,
  matchRoute,
  type HttpMethod,
} from '@/lib/api/startup-studio/nif/dispatch';

const CANDIDATE_ID = '7b2e9f04-5c31-4a86-9d17-6e0b3f8a2c45';

/**
 * Every path the 12 original route files served, as the segments that follow
 * /api/startup-studio/nif/<id>, with the methods each file exported.
 */
const ORIGINAL_ROUTES: Array<{
  file: string;
  slug: string[];
  key: string;
  methods: HttpMethod[];
  params?: Record<string, string>;
}> = [
  { file: '[id]/route.ts', slug: [], key: 'candidate', methods: ['GET', 'PATCH'] },
  { file: '[id]/advance/route.ts', slug: ['advance'], key: 'advance', methods: ['POST'] },
  {
    file: '[id]/competitive/route.ts',
    slug: ['competitive'],
    key: 'competitive',
    methods: ['GET', 'POST'],
  },
  { file: '[id]/exit/route.ts', slug: ['exit'], key: 'exit', methods: ['GET', 'POST', 'PATCH'] },
  {
    file: '[id]/exit/complete/route.ts',
    slug: ['exit', 'complete'],
    key: 'exit-complete',
    methods: ['POST'],
  },
  {
    file: '[id]/graduation/route.ts',
    slug: ['graduation'],
    key: 'graduation',
    methods: ['GET', 'POST'],
  },
  { file: '[id]/history/route.ts', slug: ['history'], key: 'history', methods: ['GET'] },
  { file: '[id]/mentors/route.ts', slug: ['mentors'], key: 'mentors', methods: ['GET', 'POST'] },
  {
    file: '[id]/mentors/suggest/route.ts',
    slug: ['mentors', 'suggest'],
    key: 'mentors-suggest',
    methods: ['GET'],
  },
  { file: '[id]/reject/route.ts', slug: ['reject'], key: 'reject', methods: ['POST'] },
  { file: '[id]/risk/route.ts', slug: ['risk'], key: 'risk', methods: ['GET', 'POST'] },
  { file: '[id]/trl/route.ts', slug: ['trl'], key: 'trl', methods: ['GET', 'POST'] },
];

const ALL_METHODS: HttpMethod[] = ['GET', 'POST', 'PATCH', 'DELETE'];

const NIF_BASE = path.join(process.cwd(), 'app/api/startup-studio/nif/[id]');

/** Every route.ts under the folded folder, relative to it. */
function routeFilesUnder(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...routeFilesUnder(path.join(dir, entry.name), rel));
    } else if (entry.name === 'route.ts') {
      found.push(rel);
    }
  }
  return found;
}

describe('startup studio NIF route table', () => {
  it('covers exactly the 12 routes that used to be separate files', () => {
    expect(ROUTE_TABLE).toHaveLength(ORIGINAL_ROUTES.length);
    expect([...ROUTE_TABLE].map((e) => e.key).sort()).toEqual(
      ORIGINAL_ROUTES.map((r) => r.key).sort(),
    );
  });

  it('uses a unique key per entry', () => {
    const keys = ROUTE_TABLE.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ships a handler module for every entry', () => {
    const handlerDir = path.join(process.cwd(), 'lib/api/startup-studio/nif/handlers');
    for (const entry of ROUTE_TABLE) {
      expect(
        existsSync(path.join(handlerDir, `${entry.key}.ts`)),
        `missing handler module for ${entry.key}`,
      ).toBe(true);
    }
  });

  it('records that all 12 originals exported their own OPTIONS', () => {
    expect(ROUTE_TABLE.filter((e) => !e.hasOptions).map((e) => e.key)).toEqual([]);
  });
});

describe('every original path reaches its original handler', () => {
  for (const route of ORIGINAL_ROUTES) {
    it(`${route.file} -> /${route.slug.join('/')}`, () => {
      const matched = matchRoute(route.slug);
      expect(matched, `no table entry matched ${route.file}`).not.toBeNull();
      expect(matched!.entry.key).toBe(route.key);
      expect(matched!.params).toEqual(route.params ?? {});
    });
  }
});

describe('every original path x method pair is allowed', () => {
  for (const route of ORIGINAL_ROUTES) {
    for (const method of route.methods) {
      it(`${method} /${route.slug.join('/')} -> ${route.key}`, () => {
        const matched = matchRoute(route.slug);
        expect(matched!.entry.key).toBe(route.key);
        expect(matched!.entry.methods).toContain(method);
      });
    }
  }
});

describe('methods the original file never exported are rejected', () => {
  for (const route of ORIGINAL_ROUTES) {
    const absent = ALL_METHODS.filter((m) => !route.methods.includes(m));
    for (const method of absent) {
      it(`${method} /${route.slug.join('/')} is a 405, not a silent 200`, () => {
        const matched = matchRoute(route.slug);
        expect(matched!.entry.methods).not.toContain(method);
        // The route turns this into a 405 and advertises what it does take.
        expect(allowHeader(matched!.entry)).toContain('OPTIONS');
        expect(allowHeader(matched!.entry)).toContain(route.methods[0]);
      });
    }
  }
});

describe('nested paths are not swallowed by their parent', () => {
  it('exit/complete is its own entry, not the exit handler', () => {
    const matched = matchRoute(['exit', 'complete']);
    expect(matched!.entry.key).toBe('exit-complete');
    expect(matched!.entry.methods).toEqual(['POST']);
  });

  it('mentors/suggest is its own entry, not the mentors handler', () => {
    const matched = matchRoute(['mentors', 'suggest']);
    expect(matched!.entry.key).toBe('mentors-suggest');
    expect(matched!.entry.methods).toEqual(['GET']);
  });

  it('the bare parents still resolve to their own handlers', () => {
    expect(matchRoute(['exit'])!.entry.key).toBe('exit');
    expect(matchRoute(['mentors'])!.entry.key).toBe('mentors');
  });

  it('orders every literal row above the parameter row of the same length', () => {
    for (let i = 0; i < ROUTE_TABLE.length; i += 1) {
      const outer = ROUTE_TABLE[i];
      const hasParam = outer.segments.some((s) => s.startsWith(':'));
      if (!hasParam) continue;

      // Anything below a parameterised row must not be a literal row that the
      // parameter would shadow.
      for (let j = i + 1; j < ROUTE_TABLE.length; j += 1) {
        const inner = ROUTE_TABLE[j];
        if (inner.segments.length !== outer.segments.length) continue;
        const shadowed = inner.segments.every(
          (seg, k) => outer.segments[k].startsWith(':') || outer.segments[k] === seg,
        );
        expect(
          shadowed,
          `${inner.key} sits below ${outer.key} and would never be reached`,
        ).toBe(false);
      }
    }
  });
});

describe('paths that never existed are rejected', () => {
  const unknown: string[][] = [
    ['nonsense'],
    ['complete'],
    ['suggest'],
    ['exit', 'nonsense'],
    ['exit', 'complete', 'extra'],
    ['mentors', 'suggest', 'extra'],
    ['history', 'extra'],
    ['risk', CANDIDATE_ID],
  ];

  for (const slug of unknown) {
    it(`/${slug.join('/')} has no handler`, () => {
      expect(matchRoute(slug)).toBeNull();
    });
  }
});

describe('the allow header advertises the real methods', () => {
  it('lists the candidate handler methods plus OPTIONS', () => {
    expect(allowHeader(matchRoute([])!.entry)).toBe('GET, PATCH, OPTIONS');
  });

  it('lists all three exit methods plus OPTIONS', () => {
    expect(allowHeader(matchRoute(['exit'])!.entry)).toBe('GET, POST, PATCH, OPTIONS');
  });

  it('lists the single history method plus OPTIONS', () => {
    expect(allowHeader(matchRoute(['history'])!.entry)).toBe('GET, OPTIONS');
  });
});

describe('the folded folder holds exactly one route file', () => {
  it('has the catch-all and nothing else under [id]', () => {
    expect(routeFilesUnder(NIF_BASE)).toEqual(['[[...slug]]/route.ts']);
  });

  it('no longer has any of the 12 originals', () => {
    for (const route of ORIGINAL_ROUTES) {
      const rel = route.file.replace(/^\[id\]\//, '');
      expect(existsSync(path.join(NIF_BASE, rel)), `${route.file} still exists`).toBe(false);
    }
  });
});

/**
 * The reject paths run against the real exported handlers. They return before
 * any handler module is loaded, so this needs no Supabase and no environment.
 */
describe('the catch-all route rejects what it should', () => {
  const request = (slug: string[]) =>
    new NextRequest(
      new URL(
        `https://jkkn.test/api/startup-studio/nif/${CANDIDATE_ID}/${slug.join('/')}`,
      ),
    );
  const context = (slug?: string[] | string) => ({
    params: Promise.resolve(
      slug === undefined ? { id: CANDIDATE_ID } : { id: CANDIDATE_ID, slug },
    ),
  });

  it('answers an unknown path with a 404 envelope', async () => {
    const res = await routeGET(request(['nonsense']), context(['nonsense']));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Not found' });
  });

  it('answers a known path with an unsupported method with a 405 and an Allow header', async () => {
    const res = await routeDELETE(request(['history']), context(['history']));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, OPTIONS');
    expect(await res.json()).toEqual({ success: false, error: 'Method not allowed' });
  });

  it('treats a missing slug as the candidate route itself', async () => {
    // DELETE was never exported by [id]/route.ts, so this 405s before loading
    // the handler — which is what proves the empty-slug normalisation works.
    const res = await routeDELETE(request([]), context());
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, PATCH, OPTIONS');
  });

  it('accepts a single slug handed over as a bare string', async () => {
    const res = await routePOST(request(['history']), context('history'));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, OPTIONS');
  });

  it('answers OPTIONS on an unknown path with a 404 rather than a preflight', async () => {
    const res = await routeOPTIONS(request(['nonsense']), context(['nonsense']));
    expect(res.status).toBe(404);
  });
});
