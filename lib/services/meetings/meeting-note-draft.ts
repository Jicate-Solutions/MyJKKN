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
//
// DB access goes through the small NoteDraftDb interface so the rules above
// are unit-tested without a database (__tests__/meetings/meeting-note-draft.test.ts).
// This file does NOT depend on lib/services/meetings/meeting-note-followups.ts
// (a sibling PR) — the validator here is its own.
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';
import type { FirefliesResult, FirefliesSentence } from '@/lib/services/meetings/fireflies-client';
import type { CollectedJobsLaneItem, JobsLaneEnqueueResult } from '@/lib/services/platform/ai-jobs-lane';

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
} as const;

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

/** Everything the drafter reads or writes. Implemented over Supabase by
 *  supabaseNoteDraftDb(); faked in tests. */
export interface NoteDraftDb {
  loadNote(noteId: string): Promise<
    | {
        id: string;
        bookingId: string | null;
        title: string | null;
        occurredAt: string | null;
        aiDraftedAt: string | null;
        summary: string | null;
      }
    | null
  >;
  loadParticipants(noteId: string): Promise<DraftParticipant[]>;
  bookingHost(bookingId: string): Promise<string | null>;
  countActionItems(bookingId: string): Promise<number>;
  insertActionItems(rows: Array<Record<string, unknown>>): Promise<{ error: string | null }>;
  /** Writes ai_draft + ai_drafted_at ONLY while ai_drafted_at is still NULL.
   *  Must never write meeting_notes.summary. */
  stampDraft(noteId: string, aiDraft: Record<string, unknown>): Promise<{ error: string | null }>;
  /** Remove payload.prompt from one ai_jobs row, keeping every other key. */
  stripJobPrompt(jobId: string): Promise<{ error: string | null }>;
  isJobTypeEnabled(jobType: string): Promise<boolean>;
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
 * the note is never sent to the model again; a transient DB error does not.
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

  const host = await db.bookingHost(note.bookingId);
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
    if (existing > 0) {
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
      const row = noteId ? await db.loadNote(noteId) : null;
      if (!row || !row.bookingId || row.aiDraftedAt) {
        s.skipped++;
        continue;
      }
      const note: DraftNote = {
        id: row.id,
        bookingId: row.bookingId,
        title: row.title,
        occurredAt: row.occurredAt,
        participants: await db.loadParticipants(row.id),
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

export interface EnqueueSummary {
  dark: boolean;
  considered: number;
  excludedInterviews: number;
  enqueued: number;
  inFlight: number;
  noTranscript: number;
  skipped: number;
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
    skipped: 0,
    stoppedReason: null,
  };

  // DARK means DARK: no Fireflies call and no DB write while the job type is
  // switched off — not merely a refused enqueue at the end.
  if (!(await db.isJobTypeEnabled(NOTE_DRAFT_JOB))) {
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
      if (sentences.reason === 'unreadable') {
        // Fireflies holds no sentences for this one; stamp it so it does not
        // block the queue on every run.
        await db.stampDraft(c.id, {
          label: AI_DRAFT_LABEL,
          status: 'no_transcript',
          drafted_at: now.toISOString(),
        });
        s.noTranscript++;
        continue;
      }
      // not_connected / rejected / unreachable are systemic — stop the run.
      s.stoppedReason = `fireflies ${sentences.reason}`;
      break;
    }
    if (sentences.data.length === 0) {
      await db.stampDraft(c.id, {
        label: AI_DRAFT_LABEL,
        status: 'no_transcript',
        drafted_at: now.toISOString(),
      });
      s.noTranscript++;
      continue;
    }

    const note: DraftNote = {
      id: c.id,
      bookingId: c.bookingId,
      title: c.title,
      occurredAt: c.occurredAt,
      participants: await db.loadParticipants(c.id),
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
      if (error || !data) return null;
      return {
        id: data.id,
        bookingId: data.booking_id ?? null,
        title: data.title ?? null,
        occurredAt: data.occurred_at ?? null,
        aiDraftedAt: data.ai_drafted_at ?? null,
        summary: data.summary ?? null,
      };
    },

    async loadParticipants(noteId) {
      const { data } = await sb
        .from('meeting_note_participants')
        .select('email, display_name, profile_id')
        .eq('note_id', noteId);
      const rows = (data ?? []) as Array<{ email: string; display_name: string | null; profile_id: string | null }>;
      const out: DraftParticipant[] = rows.map((r) => ({
        email: String(r.email).trim().toLowerCase(),
        displayName: r.display_name ?? null,
        profileId: r.profile_id ?? null,
      }));
      // Fill profile ids the ingest left null — by EXACT email only.
      const missing = out.filter((p) => !p.profileId).map((p) => p.email);
      if (missing.length > 0) {
        const { data: profiles } = await sb.from('profiles').select('id, email').in('email', missing);
        const byEmail = new Map<string, string>();
        for (const p of (profiles ?? []) as Array<{ id: string; email: string | null }>) {
          if (p.email) byEmail.set(p.email.trim().toLowerCase(), p.id);
        }
        for (const p of out) if (!p.profileId) p.profileId = byEmail.get(p.email) ?? null;
      }
      return out;
    },

    async bookingHost(bookingId) {
      const { data } = await sb
        .from('meeting_bookings')
        .select('host_profile_id')
        .eq('id', bookingId)
        .maybeSingle();
      return (data?.host_profile_id as string | null | undefined) ?? null;
    },

    async countActionItems(bookingId) {
      const { count, error } = await sb
        .from('meeting_action_items')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId);
      // Unknown → treat as "has items": never add a second set on a guess.
      if (error || count === null || count === undefined) return 1;
      return count;
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

    async isJobTypeEnabled(jobType) {
      const { data, error } = await sb
        .from('ai_job_types')
        .select('enabled')
        .eq('job_type', jobType)
        .maybeSingle();
      return !error && data?.enabled === true;
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
