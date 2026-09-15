// ============================================================================
// GET /api/bos/taxonomies — the institution label must not depend on the view
// ============================================================================
// This drives the REAL exported route handler against a Supabase test double
// that honours the route's own .eq() filters and .range() paging. It is
// deliberately NOT a re-implementation of the labelling rule: the assertions
// only ever read `institution_name` off the JSON the route actually returned,
// so the logic under test is the shipped code path, not a copy of it.
//
// The sibling suite __tests__/meetings/institution-label-collision.test.ts
// covers the pure helper. The helper was already correct; what broke here was
// WHICH ROWS the route fed it. Two live colleges (CAS Aided a33138b6… and CAS
// Self b0b8a724…) share a display_name, and the helper disambiguates a label
// only when it can see both halves of that pair. The route used to build its
// collision set from the institutions embedded in the current page of results
// — i.e. AFTER `.eq('institutions_id', …)` and AFTER `.range()`. Either
// narrowing can hide one half, and a pair of one has no collision to detect,
// so the same taxonomy row rendered "(Aided)" in the All Institutions view and
// "(Autonomous)" once the institution filter was applied.
//
// Discrimination: every test in the first describe block below fails against
// the pre-fix route (verified by reverting the route and re-running) — three
// on the label itself, one on the absence of any institutions read.
// ============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Fixtures: the real production rows, verified 2026-08-31 ─────────────────
const AIDED = {
  id: 'a33138b6',
  name: 'JKKN College of Arts and Science (Aided)',
  display_name: 'JKKN College of Arts and Science (Autonomous)',
};
const SELF = {
  id: 'b0b8a724',
  name: 'JKKN College of Arts and Science (Self)',
  display_name: 'JKKN College of Arts and Science (Autonomous)',
};
const DENTAL = {
  id: 'd1',
  name: 'JKKN Dental College',
  display_name: 'JKKN Dental College and Hospital',
};
const INSTITUTIONS = [AIDED, SELF, DENTAL];

// One taxonomy per college, all carrying the same `code` — the master list
// deduplicates on `code::institution_name`, which is how an ambiguous label
// made one college's row (and its delete button) unreachable.
const TAXONOMIES = [
  { id: 't-aided', code: 'BLOOM', name: 'Bloom Aided', institutions_id: AIDED.id },
  { id: 't-self', code: 'BLOOM', name: 'Bloom Self', institutions_id: SELF.id },
  { id: 't-dental', code: 'BLOOM', name: 'Bloom Dental', institutions_id: DENTAL.id },
];

// ── Supabase test double ────────────────────────────────────────────────────
// Every builder call is recorded per issued query, so a test can inspect the
// query the route actually sent — not just the rows it got back.
type Call = { method: string; args: unknown[] };
type Issued = { table: string; calls: Call[] };

let issued: Issued[] = [];
let institutionsReadFails = false;
let scope: {
  isSuperAdmin: boolean;
  institutionsId: string | null;
  allInstitutionIds: string[];
  userInstitutionId: string | null;
  role: string | null;
};

/** Apply the recorded .eq() filters, then .range(), the way PostgREST would. */
function resolveTaxonomies(calls: Call[]) {
  let rows: Array<Record<string, unknown>> = TAXONOMIES.slice();
  for (const c of calls) {
    if (c.method === 'eq') {
      const [col, val] = c.args as [string, unknown];
      rows = rows.filter((r) => r[col] === val);
    }
  }
  // `count: 'exact'` counts after filters but before the range slice.
  const total = rows.length;
  const range = calls.find((c) => c.method === 'range');
  if (range) {
    const [from, to] = range.args as [number, number];
    rows = rows.slice(from, to + 1);
  }
  return {
    data: rows.map((r) => ({
      ...r,
      bos_taxonomy_levels: [{ count: 3 }],
      institutions: INSTITUTIONS.find((i) => i.id === r.institutions_id) ?? null,
    })),
    error: null,
    count: total,
  };
}

function resolveTable(table: string, calls: Call[]) {
  if (table === 'institutions') {
    return institutionsReadFails
      ? { data: null, error: { message: 'institutions unavailable' }, count: null }
      : { data: INSTITUTIONS, error: null, count: INSTITUTIONS.length };
  }
  if (table === 'bos_taxonomy') return resolveTaxonomies(calls);
  return { data: [], error: null, count: 0 };
}

function builderFor(table: string) {
  const calls: Call[] = [];
  issued.push({ table, calls });
  const chain: Record<string, unknown> = {};
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    });
  ['select', 'eq', 'or', 'order', 'range', 'in', 'ilike'].forEach((m) => {
    chain[m] = record(m);
  });
  // PostgREST builders are thenables — they execute on await, not on build.
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolveTable(table, calls)).then(onFulfilled, onRejected);
  return chain;
}

// Referenced only when the returned function is CALLED, which is long after
// module init — so the hoisted vi.mock factory never hits a TDZ on these.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: (table: string) => builderFor(table),
  }),
}));

vi.mock('@/lib/utils/bos/bos-access', () => ({
  resolveBosAccess: async () => scope,
  guardInstitutionWrite: () => null,
}));

import { GET } from '@/app/api/bos/taxonomies/route';

type Row = { id: string; code: string; institution_name?: string };

async function get(qs = ''): Promise<Row[]> {
  const res = await GET(
    new Request(`http://localhost/api/bos/taxonomies${qs}`) as unknown as NextRequest,
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { data: Row[] };
  return body.data;
}

const rowById = (rows: Row[], id: string) => {
  const r = rows.find((x) => x.id === id);
  expect(r, `expected taxonomy row ${id} in the response`).toBeDefined();
  return r!;
};

beforeEach(() => {
  issued = [];
  institutionsReadFails = false;
  scope = {
    isSuperAdmin: true,
    institutionsId: null,
    allInstitutionIds: [],
    userInstitutionId: AIDED.id,
    role: 'super_admin',
  };
});

// ============================================================================
// The defect: one row, two names, depending on how the list was narrowed.
// ============================================================================
describe('GET /api/bos/taxonomies — label is independent of the current view', () => {
  it('spells the same row the same way filtered and unfiltered', async () => {
    const unfiltered = await get();
    const filtered = await get(`?institutionsId=${AIDED.id}`);

    // The filter really did narrow the result set — otherwise this test would
    // pass for the wrong reason.
    expect(unfiltered).toHaveLength(3);
    expect(filtered).toHaveLength(1);

    const inAll = rowById(unfiltered, 't-aided');
    const inFiltered = rowById(filtered, 't-aided');

    expect(inFiltered.institution_name).toBe(inAll.institution_name);
    // And the label it settles on is the one that tells the pair apart.
    expect(inAll.institution_name).toBe(AIDED.name);
  });

  it('spells the same row the same way across pages', async () => {
    // The second narrowing, independent of any filter: with limit=1 each page
    // holds one half of the Aided/Self pair, so a page-derived collision set
    // sees no collision even in the All Institutions view.
    const unfiltered = await get();
    const page1 = await get('?limit=1&page=1');

    expect(page1).toHaveLength(1);
    const paged = page1[0];
    expect(paged.institution_name).toBe(rowById(unfiltered, paged.id).institution_name);
  });

  it('separates the two colleges the dedup key would otherwise collapse', async () => {
    const rows = await get();
    const aided = rowById(rows, 't-aided');
    const self = rowById(rows, 't-self');

    expect(aided.institution_name).not.toBe(self.institution_name);
    // The key the master list deduplicates on.
    expect(`${aided.code}::${aided.institution_name}`).not.toBe(
      `${self.code}::${self.institution_name}`,
    );
  });

  it('reads the collision set with no narrowing of its own', async () => {
    // Structural half of the proof: the route must issue a SEPARATE
    // institutions read, and that read must carry none of the taxonomy
    // query's filters. Against the pre-fix route no such read exists at all.
    await get(`?institutionsId=${AIDED.id}`);

    const institutionReads = issued.filter((q) => q.table === 'institutions');
    expect(institutionReads).toHaveLength(1);
    expect(institutionReads[0].calls.filter((c) => c.method === 'eq')).toHaveLength(0);

    // ...while the taxonomy read WAS narrowed. The two differ on purpose.
    const taxonomyRead = issued.find((q) => q.table === 'bos_taxonomy');
    expect(taxonomyRead).toBeDefined();
    expect(
      taxonomyRead!.calls.some((c) => c.method === 'eq' && c.args[0] === 'institutions_id'),
    ).toBe(true);
  });
});

// ============================================================================
// Behaviour that must survive the fix.
// ============================================================================
describe('GET /api/bos/taxonomies — surrounding behaviour', () => {
  it('keeps display_name where it is unique', async () => {
    const rows = await get();
    expect(rowById(rows, 't-dental').institution_name).toBe(DENTAL.display_name);
  });

  it('disambiguates for a non-super-admin who can never see the wider view', async () => {
    // This user's institution filter is forced server-side, so the page they
    // load is permanently a subset of one — the exact shape that lost the
    // collision before. (What they can actually read from `institutions` is
    // still RLS's call; the route asks for the full table and labels over
    // whatever comes back, matching listInstitutionOptions in
    // app/(routes)/meetings/series/actions.ts.)
    scope = {
      isSuperAdmin: false,
      institutionsId: AIDED.id,
      allInstitutionIds: [AIDED.id, SELF.id],
      userInstitutionId: AIDED.id,
      role: 'hod',
    };
    const rows = await get();
    expect(rows).toHaveLength(1);
    expect(rows[0].institution_name).toBe(AIDED.name);
  });

  it('ignores an institutionsId a non-super-admin tries to pass', async () => {
    scope = {
      isSuperAdmin: false,
      institutionsId: AIDED.id,
      allInstitutionIds: [AIDED.id, SELF.id],
      userInstitutionId: AIDED.id,
      role: 'hod',
    };
    const rows = await get(`?institutionsId=${SELF.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('t-aided');
  });

  it('still renders, ambiguously but STABLY, when the institutions read fails', async () => {
    institutionsReadFails = true;
    const rows = await get();

    // The list survives — a cosmetic label must not 500 the page.
    expect(rows).toHaveLength(3);
    // Degrades to `display_name || name`, which is main's pre-fix spelling:
    // ambiguous across the pair, but identical in every view, which is the
    // half of the property worth keeping when the other is unavailable.
    expect(rowById(rows, 't-aided').institution_name).toBe(AIDED.display_name);
    expect(rowById(rows, 't-self').institution_name).toBe(SELF.display_name);
    expect(rowById(rows, 't-dental').institution_name).toBe(DENTAL.display_name);
  });
});
