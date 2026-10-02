// lib/services/admission/walkin-claims-weekly-note.ts
// The pure half of the weekly walk-in agency claims note
// (app/api/cron/walkin-claims-weekly-note/route.ts).
//
// An agency credit on a learner whose enquiry was recorded as a walk-in is held
// out of the payment run until a human releases it (Director ruling 2026-08-17,
// migration 20260909061500). Nobody had been reminded they were waiting, so none
// had ever been released. Director ruling 2026-09-27: the release owner and the
// Director each get a short note every week, by email and by the in-app bell.
//
// Everything here is side-effect free so the wording, the recipient list and the
// once-a-week key can be tested without a database.

export const WALKIN_WORKLIST_URL = 'https://www.jkkn.ai/admission/consultants/review-worklist';
export const WALKIN_WORKLIST_PATH = '/admission/consultants/review-worklist';

export const OWNER_POLICY_KEY = 'admission.walkin_release.owner_user_id';
export const RECIPIENTS_POLICY_KEY = 'admission.walkin_release.weekly_note_recipient_ids';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface WalkinClaimCounts {
  /** Walk-in agency credits still waiting (payout_cleared_at IS NULL). */
  waiting: number;
  /** created_at of the oldest waiting credit; null when none are waiting. */
  oldestWaitingAt: string | null;
  /** Walk-in credits released in the last 7 days. */
  releasedLast7Days: number;
}

export interface WalkinClaimsNote {
  subject: string;
  /** Plain text — the bell body and the email's text part. */
  text: string;
  html: string;
}

/**
 * ISO-8601 week of the given instant, read on the Indian calendar
 * (e.g. "2026-W39"). This is the note's identity: one note per recipient per
 * week, whatever the dispatcher, a retry or a manual poke does.
 */
export function isoWeekKey(now: Date): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  // Work on a UTC-midnight copy of the IST calendar date.
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  const dow = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  // The Thursday of this week decides which year the week belongs to.
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Notification idempotency key for one recipient in one week. */
export function noteIdempotencyKey(weekKey: string, userId: string): string {
  return `walkin-claims-weekly-note:${weekKey}:${userId}`;
}

function formatIstDate(iso: string, withYear: boolean): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'Asia/Kolkata',
  }).format(new Date(t));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The note itself. Counts only — never a rupee amount. */
export function buildWalkinClaimsNote(counts: WalkinClaimCounts): WalkinClaimsNote {
  const waiting = Math.max(0, Math.trunc(counts.waiting || 0));
  const released = Math.max(0, Math.trunc(counts.releasedLast7Days || 0));
  const oldestShort = counts.oldestWaitingAt ? formatIstDate(counts.oldestWaitingAt, false) : null;
  const oldestLong = counts.oldestWaitingAt ? formatIstDate(counts.oldestWaitingAt, true) : null;

  const subject =
    waiting === 0
      ? 'Walk-in agency claims: none waiting'
      : `Walk-in agency claims: ${waiting} waiting${oldestShort ? `, oldest ${oldestShort}` : ''}`;

  const lines: string[] = [];
  if (waiting === 0) {
    lines.push('No walk-in agency claims are waiting for confirmation.');
  } else {
    lines.push(
      `${plural(waiting, 'walk-in agency claim is', 'walk-in agency claims are')} waiting for someone to confirm they are genuine.`,
    );
    if (oldestLong) lines.push(`The oldest has been waiting since ${oldestLong}.`);
  }
  lines.push(
    released === 0
      ? 'None were released in the last 7 days.'
      : `${plural(released, 'was', 'were')} released in the last 7 days.`,
  );
  lines.push('A claim is paid only after it is released. Review them here:');
  const text = `${lines.join(' ')}\n${WALKIN_WORKLIST_URL}`;

  const html = [
    `<p>${lines.map(escapeHtml).join('<br>')}</p>`,
    `<p><a href="${WALKIN_WORKLIST_URL}">Open the review worklist</a></p>`,
    '<p style="color:#6b7280;font-size:12px">Sent every Monday. You get this because you are listed in admission.walkin_release.weekly_note_recipient_ids or are the walk-in release owner.</p>',
  ].join('\n');

  return { subject, text, html };
}

function asUuid(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim().toLowerCase() : null;
}

export interface ResolvedRecipients {
  userIds: string[];
  /** The owner policy row is absent or does not hold a uuid. */
  ownerMissing: boolean;
  /** Entries in the recipients list that were not uuids (ignored). */
  invalidEntries: number;
}

/**
 * Recipients = the configured list plus the release owner, de-duplicated.
 * Either policy value may be absent or malformed; bad entries are dropped and
 * reported rather than thrown, so one broken row never silences the other person.
 */
export function resolveRecipients(listValue: unknown, ownerValue: unknown): ResolvedRecipients {
  const ids: string[] = [];
  let invalidEntries = 0;
  if (Array.isArray(listValue)) {
    for (const entry of listValue) {
      const id = asUuid(entry);
      if (id) ids.push(id);
      else invalidEntries++;
    }
  }
  const owner = asUuid(ownerValue);
  if (owner) ids.push(owner);
  return { userIds: Array.from(new Set(ids)), ownerMissing: owner === null, invalidEntries };
}
