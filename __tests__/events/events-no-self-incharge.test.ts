// __tests__/events/events-no-self-incharge.test.ts
//
// Follow-up to #4128 (only an event's in-charges and admins may cancel it).
// Three ways around that rule are closed here:
//   1. adding YOURSELF to an event's in-charge roster on UPDATE,
//   2. naming yourself in-charge when you CREATE the event,
//   3. switching a general event to a marathon (exempt from #4128), cancelling
//      it, and switching it back.
// Only an admin (is_super_admin() / is_admin()) may put themselves on a roster.
// A tournament's own creator stays its in-charge (Director 29 Sep, #4127).

import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import * as peopleFields from '@/components/events/shared/event-people-fields';

const MIGRATION = 'supabase/migrations/20270712090000_events_no_self_incharge.sql';

function code(): string {
  const path = join(process.cwd(), MIGRATION);
  expect(existsSync(path), `${MIGRATION} is missing`).toBe(true);
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.replace(/^\s*--.*$/, ''))
    .join('\n');
}

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}()`);
  expect(start, `${name} is not (re)defined`).toBeGreaterThan(-1);
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end);
}

describe('migration 20270712090000 — the UPDATE roster guard', () => {
  it('refuses a non-admin who adds themselves (present in NEW, absent from OLD)', () => {
    const body = fnBody(code(), 'fn_guard_event_privileged_fields');
    expect(body).toMatch(/n->>'member_id'\s*=\s*auth\.uid\(\)::text/);
    expect(body).toMatch(/NOT EXISTS[\s\S]*OLD\.config->'incharges'[\s\S]*o->>'member_id'\s*=\s*auth\.uid\(\)::text/);
    expect(body).toMatch(/NOT \(COALESCE\(public\.is_super_admin\(\), false\) OR COALESCE\(public\.is_admin\(\), false\)\)/);
    expect(body).toContain('You cannot make yourself an in-charge');
  });

  it('keeps the existing tier-1 and tier-2 rules', () => {
    const body = fnBody(code(), 'fn_guard_event_privileged_fields');
    expect(body).toContain("OLD.event_type = 'sports_tournament'");
    expect(body).toContain("user_has_permission('events.logistics.manage')");
    expect(body).toContain('You may not change the institution, event type or owner of event');
    expect(body).toMatch(/IF auth\.uid\(\) IS NULL THEN\s*RETURN NEW;/);
  });

  it('lets only an admin move an event INTO or OUT OF tournament, marathon or induction', () => {
    const body = fnBody(code(), 'fn_guard_event_privileged_fields');
    // Two-way (W12 review): a tournament switched to a general type would keep
    // its creator as a self-appointed in-charge who can cancel it.
    expect(body).toMatch(
      /\(NEW\.event_type IN \('sports_tournament', 'marathon', 'induction'\)\s*OR COALESCE\(OLD\.event_type, ''\) IN \('sports_tournament', 'marathon', 'induction'\)\)/,
    );
    expect(body).not.toMatch(/NOT IN \('sports_tournament', 'marathon', 'induction'\)/);
    expect(body).toContain('into or out of a tournament, marathon or induction');
  });

  it("lets a tournament's own creator re-add themselves (#4127), nobody else", () => {
    const body = fnBody(code(), 'fn_guard_event_privileged_fields');
    expect(body).toMatch(
      /IF NOT \(OLD\.event_type = 'sports_tournament'\s*AND OLD\.created_by IS NOT NULL AND OLD\.created_by = auth\.uid\(\)\)\s*AND EXISTS \(/,
    );
  });
});

describe('the tournament in-charge panel uses the same picker rule', () => {
  const PANEL = 'app/(routes)/events/tournament/[id]/_components/incharge-panel.tsx';
  const src = () => readFileSync(join(process.cwd(), PANEL), 'utf8');

  it('drops your own name unless you are an admin or the creator', () => {
    const s = src();
    expect(s).toContain('dropSelfUnlessAdmin(picked');
    expect(s).toMatch(/isCreator\s*=\s*!!profile\?\.id && tournament\.created_by === profile\.id/);
    expect(s).toContain("You can&apos;t make yourself an in-charge");
  });
});

describe('migration 20270712090000 — the INSERT guard', () => {
  it('exists, runs BEFORE INSERT, and checks the new roster for the caller', () => {
    const sql = code();
    const body = fnBody(sql, 'fn_guard_event_incharges_on_insert');
    expect(body).toMatch(/n->>'member_id'\s*=\s*auth\.uid\(\)::text/);
    expect(body).toContain('You cannot make yourself an in-charge of a new event');
    expect(sql).toMatch(
      /CREATE TRIGGER trg_events_guard_incharges_on_insert\s+BEFORE INSERT ON public\.events/,
    );
  });

  it("exempts a tournament's own creator (#4127) and the service path", () => {
    const body = fnBody(code(), 'fn_guard_event_incharges_on_insert');
    expect(body).toMatch(
      /NEW\.event_type = 'sports_tournament' AND NEW\.created_by = auth\.uid\(\) THEN\s*RETURN NEW;/,
    );
    expect(body).toMatch(/IF auth\.uid\(\) IS NULL THEN\s*RETURN NEW;/);
  });

  it('locks anon out of both guards', () => {
    const sql = code();
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fn_guard_event_incharges_on_insert() FROM anon, PUBLIC;',
    );
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fn_guard_event_privileged_fields() FROM anon, PUBLIC;',
    );
  });
});

describe('the in-charge picker drops your own name unless you are an admin', () => {
  const drop = (peopleFields as Record<string, unknown>).dropSelfUnlessAdmin as
    | ((
        people: { member_id: string }[],
        viewer: { userId?: string | null; isSuperAdmin?: boolean; role?: string | null },
      ) => { kept: { member_id: string }[]; droppedSelf: boolean })
    | undefined;
  const people = [{ member_id: 'me' }, { member_id: 'other' }];

  it('is exported', () => {
    expect(typeof drop).toBe('function');
  });

  it('removes the viewer for a non-admin and says so', () => {
    const r = drop!(people, { userId: 'me', role: 'senior_learner' });
    expect(r.kept.map((p) => p.member_id)).toEqual(['other']);
    expect(r.droppedSelf).toBe(true);
  });

  it('keeps everyone for an admin role or a super admin', () => {
    expect(drop!(people, { userId: 'me', role: 'admin' }).kept).toHaveLength(2);
    expect(drop!(people, { userId: 'me', role: 'administrator' }).kept).toHaveLength(2);
    expect(drop!(people, { userId: 'me', isSuperAdmin: true }).kept).toHaveLength(2);
  });

  it('treats event_coordinator like the database does: not an admin', () => {
    expect(drop!(people, { userId: 'me', role: 'event_coordinator' }).droppedSelf).toBe(true);
  });

  it('leaves the list alone when you are not in it', () => {
    const r = drop!([{ member_id: 'other' }], { userId: 'me', role: 'senior_learner' });
    expect(r.kept).toHaveLength(1);
    expect(r.droppedSelf).toBe(false);
  });
});
