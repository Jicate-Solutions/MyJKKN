// __tests__/events/events-cancel-incharge-or-admin.test.ts
//
// Director's ruling, 30 Sep 2026 08:59: cancelling an event is allowed ONLY for
// that event's in-charges and for admins (is_admin()). Two halves:
//
//   1. The database. Migration 20270601110000 narrows event_cancellations, and
//      must also close the side door on public.events itself: the row-level
//      UPDATE policies (events_edit_permission_update and friends) would
//      otherwise let any events.edit holder write status = 'cancelled' directly.
//   2. The screen. The Cancel button on /events/[id] follows the same rule —
//      not canEditEvent.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// event-display -> use-general-events -> EventBaseService builds a Supabase
// client at module level. These tests never touch it.
vi.mock('@/lib/services/events/core/event-base-service', () => ({ EventBaseService: {} }));

import { canCancelEvent } from '@/app/(routes)/events/_components/event-display';

describe('migration 20270601110000 — events.status -> cancelled is guarded on events too', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20270601110000_event_cancellations_incharges_and_admins.sql',
    ),
    'utf8',
  );
  /** The SQL that actually runs — `--` prose is free to explain. */
  const code = sql
    .split('\n')
    .map((line) => line.replace(/^\s*--.*$/, ''))
    .join('\n');

  const fnStart = code.indexOf(
    'CREATE OR REPLACE FUNCTION public.fn_events_cancel_incharge_or_admin()',
  );
  const fnEnd = code.indexOf(
    'REVOKE EXECUTE ON FUNCTION public.fn_events_cancel_incharge_or_admin()',
  );
  const body = fnStart >= 0 && fnEnd > fnStart ? code.slice(fnStart, fnEnd) : '';

  it('defines the guard function', () => {
    expect(fnStart).toBeGreaterThanOrEqual(0);
    expect(fnEnd).toBeGreaterThan(fnStart);
  });

  it('attaches it as a BEFORE UPDATE OF status row trigger on public.events', () => {
    expect(code).toMatch(
      /CREATE TRIGGER trg_events_cancel_incharge_or_admin\s+BEFORE UPDATE OF status ON public\.events\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.fn_events_cancel_incharge_or_admin\(\)/,
    );
  });

  it('fires only on the move INTO cancelled, so reinstating is untouched', () => {
    expect(body).toMatch(/NEW\.status = 'cancelled'/);
    expect(body).toMatch(/OLD\.status IS DISTINCT FROM 'cancelled'/);
  });

  it('admits exactly is_admin() or an in-charge of the event, and raises otherwise', () => {
    expect(body).toMatch(/public\.is_admin\(\)/);
    expect(body).toMatch(/public\.fn_is_event_incharge\(OLD\.id\)/);
    expect(body).toMatch(/RAISE EXCEPTION/);
    expect(body).toMatch(/ERRCODE = '42501'/);
    // Not the old "if you can edit, you can cancel" rule.
    expect(body).not.toMatch(/events\.edit/);
    expect(body).not.toMatch(/created_by/);
  });

  it('checks the roster as it was BEFORE the write (OLD.id), not one the same write adds', () => {
    expect(body).not.toMatch(/NEW\.config/);
  });

  it('lets trusted backend paths through, like fn_guard_event_privileged_fields', () => {
    expect(body).toMatch(/IF auth\.uid\(\) IS NULL THEN\s+RETURN NEW;/);
  });

  it('keeps anon and PUBLIC off the function, and asserts the trigger exists', () => {
    expect(code).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_events_cancel_incharge_or_admin\(\) FROM anon, PUBLIC;/,
    );
    expect(code).toMatch(/tgname = 'trg_events_cancel_incharge_or_admin'/);
  });
});

describe('canCancelEvent — who sees the Cancel button', () => {
  const ME = 'u-me';
  const withIncharges = (...ids: string[]) => ({
    created_by: 'u-creator',
    institution_id: 'inst-1',
    config: { incharges: ids.map((member_id) => ({ member_id, name: 'x' })) },
  });

  it('shows it to an in-charge who does NOT hold events.edit', () => {
    expect(canCancelEvent(withIncharges(ME), { userId: ME })).toBe(true);
  });

  it('hides it from an events.edit holder who is not an in-charge', () => {
    // canCancelEvent takes no edit permission at all: holding events.edit is
    // irrelevant to cancelling.
    expect(canCancelEvent(withIncharges('u-other'), { userId: ME })).toBe(false);
  });

  it('hides it from the creator who is not an in-charge', () => {
    expect(canCancelEvent(withIncharges('u-other'), { userId: 'u-creator' })).toBe(false);
  });

  it('shows it to a super admin and to the is_admin() roles', () => {
    const ev = withIncharges('u-other');
    expect(canCancelEvent(ev, { userId: ME, isSuperAdmin: true })).toBe(true);
    for (const role of ['admin', 'super_admin', 'administrator']) {
      expect(canCancelEvent(ev, { userId: ME, role })).toBe(true);
    }
  });

  it('does not treat event_coordinator as admin — is_admin() does not', () => {
    expect(canCancelEvent(withIncharges('u-other'), { userId: ME, role: 'event_coordinator' })).toBe(false);
  });

  it('hides it when the event has no in-charge roster, or the viewer is unknown', () => {
    expect(canCancelEvent({ config: null }, { userId: ME })).toBe(false);
    expect(canCancelEvent({ config: { incharges: 'nope' } }, { userId: ME })).toBe(false);
    expect(canCancelEvent(withIncharges(ME), { userId: null })).toBe(false);
  });
});

describe('/events/[id] — the Cancel button is wired to canCancelEvent, not canEdit', () => {
  const page = readFileSync(join(process.cwd(), 'app/(routes)/events/[id]/page.tsx'), 'utf8');

  it('renders CancelEventDialog behind mayCancel', () => {
    expect(page).toMatch(/\{mayCancel && cancelReachable && <CancelEventDialog event=\{event\} \/>\}/);
    expect(page).not.toMatch(/canEdit && canCancel && <CancelEventDialog/);
  });

  it('computes mayCancel from canCancelEvent', () => {
    expect(page).toMatch(/const mayCancel =\s+!!event &&\s+canCancelEvent\(event,/);
  });
});
