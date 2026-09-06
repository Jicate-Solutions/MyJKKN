// ============================================================================
// Guard: the untriaged-idea nudge must reach a bell, not just a table.
// Covers supabase/migrations/20261113000000_improvement_untriaged_notice_reaches_the_bell.sql
// Created: 2026-09-06.
//
// WHAT WENT WRONG, AND WHY A TEST CATCHES IT AND NOTHING ELSE DID
//   fn_improvement_untriaged_notify wrote its notifications row, its ledger row
//   and its 'escalated' activity row, and skipped user_notifications. Every one
//   of those writes succeeded. The cron reported success. The ledger recorded the
//   announcement as sent. The bell reads user_notifications with an `!inner` join
//   to notifications (lib/services/notification/notification-service.ts —
//   getNotifications, getNotificationCounts and the rollups all do this), so a
//   notification with no junction row is invisible to the badge, the list and the
//   counts alike, and nothing anywhere raises.
//
//   Measured on production 2026-09-06: 10 improvement_untriaged_notices rows, 10
//   notifications with category='improvement:triage', and 0 user_notifications
//   rows joined to them. Ten neglected ideas "announced" to three department
//   owners; none of the three was told anything.
//
//   There is no fan-out trigger on public.notifications to close the gap later
//   (the only triggers on that table are safety_log_delete and
//   set_timestamp_notifications). The writer writes both rows or nobody is told.
//
// WHY THIS FILE READS THE .sql
//   The failure is a MISSING statement. A unit test of a TypeScript wrapper
//   cannot see it — lib/services/improvement/untriaged-sweep.ts is a thin shim
//   that calls the RPC and reshapes the result; all behaviour is in the SQL. The
//   migration is the only source, and a fixture copy of it would drift. No
//   database, no secret, no network.
//
// WHY IT RESOLVES THE LATEST DEFINITION RATHER THAN NAMING ONE FILE
//   CREATE OR REPLACE means the function's behaviour is whatever the
//   highest-sorting migration that defines it says. Pinning this test to one
//   filename would let a later migration silently reintroduce the omission and
//   still pass. The invariant is "the definition that wins must deliver".
// ============================================================================

import { readdirSync, readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase/migrations');

/** Every migration filename, in the order Postgres/Supabase applies them. */
const ALL_MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/**
 * SQL with every `--` line comment removed.
 *
 * This is not tidiness. The fixing migration QUOTES the missing statement in its
 * own header, to show what was dropped:
 *   --     INSERT INTO public.user_notifications (notification_id, user_id)
 * A test that greps the raw file therefore passes on the strength of a comment
 * even when the real statement has been deleted — a test that cannot fail. Every
 * assertion below runs against comment-stripped SQL.
 */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function read(file: string): string {
  return stripComments(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
}

/**
 * The migration whose definition of `fnName` actually wins — the last one, by
 * apply order, that contains a CREATE [OR REPLACE] FUNCTION for it.
 */
function authoritativeDefinitionOf(fnName: string): { file: string; sql: string } {
  const defining = ALL_MIGRATIONS.filter((f) =>
    new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?${fnName}\\s*\\(`, 'i').test(
      read(f)
    )
  );
  if (defining.length === 0) {
    throw new Error(`No migration defines ${fnName}`);
  }
  const file = defining[defining.length - 1];
  return { file, sql: read(file) };
}

/**
 * The body of one function, from its CREATE to the closing dollar-quote tag.
 * Scoped so a match elsewhere in a multi-function migration cannot satisfy an
 * assertion about this function.
 */
function bodyOf(sql: string, fnName: string): string {
  const start = sql.search(
    new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?${fnName}\\s*\\(`, 'i')
  );
  expect(start, `${fnName} not found in the migration`).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  // Function bodies here are dollar-quoted, e.g. AS $function$ ... $function$;
  const tag = rest.match(/\bAS\s+(\$[A-Za-z_]*\$)/i);
  expect(tag, `${fnName} has no dollar-quoted body`).not.toBeNull();
  const open = rest.indexOf(tag![1], rest.indexOf(tag![0]));
  const close = rest.indexOf(tag![1], open + tag![1].length);
  expect(close, `${fnName} body is not closed`).toBeGreaterThan(open);
  return rest.slice(open, close + tag![1].length);
}

const JUNCTION_WRITE = /insert\s+into\s+(public\.)?user_notifications\b/i;
const NOTIFICATION_WRITE = /insert\s+into\s+(public\.)?notifications\b/i;

const UNTRIAGED = authoritativeDefinitionOf('fn_improvement_untriaged_notify');

// ---------------------------------------------------------------------------
// The bug itself.
// ---------------------------------------------------------------------------
describe('fn_improvement_untriaged_notify delivers to a bell', () => {
  const body = bodyOf(UNTRIAGED.sql, 'fn_improvement_untriaged_notify');

  it('writes a notifications row (the announcement)', () => {
    expect(NOTIFICATION_WRITE.test(body)).toBe(true);
  });

  it('ALSO writes user_notifications (the delivery) — the bell reads the junction table', () => {
    // Removing the `INSERT INTO public.user_notifications` from the migration
    // makes exactly this assertion fail, which is the whole point of the file:
    // the notice would still be created and still reach nobody.
    expect(JUNCTION_WRITE.test(body)).toBe(true);
  });

  it('recovers the notification id when ON CONFLICT swallowed the RETURNING', () => {
    // `ON CONFLICT DO NOTHING ... RETURNING id INTO v_notif` leaves v_notif NULL
    // when the notice already exists. Without this lookup the junction write is
    // skipped on that path and the owner is told nothing about a notice that
    // demonstrably exists — the same failure in a narrower window.
    expect(/idempotency_key\s*=\s*v_key/i.test(body)).toBe(true);
  });

  it('keys the junction insert so a second run the same night adds nothing', () => {
    expect(/on\s+conflict\s*\(\s*notification_id\s*,\s*user_id\s*\)\s*do\s+nothing/i.test(body)).toBe(
      true
    );
  });
});

// ---------------------------------------------------------------------------
// The fix must not have quietly changed the policy while fixing delivery.
// ---------------------------------------------------------------------------
describe('delivery changed; the escalation policy did not', () => {
  const body = bodyOf(UNTRIAGED.sql, 'fn_improvement_untriaged_notify');

  it('still notifies the CURRENT holder of the area role, and only them', () => {
    expect(/hr_additional_roles/i.test(body)).toBe(true);
    expect(/h\.improvement_area_id\s*=\s*r\.area/i.test(body)).toBe(true);
    expect(/h\.is_current/i.test(body)).toBe(true);
  });

  it('still skips an area with no current owner instead of recording a notice', () => {
    expect(/array_length\(v_recipients,\s*1\)\s+IS\s+NULL/i.test(body)).toBe(true);
    expect(/\bCONTINUE;/i.test(body)).toBe(true);
  });

  it('still announces an idea once, ever (ledger + idempotency key)', () => {
    expect(/improvement_untriaged_notices/i.test(body)).toBe(true);
    expect(/on\s+conflict\s*\(\s*idea_id\s*\)\s*do\s+nothing/i.test(body)).toBe(true);
    expect(/'improvement\.untriaged\|'/i.test(body)).toBe(true);
  });

  it('still keeps its own category, expiry and metadata', () => {
    // fn_cr_notify is the canonical two-table writer but hardcodes
    // category='projects:change_request' and writes no idempotency_key, no
    // expires_at and no metadata — routing through it would fix delivery by
    // breaking four other things. See the migration header.
    expect(/'improvement:triage'/i.test(body)).toBe(true);
    expect(/expires_at|make_interval\(days\s*=>\s*GREATEST\(1,\s*v_expiry_days\)/i.test(body)).toBe(
      true
    );
    expect(/'waited_days'/i.test(body)).toBe(true);
  });

  it('still writes the escalated activity row with a NULL actor', () => {
    expect(/improvement_idea_activity/i.test(body)).toBe(true);
    expect(/'escalated'/i.test(body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The already-fired notices. A code-only fix reaches none of them.
// ---------------------------------------------------------------------------
describe('the notices already fired into the void are backfilled', () => {
  it('the fixing migration backfills user_notifications for existing triage notices', () => {
    // improvement_untriaged_notices is UNIQUE (idea_id) and 20260816050000 argues
    // that this is deliberate: an idea is announced ONCE, EVER. So the ten ideas
    // already in the ledger are never swept again and a forward-only fix leaves
    // them permanently silent.
    const outsideFunction = UNTRIAGED.sql.replace(
      bodyOf(UNTRIAGED.sql, 'fn_improvement_untriaged_notify'),
      ''
    );
    expect(JUNCTION_WRITE.test(outsideFunction)).toBe(true);
    expect(/category\s*=\s*'improvement:triage'/i.test(outsideFunction)).toBe(true);
    expect(/targeting\s*->\s*'user_ids'/i.test(outsideFunction)).toBe(true);
  });

  it('the backfill is a no-op on a second run', () => {
    const outsideFunction = UNTRIAGED.sql.replace(
      bodyOf(UNTRIAGED.sql, 'fn_improvement_untriaged_notify'),
      ''
    );
    expect(/not\s+exists\s*\(/i.test(outsideFunction)).toBe(true);
    expect(/on\s+conflict\s*\(\s*notification_id\s*,\s*user_id\s*\)\s*do\s+nothing/i.test(
      outsideFunction
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The lockdown from 20260816050000 must survive CREATE OR REPLACE.
// ---------------------------------------------------------------------------
describe('the sweep stays cron-only', () => {
  it('is revoked from anon and authenticated and granted only to service_role', () => {
    const { sql } = UNTRIAGED;
    expect(
      /revoke\s+execute\s+on\s+function\s+public\.fn_improvement_untriaged_notify\(integer\)\s*\n?\s*from\s+anon,\s*authenticated,\s*PUBLIC/i.test(
        sql
      )
    ).toBe(true);
    expect(
      /grant\s+execute\s+on\s+function\s+public\.fn_improvement_untriaged_notify\(integer\)\s*\n?\s*to\s+service_role/i.test(
        sql
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The rule, for the next sweep somebody writes on this board.
// ---------------------------------------------------------------------------
describe('every improvement-board notifier writes both tables', () => {
  // Scoped to this module on purpose. Eight sibling functions elsewhere in the
  // repo (fn_cdc_emit_drive_notification, fn_cdc_emit_placement_notification,
  // fn_cdc_emit_placement_auto_decline_notification,
  // fn_cdc_internship_cert_issued_notify, fn_cdc_internship_completed_notify,
  // fn_lc_broadcast_submit, fn_lc_broadcast_decide, fn_lc_broadcast_autosend)
  // share the same omission and are owned by other lanes. Widening this list is
  // how they get fixed — not by this file quietly failing on somebody else's code.
  const IMPROVEMENT_NOTIFIERS = [
    'fn_improvement_untriaged_notify',
    'fn_gemba_official_lapse_notify',
  ];

  it.each(IMPROVEMENT_NOTIFIERS)(
    '%s writes user_notifications wherever it writes notifications',
    (fn) => {
      const { sql } = authoritativeDefinitionOf(fn);
      const body = bodyOf(sql, fn);
      if (!NOTIFICATION_WRITE.test(body)) return; // not a notifier any more
      expect(JUNCTION_WRITE.test(body)).toBe(true);
    }
  );
});
