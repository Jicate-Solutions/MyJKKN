// lib/services/meetings/meeting-note-draft.ts
// ============================================================================
// AI note-drafter — when Fireflies returns NO summary for a meeting that is
// linked to a MyJKKN booking, draft one on the ₹0 Max lane: a short summary,
// the decisions taken, and the follow-ups. Every output is labelled AI draft.
//
// WHY (measured live 2026-09-26): Fireflies returned summary = NULL for 115 of
// 152 recent meetings (76%); of the 68 notes linked to a booking, 23 produced
// ZERO follow-ups for that reason. Re-fetching does not fill them.
//
// SHAPE — copied from the accreditation committee assistant
// (app/api/cron/accreditation-committee-ai-drafts + meeting-draft-service):
//   COLLECT finished jobs → validate → record → strip the prompt off the job;
//   THEN ENQUEUE new drafts. The model never writes a row: it returns JSON, and
//   every field is re-checked here before anything is stored.
//
// THE RULES THAT MAKE A DRAFT SAFE TO STORE
//   * An OWNER is attached only on an EXACT participant-email match against
//     meeting_note_participants for that note. A name — however close — never
//     resolves to a person (a wrong owner puts somebody else's task on a real
//     person's list).
//   * A DUE DATE is kept only as an ISO date 0–180 days after the meeting.
//   * Every text field is length-capped.
//   * A booking that already carries meeting_action_items gets NO new items.
//   * meeting_notes.summary is NEVER written. The draft lives in
//     meeting_notes.ai_draft, because the Fireflies ingest rewrites `summary`
//     and `raw` on every 30-minute tick and would wipe a draft stored there.
//   * Interview bookings are never enqueued.
//   * THE SWITCH IS REAL. The run reads ai_job_types.enabled for
//     'meetings.note_draft' FIRST. Switched off, it collects nothing (no
//     fn_ai_collect_claim call, no 'AI draft:' tasks, no stamps), calls
//     Fireflies for nothing, enqueues nothing, and CANCELS every job of this
//     type still 'pending', removing its prompt. A job the drain has already
//     claimed or is running cannot be stopped from here; its result waits in
//     ai_jobs and is collected only if the switch is turned back on. If the
//     switch cannot be read, the run collects and enqueues nothing and
//     cancels nothing beyond the ordinary 7-day rule.
//   * A note is stamped 'no_transcript' ONLY when Fireflies returned the
//     transcript and it holds zero sentences.
//   * Fireflies' PER-TRANSCRIPT codes (object_not_found, forbidden,
//     not_in_team — FIREFLIES_PER_TRANSCRIPT_CODES) are final for that ONE
//     note: it is stamped 'fireflies_<code>' and the run goes on to the next
//     candidate. A transcript that came back without a readable sentence list
//     leaves the note UNSTAMPED and the run also goes on.
//   * ONLY the key / account failures STOP the run, stamping nothing: no key
//     (not_connected), HTTP 401 / 429, and the codes in
//     FIREFLIES_ACCOUNT_STOP_CODES (auth_failed, too_many_requests,
//     account_cancelled, paid_required). Every other failure — the 20 s
//     timeout, a network error, a 5xx, a body that is not JSON, and any other
//     or unknown GraphQL code — SKIPS that note for this run, UNSTAMPED, and
//     the run goes on (counted as skippedTransient). One note that always
//     fails cannot hold the backlog; the 10-per-run cap bounds the cost.
//   * If Fireflies' own summary has arrived by the time a finished draft is
//     collected, the draft is NOT written as tasks: the note is stamped
//     'summary_arrived' and the model's answer is dropped.
//   * A DB read that FAILS is never read as "nothing there". A failed read of
//     the note, its participants, their profiles, the booking host or the
//     booking's existing follow-ups gives outcome 'error' and leaves the note
//     UNSTAMPED, so a later run retries it. Only a read that succeeded and
//     found no host stamps 'no_host'; only a count that succeeded and is above
//     zero stamps 'items_skipped_existing'.
//   * A transcript does not linger in ai_jobs.payload.prompt: it is removed
//     from every delivered job (collect), from every job that ended 'error' or
//     'canceled', and from any job still pending after 7 days — which is also
//     cancelled, because a pending job with no prompt would run blank.
//   * If the collect pass throws, the enqueue pass does not run that time: a
//     note whose finished job was not collected must not be sent twice.
//
// DB access goes through the small NoteDraftDb interface so the rules above
// are unit-tested without a database (__tests__/meetings/meeting-note-draft.test.ts).
// This file does NOT depend on lib/services/meetings/meeting-note-followups.ts
// (a sibling PR) — the validator here is its own.
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';
import {
  isFirefliesPerTranscriptCode,
  type FirefliesResult,
  type FirefliesSentence,
} from '@/lib/services/meetings/fireflies-client';
import {
  extractJobResultText,
  type CollectedJobsLaneItem,
  type JobsLaneEnqueueResult,
} from '@/lib/services/platform/ai-jobs-lane';

type Admin = ReturnType<typeof createServiceRoleClient>;

export const NOTE_DRAFT_JOB = 'meetings.note_draft';
export const AI_DRAFT_LABEL = 'AI draft — check before acting';
/** Prefixed onto every drafted follow-up so it reads as a draft on ANY screen,
 *  including ones that do not yet read meeting_action_items.source. */
export const AI_DRAFT_ACTION_PREFIX = 'AI draft: ';

export const LIMITS = {
  summary: 2000,
  decision: 500,
  decisions: 10,
  /** meeting_action_items.action_text CHECK is 1..500, prefix included. */
  actionText: 500,
  ownerLabel: 120,
  actions: 15,
  transcriptChars: 60_000,
  dueDateMaxDays: 180,
  /** A note must be at least this old before it is drafted. */
  minAgeHours: 2,
  /** Per-run enqueue cap. */
  enqueueCap: 10,
  /** A job still PENDING after this many days is cancelled and its prompt
   *  (a meeting transcript) removed — the drain is not coming for it. */
  pendingPromptMaxDays: 7,
  /** How many prompt-holding jobs one sweep looks at. */
  promptSweepBatch: 100,
} as const;

/**
 * ai_jobs.status values, from ai_jobs_status_chk (20260712183000; read live
 * 2026-09-28: pending | claimed | running | done | error | canceled). There is
 * no 'expired' or 'failed'. 'error' and 'canceled' are the terminal states a
 * job reaches WITHOUT being delivered — nothing re-pends them
 * (fn_ai_requeue_stale only rescues claimed/running jobs), so their prompt has
 * no further use.
 */
export const TERMINAL_UNDELIVERED_STATUSES = ['error', 'canceled'] as const;

// ── Types ───────────────────────────────────────────────────────────────────

export interface DraftParticipant {
  /** lower-cased, as meeting_note_participants stores it */
  email: string;
  displayName: string | null;
  /** the MyJKKN profile for exactly this email, or null */
  profileId: string | null;
}

export interface DraftNote {
  id: string;
  bookingId: string;
  title: string | null;
  occurredAt: string | null;
  participants: DraftParticipant[];
}

export interface ValidatedAction {
  actionText: string;
  ownerLabel: string | null;
  ownerProfileId: string | null;
  dueDate: string | null;
}

export interface ValidatedDraft {
  summary: string | null;
  decisions: string[];
  actions: ValidatedAction[];
}

export type RecordOutcome =
  | 'recorded'
  | 'recorded_items_skipped'
  | 'unreadable'
  | 'no_host'
  | 'already_drafted'
  | 'error';

export interface CandidateNote {
  id: string;
  bookingId: string;
  providerRef: string;
  title: string | null;
  occurredAt: string | null;
}

/** One ai_jobs row of this job type whose payload still carries a prompt. */
export interface HeldPromptJob {
  id: string;
  status: string;
  requestedAt: string | null;
  deliveredAt: string | null;
}

/** Everything the drafter reads or writes. Implemented over Supabase by
 *  supabaseNoteDraftDb(); faked in tests.
 *
 *  Every read on the collect / record path returns its `error` separately
 *  from its answer: a failed read must never be mistaken for an empty one
 *  (no host, no participants, no existing follow-ups), because those empty
 *  answers lead to FINAL stamps. */
export interface NoteDraftDb {
  /** note null with no error = there is no such note. */
  loadNote(noteId: string): Promise<{
    note: {
      id: string;
      bookingId: string | null;
      title: string | null;
      occurredAt: string | null;
      aiDraftedAt: string | null;
      summary: string | null;
    } | null;
    error: string | null;
  }>;
  /** error = the participant list OR the profile lookup failed; the caller
   *  must not draft on that list. [] with no error = genuinely nobody. */
  loadParticipants(noteId: string): Promise<{ participants: DraftParticipant[]; error: string | null }>;
  /** host null with no error = the booking has no host (or no longer exists). */
  bookingHost(bookingId: string): Promise<{ host: string | null; error: string | null }>;
  /** error = the count could not be read; count is then meaningless. */
  countActionItems(bookingId: string): Promise<{ count: number; error: string | null }>;
  insertActionItems(rows: Array<Record<string, unknown>>): Promise<{ error: string | null }>;
  /** Writes ai_draft + ai_drafted_at ONLY while ai_drafted_at is still NULL.
   *  Must never write meeting_notes.summary. */
  stampDraft(noteId: string, aiDraft: Record<string, unknown>): Promise<{ error: string | null }>;
  /** Remove payload.prompt from one ai_jobs row, keeping every other key. */
  stripJobPrompt(jobId: string): Promise<{ error: string | null }>;
  /** This job type's ai_jobs rows whose payload still carries a prompt,
   *  oldest first. null = could not read. */
  listJobsHoldingPrompt(jobType: string, limit: number): Promise<HeldPromptJob[] | null>;
  /** Remove payload.prompt AND mark the job 'canceled' — ONLY while it is
   *  still 'pending'. applied=false means the drain claimed it in between, so
   *  it runs with its prompt intact and is left alone. */
  cancelPendingJob(jobId: string, reason: string): Promise<{ applied: boolean; error: string | null }>;
  /** error = the switch could not be read; enabled is then meaningless. */
  isJobTypeEnabled(jobType: string): Promise<{ enabled: boolean; error: string | null }>;
  listCandidates(olderThanIso: string, limit: number): Promise<CandidateNote[] | null>;
  /** Booking ids that are interviews — hr_recruitment_interviews.booking_id,
   *  plus bookings whose meeting type is named as an interview. null = could
   *  not tell, which the caller must treat as "enqueue nothing". */
  interviewBookingIds(bookingIds: string[]): Promise<Set<string> | null>;
}

// ── Prompt ──────────────────────────────────────────────────────────────────

export function buildPrompt(note: DraftNote, sentences: FirefliesSentence[]): string {
  const people = note.participants
    .map((p) => `- ${p.displayName ?? '(no name)'} <${p.email}>`)
    .join('\n');

  let transcript = '';
  for (const s of sentences) {
    const line = `${s.speakerName ?? 'Unknown speaker'}: ${s.text}\n`;
    if (transcript.length + line.length > LIMITS.transcriptChars) {
      transcript += '[transcript truncated]\n';
      break;
    }
    transcript += line;
  }

  return [
    'You are drafting meeting notes for a college (JKKN). The meeting recorder produced no summary, so you are writing a DRAFT that a person will check before acting on it.',
    '',
    'Return STRICT JSON only — no prose, no code fence — in exactly this shape:',
    '{"summary": string, "decisions": string[], "actions": [{"text": string, "owner_email": string|null, "owner_label": string, "due_date": string|null}]}',
    '',
    'Rules:',
    `- summary: at most 5 plain sentences, under ${LIMITS.summary} characters.`,
    '- decisions: only decisions the transcript shows were actually agreed. If none, return [].',
    '- actions: only follow-ups somebody actually took on. If none, return [].',
    '- owner_email: copy an address EXACTLY from the participant list below, or null. Never guess an address and never build one from a name.',
    '- owner_label: the owner as they were addressed in the meeting (a name or role), or "Unassigned".',
    '- due_date: an ISO date (YYYY-MM-DD) ONLY when a specific date was stated; otherwise null. Do not convert "soon" or "next week" into a date.',
    '- The transcript may be missing parts spoken in Tamil. Never infer a decision or a task from a gap or an unclear passage — leave it out.',
    '- Do not invent names, numbers, dates or decisions.',
    '',
    `Meeting: ${note.title ?? '(untitled)'}`,
    `Held: ${note.occurredAt ?? 'unknown date'}`,
    'Participants:',
    people || '- (none recorded)',
    '',
    'Transcript:',
    transcript || '(empty)',
  ].join('\n');
}

// ── Validation ──────────────────────────────────────────────────────────────

function cap(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Pull the first JSON object out of the model text (tolerates a code fence). */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** The IST calendar date (YYYY-MM-DD) of an instant. */
function istDate(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * A due date survives only as a real ISO calendar date 0..180 days after the
 * day the meeting was held (IST). No meeting date → no due date at all.
 */
export function validateDueDate(value: unknown, occurredAt: string | null): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const due = Date.UTC(y, m - 1, d);
  const roundTrip = new Date(due).toISOString().slice(0, 10);
  if (roundTrip !== value) return null; // 2026-02-30 and friends
  if (!occurredAt) return null;
  const heldOn = istDate(occurredAt);
  if (!heldOn) return null;
  const [hy, hm, hd] = heldOn.split('-').map(Number);
  const days = (due - Date.UTC(hy, hm - 1, hd)) / 86_400_000;
  return days >= 0 && days <= LIMITS.dueDateMaxDays ? value : null;
}

/**
 * The owner is a person ONLY when owner_email is, character for character
 * after trimming and lower-casing, the address of a participant of THIS note.
 * A name is never matched.
 */
export function resolveOwner(ownerEmail: unknown, participants: DraftParticipant[]): string | null {
  if (typeof ownerEmail !== 'string') return null;
  const wanted = ownerEmail.trim().toLowerCase();
  if (!wanted) return null;
  const hit = participants.find((p) => p.email === wanted);
  return hit?.profileId ?? null;
}

export function parseAndValidate(text: string | null, note: DraftNote): ValidatedDraft | null {
  if (!text) return null;
  const json = extractJson(text);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;

  const summary = cap(o.summary, LIMITS.summary);

  const decisions = (Array.isArray(o.decisions) ? o.decisions : [])
    .map((d) => cap(d, LIMITS.decision))
    .filter((d): d is string => Boolean(d))
    .slice(0, LIMITS.decisions);

  const actions: ValidatedAction[] = [];
  for (const raw of Array.isArray(o.actions) ? o.actions : []) {
    if (actions.length >= LIMITS.actions) break;
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const body = cap(a.text, LIMITS.actionText - AI_DRAFT_ACTION_PREFIX.length);
    if (!body) continue;
    actions.push({
      actionText: `${AI_DRAFT_ACTION_PREFIX}${body}`,
      ownerLabel: cap(a.owner_label, LIMITS.ownerLabel),
      ownerProfileId: resolveOwner(a.owner_email, note.participants),
      dueDate: validateDueDate(a.due_date, note.occurredAt),
    });
  }

  if (!summary && decisions.length === 0 && actions.length === 0) return null;
  return { summary, decisions, actions };
}

// ── Recording ───────────────────────────────────────────────────────────────

/**
 * Store one validated draft. Outcomes that are FINAL stamp ai_drafted_at so
 * the note is never sent to the model again. A failed read or write does not
 * stamp: it returns 'error' and a later run retries the note.
 */
export async function recordDraft(
  db: NoteDraftDb,
  args: { note: DraftNote; draft: ValidatedDraft | null; jobId: string; now?: Date },
): Promise<RecordOutcome> {
  const { note, draft, jobId } = args;
  const draftedAt = (args.now ?? new Date()).toISOString();
  const base = { label: AI_DRAFT_LABEL, job_id: jobId, drafted_at: draftedAt };

  if (!draft) {
    const { error } = await db.stampDraft(note.id, { ...base, status: 'unreadable' });
    return error ? 'error' : 'unreadable';
  }

  const hostRead = await db.bookingHost(note.bookingId);
  // A failed read proves nothing about the host. meeting_bookings.host_profile_id
  // is NOT NULL, so in practice 'no_host' below is reached only when the
  // booking row is gone — never on a timeout.
  if (hostRead.error) return 'error'; // not stamped → retried on the next run
  const host = hostRead.host;
  if (!host) {
    // host_profile_id is NOT NULL on meeting_action_items: there is nobody to
    // hang the follow-ups off. Keep the summary; record why items are absent.
    const { error } = await db.stampDraft(note.id, {
      ...base,
      status: 'no_host',
      summary: draft.summary,
      decisions: draft.decisions,
    });
    return error ? 'error' : 'no_host';
  }

  let itemsSkipped = false;
  if (draft.actions.length > 0) {
    const existing = await db.countActionItems(note.bookingId);
    // A count that could not be read is neither "none" (a second set of
    // follow-ups) nor "some" (a final skip): not stamped, retried next run.
    if (existing.error) return 'error';
    if (existing.count > 0) {
      // Somebody (the host, or Fireflies) already wrote follow-ups for this
      // meeting. A machine draft on top of them is noise at best.
      itemsSkipped = true;
    } else {
      const rows = draft.actions.map((a) => ({
        booking_id: note.bookingId,
        host_profile_id: host,
        decision_text: null,
        action_text: a.actionText,
        owner_label: a.ownerLabel,
        owner_profile_id: a.ownerProfileId,
        due_date: a.dueDate,
        status: 'open',
        source: 'ai_draft',
      }));
      const { error } = await db.insertActionItems(rows);
      if (error) return 'error'; // not stamped → retried on the next run
    }
  }

  const { error } = await db.stampDraft(note.id, {
    ...base,
    status: itemsSkipped ? 'items_skipped_existing' : 'drafted',
    summary: draft.summary,
    decisions: draft.decisions,
    action_count: itemsSkipped ? 0 : draft.actions.length,
  });
  if (error) return 'error';
  return itemsSkipped ? 'recorded_items_skipped' : 'recorded';
}

// ── Candidate selection (pure) ──────────────────────────────────────────────

/** Drop interviews and anything younger than minAgeHours; cap the batch. */
export function selectEnqueueCandidates(
  candidates: CandidateNote[],
  interviewBookingIds: Set<string>,
  now: Date,
  capCount: number = LIMITS.enqueueCap,
): CandidateNote[] {
  const cutoff = now.getTime() - LIMITS.minAgeHours * 3_600_000;
  return candidates
    .filter((c) => Boolean(c.bookingId))
    .filter((c) => !interviewBookingIds.has(c.bookingId))
    .filter((c) => {
      const t = c.occurredAt ? Date.parse(c.occurredAt) : NaN;
      return Number.isFinite(t) && t <= cutoff;
    })
    .slice(0, capCount);
}

export function noteDraftDedupeKey(noteId: string): string {
  return `${NOTE_DRAFT_JOB}|${noteId}`;
}

// ── The two phases the cron runs ────────────────────────────────────────────

function readMessageText(msg: unknown): string | null {
  const content = (msg as { content?: Array<{ type?: string; text?: string }> } | null)?.content;
  if (!Array.isArray(content)) return null;
  const t = content.find((c) => c?.type === 'text')?.text;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

export interface CollectSummary {
  collected: number;
  recorded: number;
  /** Fireflies' own summary had arrived by collect time: stamped
   *  'summary_arrived', no tasks written from the model's answer. */
  summaryArrived: number;
  itemsSkipped: number;
  unreadable: number;
  noHost: number;
  skipped: number;
  stripped: number;
  errors: number;
}

export async function runCollect(
  db: NoteDraftDb,
  collect: () => Promise<CollectedJobsLaneItem[]>,
  now: Date = new Date(),
): Promise<CollectSummary> {
  const s: CollectSummary = {
    collected: 0,
    recorded: 0,
    summaryArrived: 0,
    itemsSkipped: 0,
    unreadable: 0,
    noHost: 0,
    skipped: 0,
    stripped: 0,
    errors: 0,
  };
  const items = await collect();
  s.collected = items.length;

  for (const item of items) {
    try {
      const noteId = typeof item.context.note_id === 'string' ? item.context.note_id : null;
      if (!noteId) {
        s.skipped++;
        continue;
      }
      const loaded = await db.loadNote(noteId);
      if (loaded.error) {
        // Not "no such note": unstamped, so a later run drafts it again.
        s.errors++;
        continue;
      }
      const row = loaded.note;
      if (!row || !row.bookingId || row.aiDraftedAt) {
        s.skipped++;
        continue;
      }
      if (row.summary !== null) {
        // Fireflies' own summary landed after this job was enqueued. The
        // meeting now has a real record, so the model's answer is dropped —
        // no 'AI draft:' tasks — and the note is stamped so it is not drafted
        // again. (listCandidates would not pick it anyway: summary IS NULL.)
        const { error } = await db.stampDraft(row.id, {
          label: AI_DRAFT_LABEL,
          job_id: item.jobId,
          status: 'summary_arrived',
          drafted_at: now.toISOString(),
        });
        if (error) s.errors++;
        else s.summaryArrived++;
        continue;
      }
      const people = await db.loadParticipants(row.id);
      if (people.error) {
        // A failed read is not "no participants": drafting on it would leave
        // every follow-up without an owner for good. Unstamped; retried.
        s.errors++;
        continue;
      }
      const note: DraftNote = {
        id: row.id,
        bookingId: row.bookingId,
        title: row.title,
        occurredAt: row.occurredAt,
        participants: people.participants,
      };
      const draft = parseAndValidate(readMessageText(item.message), note);
      const outcome = await recordDraft(db, { note, draft, jobId: item.jobId, now });
      if (outcome === 'recorded') s.recorded++;
      else if (outcome === 'recorded_items_skipped') s.itemsSkipped++;
      else if (outcome === 'unreadable') s.unreadable++;
      else if (outcome === 'no_host') s.noHost++;
      else s.errors++;
    } catch {
      s.errors++;
    } finally {
      // The job is delivered (fn_ai_collect_claim stamped it) and will never
      // be collected again, so its prompt — a meeting transcript — has no
      // further use. Strip it whatever the outcome.
      const { error } = await db.stripJobPrompt(item.jobId);
      if (error) s.errors++;
      else s.stripped++;
    }
  }
  return s;
}

// ── Prompt retention: jobs that were never delivered ────────────────────────

/**
 * Which prompt-holding jobs give up their prompt (pure).
 *   strip  — 'error' / 'canceled' (terminal, never delivered, never re-pended),
 *            and 'done' jobs already delivered (a collect run that died
 *            between claim and strip left the prompt behind).
 *   cancel — 'pending' for more than pendingPromptMaxDays: the prompt goes and
 *            the job is cancelled with it, because a pending job with no prompt
 *            would still be claimed and run blank.
 * Kept: claimed / running (in use), 'done' not yet delivered (the collect loop
 * strips it when it claims it), pending younger than the limit, and a pending
 * job with no readable request time (never cancelled on a guess).
 *
 * switchedOff: the job type is disabled, so EVERY pending job is cancelled,
 * whatever its age — nothing of this type should reach the Max seat any
 * more. Claimed / running / undelivered 'done' jobs are still kept: they
 * cannot be stopped from here, and a 'done' one is collected only if the
 * switch is turned back on.
 */
export function selectPromptsToRetire(
  jobs: HeldPromptJob[],
  now: Date,
  opts: { switchedOff?: boolean } = {},
): { strip: string[]; cancel: string[] } {
  const cutoff = now.getTime() - LIMITS.pendingPromptMaxDays * 86_400_000;
  const strip: string[] = [];
  const cancel: string[] = [];
  for (const j of jobs) {
    if ((TERMINAL_UNDELIVERED_STATUSES as readonly string[]).includes(j.status)) strip.push(j.id);
    else if (j.status === 'done' && j.deliveredAt) strip.push(j.id);
    else if (j.status === 'pending') {
      if (opts.switchedOff) {
        cancel.push(j.id);
        continue;
      }
      const t = j.requestedAt ? Date.parse(j.requestedAt) : NaN;
      if (Number.isFinite(t) && t <= cutoff) cancel.push(j.id);
    }
  }
  return { strip, cancel };
}

export const STALE_PENDING_REASON =
  'canceled by meeting-note-drafts: still pending after 7 days, so its prompt (a meeting transcript) was removed';

export const SWITCHED_OFF_REASON =
  'canceled by meeting-note-drafts: the meetings.note_draft job type is switched off, so its prompt (a meeting transcript) was removed';

export interface PromptSweepSummary {
  listed: number;
  stripped: number;
  canceled: number;
  errors: number;
}

/** Part of the collect pass. Runs even when collecting itself failed — how
 *  long a transcript is kept must not depend on the drain being healthy.
 *  switchedOff: cancel every pending job (see selectPromptsToRetire). */
export async function runPromptSweep(
  db: NoteDraftDb,
  now: Date = new Date(),
  opts: { switchedOff?: boolean } = {},
): Promise<PromptSweepSummary> {
  const s: PromptSweepSummary = { listed: 0, stripped: 0, canceled: 0, errors: 0 };
  const jobs = await db.listJobsHoldingPrompt(NOTE_DRAFT_JOB, LIMITS.promptSweepBatch);
  if (!jobs) {
    s.errors++;
    return s;
  }
  s.listed = jobs.length;
  const { strip, cancel } = selectPromptsToRetire(jobs, now, opts);
  for (const id of strip) {
    const { error } = await db.stripJobPrompt(id);
    if (error) s.errors++;
    else s.stripped++;
  }
  for (const id of cancel) {
    const { applied, error } = await db.cancelPendingJob(
      id,
      opts.switchedOff ? SWITCHED_OFF_REASON : STALE_PENDING_REASON,
    );
    if (error) s.errors++;
    else if (applied) s.canceled++;
  }
  return s;
}

export interface EnqueueSummary {
  dark: boolean;
  considered: number;
  excludedInterviews: number;
  enqueued: number;
  inFlight: number;
  noTranscript: number;
  /** Fireflies said this ONE transcript is gone or this key may not read it
   *  (object_not_found / forbidden / not_in_team): stamped
   *  'fireflies_<code>' and the run went on. */
  transcriptUnavailable: number;
  /** Fireflies answered about this transcript without a readable sentence
   *  list. The note is NOT stamped; a later run tries it again. */
  transcriptRetry: number;
  /** THIS request failed (timeout, network, 5xx, not JSON, another or
   *  unknown code). The note is NOT stamped and the run went on. */
  skippedTransient: number;
  skipped: number;
  /** A stamp that failed to write, or a participant read that failed. The
   *  note is NOT counted as stamped and stays a candidate. */
  errors: number;
  stoppedReason: string | null;
}

export async function runEnqueue(
  db: NoteDraftDb,
  deps: {
    fetchSentences: (providerRef: string) => Promise<FirefliesResult<FirefliesSentence[]>>;
    enqueue: (args: {
      jobType: string;
      prompt: string;
      context: Record<string, unknown>;
      dedupeKey: string;
    }) => Promise<JobsLaneEnqueueResult>;
  },
  now: Date = new Date(),
): Promise<EnqueueSummary> {
  const s: EnqueueSummary = {
    dark: false,
    considered: 0,
    excludedInterviews: 0,
    enqueued: 0,
    inFlight: 0,
    noTranscript: 0,
    transcriptUnavailable: 0,
    transcriptRetry: 0,
    skippedTransient: 0,
    skipped: 0,
    errors: 0,
    stoppedReason: null,
  };

  // Read again here even though runNoteDraftCron already checked: the switch
  // may have been turned off while collect ran, and this is the phase that
  // calls Fireflies and sends transcripts.
  const sw = await db.isJobTypeEnabled(NOTE_DRAFT_JOB);
  if (sw.error) {
    s.stoppedReason = 'could not read whether the job type is switched on';
    return s;
  }
  if (!sw.enabled) {
    s.dark = true;
    return s;
  }

  const olderThan = new Date(now.getTime() - LIMITS.minAgeHours * 3_600_000).toISOString();
  // Over-fetch so interview exclusions do not leave the batch short.
  const listed = await db.listCandidates(olderThan, LIMITS.enqueueCap * 4);
  if (!listed) {
    s.stoppedReason = 'could not list candidate notes';
    return s;
  }
  s.considered = listed.length;
  if (listed.length === 0) return s;

  const interviews = await db.interviewBookingIds([...new Set(listed.map((c) => c.bookingId))]);
  if (!interviews) {
    // Could not tell which bookings are interviews → send nothing.
    s.stoppedReason = 'could not check interview bookings';
    return s;
  }
  const picked = selectEnqueueCandidates(listed, interviews, now);
  s.excludedInterviews = listed.filter((c) => interviews.has(c.bookingId)).length;

  for (const c of picked) {
    const sentences = await deps.fetchSentences(c.providerRef);
    if (!sentences.ok) {
      if (sentences.scope === 'transcript') {
        if (isFirefliesPerTranscriptCode(sentences.errorCode)) {
          // FINAL for THIS note only: Fireflies says the transcript is gone
          // (object_not_found) or this key may not read it (forbidden /
          // not_in_team). Stamped so it is not fetched again, and the run goes
          // ON. Candidates come newest first, so stopping here would stop at
          // this note on every run and no older note would ever be drafted.
          const { error } = await db.stampDraft(c.id, {
            label: AI_DRAFT_LABEL,
            status: `fireflies_${sentences.errorCode}`,
            detail: sentences.message.slice(0, 300),
            drafted_at: now.toISOString(),
          });
          if (error) s.errors++;
          else s.transcriptUnavailable++;
          continue;
        }
        // About this transcript, but not final (no sentence list, or lines
        // with no readable text): UNSTAMPED, a later run retries it, and the
        // rest of the batch still gets its turn.
        s.transcriptRetry++;
        continue;
      }
      if (sentences.scope === 'request') {
        // THIS request failed — the 20 s timeout on a very long meeting, a
        // network error, a 5xx, a body that is not JSON, another or unknown
        // code. It proves nothing about the note or the account: UNSTAMPED,
        // retried next run, and the run goes ON so one note that always fails
        // cannot hold every older note back.
        s.skippedTransient++;
        continue;
      }
      // ACCOUNT-WIDE, and ONLY these (no key, HTTP 401 / 429, auth_failed,
      // too_many_requests, account_cancelled, paid_required — or a failure
      // with no scope at all): the next candidate would fail the same way.
      // Stop the run and stamp nothing.
      s.stoppedReason = `fireflies ${sentences.reason}${sentences.errorCode ? ` (${sentences.errorCode})` : ''}`;
      break;
    }
    if (sentences.data.length === 0) {
      // The ONLY 'no_transcript' stamp: Fireflies returned the transcript and
      // it holds zero sentences — a retry cannot change that. Counted only
      // when the stamp was written; a failed write leaves it a candidate.
      const { error } = await db.stampDraft(c.id, {
        label: AI_DRAFT_LABEL,
        status: 'no_transcript',
        drafted_at: now.toISOString(),
      });
      if (error) s.errors++;
      else s.noTranscript++;
      continue;
    }

    const people = await db.loadParticipants(c.id);
    if (people.error) {
      // Without the participant list the model cannot name an owner by
      // email, and every follow-up would be owner-less for good. Unstamped.
      s.errors++;
      continue;
    }
    const note: DraftNote = {
      id: c.id,
      bookingId: c.bookingId,
      title: c.title,
      occurredAt: c.occurredAt,
      participants: people.participants,
    };
    const res = await deps.enqueue({
      jobType: NOTE_DRAFT_JOB,
      prompt: buildPrompt(note, sentences.data),
      context: { note_id: c.id, booking_id: c.bookingId },
      dedupeKey: noteDraftDedupeKey(c.id),
    });
    if (res.ok) {
      s.enqueued++;
      continue;
    }
    // Narrowed by hand: without strictNullChecks TS does not narrow this union
    // through `res.ok`.
    const reason = (res as { reason: string }).reason;
    if (reason === 'in_flight') s.inFlight++;
    else {
      s.skipped++;
      if (reason === 'unknown_type' || reason === 'no_seat') {
        s.stoppedReason = reason;
        break;
      }
    }
  }
  return s;
}

// ── Collect claim that FAILS LOUDLY ─────────────────────────────────────────

/**
 * fn_ai_collect_claim for this job type. Same claim as collectJobsLane, with
 * one difference that matters here: an RPC error THROWS instead of reading as
 * "nothing finished". collectJobsLane logs and returns [] on an error, and an
 * empty collect followed by an enqueue would send a note whose finished job
 * was never collected to the model a second time.
 */
export async function collectNoteDraftJobs(admin: Admin, limit: number): Promise<CollectedJobsLaneItem[]> {
  const { data, error } = await admin.rpc('fn_ai_collect_claim', {
    p_job_types: [NOTE_DRAFT_JOB],
    p_limit: limit,
  });
  if (error) throw new Error(`collect claim failed: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('collect claim returned no rows array');
  return (
    data as Array<{ id: string; job_type: string; payload: Record<string, unknown> | null; result: unknown }>
  ).map((row) => {
    const text = extractJobResultText(row.result);
    return {
      jobId: row.id,
      jobType: row.job_type,
      context: ((row.payload?._ctx as Record<string, unknown>) ?? {}) as Record<string, unknown>,
      // Only content[].text is read (readMessageText), as in collectJobsLane.
      message: text
        ? ({ content: [{ type: 'text', text }] } as unknown as CollectedJobsLaneItem['message'])
        : null,
    };
  });
}

// ── One cron run ────────────────────────────────────────────────────────────

export interface NoteDraftCronResult {
  /** true = the job type is switched off: nothing was collected or enqueued,
   *  and `sweep` is the switched-off sweep (every pending job cancelled). */
  disabled: boolean;
  /** The switch could not be read: nothing collected, enqueued or cancelled. */
  switchError: string | null;
  collect: CollectSummary | null;
  collectError: string | null;
  sweep: PromptSweepSummary | null;
  sweepError: string | null;
  enqueue: EnqueueSummary | null;
  enqueueError: string | null;
  /** true when the enqueue pass was NOT run because collecting threw or the
   *  switch could not be read. */
  enqueueSkipped: boolean;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * SWITCH → COLLECT → PROMPT SWEEP → ENQUEUE.
 *
 * The switch (ai_job_types.enabled) is read FIRST, because nothing downstream
 * reads it: fn_ai_collect_claim and the drain's fn_ai_claim never look at
 * `enabled` (live catalog, read 2026-09-29), only fn_ai_enqueue_system does.
 *   off     → no collect, no Fireflies call, no enqueue; the sweep runs in
 *             switched-off mode and cancels EVERY pending job of this type,
 *             removing its prompt. Claimed / running jobs cannot be stopped
 *             here; their results are collected only if it is switched on.
 *   unknown → (the read failed) no collect, no enqueue, no cancel-all; only
 *             the ordinary retention sweep, which is the same either way.
 *   on      → as below.
 * If collecting throws, the sweep still runs (retention does not wait on the
 * drain) but ENQUEUE does not: a note whose finished job was not collected is
 * still unstamped, and the lane's duplicate guard only covers
 * pending/claimed/running jobs, so enqueueing now would pay for a second
 * model call on the same transcript.
 */
export async function runNoteDraftCron(
  db: NoteDraftDb,
  deps: {
    collect: () => Promise<CollectedJobsLaneItem[]>;
    fetchSentences: (providerRef: string) => Promise<FirefliesResult<FirefliesSentence[]>>;
    enqueue: (args: {
      jobType: string;
      prompt: string;
      context: Record<string, unknown>;
      dedupeKey: string;
    }) => Promise<JobsLaneEnqueueResult>;
  },
  now: Date = new Date(),
): Promise<NoteDraftCronResult> {
  const r: NoteDraftCronResult = {
    disabled: false,
    switchError: null,
    collect: null,
    collectError: null,
    sweep: null,
    sweepError: null,
    enqueue: null,
    enqueueError: null,
    enqueueSkipped: false,
  };

  let sw: { enabled: boolean; error: string | null };
  try {
    sw = await db.isJobTypeEnabled(NOTE_DRAFT_JOB);
  } catch (e) {
    sw = { enabled: false, error: errText(e) };
  }
  if (sw.error || !sw.enabled) {
    if (sw.error) {
      r.switchError = sw.error;
      r.enqueueSkipped = true;
    } else {
      r.disabled = true;
    }
    try {
      r.sweep = await runPromptSweep(db, now, { switchedOff: r.disabled });
    } catch (e) {
      r.sweepError = errText(e);
    }
    return r;
  }

  try {
    r.collect = await runCollect(db, deps.collect, now);
  } catch (e) {
    r.collectError = errText(e);
  }

  try {
    r.sweep = await runPromptSweep(db, now);
  } catch (e) {
    r.sweepError = errText(e);
  }

  if (r.collectError) {
    r.enqueueSkipped = true;
    return r;
  }

  try {
    r.enqueue = await runEnqueue(db, { fetchSentences: deps.fetchSentences, enqueue: deps.enqueue }, now);
  } catch (e) {
    r.enqueueError = errText(e);
  }
  return r;
}

/**
 * The route's JSON body for one run. The dispatcher's summarizeRoutineResult
 * writes ai_routine_schedules.last_status from it: top-level numbers, OR —
 * when ok is false and `error` is a string — that sentence instead. So every
 * run that STOPPED EARLY answers ok:false with the reason (collect failed,
 * the switch could not be read, enqueue threw, or enqueue stopped: Fireflies
 * not connected / 401 / 429 / an account code, could not list candidates,
 * could not check interviews, the lane refused the job type or has no seat).
 * A switched-off run is not a failure: ok:true, disabled:true and the counts
 * of cancelled pending jobs and stripped prompts.
 */
export function noteDraftRouteBody(run: NoteDraftCronResult): Record<string, unknown> {
  const c = run.collect;
  const w = run.sweep;
  const q = run.enqueue;
  const sweepErrors = (w?.errors ?? 0) + (run.sweepError ? 1 : 0);

  if (run.disabled) {
    return {
      ok: true,
      disabled: true,
      pendingCanceled: w?.canceled ?? 0,
      promptsStripped: w?.stripped ?? 0,
      errors: sweepErrors,
      sweepError: run.sweepError,
    };
  }

  const counters = {
    disabled: q?.dark === true,
    collected: c?.collected ?? 0,
    recorded: c?.recorded ?? 0,
    summaryArrived: c?.summaryArrived ?? 0,
    itemsSkipped: c?.itemsSkipped ?? 0,
    unreadable: c?.unreadable ?? 0,
    noHost: c?.noHost ?? 0,
    promptsStripped: c?.stripped ?? 0,
    promptsRetired: w?.stripped ?? 0,
    stalePendingCanceled: w?.canceled ?? 0,
    considered: q?.considered ?? 0,
    excludedInterviews: q?.excludedInterviews ?? 0,
    enqueued: q?.enqueued ?? 0,
    inFlight: q?.inFlight ?? 0,
    noTranscript: q?.noTranscript ?? 0,
    transcriptUnavailable: q?.transcriptUnavailable ?? 0,
    transcriptRetry: q?.transcriptRetry ?? 0,
    skipped_transient: q?.skippedTransient ?? 0,
    skipped: (c?.skipped ?? 0) + (q?.skipped ?? 0),
    errors:
      (c?.errors ?? 0) +
      sweepErrors +
      (q?.errors ?? 0) +
      (run.collectError ? 1 : 0) +
      (run.enqueueError ? 1 : 0) +
      (run.switchError ? 1 : 0),
    enqueueSkipped: run.enqueueSkipped,
    stoppedReason: run.enqueueError ?? q?.stoppedReason ?? null,
    collectError: run.collectError,
    sweepError: run.sweepError,
    switchError: run.switchError,
  };

  const stop = run.switchError
    ? `could not read the switch, nothing collected or enqueued this run: ${run.switchError}`
    : run.collectError
      ? `collect failed, enqueue skipped this run: ${run.collectError}`
      : run.enqueueError
        ? `enqueue failed: ${run.enqueueError}`
        : q?.stoppedReason
          ? `enqueue stopped: ${q.stoppedReason}`
          : null;
  return stop ? { ok: false, error: stop, ...counters } : { ok: true, ...counters };
}

// ── Supabase adapter ────────────────────────────────────────────────────────

const INTERVIEW_WORD = /interview/i;

export function supabaseNoteDraftDb(admin: Admin): NoteDraftDb {
  // The two new columns (ai_drafted_at, ai_draft, meeting_action_items.source)
  // are not in the generated types until the migration is applied; the client
  // is widened locally rather than editing types/supabase.ts.
  const sb = admin as unknown as {
    from: (t: string) => any;
  };

  return {
    async loadNote(noteId) {
      const { data, error } = await sb
        .from('meeting_notes')
        .select('id, booking_id, title, occurred_at, ai_drafted_at, summary')
        .eq('id', noteId)
        .maybeSingle();
      if (error) return { note: null, error: error.message };
      if (!data) return { note: null, error: null };
      return {
        note: {
          id: data.id,
          bookingId: data.booking_id ?? null,
          title: data.title ?? null,
          occurredAt: data.occurred_at ?? null,
          aiDraftedAt: data.ai_drafted_at ?? null,
          summary: data.summary ?? null,
        },
        error: null,
      };
    },

    async loadParticipants(noteId) {
      const { data, error } = await sb
        .from('meeting_note_participants')
        .select('email, display_name, profile_id')
        .eq('note_id', noteId);
      if (error) return { participants: [], error: error.message };
      const rows = (data ?? []) as Array<{ email: string; display_name: string | null; profile_id: string | null }>;
      const out: DraftParticipant[] = rows.map((r) => ({
        email: String(r.email).trim().toLowerCase(),
        displayName: r.display_name ?? null,
        profileId: r.profile_id ?? null,
      }));
      // Fill profile ids the ingest left null — by EXACT email only.
      const missing = out.filter((p) => !p.profileId).map((p) => p.email);
      if (missing.length > 0) {
        const { data: profiles, error: profErr } = await sb
          .from('profiles')
          .select('id, email')
          .in('email', missing);
        // A failed lookup is not "no profile": it would leave owners unset.
        if (profErr) return { participants: [], error: profErr.message };
        const byEmail = new Map<string, string>();
        for (const p of (profiles ?? []) as Array<{ id: string; email: string | null }>) {
          if (p.email) byEmail.set(p.email.trim().toLowerCase(), p.id);
        }
        for (const p of out) if (!p.profileId) p.profileId = byEmail.get(p.email) ?? null;
      }
      return { participants: out, error: null };
    },

    async bookingHost(bookingId) {
      const { data, error } = await sb
        .from('meeting_bookings')
        .select('host_profile_id')
        .eq('id', bookingId)
        .maybeSingle();
      if (error) return { host: null, error: error.message };
      return { host: (data?.host_profile_id as string | null | undefined) ?? null, error: null };
    },

    async countActionItems(bookingId) {
      const { count, error } = await sb
        .from('meeting_action_items')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId);
      // Unknown is NOT "has items" (a final skip) nor "none" (a second set):
      // it is an error, and the note is retried on a later run.
      if (error) return { count: 0, error: error.message };
      if (typeof count !== 'number') return { count: 0, error: 'the follow-up count came back empty' };
      return { count, error: null };
    },

    async insertActionItems(rows) {
      const { error } = await sb.from('meeting_action_items').insert(rows);
      return { error: error?.message ?? null };
    },

    async stampDraft(noteId, aiDraft) {
      const { error } = await sb
        .from('meeting_notes')
        .update({ ai_draft: aiDraft, ai_drafted_at: new Date().toISOString() })
        .eq('id', noteId)
        .is('ai_drafted_at', null);
      return { error: error?.message ?? null };
    },

    async stripJobPrompt(jobId) {
      const { data, error } = await sb.from('ai_jobs').select('payload').eq('id', jobId).maybeSingle();
      if (error) return { error: error.message };
      const payload = (data?.payload ?? null) as Record<string, unknown> | null;
      if (!payload || !('prompt' in payload)) return { error: null };
      const rest = { ...payload };
      delete rest.prompt;
      const { error: upErr } = await sb.from('ai_jobs').update({ payload: rest }).eq('id', jobId);
      return { error: upErr?.message ?? null };
    },

    async listJobsHoldingPrompt(jobType, limit) {
      const { data, error } = await sb
        .from('ai_jobs')
        .select('id, status, requested_at, delivered_at')
        .eq('job_type', jobType)
        .in('status', [...TERMINAL_UNDELIVERED_STATUSES, 'done', 'pending'])
        .not('payload->prompt', 'is', null)
        .order('requested_at', { ascending: true })
        .limit(limit);
      if (error) return null;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        status: String(r.status),
        requestedAt: (r.requested_at as string | null) ?? null,
        deliveredAt: (r.delivered_at as string | null) ?? null,
      }));
    },

    async cancelPendingJob(jobId, reason) {
      const { data, error } = await sb
        .from('ai_jobs')
        .select('payload')
        .eq('id', jobId)
        .eq('status', 'pending')
        .maybeSingle();
      if (error) return { applied: false, error: error.message };
      if (!data) return { applied: false, error: null }; // no longer pending
      const rest = { ...((data.payload ?? {}) as Record<string, unknown>) };
      delete rest.prompt;
      // Guarded on status='pending' again: if the drain claimed it between the
      // read and this write, nothing changes and it runs with its prompt.
      const { data: updated, error: upErr } = await sb
        .from('ai_jobs')
        .update({ payload: rest, status: 'canceled', error: reason, completed_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('status', 'pending')
        .select('id');
      if (upErr) return { applied: false, error: upErr.message };
      return { applied: Array.isArray(updated) && updated.length > 0, error: null };
    },

    async isJobTypeEnabled(jobType) {
      const { data, error } = await sb
        .from('ai_job_types')
        .select('enabled')
        .eq('job_type', jobType)
        .maybeSingle();
      // A failed read is not "off": off cancels every pending job.
      if (error) return { enabled: false, error: error.message };
      // No row = the migration is not applied: nothing may run, so it is off.
      return { enabled: data?.enabled === true, error: null };
    },

    async listCandidates(olderThanIso, limit) {
      const { data, error } = await sb
        .from('meeting_notes')
        .select('id, booking_id, provider_ref, title, occurred_at')
        .not('booking_id', 'is', null)
        .is('summary', null)
        .is('ai_drafted_at', null)
        .lte('occurred_at', olderThanIso)
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (error) return null;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        bookingId: String(r.booking_id),
        providerRef: String(r.provider_ref),
        title: (r.title as string | null) ?? null,
        occurredAt: (r.occurred_at as string | null) ?? null,
      }));
    },

    async interviewBookingIds(bookingIds) {
      const out = new Set<string>();
      if (bookingIds.length === 0) return out;

      const { data: linked, error: linkErr } = await sb
        .from('hr_recruitment_interviews')
        .select('booking_id')
        .in('booking_id', bookingIds);
      if (linkErr) return null;
      for (const r of (linked ?? []) as Array<{ booking_id: string | null }>) {
        if (r.booking_id) out.add(r.booking_id);
      }

      // Belt and braces: a booking made on a meeting type whose title or slug
      // says "interview" is excluded even before HR links it.
      const { data: bookings, error: bErr } = await sb
        .from('meeting_bookings')
        .select('id, meeting_types(title, slug)')
        .in('id', bookingIds);
      if (bErr) return null;
      for (const b of (bookings ?? []) as Array<{
        id: string;
        meeting_types: { title?: string | null; slug?: string | null } | null;
      }>) {
        const t = b.meeting_types;
        if (t && (INTERVIEW_WORD.test(t.title ?? '') || INTERVIEW_WORD.test(t.slug ?? ''))) out.add(b.id);
      }
      return out;
    },
  };
}
