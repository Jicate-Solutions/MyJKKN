import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Per-idea assignment on the Improvement Board.
//
// Two things are guarded here, and the second is the one that matters.
//
// 1. The service must go through the RPC. `improvement_ideas_update` (the base
//    RLS policy, 20260723090000:135-144) grants a board.manage holder
//    USING/WITH CHECK true with no column restriction — so a direct
//    `.update({ assignee_id })` from the browser WOULD succeed. It would just
//    skip the stamps, the timeline row and the notification. A silent shortcut
//    that works is the easiest one to introduce by accident.
//
// 2. The notification must be written to BOTH tables. This is not hypothetical:
//    the board's existing sweep, fn_improvement_untriaged_notify, writes only
//    public.notifications, and the bell reads the junction table
//    public.user_notifications (notification-service.ts:571-577 says so in its
//    own comment). Measured on production 2026-09-06 — 10 rows in
//    notifications with category='improvement:triage', 0 matching rows in
//    user_notifications. The sweep believed it announced 10 neglected ideas and
//    delivered nothing. The same one-line omission in this migration would be
//    invisible in every green CI run, so it is asserted against the SQL text.
// ---------------------------------------------------------------------------

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261110000000_improvement_idea_assignee.sql'),
  'utf8',
);

/** The migration minus its `--` comment lines: the SQL that actually executes. */
const SQL = MIGRATION.split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

// --- service-layer mocks ---------------------------------------------------
type RpcResult = { data: unknown; error: { message?: string } | null };

/** Typed with its real signature: an untyped vi.fn() infers a ZERO-arg mock, and
 *  then every toHaveBeenCalledWith(name, args) is a TS2554 the runtime never
 *  notices — green tests, red TypeCheck. */
const rpcSpy = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>();
const updateSpy = vi.fn<(patch: Record<string, unknown>) => unknown>();

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => rpcSpy(name, args),
    from: () => ({ update: updateSpy }),
  }),
}));

const { ImprovementAssignmentService, ASSIGN_IDEA_RPC } = await import(
  '@/lib/services/improvement/improvement-assignment-service'
);

const IDEA = 'idea-1';
const PERSON = 'person-1';

beforeEach(() => {
  rpcSpy.mockReset();
  rpcSpy.mockResolvedValue({ data: null, error: null });
  updateSpy.mockReset();
});

describe('the service assigns through the RPC and nothing else', () => {
  it('assign() calls fn_improvement_assign_idea with both parameters', async () => {
    await ImprovementAssignmentService.assign(IDEA, PERSON);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('fn_improvement_assign_idea', {
      p_idea_id: IDEA,
      p_assignee_id: PERSON,
    });
  });

  it('unassign() sends an explicit null — the documented "clear" signal', async () => {
    await ImprovementAssignmentService.unassign(IDEA);
    expect(rpcSpy).toHaveBeenCalledWith(ASSIGN_IDEA_RPC, {
      p_idea_id: IDEA,
      p_assignee_id: null,
    });
  });

  it('never reaches the table directly — a raw UPDATE would skip stamps, timeline and notice', async () => {
    await ImprovementAssignmentService.assign(IDEA, PERSON);
    await ImprovementAssignmentService.unassign(IDEA);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('surfaces the RPC refusal instead of resolving quietly', async () => {
    rpcSpy.mockResolvedValue({
      data: null,
      error: { message: 'Only Improvement Board managers can assign an improvement idea.' },
    });
    await expect(ImprovementAssignmentService.assign(IDEA, PERSON)).rejects.toThrow(
      /Only Improvement Board managers/,
    );
  });

  it('still throws when the RPC error carries no message', async () => {
    rpcSpy.mockResolvedValue({ data: null, error: {} });
    await expect(ImprovementAssignmentService.assign(IDEA, PERSON)).rejects.toThrow(
      'Failed to assign the idea.',
    );
  });
});

describe('the migration delivers the notice to a bell, not just to a table', () => {
  it('writes user_notifications, the junction row the untriaged sweep omits', () => {
    expect(SQL).toMatch(/INSERT\s+INTO\s+public\.user_notifications/i);
  });

  it('writes both halves — a notifications row alone reached 0 bells in production', () => {
    const notifications = /INSERT\s+INTO\s+public\.notifications\b/i.test(SQL);
    const junction = /INSERT\s+INTO\s+public\.user_notifications\b/i.test(SQL);
    expect({ notifications, junction }).toEqual({ notifications: true, junction: true });
  });

  it('targets the assignee in the junction row, not the acting manager', () => {
    expect(SQL).toMatch(/INSERT\s+INTO\s+public\.user_notifications[\s\S]{0,200}?p_assignee_id/i);
  });
});

describe('the migration keeps the locks the module requires', () => {
  it('revokes EXECUTE from anon explicitly — a PUBLIC revoke alone is not enough', () => {
    expect(SQL).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_improvement_assign_idea\(uuid,\s*uuid\)\s+FROM\s+anon,\s*PUBLIC/i,
    );
  });

  it('grants EXECUTE to authenticated, so a manager can actually call it', () => {
    expect(SQL).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_improvement_assign_idea\(uuid,\s*uuid\)\s+TO\s+authenticated/i,
    );
  });

  it('guards on improvement.board.manage with the NULL-safe COALESCE house pattern', () => {
    expect(SQL).toMatch(/COALESCE\(user_has_permission\('improvement\.board\.manage'\),\s*false\)/);
  });

  it('indexes the new column', () => {
    expect(SQL).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_improvement_ideas_assignee[\s\S]{0,80}?assignee_id/i,
    );
  });
});

describe('assignment does not ride the organogram-fragile owner mechanism', () => {
  it('never writes hr_additional_roles — fn_mba_dept_role_assignments_sync end-dates those', () => {
    // department-owner-service.ts:37-43 records the live failure: approving a
    // department organogram end-dates every current role whose role_type is not
    // an organogram title, and 'department_owner' is not one. A per-idea
    // assignment stored there would inherit that silent un-assignment.
    // Naming the mechanism in a COMMENT is fine; writing to it is not, so this
    // asserts on DML rather than on the mere appearance of the table name.
    expect(SQL).not.toMatch(
      /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?hr_additional_roles/i,
    );
    expect(SQL).not.toMatch(/role_type\s*=\s*'department_owner'/i);
  });

  it('stores accountability on improvement_ideas itself, as three columns', () => {
    // Pinned as the ADD COLUMN clauses, not just "the name appears somewhere":
    // the index below also mentions assignee_id, so a looser regex passes even
    // when the column has been deleted.
    expect(SQL).toMatch(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+assignee_id\s+uuid\s+REFERENCES\s+public\.profiles\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+assigned_by\s+uuid/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+assigned_at\s+timestamptz/i);
  });
});
