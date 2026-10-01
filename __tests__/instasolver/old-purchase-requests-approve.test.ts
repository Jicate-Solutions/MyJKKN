// __tests__/instasolver/old-purchase-requests-approve.test.ts
// ============================================================================
// The approve steps (begin / complete / release) and reject on the Director's
// old-purchase-requests route, against an in-memory stand-in for the
// service-role client. No real database.
//
// Pinned (repair round, 1 Oct 2026):
//  - a HALF-MADE Procurement request (header written as 'draft', lines or the
//    submit never landed) is never recorded as the approval: a draft with
//    lines is finished (submitted), a draft with no lines is withdrawn;
//  - a double tap cannot claim twice; a stale claim can be re-taken;
//  - a tab whose claim was taken over has its extra request withdrawn;
//  - a row stuck at 'approving' can be rejected once the claim is stale;
//  - a request carrying the marker but raised by someone else is ignored.
//
// Pinned (Director answers, 1 Oct 2026) — a requester who has LEFT JKKN (no
// matched profile, or an inactive / login-disabled one):
//  - is never belled (reject, bulk reject);
//  - an approved one is raised on behalf of the college office (its Store
//    Administrator, else another procurement.request_create holder there,
//    else the Director), with a note naming the requester's role only.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bulkRejectCutoff, isOlderThanBulkCutoff, oldRequestMarker } from '@/lib/instasolver/old-purchase-requests';

type Row = Record<string, any>;
type Db = Record<string, Row[]>;

let db: Db;

class FakeQuery implements PromiseLike<{ data: any; error: null }> {
  private filters: Array<(r: Row) => boolean> = [];
  private patch: Row | null = null;
  private cols: string | null = null;
  constructor(private table: string) {}
  select(cols: string) {
    this.cols = cols;
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  is(c: string, v: unknown) {
    this.filters.push((r) => (v === null ? r[c] == null : r[c] === v));
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  like(c: string, pattern: string) {
    const needle = pattern.replace(/^%|%$/g, '');
    this.filters.push((r) => String(r[c] ?? '').includes(needle));
    return this;
  }
  contains(c: string, obj: Record<string, unknown>) {
    this.filters.push((r) => Object.entries(obj).every(([k, v]) => (r[c] ?? {})[k] === v));
    return this;
  }
  lt(c: string, v: string) {
    this.filters.push((r) => r[c] != null && r[c] < v);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  private run() {
    const rows = (db[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    if (this.patch) for (const r of rows) Object.assign(r, this.patch);
    if (this.cols === null) return null;
    return rows.map((r) => {
      const out: Row = { ...r };
      if (this.cols!.includes('items:')) {
        out.items = [{ count: db.procurement_purchase_request_items.filter((i) => i.request_id === r.id).length }];
      }
      return out;
    });
  }
  async maybeSingle() {
    const data = this.run();
    return { data: data && data.length ? data[0] : null, error: null };
  }
  then<T1 = { data: any; error: null }, T2 = never>(
    ok?: ((v: { data: any; error: null }) => T1 | PromiseLike<T1>) | null,
    bad?: ((e: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.run(), error: null as null }).then(ok, bad);
  }
}

const DIRECTOR = 'u-director';

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: DIRECTOR } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_super_admin: true }, error: null }) }) }),
    }),
  }),
  createServiceRoleClient: () => ({ from: (t: string) => new FakeQuery(t) }),
}));

const bell = vi.fn();
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...a: unknown[]) => bell(...a),
}));

import { POST } from '@/app/api/instasolver/old-purchase-requests/route';

function req(body: unknown) {
  return new Request('http://localhost/api/instasolver/old-purchase-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

async function call(body: Record<string, unknown>) {
  const res = await POST(req(body));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const ID = 7;
const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function legacyRow(over: Row = {}): Row {
  return {
    legacy_id: ID,
    institution_id: 'inst-1',
    details: 'Two steel chairs',
    cause: 'Old ones broke',
    clean_category: 'Furniture',
    clean_site: 'Engineering College',
    clean_area: 'Offices',
    legacy_location: 'Office',
    priority: 'High',
    requested_at: '2025-03-04T09:00:00.000Z',
    reporter_profile_id: 'u-old',
    legacy_status: 'Pending MD Approval',
    decision: null,
    decided_by: null,
    decision_claimed_at: null,
    imported_purchase_request_id: null,
    ...over,
  };
}

function pr(id: string, status: string, over: Row = {}): Row {
  return { id, status, requested_by: 'u-old', notes: `From old InstaSolver. ${oldRequestMarker(ID)}`, ...over };
}

const row = () => db.legacy_instasolver_requirements[0];
const prById = (id: string) => db.procurement_purchase_requests.find((p) => p.id === id)!;

function person(id: string, over: Row = {}): Row {
  return {
    id,
    role: 'librarian',
    institution_id: 'inst-1',
    is_active: true,
    is_login_disabled: false,
    is_super_admin: false,
    ...over,
  };
}

beforeEach(() => {
  bell.mockClear();
  db = {
    legacy_instasolver_requirements: [legacyRow()],
    procurement_purchase_requests: [],
    procurement_purchase_request_items: [],
    // The old requester still works here unless a test says otherwise.
    profiles: [person('u-old'), person(DIRECTOR, { is_super_admin: true, role: 'super_admin' })],
    custom_roles: [
      { id: 'r-store', role_key: 'store_admin', is_active: true, permissions: { 'procurement.request_create': true } },
      { id: 'r-buyer', role_key: 'purchase_clerk', is_active: true, permissions: { 'procurement.request_create': true } },
      { id: 'r-plain', role_key: 'library_reader', is_active: true, permissions: { 'procurement.view': true } },
    ],
    user_roles: [],
  };
});

describe('begin', () => {
  it('claims a fresh row and returns what to raise, on whose behalf, and the claim', async () => {
    const { status, json } = await call({ action: 'begin', legacy_id: ID });
    expect(status).toBe(200);
    expect(json.requested_by).toBe('u-old');
    expect(json.dto.notes).toContain(oldRequestMarker(ID));
    expect(typeof json.claimed_at).toBe('string');
    expect(row().decision).toBe('approving');
  });

  it('refuses a double tap while the claim is fresh', async () => {
    await call({ action: 'begin', legacy_id: ID });
    const second = await call({ action: 'begin', legacy_id: ID });
    expect(second.status).toBe(409);
  });

  it('records an earlier tap\'s SUBMITTED request instead of raising again', async () => {
    Object.assign(row(), { decision: 'approving', decided_by: DIRECTOR, decision_claimed_at: ago(MINUTE) });
    db.procurement_purchase_requests.push(pr('pr-1', 'submitted'));
    const { json } = await call({ action: 'begin', legacy_id: ID });
    expect(json.already_done).toBe(true);
    expect(row().decision).toBe('approved');
    expect(row().imported_purchase_request_id).toBe('pr-1');
  });

  it('never records a half-made DRAFT: a fresh claim with only a draft is left alone (409)', async () => {
    Object.assign(row(), { decision: 'approving', decided_by: DIRECTOR, decision_claimed_at: ago(MINUTE) });
    db.procurement_purchase_requests.push(pr('pr-d', 'draft'));
    const { status } = await call({ action: 'begin', legacy_id: ID });
    expect(status).toBe(409);
    expect(row().decision).toBe('approving');
    expect(prById('pr-d').status).toBe('draft');
  });

  it('on a stale claim, withdraws a draft with no lines and claims again (not approved)', async () => {
    Object.assign(row(), { decision: 'approving', decided_by: DIRECTOR, decision_claimed_at: ago(20 * MINUTE) });
    db.procurement_purchase_requests.push(pr('pr-d', 'draft'));
    const { status, json } = await call({ action: 'begin', legacy_id: ID });
    expect(status).toBe(200);
    expect(json.already_done).toBe(false);
    expect(prById('pr-d').status).toBe('cancelled');
    expect(row().decision).toBe('approving');
    expect(row().imported_purchase_request_id).toBeNull();
  });

  it('on a stale claim, finishes a draft whose lines are in and records it', async () => {
    Object.assign(row(), { decision: 'approving', decided_by: DIRECTOR, decision_claimed_at: ago(20 * MINUTE) });
    db.procurement_purchase_requests.push(pr('pr-d', 'draft'));
    db.procurement_purchase_request_items.push({ request_id: 'pr-d' });
    const { json } = await call({ action: 'begin', legacy_id: ID });
    expect(json.already_done).toBe(true);
    expect(prById('pr-d').status).toBe('submitted');
    expect(row().imported_purchase_request_id).toBe('pr-d');
  });

  it('ignores a request that carries the marker but was raised by someone else', async () => {
    Object.assign(row(), { decision: 'approving', decided_by: DIRECTOR, decision_claimed_at: ago(20 * MINUTE) });
    db.procurement_purchase_requests.push(pr('pr-x', 'submitted', { requested_by: 'u-stranger' }));
    const { json } = await call({ action: 'begin', legacy_id: ID });
    expect(json.already_done).toBe(false);
    expect(row().imported_purchase_request_id).toBeNull();
    expect(prById('pr-x').status).toBe('submitted');
  });
});

describe('release (the browser step failed)', () => {
  it('after a header-only draft: withdraws it and frees the claim — nothing recorded', async () => {
    const begun = await call({ action: 'begin', legacy_id: ID });
    db.procurement_purchase_requests.push(pr('pr-d', 'draft'));
    const { json } = await call({ action: 'release', legacy_id: ID, claimed_at: begun.json.claimed_at });
    expect(json.released).toBe(true);
    expect(json.already_done).toBeUndefined();
    expect(prById('pr-d').status).toBe('cancelled');
    expect(row().decision).toBeNull();
    expect(row().imported_purchase_request_id).toBeNull();
  });

  it('after a draft with its lines in: finishes it and records the approval', async () => {
    const begun = await call({ action: 'begin', legacy_id: ID });
    db.procurement_purchase_requests.push(pr('pr-d', 'draft'));
    db.procurement_purchase_request_items.push({ request_id: 'pr-d' });
    const { json } = await call({ action: 'release', legacy_id: ID, claimed_at: begun.json.claimed_at });
    expect(json.already_done).toBe(true);
    expect(prById('pr-d').status).toBe('submitted');
    expect(row().decision).toBe('approved');
  });

  it('does nothing for a tab whose claim was taken over', async () => {
    Object.assign(row(), { decision: 'approving', decided_by: DIRECTOR, decision_claimed_at: ago(MINUTE) });
    const { json } = await call({ action: 'release', legacy_id: ID, claimed_at: ago(30 * MINUTE) });
    expect(json.released).toBe(false);
    expect(row().decision).toBe('approving');
  });
});

describe('complete', () => {
  async function begun() {
    return (await call({ action: 'begin', legacy_id: ID })).json;
  }

  it('records a submitted request that carries the marker and the right requester', async () => {
    const b = await begun();
    db.procurement_purchase_requests.push(pr('pr-1', 'submitted'));
    const { status } = await call({ action: 'complete', legacy_id: ID, purchase_request_id: 'pr-1', claimed_at: b.claimed_at });
    expect(status).toBe(200);
    expect(row().decision).toBe('approved');
    expect(row().imported_purchase_request_id).toBe('pr-1');
  });

  it('refuses a request without the marker, or raised by someone else (422)', async () => {
    const b = await begun();
    db.procurement_purchase_requests.push(pr('pr-a', 'submitted', { notes: 'unrelated' }));
    db.procurement_purchase_requests.push(pr('pr-b', 'submitted', { requested_by: 'u-stranger' }));
    for (const id of ['pr-a', 'pr-b']) {
      const { status } = await call({ action: 'complete', legacy_id: ID, purchase_request_id: id, claimed_at: b.claimed_at });
      expect(status).toBe(422);
    }
    expect(row().decision).toBe('approving');
  });

  it('refuses a draft with no lines (422) and does not record it', async () => {
    const b = await begun();
    db.procurement_purchase_requests.push(pr('pr-d', 'draft'));
    const { status } = await call({ action: 'complete', legacy_id: ID, purchase_request_id: 'pr-d', claimed_at: b.claimed_at });
    expect(status).toBe(422);
    expect(row().decision).toBe('approving');
    expect(row().imported_purchase_request_id).toBeNull();
  });

  it('withdraws the extra request of a tab whose claim was taken over', async () => {
    const b = await begun();
    // Another tab re-took the claim after it went stale.
    row().decision_claimed_at = new Date(Date.now() + 1000).toISOString();
    db.procurement_purchase_requests.push(pr('pr-late', 'submitted'));
    const { status } = await call({ action: 'complete', legacy_id: ID, purchase_request_id: 'pr-late', claimed_at: b.claimed_at });
    expect(status).toBe(409);
    expect(prById('pr-late').status).toBe('cancelled');
    expect(row().imported_purchase_request_id).toBeNull();
  });

  it('withdraws a duplicate when the row was already approved with another request', async () => {
    Object.assign(row(), { decision: 'approved', imported_purchase_request_id: 'pr-first' });
    db.procurement_purchase_requests.push(pr('pr-first', 'submitted'), pr('pr-dup', 'submitted', { requested_by: 'u-old' }));
    const { status } = await call({ action: 'complete', legacy_id: ID, purchase_request_id: 'pr-dup' });
    expect(status).toBe(409);
    expect(prById('pr-dup').status).toBe('cancelled');
    expect(prById('pr-first').status).toBe('submitted');
  });
});

describe('reject on a row stuck at "approving"', () => {
  it('is refused while the claim is fresh', async () => {
    Object.assign(row(), { decision: 'approving', decided_by: DIRECTOR, decision_claimed_at: ago(MINUTE) });
    const { status } = await call({ action: 'reject', legacy_id: ID, reason: 'Not needed now' });
    expect(status).toBe(409);
    expect(row().decision).toBe('approving');
  });

  it('goes through once stale, withdrawing any half-made draft, and bells the requester', async () => {
    Object.assign(row(), { decision: 'approving', decided_by: DIRECTOR, decision_claimed_at: ago(20 * MINUTE) });
    db.procurement_purchase_requests.push(pr('pr-d', 'draft'));
    db.procurement_purchase_request_items.push({ request_id: 'pr-d' });
    const { status } = await call({ action: 'reject', legacy_id: ID, reason: 'Not needed now' });
    expect(status).toBe(200);
    expect(row().decision).toBe('rejected');
    expect(prById('pr-d').status).toBe('cancelled');
    expect(bell).toHaveBeenCalledTimes(1);
  });

  it('records the approval instead when the earlier approve did reach Procurement', async () => {
    Object.assign(row(), { decision: 'approving', decided_by: DIRECTOR, decision_claimed_at: ago(20 * MINUTE) });
    db.procurement_purchase_requests.push(pr('pr-1', 'submitted'));
    const { status, json } = await call({ action: 'reject', legacy_id: ID, reason: 'Not needed now' });
    expect(status).toBe(409);
    expect(json.already_done).toBe(true);
    expect(row().decision).toBe('approved');
    expect(bell).not.toHaveBeenCalled();
  });
});

describe('a requester who has LEFT JKKN (Director answers, 1 Oct 2026)', () => {
  const holds = (userId: string, roleId: string) => db.user_roles.push({ user_id: userId, role_id: roleId });
  const leave = (over: Row = { is_active: false }) => Object.assign(db.profiles[0], over);

  it('approve is raised on behalf of the college Store Administrator, with the role only in the note', async () => {
    leave();
    db.profiles.push(person('u-store-b', { role: 'store_admin' }), person('u-store-a', { role: 'store_admin' }));
    holds('u-store-b', 'r-store');
    holds('u-store-a', 'r-store');
    const { status, json } = await call({ action: 'begin', legacy_id: ID });
    expect(status).toBe(200);
    expect(json.requested_by).toBe('u-store-a'); // stable order: first by id
    expect(json.on_behalf_of).toBe('college_office');
    expect(json.requester_left).toBe(true);
    expect(json.dto.notes).toContain('a librarian who has since left JKKN');
    expect(json.dto.notes).toContain('on behalf of the college office');
    expect(json.dto.notes).not.toContain('u-old');
  });

  it('a login-disabled requester has left too', async () => {
    leave({ is_login_disabled: true });
    db.profiles.push(person('u-store-a', { role: 'store_admin' }));
    holds('u-store-a', 'r-store');
    const { json } = await call({ action: 'begin', legacy_id: ID });
    expect(json.requested_by).toBe('u-store-a');
  });

  it('prefers the Store Administrator over another procurement holder; skips other colleges, departed holders and super admins', async () => {
    leave();
    db.profiles.push(
      person('u-0buyer'),
      person('u-1other-college', { institution_id: 'inst-2' }),
      person('u-2gone', { is_active: false }),
      person('u-3super', { is_super_admin: true }),
      person('u-4plain')
    );
    holds('u-0buyer', 'r-buyer');
    holds('u-1other-college', 'r-store');
    holds('u-2gone', 'r-store');
    holds('u-3super', 'r-store');
    holds('u-4plain', 'r-plain');
    let { json } = await call({ action: 'begin', legacy_id: ID });
    expect(json.requested_by).toBe('u-0buyer'); // no eligible Store Administrator -> the procurement holder
    await call({ action: 'release', legacy_id: ID, claimed_at: json.claimed_at });

    db.profiles.push(person('u-9store'));
    holds('u-9store', 'r-store');
    ({ json } = await call({ action: 'begin', legacy_id: ID }));
    expect(json.requested_by).toBe('u-9store');
  });

  it('with nobody at the college office, it is raised in the Director\'s name; no profile = role not recorded', async () => {
    row().reporter_profile_id = null;
    const { json } = await call({ action: 'begin', legacy_id: ID });
    expect(json.requested_by).toBe(DIRECTOR);
    expect(json.on_behalf_of).toBe('director');
    expect(json.requester_left).toBe(true);
    expect(json.dto.notes).toContain('someone who has since left JKKN (role not recorded)');
  });

  it('complete records a request raised for the office, and refuses one raised by another office holder', async () => {
    leave();
    db.profiles.push(person('u-store-a'), person('u-store-b'));
    holds('u-store-a', 'r-store');
    holds('u-store-b', 'r-store');
    const b = (await call({ action: 'begin', legacy_id: ID })).json;
    db.procurement_purchase_requests.push(pr('pr-other', 'submitted', { requested_by: 'u-store-b' }));
    const refused = await call({ action: 'complete', legacy_id: ID, purchase_request_id: 'pr-other', claimed_at: b.claimed_at });
    expect(refused.status).toBe(422);
    db.procurement_purchase_requests.push(pr('pr-office', 'submitted', { requested_by: 'u-store-a' }));
    const ok = await call({ action: 'complete', legacy_id: ID, purchase_request_id: 'pr-office', claimed_at: b.claimed_at });
    expect(ok.status).toBe(200);
    expect(row().imported_purchase_request_id).toBe('pr-office');
  });

  it('an active requester is unchanged: raised in their own name, no note about leaving', async () => {
    const { json } = await call({ action: 'begin', legacy_id: ID });
    expect(json.requested_by).toBe('u-old');
    expect(json.requester_left).toBe(false);
    expect(json.dto.notes).not.toContain('left JKKN');
  });

  it('reject never messages a departed person (inactive or login-disabled)', async () => {
    for (const over of [{ is_active: false }, { is_active: true, is_login_disabled: true }]) {
      bell.mockClear();
      db.legacy_instasolver_requirements = [legacyRow()];
      leave(over);
      const { status, json } = await call({ action: 'reject', legacy_id: ID, reason: 'Not needed now' });
      expect(status).toBe(200);
      expect(json.requester_notified).toBe(false);
      expect(bell).not.toHaveBeenCalled();
    }
  });

  it('bulk reject bells only the people still at JKKN', async () => {
    db.legacy_instasolver_requirements = [
      legacyRow({ legacy_id: 1, requested_at: '2023-01-01T00:00:00.000Z' }),
      legacyRow({ legacy_id: 2, requested_at: '2023-01-01T00:00:00.000Z', reporter_profile_id: 'u-gone' }),
    ];
    db.profiles.push(person('u-gone', { is_active: false }));
    const { json } = await call({ action: 'bulk_reject', reason: 'Older than two years' });
    expect(json.rejected).toBe(2);
    expect(json.belled).toBe(1);
    expect(bell).toHaveBeenCalledTimes(1);
    expect((bell.mock.calls[0][1] as { recipientIds: string[] }).recipientIds).toEqual(['u-old']);
  });
});

describe('bulk cutoff: the screen counts exactly what the route rejects', () => {
  it('uses one instant for both', () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    const cutoff = bulkRejectCutoff(now).getTime();
    expect(isOlderThanBulkCutoff(new Date(cutoff - 1).toISOString(), now)).toBe(true);
    expect(isOlderThanBulkCutoff(new Date(cutoff).toISOString(), now)).toBe(false);
    // Half a day past 730 days: the old whole-day count said "not older"; the route's lt() says older.
    expect(isOlderThanBulkCutoff(new Date(cutoff - 12 * 3_600_000).toISOString(), now)).toBe(true);
  });
});
