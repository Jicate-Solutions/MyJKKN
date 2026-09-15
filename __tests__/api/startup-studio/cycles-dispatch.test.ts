/**
 * Startup Studio cycle routes — dispatch table.
 *
 * 10 dynamic route files under app/api/startup-studio/cycles/[id]/** folded
 * into one optional catch-all to get 18 routes back under Vercel's 2048 cap.
 * The fold is only safe if every URL that worked before still reaches the same
 * handler with the same methods, so that is what this file pins down.
 *
 * The table is imported on its own — no handler module is loaded — so these
 * assertions need neither Supabase nor a Next.js request.
 */

import { existsSync } from 'fs';
import path from 'path';

import { NextRequest } from 'next/server';
import { describe, it, expect } from 'vitest';

import {
  DELETE as routeDELETE,
  GET as routeGET,
  OPTIONS as routeOPTIONS,
} from '@/app/api/startup-studio/cycles/[id]/[[...slug]]/route';
import {
  ROUTE_TABLE,
  allowHeader,
  matchRoute,
  type HttpMethod,
} from '@/lib/api/startup-studio/cycles/dispatch';

const CYCLE_ID = '7b2e9d41-5c68-4a03-9e17-6f4a0b3d8c25';

/**
 * Every path the 10 original route files served, as the segments that follow
 * /api/startup-studio/cycles/<id>, with the methods each file exported.
 */
const ORIGINAL_ROUTES: Array<{
  file: string;
  slug: string[];
  key: string;
  methods: HttpMethod[];
  params?: Record<string, string>;
}> = [
  { file: '[id]/route.ts', slug: [], key: 'cycle', methods: ['GET', 'PATCH', 'DELETE'] },
  { file: '[id]/advance/route.ts', slug: ['advance'], key: 'advance', methods: ['POST'] },
  { file: '[id]/complete/route.ts', slug: ['complete'], key: 'complete', methods: ['POST'] },
  { file: '[id]/steps/build/route.ts', slug: ['steps', 'build'], key: 'steps-build', methods: ['POST'] },
  { file: '[id]/steps/context/route.ts', slug: ['steps', 'context'], key: 'steps-context', methods: ['POST'] },
  { file: '[id]/steps/impact/route.ts', slug: ['steps', 'impact'], key: 'steps-impact', methods: ['POST'] },
  { file: '[id]/steps/problem/route.ts', slug: ['steps', 'problem'], key: 'steps-problem', methods: ['POST'] },
  { file: '[id]/steps/prompt/route.ts', slug: ['steps', 'prompt'], key: 'steps-prompt', methods: ['POST'] },
  {
    file: '[id]/steps/value-assessment/route.ts',
    slug: ['steps', 'value-assessment'],
    key: 'steps-value-assessment',
    methods: ['POST'],
  },
  { file: '[id]/steps/workflow/route.ts', slug: ['steps', 'workflow'], key: 'steps-workflow', methods: ['POST'] },
];

const ALL_METHODS: HttpMethod[] = ['GET', 'POST', 'PATCH', 'DELETE'];

describe('startup studio cycle route table', () => {
  it('covers exactly the 10 routes that used to be separate files', () => {
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
    const handlerDir = path.join(
      process.cwd(),
      'lib/api/startup-studio/cycles/handlers',
    );
    for (const entry of ROUTE_TABLE) {
      expect(
        existsSync(path.join(handlerDir, `${entry.key}.ts`)),
        `missing handler module for ${entry.key}`,
      ).toBe(true);
    }
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

describe('the seven step paths stay distinct', () => {
  const steps = [
    'build',
    'context',
    'impact',
    'problem',
    'prompt',
    'value-assessment',
    'workflow',
  ];

  for (const step of steps) {
    it(`steps/${step} resolves to its own handler`, () => {
      const matched = matchRoute(['steps', step]);
      expect(matched!.entry.key).toBe(`steps-${step}`);
      expect(matched!.params).toEqual({});
    });
  }

  it('has no parameterised row that could swallow a step name', () => {
    const parameterised = ROUTE_TABLE.filter((e) =>
      e.segments.some((s) => s.startsWith(':')),
    );
    expect(parameterised).toEqual([]);
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
    ['steps'],
    ['steps', 'nonsense'],
    ['steps', 'build', 'extra'],
    ['advance', 'extra'],
    ['complete', CYCLE_ID],
    ['value-assessment'],
  ];

  for (const slug of unknown) {
    it(`/${slug.join('/')} has no handler`, () => {
      expect(matchRoute(slug)).toBeNull();
    });
  }

  it('an empty trailing segment does not match a step', () => {
    expect(matchRoute(['steps', ''])).toBeNull();
  });
});

describe('the allow header advertises the real methods', () => {
  it('lists the cycle handler methods plus OPTIONS', () => {
    const matched = matchRoute([]);
    expect(allowHeader(matched!.entry)).toBe('GET, PATCH, DELETE, OPTIONS');
  });

  it('lists the single method of a step plus OPTIONS', () => {
    const matched = matchRoute(['steps', 'workflow']);
    expect(allowHeader(matched!.entry)).toBe('POST, OPTIONS');
  });
});

describe('OPTIONS provenance is recorded per entry', () => {
  it('records that every original exported its own OPTIONS handler', () => {
    const withoutOptions = ROUTE_TABLE.filter((e) => !e.hasOptions).map((e) => e.key);
    expect(withoutOptions).toEqual([]);
  });
});

describe('the folded folder holds exactly one route file', () => {
  it('has the catch-all and nothing else under [id]', () => {
    const base = path.join(process.cwd(), 'app/api/startup-studio/cycles/[id]');
    expect(existsSync(path.join(base, '[[...slug]]/route.ts'))).toBe(true);
    expect(existsSync(path.join(base, 'route.ts'))).toBe(false);
    expect(existsSync(path.join(base, 'advance/route.ts'))).toBe(false);
    expect(existsSync(path.join(base, 'complete/route.ts'))).toBe(false);
    expect(existsSync(path.join(base, 'steps/build/route.ts'))).toBe(false);
    expect(existsSync(path.join(base, 'steps/value-assessment/route.ts'))).toBe(false);
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
        `https://jkkn.test/api/startup-studio/cycles/${CYCLE_ID}/${slug.join('/')}`,
      ),
    );
  const context = (slug: string[]) => ({
    params: Promise.resolve({ id: CYCLE_ID, slug }),
  });

  it('answers an unknown path with a 404 envelope', async () => {
    const slug = ['nonsense'];
    const res = await routeGET(request(slug), context(slug));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Not found' });
  });

  it('answers a known path with an unsupported method with a 405 and an Allow header', async () => {
    const slug = ['advance'];
    const res = await routeDELETE(request(slug), context(slug));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST, OPTIONS');
  });

  it('answers a step path with an unsupported method with a 405', async () => {
    const slug = ['steps', 'build'];
    const res = await routeGET(request(slug), context(slug));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST, OPTIONS');
  });

  it('answers OPTIONS on an unknown path with a 404 rather than a preflight', async () => {
    const slug = ['nonsense'];
    const res = await routeOPTIONS(request(slug), context(slug));
    expect(res.status).toBe(404);
  });
});
