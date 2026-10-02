// lib/grievance/complaint-display.ts
// ============================================================================
// Plain-words helpers for a complaint (a grievance_tickets row), shared by the
// handler pages, the filer's "My complaints" page and the filer bell.
//
// Director rulings, 30 Sep 2026 (InstaSolver tab):
//   · every complaint shows who is handling it;
//   · the person who complained hears about every change;
//   · a "My complaints" page.
//
// Pure: no database, no server-only imports — so a 'use client' page can use
// it and a test can import it without mocking anything.
// ============================================================================

/** The live grievance_tickets_status_check values. */
export type ComplaintStatus =
  | 'open'
  | 'in_progress'
  | 'pending_info'
  | 'resolved'
  | 'closed'
  | 'reopened';

const STATUS_WORDS: Record<ComplaintStatus, string> = {
  open: 'Open',
  in_progress: 'Being handled',
  pending_info: 'Waiting for more information',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
};

/** "in_progress" → "Being handled". Unknown values are shown tidied, never raw. */
export function statusInWords(status: string | null | undefined): string {
  if (!status) return 'Open';
  const known = STATUS_WORDS[status as ComplaintStatus];
  if (known) return known;
  return status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * A date a person can read, or null when there is no real date.
 *
 * THE 1970 GUARD. `new Date(null)` is 1 Jan 1970, and so is a zero or a tiny
 * number, and an unparseable string is "Invalid Date". None of those is a
 * deadline anybody set. A complaint answer-due date before the year 2000 is
 * treated as missing, so a screen shows "Not set" instead of 1970.
 */
export function formatComplaintDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() < 2000) return null;
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    // Fixed zone: server (UTC) and phone (IST) must render the same string,
    // or a server-rendered client component hydrates with a mismatch.
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * "Handled by <name>" / "Not yet assigned".
 *
 * A ticket can be assigned while the viewer cannot read the handler's profile
 * (RLS on profiles). That is NOT "not yet assigned" — saying so would be a lie
 * on exactly the screen that exists to stop complaints going unowned.
 */
export function handledByLabel(
  assignedTo: string | null | undefined,
  handlerName: string | null | undefined
): string {
  if (!assignedTo) return 'Not yet assigned';
  const name = handlerName?.trim();
  if (name) return `Handled by ${name}`;
  return 'Assigned (name not available)';
}

// ── The filer bell ─────────────────────────────────────────────────────────

/** The columns the filer-update decision reads from the row AFTER the write. */
export interface FilerUpdateAfter {
  id: string;
  ticket_number: string | null;
  status: string | null;
  assigned_to: string | null;
  is_anonymous: boolean | null;
  raised_by_id: string | null;
  resolution: string | null;
}

/** The two columns it reads from the row BEFORE the write. */
export interface FilerUpdateBefore {
  status: string | null;
  assigned_to: string | null;
}

export interface FilerUpdateMessage {
  recipientId: string;
  title: string;
  body: string;
  // No idempotency key, on purpose (repair round, 1 Oct 2026). A key of
  // ticket + status silenced every REPEAT change: a complaint reopened and
  // resolved again, or handed back to an earlier handler, sent no second bell,
  // which breaks the ruling "a message each time something changes".
  // grievance_tickets has no updated_at trigger, so there is no per-write value
  // to key on. A no-op repeat (same status, same handler) is already stopped
  // above by the before/after comparison, and neither write path retries.
}

export const FILER_UPDATE_URL = '/instasolver/my-complaints';

/**
 * Decide whether the filer gets a bell for this write, and what it says.
 * Returns null when nothing should be sent:
 *   · the complaint is anonymous — never a message; they follow the track page;
 *   · there is no filer on record;
 *   · the before-row is unknown (no way to tell what changed — stay quiet
 *     rather than guess);
 *   · neither the status nor the handler changed.
 * One write that both assigns and moves the status sends ONE bell.
 */
export function describeFilerUpdate(
  before: FilerUpdateBefore | null,
  after: FilerUpdateAfter,
  handlerName: string | null
): FilerUpdateMessage | null {
  if (after.is_anonymous !== false) return null;
  if (!after.raised_by_id) return null;
  if (!before) return null;

  const statusChanged = (before.status ?? null) !== (after.status ?? null);
  const assignmentChanged =
    !!after.assigned_to && (before.assigned_to ?? null) !== after.assigned_to;
  if (!statusChanged && !assignmentChanged) return null;

  const number = after.ticket_number ?? 'without a number';
  const name = handlerName?.trim() || null;
  const byName = name ? ` by ${name}` : '';

  let what: string;
  if (statusChanged && after.status === 'resolved') {
    const full = after.resolution?.trim() ?? '';
    // A bell is a glance, not the record: the full text is on My complaints.
    const summary = full.length > 200 ? `${full.slice(0, 197)}...` : full;
    what = summary ? `was resolved: ${summary}` : 'was resolved.';
  } else if (assignmentChanged || (statusChanged && after.status === 'in_progress')) {
    what = `is now being handled${byName}.`;
  } else if (after.status === 'reopened') {
    what = 'has been reopened.';
  } else if (after.status === 'pending_info') {
    what = 'is waiting for more information.';
  } else {
    what = `is now ${statusInWords(after.status).toLowerCase()}.`;
  }

  return {
    recipientId: after.raised_by_id,
    title: `Your complaint ${number}`,
    body: `Your complaint ${number} ${what}`,
  };
}
