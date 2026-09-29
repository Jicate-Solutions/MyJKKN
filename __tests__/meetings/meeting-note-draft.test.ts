import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  AI_DRAFT_ACTION_PREFIX,
  LIMITS,
  NOTE_DRAFT_JOB,
  noteDraftDedupeKey,
  parseAndValidate,
  recordDraft,
  resolveOwner,
  collectNoteDraftJobs,
  noteDraftRouteBody,
  runCollect,
  runEnqueue,
  runNoteDraftCron,
  runPromptSweep,
  selectEnqueueCandidates,
  selectPromptsToRetire,
  STALE_PENDING_REASON,
  SWITCHED_OFF_REASON,
  supabaseNoteDraftDb,
  validateDueDate,
  type CandidateNote,
  type DraftNote,
  type DraftParticipant,
  type HeldPromptJob,
  type NoteDraftDb,
} from '@/lib/services/meetings/meeting-note-draft';
import {
  fetchFirefliesTranscriptSentences,
  FIREFLIES_ACCOUNT_STOP_CODES,
  FIREFLIES_PER_TRANSCRIPT_CODES,
} from '@/lib/services/meetings/fireflies-client';
import type { CollectedJobsLaneItem } from '@/lib/services/platform/ai-jobs-lane';
import { summarizeRoutineResult } from '@/lib/ai-routines/summarize-routine-result';

// ── fixtures ────────────────────────────────────────────────────────────────

const NOTE: DraftNote = {
  id: 'note-1',
  bookingId: 'booking-1',
  title: 'Placement review',
  occurredAt: '2026-09-10T05:30:00Z', // 11:00 IST, 10 Sep
  participants: [
    { email: 'priya.r@jkkn.ac.in', displayName: 'Priya R', profileId: 'profile-priya' },
    { email: 'guest@example.com', displayName: 'Guest', profileId: null },
  ],
};

function modelText(obj: unknown): string {
  return JSON.stringify(obj);
}

interface FakeState {
  notes: Record<
    string,
    {
      id: string;
      bookingId: string | null;
      title: string | null;
      occurredAt: string | null;
      aiDraftedAt: string | null;
      summary: string | null;
      aiDraft?: Record<string, unknown>;
    }
  >;
  hosts: Record<string, string | null>;
  existingItems: Record<string, number>;
  inserted: Array<Record<string, unknown>>;
  jobPayloads: Record<string, Record<string, unknown>>;
  enabled: boolean;
  /** the switch read FAILS with this message */
  switchError: string | null;
  candidates: CandidateNote[];
  interviews: Set<string> | null;
  summaryWrites: number;
  /** ai_jobs rows of this type, for the prompt sweep. */
  jobs: Record<string, HeldPromptJob & { payload: Record<string, unknown> }>;
  /** null → listJobsHoldingPrompt fails */
  jobsReadable: boolean;
  /** ids the drain "claims" between the sweep's read and its write */
  claimedMidway: Set<string>;
  participants: DraftParticipant[];
  /** read name → error message: that read FAILS (as opposed to finding nothing) */
  readErrors: Partial<Record<'loadNote' | 'loadParticipants' | 'bookingHost' | 'countActionItems', string>>;
  /** stampDraft fails with this message */
  stampError: string | null;
  /** every stampDraft call, by note id */
  stampCalls: string[];
}

function fakeDb(over: Partial<FakeState> = {}): { db: NoteDraftDb; state: FakeState } {
  const state: FakeState = {
    notes: {
      'note-1': {
        id: 'note-1',
        bookingId: 'booking-1',
        title: NOTE.title,
        occurredAt: NOTE.occurredAt,
        aiDraftedAt: null,
        summary: null,
      },
    },
    hosts: { 'booking-1': 'profile-host' },
    existingItems: {},
    inserted: [],
    jobPayloads: {},
    enabled: true,
    switchError: null,
    candidates: [],
    interviews: new Set(),
    summaryWrites: 0,
    jobs: {},
    jobsReadable: true,
    claimedMidway: new Set(),
    participants: NOTE.participants,
    readErrors: {},
    stampError: null,
    stampCalls: [],
    ...over,
  };
  const db: NoteDraftDb = {
    async loadNote(id) {
      if (state.readErrors.loadNote) return { note: null, error: state.readErrors.loadNote };
      return { note: state.notes[id] ?? null, error: null };
    },
    async loadParticipants() {
      if (state.readErrors.loadParticipants) return { participants: [], error: state.readErrors.loadParticipants };
      return { participants: state.participants, error: null };
    },
    async bookingHost(id) {
      if (state.readErrors.bookingHost) return { host: null, error: state.readErrors.bookingHost };
      return { host: state.hosts[id] ?? null, error: null };
    },
    async countActionItems(id) {
      if (state.readErrors.countActionItems) return { count: 0, error: state.readErrors.countActionItems };
      return { count: state.existingItems[id] ?? 0, error: null };
    },
    async insertActionItems(rows) {
      state.inserted.push(...rows);
      return { error: null };
    },
    async stampDraft(id, aiDraft) {
      state.stampCalls.push(id);
      if (state.stampError) return { error: state.stampError };
      const n = state.notes[id];
      if (n && !n.aiDraftedAt) {
        n.aiDraftedAt = new Date().toISOString();
        n.aiDraft = aiDraft;
      }
      // the interface has no way to write summary; count any attempt that did
      if ('summary_column' in aiDraft) state.summaryWrites++;
      return { error: null };
    },
    async stripJobPrompt(jobId) {
      const p = state.jobPayloads[jobId];
      if (p) delete p.prompt;
      const j = state.jobs[jobId];
      if (j) delete j.payload.prompt;
      return { error: null };
    },
    async listJobsHoldingPrompt(jobType) {
      if (!state.jobsReadable) return null;
      expect(jobType).toBe(NOTE_DRAFT_JOB);
      return Object.values(state.jobs)
        .filter((j) => 'prompt' in j.payload)
        .map(({ id, status, requestedAt, deliveredAt }) => ({ id, status, requestedAt, deliveredAt }));
    },
    async cancelPendingJob(jobId, reason) {
      const j = state.jobs[jobId];
      if (state.claimedMidway.has(jobId) && j) j.status = 'claimed';
      if (!j || j.status !== 'pending') return { applied: false, error: null };
      delete j.payload.prompt;
      j.status = 'canceled';
      j.payload.__reason = reason;
      return { applied: true, error: null };
    },
    async isJobTypeEnabled() {
      if (state.switchError) return { enabled: false, error: state.switchError };
      return { enabled: state.enabled, error: null };
    },
    async listCandidates() {
      // Like the real query: a stamped note (ai_drafted_at set) is no longer a candidate.
      return state.candidates.filter((c) => !state.notes[c.id]?.aiDraftedAt);
    },
    async interviewBookingIds() {
      return state.interviews;
    },
  };
  return { db, state };
}

function collected(jobId: string, noteId: string, text: string | null): CollectedJobsLaneItem {
  return {
    jobId,
    jobType: NOTE_DRAFT_JOB,
    context: { note_id: noteId, booking_id: 'booking-1' },
    message: text
      ? ({ content: [{ type: 'text', text }] } as unknown as CollectedJobsLaneItem['message'])
      : null,
  };
}

// ── owner: exact email only ─────────────────────────────────────────────────

describe('owner resolution — exact participant email only', () => {
  it('resolves an exact participant email (case/space-insensitive)', () => {
    expect(resolveOwner('  Priya.R@JKKN.ac.in ', NOTE.participants)).toBe('profile-priya');
  });

  it('never resolves a near-name or a near-email', () => {
    expect(resolveOwner('Priya R', NOTE.participants)).toBeNull();
    expect(resolveOwner('priya', NOTE.participants)).toBeNull();
    expect(resolveOwner('priya.r@jkkn.ac', NOTE.participants)).toBeNull();
    expect(resolveOwner('priya.r@jkkn.ac.in.evil.com', NOTE.participants)).toBeNull();
  });

  it('a model-supplied email that is not a participant resolves to nobody', () => {
    expect(resolveOwner('director@jkkn.ac.in', NOTE.participants)).toBeNull();
  });

  it('a participant with no MyJKKN profile yields no owner', () => {
    expect(resolveOwner('guest@example.com', NOTE.participants)).toBeNull();
  });

  it('parseAndValidate keeps the owner label but no owner id for a name-only owner', () => {
    const d = parseAndValidate(
      modelText({
        summary: 's',
        decisions: [],
        actions: [{ text: 'Send the list', owner_email: null, owner_label: 'Priya R', due_date: null }],
      }),
      NOTE,
    );
    expect(d?.actions[0].ownerProfileId).toBeNull();
    expect(d?.actions[0].ownerLabel).toBe('Priya R');
  });
});

// ── due-date window ─────────────────────────────────────────────────────────

describe('due date — ISO date 0..180 days after the meeting', () => {
  it('accepts the meeting day itself and day 180', () => {
    expect(validateDueDate('2026-09-10', NOTE.occurredAt)).toBe('2026-09-10');
    expect(validateDueDate('2027-03-09', NOTE.occurredAt)).toBe('2027-03-09'); // +180
  });

  it('rejects day 181, the day before, and non-ISO forms', () => {
    expect(validateDueDate('2027-03-10', NOTE.occurredAt)).toBeNull(); // +181
    expect(validateDueDate('2026-09-09', NOTE.occurredAt)).toBeNull();
    expect(validateDueDate('10/09/2026', NOTE.occurredAt)).toBeNull();
    expect(validateDueDate('next week', NOTE.occurredAt)).toBeNull();
    expect(validateDueDate('2026-02-30', NOTE.occurredAt)).toBeNull();
    expect(validateDueDate('2026-09-15T00:00:00Z', NOTE.occurredAt)).toBeNull();
  });

  it('uses the IST calendar day of the meeting', () => {
    // 20:00 UTC on 9 Sep is 01:30 IST on 10 Sep → 10 Sep is day 0.
    expect(validateDueDate('2026-09-10', '2026-09-09T20:00:00Z')).toBe('2026-09-10');
  });

  it('drops every due date when the meeting date is unknown', () => {
    expect(validateDueDate('2026-09-15', null)).toBeNull();
  });
});

// ── field caps + unreadable output ──────────────────────────────────────────

describe('parseAndValidate', () => {
  it('caps every text field and labels every follow-up as an AI draft', () => {
    const long = 'x'.repeat(5000);
    const d = parseAndValidate(
      modelText({
        summary: long,
        decisions: [long],
        actions: [{ text: long, owner_email: null, owner_label: long, due_date: null }],
      }),
      NOTE,
    )!;
    expect(d.summary!.length).toBeLessThanOrEqual(LIMITS.summary);
    expect(d.decisions[0].length).toBeLessThanOrEqual(LIMITS.decision);
    expect(d.actions[0].actionText.length).toBeLessThanOrEqual(LIMITS.actionText);
    expect(d.actions[0].actionText.startsWith(AI_DRAFT_ACTION_PREFIX)).toBe(true);
    expect(d.actions[0].ownerLabel!.length).toBeLessThanOrEqual(LIMITS.ownerLabel);
  });

  it('tolerates a code fence and rejects non-JSON', () => {
    expect(parseAndValidate('```json\n{"summary":"ok","decisions":[],"actions":[]}\n```', NOTE)?.summary).toBe('ok');
    expect(parseAndValidate('Sorry, I cannot do that.', NOTE)).toBeNull();
    expect(parseAndValidate(null, NOTE)).toBeNull();
  });
});

// ── recordDraft ─────────────────────────────────────────────────────────────

describe('recordDraft', () => {
  const draft = parseAndValidate(
    modelText({
      summary: 'Agreed the placement drive dates.',
      decisions: ['Drive on 20 Sep'],
      actions: [
        { text: 'Book the hall', owner_email: 'priya.r@jkkn.ac.in', owner_label: 'Priya', due_date: '2026-09-15' },
        { text: 'Email companies', owner_email: null, owner_label: 'Unassigned', due_date: null },
      ],
    }),
    NOTE,
  );

  it("writes source='ai_draft', status open and the booking host on every inserted row", async () => {
    const { db, state } = fakeDb();
    const out = await recordDraft(db, { note: NOTE, draft, jobId: 'job-1' });
    expect(out).toBe('recorded');
    expect(state.inserted).toHaveLength(2);
    for (const row of state.inserted) {
      expect(row.source).toBe('ai_draft');
      expect(row.status).toBe('open');
      expect(row.host_profile_id).toBe('profile-host');
      expect(row.booking_id).toBe('booking-1');
    }
    expect(state.inserted[0].owner_profile_id).toBe('profile-priya');
    expect(state.inserted[1].owner_profile_id).toBeNull();
  });

  it('skips the follow-ups when the booking already has action items', async () => {
    const { db, state } = fakeDb({ existingItems: { 'booking-1': 3 } });
    const out = await recordDraft(db, { note: NOTE, draft, jobId: 'job-1' });
    expect(out).toBe('recorded_items_skipped');
    expect(state.inserted).toHaveLength(0);
    expect(state.notes['note-1'].aiDraftedAt).not.toBeNull();
  });

  it('never overwrites meeting_notes.summary — the draft lands in ai_draft', async () => {
    const { db, state } = fakeDb();
    state.notes['note-1'].summary = 'Written by a person';
    await recordDraft(db, { note: NOTE, draft, jobId: 'job-1' });
    expect(state.notes['note-1'].summary).toBe('Written by a person');
    expect(state.notes['note-1'].aiDraft?.summary).toBe('Agreed the placement drive dates.');
    expect(state.notes['note-1'].aiDraft?.label).toMatch(/AI draft/);
    expect(state.summaryWrites).toBe(0);
  });

  it('stamps an unreadable draft so it is never re-sent', async () => {
    const { db, state } = fakeDb();
    const out = await recordDraft(db, { note: NOTE, draft: null, jobId: 'job-1' });
    expect(out).toBe('unreadable');
    expect(state.notes['note-1'].aiDraft?.status).toBe('unreadable');
    expect(state.inserted).toHaveLength(0);
  });

  it('inserts nothing when the booking has no host — and stamps no_host (a READ that succeeded)', async () => {
    const { db, state } = fakeDb({ hosts: {} });
    expect(await recordDraft(db, { note: NOTE, draft, jobId: 'job-1' })).toBe('no_host');
    expect(state.inserted).toHaveLength(0);
    expect(state.notes['note-1'].aiDraft?.status).toBe('no_host');
  });

  it('a host read that FAILS is not "no host": outcome error, note UNSTAMPED, nothing inserted', async () => {
    const { db, state } = fakeDb({ readErrors: { bookingHost: 'statement timeout' } });
    expect(await recordDraft(db, { note: NOTE, draft, jobId: 'job-1' })).toBe('error');
    expect(state.notes['note-1'].aiDraftedAt).toBeNull();
    expect(state.stampCalls).toEqual([]);
    expect(state.inserted).toHaveLength(0);
  });

  it('a follow-up count that FAILS is neither "none" nor "some": outcome error, UNSTAMPED, nothing inserted', async () => {
    const { db, state } = fakeDb({ readErrors: { countActionItems: 'statement timeout' } });
    expect(await recordDraft(db, { note: NOTE, draft, jobId: 'job-1' })).toBe('error');
    expect(state.notes['note-1'].aiDraftedAt).toBeNull();
    expect(state.stampCalls).toEqual([]);
    expect(state.inserted).toHaveLength(0);
  });

  it('a count of zero that was really read inserts the follow-ups and stamps drafted', async () => {
    const { db, state } = fakeDb({ existingItems: { 'booking-1': 0 } });
    expect(await recordDraft(db, { note: NOTE, draft, jobId: 'job-1' })).toBe('recorded');
    expect(state.inserted).toHaveLength(2);
    expect(state.notes['note-1'].aiDraft?.status).toBe('drafted');
  });
});

// ── collect: prompt stripped ────────────────────────────────────────────────

describe('runCollect', () => {
  it('strips payload.prompt from every collected job, keeping the rest', async () => {
    const { db, state } = fakeDb();
    state.jobPayloads = {
      'job-ok': { prompt: 'TRANSCRIPT…', _ctx: { note_id: 'note-1' }, _dedupe: 'k' },
      'job-bad': { prompt: 'TRANSCRIPT…', _ctx: { note_id: 'missing' } },
    };
    const s = await runCollect(db, async () => [
      collected('job-ok', 'note-1', modelText({ summary: 'S', decisions: [], actions: [] })),
      collected('job-bad', 'missing', 'garbage'),
    ]);
    expect(s.collected).toBe(2);
    expect(s.stripped).toBe(2);
    expect(state.jobPayloads['job-ok']).toEqual({ _ctx: { note_id: 'note-1' }, _dedupe: 'k' });
    expect('prompt' in state.jobPayloads['job-bad']).toBe(false);
  });

  it('a note read that FAILS counts as an error (not a skip), leaves the note UNSTAMPED, and still strips the prompt', async () => {
    const { db, state } = fakeDb({ readErrors: { loadNote: 'statement timeout' } });
    state.jobPayloads = { 'job-1': { prompt: 'TRANSCRIPT…', _ctx: { note_id: 'note-1' } } };
    const s = await runCollect(db, async () => [
      collected('job-1', 'note-1', modelText({ summary: 'S', decisions: [], actions: [] })),
    ]);
    expect(s.errors).toBe(1);
    expect(s.skipped).toBe(0);
    expect(s.recorded).toBe(0);
    expect(state.notes['note-1'].aiDraftedAt).toBeNull();
    expect('prompt' in state.jobPayloads['job-1']).toBe(false);
  });

  it('a participant read that FAILS is not "no participants": error, UNSTAMPED, no owner-less items written', async () => {
    const { db, state } = fakeDb({ readErrors: { loadParticipants: 'statement timeout' } });
    const s = await runCollect(db, async () => [
      collected(
        'job-1',
        'note-1',
        modelText({
          summary: 'S',
          decisions: [],
          actions: [{ text: 'Book the hall', owner_email: 'priya.r@jkkn.ac.in', owner_label: 'Priya', due_date: null }],
        }),
      ),
    ]);
    expect(s.errors).toBe(1);
    expect(s.recorded).toBe(0);
    expect(state.inserted).toHaveLength(0);
    expect(state.notes['note-1'].aiDraftedAt).toBeNull();
  });

  it('a participant list that is really EMPTY still records the draft (owner-less), as before', async () => {
    const { db, state } = fakeDb({ participants: [] });
    const s = await runCollect(db, async () => [
      collected(
        'job-1',
        'note-1',
        modelText({
          summary: 'S',
          decisions: [],
          actions: [{ text: 'Book the hall', owner_email: 'priya.r@jkkn.ac.in', owner_label: 'Priya', due_date: null }],
        }),
      ),
    ]);
    expect(s.recorded).toBe(1);
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].owner_profile_id).toBeNull();
    expect(state.notes['note-1'].aiDraft?.status).toBe('drafted');
  });

  it('does not re-record a note that was already drafted', async () => {
    const { db, state } = fakeDb();
    state.notes['note-1'].aiDraftedAt = '2026-09-20T00:00:00Z';
    const s = await runCollect(db, async () => [
      collected('job-1', 'note-1', modelText({ summary: 'S', decisions: [], actions: [{ text: 'x' }] })),
    ]);
    expect(s.skipped).toBe(1);
    expect(state.inserted).toHaveLength(0);
  });
});

// ── enqueue: interviews, dark, dedupe ───────────────────────────────────────

const NOW = new Date('2026-09-26T10:00:00Z');
function cand(id: string, bookingId: string, occurredAt = '2026-09-25T05:00:00Z'): CandidateNote {
  return { id, bookingId, providerRef: `ff-${id}`, title: id, occurredAt };
}

describe('enqueue', () => {
  it('never selects an interview booking', () => {
    const picked = selectEnqueueCandidates(
      [cand('a', 'b-interview'), cand('b', 'b-normal')],
      new Set(['b-interview']),
      NOW,
    );
    expect(picked.map((c) => c.id)).toEqual(['b']);
  });

  it('skips notes younger than two hours and caps the batch at 10', () => {
    const young = cand('young', 'b1', '2026-09-26T09:00:00Z');
    const many = Array.from({ length: 15 }, (_, i) => cand(`n${i}`, `b${i}`));
    const picked = selectEnqueueCandidates([young, ...many], new Set(), NOW);
    expect(picked.find((c) => c.id === 'young')).toBeUndefined();
    expect(picked).toHaveLength(10);
  });

  it('never enqueues an interview, and uses the note dedupe key', async () => {
    const { db } = fakeDb({
      candidates: [cand('int', 'b-int'), cand('ok', 'b-ok')],
      interviews: new Set(['b-int']),
    });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const fetchSentences = vi.fn(async () => ({
      ok: true as const,
      data: [{ speakerName: 'A', text: 'We agreed.' }],
    }));
    const s = await runEnqueue(db, { enqueue, fetchSentences }, NOW);
    expect(s.enqueued).toBe(1);
    expect(s.excludedInterviews).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const args = (enqueue.mock.calls[0] as unknown as [{ context: { note_id: string }; dedupeKey: string }])[0];
    expect(args.context.note_id).toBe('ok');
    expect(args.dedupeKey).toBe(noteDraftDedupeKey('ok'));
    expect(args.dedupeKey).toBe('meetings.note_draft|ok');
    expect(fetchSentences).not.toHaveBeenCalledWith('ff-int');
  });

  it('sends nothing when it cannot tell which bookings are interviews', async () => {
    const { db } = fakeDb({ candidates: [cand('ok', 'b-ok')], interviews: null });
    const enqueue = vi.fn();
    const fetchSentences = vi.fn();
    const s = await runEnqueue(db, { enqueue, fetchSentences }, NOW);
    expect(enqueue).not.toHaveBeenCalled();
    expect(fetchSentences).not.toHaveBeenCalled();
    expect(s.stoppedReason).toMatch(/interview/);
  });

  it('while the job type is disabled, calls neither Fireflies nor the queue', async () => {
    const { db } = fakeDb({ enabled: false, candidates: [cand('ok', 'b-ok')] });
    const enqueue = vi.fn();
    const fetchSentences = vi.fn();
    const s = await runEnqueue(db, { enqueue, fetchSentences }, NOW);
    expect(s.dark).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(fetchSentences).not.toHaveBeenCalled();
  });
});

// ── no_transcript: stamped ONLY for a transcript with zero sentences ───────

describe('no_transcript is stamped only when Fireflies returned zero sentences', () => {
  const okEnqueue = () => vi.fn(async () => ({ ok: true as const, jobId: 'j' }));

  it('a transcript with zero sentences is stamped no_transcript', async () => {
    const { db, state } = fakeDb({ candidates: [cand('note-1', 'booking-1')] });
    const enqueue = okEnqueue();
    const s = await runEnqueue(db, { enqueue, fetchSentences: async () => ({ ok: true, data: [] }) }, NOW);
    expect(s.noTranscript).toBe(1);
    expect(state.notes['note-1'].aiDraftedAt).not.toBeNull();
    expect(state.notes['note-1'].aiDraft?.status).toBe('no_transcript');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a transcript-level unreadable answer leaves the note UNSTAMPED and the rest of the batch still runs', async () => {
    const { db, state } = fakeDb({ candidates: [cand('note-1', 'booking-1'), cand('ok', 'b-ok')] });
    const enqueue = okEnqueue();
    const fetchSentences = vi.fn(async (ref: string) =>
      ref === 'ff-note-1'
        ? { ok: false as const, reason: 'unreadable' as const, scope: 'transcript' as const, message: 'no sentences' }
        : { ok: true as const, data: [{ speakerName: 'A', text: 'We agreed.' }] },
    );
    const s = await runEnqueue(db, { enqueue, fetchSentences }, NOW);
    expect(s.transcriptRetry).toBe(1);
    expect(s.noTranscript).toBe(0);
    expect(state.notes['note-1'].aiDraftedAt).toBeNull();
    expect(state.notes['note-1'].aiDraft).toBeUndefined();
    expect(s.enqueued).toBe(1);
    expect(s.stoppedReason).toBeNull();
  });

  it.each(['unreachable', 'rejected', 'not_connected'] as const)(
    'a %s failure leaves the note UNSTAMPED and stops the run',
    async (reason) => {
      const { db, state } = fakeDb({ candidates: [cand('note-1', 'booking-1'), cand('ok', 'b-ok')] });
      const enqueue = okEnqueue();
      const s = await runEnqueue(
        db,
        { enqueue, fetchSentences: async () => ({ ok: false, reason, message: 'x' }) },
        NOW,
      );
      expect(state.notes['note-1'].aiDraftedAt).toBeNull();
      expect(s.noTranscript).toBe(0);
      expect(s.stoppedReason).toBe(`fireflies ${reason}`);
      expect(enqueue).not.toHaveBeenCalled();
    },
  );

  it('an unreadable note is retried on the next run, and stamped once the transcript really is empty', async () => {
    const { db, state } = fakeDb({ candidates: [cand('note-1', 'booking-1')] });
    const enqueue = okEnqueue();
    await runEnqueue(
      db,
      {
        enqueue,
        fetchSentences: async () => ({ ok: false, reason: 'unreadable', scope: 'transcript', message: 'x' }),
      },
      NOW,
    );
    expect(state.notes['note-1'].aiDraftedAt).toBeNull();
    const fetchSentences = vi.fn(async () => ({ ok: true as const, data: [] }));
    await runEnqueue(db, { enqueue, fetchSentences }, NOW);
    expect(fetchSentences).toHaveBeenCalledWith('ff-note-1');
    expect(state.notes['note-1'].aiDraft?.status).toBe('no_transcript');
  });
});

describe('fetchFirefliesTranscriptSentences — what counts as "zero sentences"', () => {
  function withFetch(impl: () => Promise<Response>) {
    vi.stubEnv('FIREFLIES_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(impl));
  }
  const json = (body: unknown) => async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('an empty sentence list is ok with zero sentences', async () => {
    withFetch(json({ data: { transcript: { sentences: [] } } }));
    expect(await fetchFirefliesTranscriptSentences('t1')).toEqual({ ok: true, data: [] });
  });

  it('a body that is not JSON is unreadable and about THIS request only (round 3)', async () => {
    withFetch(async () => new Response('<html>maintenance</html>', { status: 200 }));
    const r = await fetchFirefliesTranscriptSentences('t1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unreadable');
    expect(r.scope).toBe('request');
  });

  it('a null transcript is unreadable and about THIS transcript', async () => {
    withFetch(json({ data: { transcript: null } }));
    const r = await fetchFirefliesTranscriptSentences('t1');
    expect(r.reason).toBe('unreadable');
    expect(r.scope).toBe('transcript');
  });

  it('sentences that are all blank are unreadable, not "zero sentences"', async () => {
    withFetch(json({ data: { transcript: { sentences: [{ speaker_name: 'A', text: null }, { text: '  ' }] } } }));
    expect((await fetchFirefliesTranscriptSentences('t1')).reason).toBe('unreadable');
  });

  it('a network error is unreachable and an auth refusal is rejected', async () => {
    withFetch(async () => {
      throw new Error('ECONNRESET');
    });
    const net = await fetchFirefliesTranscriptSentences('t1');
    expect(net.reason).toBe('unreachable');
    expect(net.scope).toBe('request');
    withFetch(async () => new Response('no', { status: 401 }));
    const r = await fetchFirefliesTranscriptSentences('t1');
    expect(r.reason).toBe('rejected');
    expect(r.scope).toBe('account');
  });

  it('end to end: a non-JSON answer never stamps; an empty transcript does', async () => {
    const { db, state } = fakeDb({ candidates: [cand('note-1', 'booking-1')] });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    withFetch(async () => new Response('Bad gateway', { status: 200 }));
    await runEnqueue(db, { enqueue, fetchSentences: fetchFirefliesTranscriptSentences }, NOW);
    expect(state.notes['note-1'].aiDraftedAt).toBeNull();

    withFetch(json({ data: { transcript: { sentences: [] } } }));
    await runEnqueue(db, { enqueue, fetchSentences: fetchFirefliesTranscriptSentences }, NOW);
    expect(state.notes['note-1'].aiDraft?.status).toBe('no_transcript');
  });
});

// ── Fireflies error codes: one transcript vs the whole account (round 2) ─────

describe('Fireflies error codes — a per-transcript code never stops the run', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const B_SENTENCES = { data: { transcript: { sentences: [{ speaker_name: 'A', text: 'We agreed.' }] } } };

  /** A Fireflies GraphQL error answer, shaped as docs.fireflies.ai/miscellaneous/error-codes shows it. */
  function gqlError(code: string | null, status: number, where: 'both' | 'top' = 'both') {
    const entry: Record<string, unknown> = { message: `Fireflies says ${code ?? 'no code'}` };
    if (code) {
      entry.code = code;
      if (where === 'both') entry.extensions = { code, status };
    }
    return { errors: [entry], data: null };
  }

  /** Stub Fireflies by transcript id → [HTTP status, body]; returns the ids asked for. */
  function routeFetch(routes: Record<string, [number, unknown]>): string[] {
    vi.stubEnv('FIREFLIES_API_KEY', 'test-key');
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const id = JSON.parse(init.body).variables.id as string;
        asked.push(id);
        const [status, body] = routes[id];
        return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    return asked;
  }

  /** X is newer than B, and candidates come newest first — the reviewer's repro. */
  function xThenB() {
    return fakeDb({
      notes: {
        X: { id: 'X', bookingId: 'b-x', title: 'X', occurredAt: '2026-09-25T05:00:00Z', aiDraftedAt: null, summary: null },
        B: { id: 'B', bookingId: 'b-b', title: 'B', occurredAt: '2026-09-20T05:00:00Z', aiDraftedAt: null, summary: null },
      },
      candidates: [cand('X', 'b-x', '2026-09-25T05:00:00Z'), cand('B', 'b-b', '2026-09-20T05:00:00Z')],
    });
  }
  const enqueuedIds = (enqueue: ReturnType<typeof vi.fn>) =>
    (enqueue.mock.calls as unknown as Array<[{ context: { note_id: string } }]>).map((c) => c[0].context.note_id);

  it('the per-transcript set is exactly object_not_found, forbidden, not_in_team', () => {
    expect([...FIREFLIES_PER_TRANSCRIPT_CODES].sort()).toEqual(['forbidden', 'not_in_team', 'object_not_found']);
  });

  it.each([
    ['HTTP 404, code in both places', 404, 'both'],
    ['HTTP 200, code in both places', 200, 'both'],
    ['HTTP 200, top-level code only', 200, 'top'],
  ] as const)(
    '(a) [X object_not_found (%s), B older]: X stamped ONCE with its reason, B enqueued in the SAME run',
    async (_label, status, where) => {
      const { db, state } = xThenB();
      const asked = routeFetch({
        'ff-X': [status, gqlError('object_not_found', 404, where)],
        'ff-B': [200, B_SENTENCES],
      });
      const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
      const deps = { enqueue, fetchSentences: fetchFirefliesTranscriptSentences };

      const s1 = await runEnqueue(db, deps, NOW);
      expect(s1.stoppedReason).toBeNull();
      expect(s1.transcriptUnavailable).toBe(1);
      expect(s1.errors).toBe(0);
      expect(state.notes.X.aiDraft?.status).toBe('fireflies_object_not_found');
      expect(state.notes.X.aiDraft?.detail).toBe('Fireflies says object_not_found');
      expect(enqueuedIds(enqueue)).toEqual(['B']);
      expect(state.notes.B.aiDraftedAt).toBeNull();

      // Two more runs — the reviewer's three-run repro. X is never fetched or stamped again.
      await runEnqueue(db, deps, NOW);
      await runEnqueue(db, deps, NOW);
      expect(state.stampCalls.filter((id) => id === 'X')).toHaveLength(1);
      expect(asked.filter((id) => id === 'ff-X')).toHaveLength(1);
    },
  );

  it.each(['forbidden', 'not_in_team'] as const)(
    '(b) [X %s, B older]: X stamped with its own reason and the run goes on to B',
    async (code) => {
      const { db, state } = xThenB();
      routeFetch({ 'ff-X': [403, gqlError(code, 403)], 'ff-B': [200, B_SENTENCES] });
      const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
      const s = await runEnqueue(db, { enqueue, fetchSentences: fetchFirefliesTranscriptSentences }, NOW);
      expect(s.stoppedReason).toBeNull();
      expect(s.transcriptUnavailable).toBe(1);
      expect(state.notes.X.aiDraft?.status).toBe(`fireflies_${code}`);
      expect(enqueuedIds(enqueue)).toEqual(['B']);
    },
  );

  it.each([
    ['HTTP 429 too_many_requests', 429, gqlError('too_many_requests', 429)],
    ['too_many_requests inside a 200', 200, gqlError('too_many_requests', 429)],
    ['HTTP 401 (the key)', 401, 'Unauthorized'],
    ['auth_failed', 200, gqlError('auth_failed', 401)],
    ['account_cancelled', 403, gqlError('account_cancelled', 403)],
    ['paid_required', 403, gqlError('paid_required', 403)],
    ['a per-transcript code mixed with too_many_requests', 200, { errors: [{ code: 'object_not_found' }, { code: 'too_many_requests' }] }],
  ] as const)('(c) %s is ACCOUNT-wide: the run stops and NOTHING is stamped', async (_label, status, body) => {
    const { db, state } = xThenB();
    const asked = routeFetch({ 'ff-X': [status, body], 'ff-B': [200, B_SENTENCES] });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const s = await runEnqueue(db, { enqueue, fetchSentences: fetchFirefliesTranscriptSentences }, NOW);
    expect(s.stoppedReason).toMatch(/^fireflies /);
    expect(s.transcriptUnavailable).toBe(0);
    expect(s.skippedTransient).toBe(0);
    expect(state.stampCalls).toEqual([]);
    expect(state.notes.X.aiDraftedAt).toBeNull();
    expect(asked).toEqual(['ff-X']);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('(c) no FIREFLIES_API_KEY (not_connected) stops the run before any request', async () => {
    const { db, state } = xThenB();
    vi.stubEnv('FIREFLIES_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const s = await runEnqueue(db, { enqueue, fetchSentences: fetchFirefliesTranscriptSentences }, NOW);
    expect(s.stoppedReason).toBe('fireflies not_connected');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.stampCalls).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('the account stop set is exactly auth_failed, too_many_requests, account_cancelled, paid_required', () => {
    expect([...FIREFLIES_ACCOUNT_STOP_CODES].sort()).toEqual([
      'account_cancelled',
      'auth_failed',
      'paid_required',
      'too_many_requests',
    ]);
  });

  // Round 3: everything that is not a key / account failure SKIPS that one
  // note for this run, unstamped, and the run goes on to the older note.
  it.each([
    ['an unknown code', 200, gqlError('a_code_nobody_documented', 400)],
    ['an error entry with no code', 200, gqlError(null, 0)],
    ['request_timeout (408)', 408, gqlError('request_timeout', 408)],
    ['invariant_violation (500)', 500, gqlError('invariant_violation', 500)],
    [
      'a GraphQL validation error',
      400,
      { errors: [{ message: 'Cannot query field', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }] },
    ],
    ['a per-transcript code mixed with an unknown one', 200, { errors: [{ code: 'object_not_found' }, { code: 'mystery' }] }],
    ['a body that is not JSON (a gateway page)', 502, '<html>Bad gateway</html>'],
    ['a 503 with JSON and no errors', 503, { data: null }],
    ['a 200 body that is not JSON', 200, 'maintenance'],
    ['JSON with no data object', 200, { hello: 'world' }],
  ] as const)('(d) [X: %s, B older]: X skipped UNSTAMPED, B enqueued in the SAME run', async (_label, status, body) => {
    const { db, state } = xThenB();
    const asked = routeFetch({ 'ff-X': [status, body], 'ff-B': [200, B_SENTENCES] });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const s = await runEnqueue(db, { enqueue, fetchSentences: fetchFirefliesTranscriptSentences }, NOW);
    expect(s.stoppedReason).toBeNull();
    expect(s.skippedTransient).toBe(1);
    expect(s.transcriptUnavailable).toBe(0);
    expect(state.stampCalls).toEqual([]);
    expect(state.notes.X.aiDraftedAt).toBeNull();
    expect(asked).toEqual(['ff-X', 'ff-B']);
    expect(enqueuedIds(enqueue)).toEqual(['B']);
  });

  it('(d) a network error on X skips X, unstamped, and B is still enqueued', async () => {
    const { db, state } = xThenB();
    vi.stubEnv('FIREFLIES_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        if (JSON.parse(init.body).variables.id === 'ff-X') throw new Error('ECONNRESET');
        return new Response(JSON.stringify(B_SENTENCES), { status: 200 });
      }),
    );
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const s = await runEnqueue(db, { enqueue, fetchSentences: fetchFirefliesTranscriptSentences }, NOW);
    expect(s.stoppedReason).toBeNull();
    expect(s.skippedTransient).toBe(1);
    expect(state.stampCalls).toEqual([]);
    expect(enqueuedIds(enqueue)).toEqual(['B']);
  });

  it('(d) [X times out after 20 s, B older]: X UNSTAMPED, B enqueued in the SAME run; X is tried again next run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { db, state } = xThenB();
      vi.stubEnv('FIREFLIES_API_KEY', 'test-key');
      const asked: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: { body: string; signal: AbortSignal }) => {
          const id = JSON.parse(init.body).variables.id as string;
          asked.push(id);
          if (id === 'ff-B') return Promise.resolve(new Response(JSON.stringify(B_SENTENCES), { status: 200 }));
          // X never answers; only the client's own 20 s abort ends it.
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const e = new Error('The operation was aborted.');
              e.name = 'AbortError';
              reject(e);
            });
          });
        }),
      );
      const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
      const deps = { enqueue, fetchSentences: fetchFirefliesTranscriptSentences };

      const run1 = runEnqueue(db, deps, NOW);
      await vi.advanceTimersByTimeAsync(20_000);
      const s1 = await run1;
      expect(s1.stoppedReason).toBeNull();
      expect(s1.skippedTransient).toBe(1);
      expect(state.stampCalls).toEqual([]);
      expect(state.notes.X.aiDraftedAt).toBeNull();
      expect(enqueuedIds(enqueue)).toEqual(['B']);

      // Next run: X is still a candidate and is fetched again.
      const run2 = runEnqueue(db, deps, NOW);
      await vi.advanceTimersByTimeAsync(20_000);
      await run2;
      expect(asked.filter((id) => id === 'ff-X')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the 20 s timeout itself is reported as unreachable, request-scoped', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vi.stubEnv('FIREFLIES_API_KEY', 'test-key');
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener('abort', () => {
                const e = new Error('aborted');
                e.name = 'AbortError';
                reject(e);
              });
            }),
        ),
      );
      const p = fetchFirefliesTranscriptSentences('t1');
      await vi.advanceTimersByTimeAsync(20_000);
      const r = await p;
      expect(r.reason).toBe('unreachable');
      expect(r.scope).toBe('request');
      expect(r.message).toMatch(/within 20s/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failure that carries no scope is treated as account-wide, even with a per-transcript code', async () => {
    const { db, state } = xThenB();
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const s = await runEnqueue(
      db,
      {
        enqueue,
        fetchSentences: async () => ({ ok: false, reason: 'rejected', errorCode: 'object_not_found', message: 'x' }),
      },
      NOW,
    );
    expect(s.stoppedReason).toBe('fireflies rejected (object_not_found)');
    expect(state.stampCalls).toEqual([]);
  });
});

describe('a stamp is counted only when it was written', () => {
  it('no_transcript: a failed write is an error, not a stamped note, and it stays a candidate', async () => {
    const { db, state } = fakeDb({ candidates: [cand('note-1', 'booking-1')], stampError: 'timeout' });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const s = await runEnqueue(db, { enqueue, fetchSentences: async () => ({ ok: true, data: [] }) }, NOW);
    expect(state.stampCalls).toEqual(['note-1']);
    expect(s.noTranscript).toBe(0);
    expect(s.errors).toBe(1);
    expect(state.notes['note-1'].aiDraftedAt).toBeNull();
  });

  it('fireflies_<code>: a failed write is an error, not a stamped note, and the run still goes on', async () => {
    const { db } = fakeDb({ candidates: [cand('note-1', 'booking-1'), cand('ok', 'b-ok')], stampError: 'timeout' });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const s = await runEnqueue(
      db,
      {
        enqueue,
        fetchSentences: async (ref: string) =>
          ref === 'ff-note-1'
            ? {
                ok: false as const,
                reason: 'rejected' as const,
                scope: 'transcript' as const,
                errorCode: 'object_not_found',
                message: 'gone',
              }
            : { ok: true as const, data: [{ speakerName: 'A', text: 'We agreed.' }] },
      },
      NOW,
    );
    expect(s.transcriptUnavailable).toBe(0);
    expect(s.errors).toBe(1);
    expect(s.enqueued).toBe(1);
  });

  it('a participant read that FAILS during enqueue sends nothing for that note and leaves it UNSTAMPED', async () => {
    const { db, state } = fakeDb({
      candidates: [cand('note-1', 'booking-1')],
      readErrors: { loadParticipants: 'timeout' },
    });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const s = await runEnqueue(
      db,
      { enqueue, fetchSentences: async () => ({ ok: true, data: [{ speakerName: 'A', text: 'We agreed.' }] }) },
      NOW,
    );
    expect(enqueue).not.toHaveBeenCalled();
    expect(s.errors).toBe(1);
    expect(s.enqueued).toBe(0);
    expect(state.stampCalls).toEqual([]);
  });
});

// ── prompt retention: jobs that were never delivered ────────────────────────

function job(
  id: string,
  status: string,
  requestedAt: string | null,
  deliveredAt: string | null = null,
): HeldPromptJob & { payload: Record<string, unknown> } {
  return {
    id,
    status,
    requestedAt,
    deliveredAt,
    payload: { prompt: 'TRANSCRIPT', _ctx: { note_id: id }, _dedupe: `k-${id}` },
  };
}
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe('selectPromptsToRetire', () => {
  it('strips error / canceled / delivered-done, cancels pending from 7 days, keeps the rest', () => {
    const r = selectPromptsToRetire(
      [
        job('err', 'error', ago(1)),
        job('can', 'canceled', ago(1)),
        job('done-delivered', 'done', ago(1), ago(1)),
        job('done-undelivered', 'done', ago(1)),
        job('claimed', 'claimed', ago(30)),
        job('running', 'running', ago(30)),
        job('pending-8d', 'pending', ago(8)),
        job('pending-7d', 'pending', ago(7)),
        job('pending-6d', 'pending', ago(6)),
        job('pending-no-date', 'pending', null),
      ],
      NOW,
    );
    expect(r.strip.sort()).toEqual(['can', 'done-delivered', 'err']);
    expect(r.cancel.sort()).toEqual(['pending-7d', 'pending-8d']);
  });
});

describe('runPromptSweep', () => {
  it('removes the prompt from failed and cancelled jobs and cancels a stale pending one, keeping _ctx/_dedupe', async () => {
    const { db, state } = fakeDb({
      jobs: {
        err: job('err', 'error', ago(2)),
        can: job('can', 'canceled', ago(2)),
        stale: job('stale', 'pending', ago(9)),
        fresh: job('fresh', 'pending', ago(1)),
        running: job('running', 'running', ago(1)),
      },
    });
    const s = await runPromptSweep(db, NOW);
    expect(s).toEqual({ listed: 5, stripped: 2, canceled: 1, errors: 0 });
    expect('prompt' in state.jobs.err.payload).toBe(false);
    expect('prompt' in state.jobs.can.payload).toBe(false);
    expect(state.jobs.err.payload._ctx).toEqual({ note_id: 'err' });
    expect(state.jobs.err.payload._dedupe).toBe('k-err');
    expect(state.jobs.stale.status).toBe('canceled');
    expect('prompt' in state.jobs.stale.payload).toBe(false);
    expect(state.jobs.stale.payload.__reason).toBe(STALE_PENDING_REASON);
    expect(state.jobs.fresh.payload.prompt).toBe('TRANSCRIPT');
    expect(state.jobs.running.payload.prompt).toBe('TRANSCRIPT');
  });

  it('leaves a stale job alone when the drain claimed it in between', async () => {
    const { db, state } = fakeDb({
      jobs: { stale: job('stale', 'pending', ago(9)) },
      claimedMidway: new Set(['stale']),
    });
    const s = await runPromptSweep(db, NOW);
    expect(s.canceled).toBe(0);
    expect(state.jobs.stale.status).toBe('claimed');
    expect(state.jobs.stale.payload.prompt).toBe('TRANSCRIPT');
  });

  it('counts an error when the jobs cannot be listed', async () => {
    const { db } = fakeDb({ jobsReadable: false });
    expect(await runPromptSweep(db, NOW)).toEqual({ listed: 0, stripped: 0, canceled: 0, errors: 1 });
  });
});

// ── one cron run: a collect failure skips enqueue ───────────────────────────

describe('runNoteDraftCron', () => {
  const fetchOk = () =>
    vi.fn(async () => ({ ok: true as const, data: [{ speakerName: 'A', text: 'We agreed.' }] }));

  it('when collecting throws: reports it, still sweeps prompts, and does NOT enqueue', async () => {
    const { db, state } = fakeDb({
      candidates: [cand('note-1', 'booking-1')],
      jobs: { err: job('err', 'error', ago(2)) },
    });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const fetchSentences = fetchOk();
    const r = await runNoteDraftCron(
      db,
      {
        collect: async () => {
          throw new Error('collect claim failed: boom');
        },
        fetchSentences,
        enqueue,
      },
      NOW,
    );
    expect(r.collectError).toBe('collect claim failed: boom');
    expect(r.enqueueSkipped).toBe(true);
    expect(r.enqueue).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
    expect(fetchSentences).not.toHaveBeenCalled();
    expect(r.sweep?.stripped).toBe(1);
    expect('prompt' in state.jobs.err.payload).toBe(false);
  });

  it('when collecting succeeds, enqueues as usual', async () => {
    const { db } = fakeDb({ candidates: [cand('note-1', 'booking-1')] });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const r = await runNoteDraftCron(db, { collect: async () => [], fetchSentences: fetchOk(), enqueue }, NOW);
    expect(r.enqueueSkipped).toBe(false);
    expect(r.collectError).toBeNull();
    expect(r.enqueue?.enqueued).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('collectNoteDraftJobs', () => {
  it('THROWS on an RPC error instead of reading it as "nothing finished"', async () => {
    const admin = { rpc: vi.fn(async () => ({ data: null, error: { message: 'timeout' } })) } as never;
    await expect(collectNoteDraftJobs(admin, 25)).rejects.toThrow(/timeout/);
  });

  it('claims only this job type and maps result text + context', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          id: 'j1',
          job_type: NOTE_DRAFT_JOB,
          payload: { _ctx: { note_id: 'n1' } },
          result: { answer: '{"summary":"s"}' },
        },
        { id: 'j2', job_type: NOTE_DRAFT_JOB, payload: null, result: null },
      ],
      error: null,
    }));
    const items = await collectNoteDraftJobs({ rpc } as never, 25);
    expect(rpc).toHaveBeenCalledWith('fn_ai_collect_claim', { p_job_types: [NOTE_DRAFT_JOB], p_limit: 25 });
    expect(items[0].jobId).toBe('j1');
    expect(items[0].context).toEqual({ note_id: 'n1' });
    expect((items[0].message as unknown as { content: Array<{ text: string }> }).content[0].text).toBe(
      '{"summary":"s"}',
    );
    expect(items[1].message).toBeNull();
    expect(items[1].context).toEqual({});
  });
});

// ── the Supabase adapter: what actually reaches the database ────────────────

function stubAdmin(
  selectResult: unknown = { data: null, error: null },
  awaitedResult: unknown = { data: [], error: null },
) {
  const calls: Array<{ table: string; op: string; arg?: unknown; filters: unknown[][] }> = [];
  const from = (table: string) => {
    const call = { table, op: 'select', arg: undefined as unknown, filters: [] as unknown[][] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const filter = (name: string) => (...a: unknown[]) => {
      call.filters.push([name, ...a]);
      return chain;
    };
    for (const f of ['select', 'eq', 'is', 'in', 'not', 'lte', 'order', 'limit']) chain[f] = filter(f);
    chain.update = (arg: unknown) => {
      call.op = 'update';
      call.arg = arg;
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve(selectResult);
    chain.then = (res: (v: unknown) => unknown) =>
      Promise.resolve(
        typeof awaitedResult === 'function' ? (awaitedResult as (t: string) => unknown)(table) : awaitedResult,
      ).then(res);
    return chain;
  };
  return { admin: { from } as never, calls };
}

describe('supabaseNoteDraftDb', () => {
  it('stampDraft writes ONLY ai_draft + ai_drafted_at (never summary), only while ai_drafted_at is null', async () => {
    const { admin, calls } = stubAdmin();
    await supabaseNoteDraftDb(admin).stampDraft('note-1', { label: 'AI draft', summary: 'x' });
    const up = calls.find((c) => c.op === 'update')!;
    expect(up.table).toBe('meeting_notes');
    expect(Object.keys(up.arg as object).sort()).toEqual(['ai_draft', 'ai_drafted_at']);
    expect(up.filters).toContainEqual(['is', 'ai_drafted_at', null]);
  });

  it('stripJobPrompt removes prompt and keeps _ctx / _dedupe', async () => {
    const { admin, calls } = stubAdmin({
      data: { payload: { prompt: 'TRANSCRIPT', _ctx: { note_id: 'n' }, _dedupe: 'k' } },
      error: null,
    });
    await supabaseNoteDraftDb(admin).stripJobPrompt('job-1');
    const up = calls.find((c) => c.op === 'update')!;
    expect(up.table).toBe('ai_jobs');
    expect(up.arg).toEqual({ payload: { _ctx: { note_id: 'n' }, _dedupe: 'k' } });
  });

  it('listJobsHoldingPrompt reads only this job type, only rows still holding a prompt', async () => {
    const { admin, calls } = stubAdmin(undefined, {
      data: [{ id: 'j', status: 'error', requested_at: 'r', delivered_at: null }],
      error: null,
    });
    const rows = await supabaseNoteDraftDb(admin).listJobsHoldingPrompt(NOTE_DRAFT_JOB, 100);
    expect(rows).toEqual([{ id: 'j', status: 'error', requestedAt: 'r', deliveredAt: null }]);
    const f = calls[0].filters;
    expect(calls[0].table).toBe('ai_jobs');
    expect(f).toContainEqual(['eq', 'job_type', NOTE_DRAFT_JOB]);
    expect(f).toContainEqual(['in', 'status', ['error', 'canceled', 'done', 'pending']]);
    expect(f).toContainEqual(['not', 'payload->prompt', 'is', null]);
  });

  it('cancelPendingJob strips the prompt and cancels, guarded on status = pending in the write', async () => {
    const { admin, calls } = stubAdmin(
      { data: { payload: { prompt: 'T', _ctx: { note_id: 'n' }, _dedupe: 'k' } }, error: null },
      { data: [{ id: 'j' }], error: null },
    );
    const r = await supabaseNoteDraftDb(admin).cancelPendingJob('j', STALE_PENDING_REASON);
    expect(r).toEqual({ applied: true, error: null });
    const up = calls.find((c) => c.op === 'update')!;
    const arg = up.arg as Record<string, unknown>;
    expect(arg.payload).toEqual({ _ctx: { note_id: 'n' }, _dedupe: 'k' });
    expect(arg.status).toBe('canceled');
    expect(arg.error).toBe(STALE_PENDING_REASON);
    expect(up.filters).toContainEqual(['eq', 'status', 'pending']);
    expect(up.filters).toContainEqual(['eq', 'id', 'j']);
  });

  it('cancelPendingJob changes nothing when the job is no longer pending', async () => {
    const { admin, calls } = stubAdmin({ data: null, error: null });
    const r = await supabaseNoteDraftDb(admin).cancelPendingJob('j', STALE_PENDING_REASON);
    expect(r).toEqual({ applied: false, error: null });
    expect(calls.find((c) => c.op === 'update')).toBeUndefined();
  });

  it('cancelPendingJob reports not-applied when the guarded write matched no row', async () => {
    const { admin } = stubAdmin({ data: { payload: { prompt: 'T' } }, error: null }, { data: [], error: null });
    expect(await supabaseNoteDraftDb(admin).cancelPendingJob('j', 'r')).toEqual({ applied: false, error: null });
  });
});

describe('supabaseNoteDraftDb — a failed read is never an empty answer', () => {
  const dbErr = { data: null, error: { message: 'statement timeout' } };

  it('loadNote: a read error is an error; no row is "no such note"', async () => {
    expect(await supabaseNoteDraftDb(stubAdmin(dbErr).admin).loadNote('n')).toEqual({
      note: null,
      error: 'statement timeout',
    });
    expect(await supabaseNoteDraftDb(stubAdmin({ data: null, error: null }).admin).loadNote('n')).toEqual({
      note: null,
      error: null,
    });
  });

  it('bookingHost: a read error is an error; no row is "no host"; a row gives its host', async () => {
    expect(await supabaseNoteDraftDb(stubAdmin(dbErr).admin).bookingHost('b')).toEqual({
      host: null,
      error: 'statement timeout',
    });
    expect(await supabaseNoteDraftDb(stubAdmin({ data: null, error: null }).admin).bookingHost('b')).toEqual({
      host: null,
      error: null,
    });
    expect(
      await supabaseNoteDraftDb(stubAdmin({ data: { host_profile_id: 'p-host' }, error: null }).admin).bookingHost('b'),
    ).toEqual({ host: 'p-host', error: null });
  });

  it('countActionItems: an error or a missing count is an error; a real count is a count', async () => {
    const count = async (r: unknown) => supabaseNoteDraftDb(stubAdmin(undefined, r).admin).countActionItems('b');
    expect((await count({ count: null, error: { message: 'statement timeout' } })).error).toBe('statement timeout');
    expect((await count({ count: null, error: null })).error).not.toBeNull();
    expect(await count({ count: 0, error: null })).toEqual({ count: 0, error: null });
    expect(await count({ count: 2, error: null })).toEqual({ count: 2, error: null });
  });

  it('loadParticipants: a failed participant read and a failed profile lookup are errors; a real empty list is not', async () => {
    const participantRow = { data: [{ email: 'Asha@JKKN.ac.in ', display_name: 'Asha', profile_id: null }], error: null };
    const load = async (byTable: (t: string) => unknown) =>
      supabaseNoteDraftDb(stubAdmin(undefined, byTable).admin).loadParticipants('n');

    expect(await load(() => dbErr)).toEqual({ participants: [], error: 'statement timeout' });
    expect(await load((t) => (t === 'meeting_note_participants' ? participantRow : dbErr))).toEqual({
      participants: [],
      error: 'statement timeout',
    });
    expect(await load(() => ({ data: [], error: null }))).toEqual({ participants: [], error: null });
    expect(
      await load((t) =>
        t === 'meeting_note_participants' ? participantRow : { data: [{ id: 'p-asha', email: 'asha@jkkn.ac.in' }], error: null },
      ),
    ).toEqual({
      participants: [{ email: 'asha@jkkn.ac.in', displayName: 'Asha', profileId: 'p-asha' }],
      error: null,
    });
  });
});

// ── round 3: Fireflies' own summary arrived before collect ──────────────────

describe('collect — a Fireflies summary that arrived after enqueue wins (round 3)', () => {
  const draftText = modelText({
    summary: 'S',
    decisions: ['D'],
    actions: [{ text: 'Book the hall', owner_email: 'priya.r@jkkn.ac.in', owner_label: 'Priya', due_date: null }],
  });

  it('writes NO tasks, stamps summary_arrived, keeps the model answer out, and still strips the prompt', async () => {
    const { db, state } = fakeDb();
    state.notes['note-1'].summary = 'The real Fireflies overview.';
    state.jobPayloads = { 'job-1': { prompt: 'TRANSCRIPT…', _ctx: { note_id: 'note-1' } } };
    const s = await runCollect(db, async () => [collected('job-1', 'note-1', draftText)], NOW);
    expect(s.summaryArrived).toBe(1);
    expect(s.recorded).toBe(0);
    expect(state.inserted).toHaveLength(0);
    expect(state.notes['note-1'].aiDraft?.status).toBe('summary_arrived');
    expect(state.notes['note-1'].aiDraft?.job_id).toBe('job-1');
    expect(state.notes['note-1'].aiDraft).not.toHaveProperty('summary');
    expect(state.notes['note-1'].aiDraft).not.toHaveProperty('decisions');
    expect(state.notes['note-1'].summary).toBe('The real Fireflies overview.');
    expect('prompt' in state.jobPayloads['job-1']).toBe(false);
  });

  it('a summary_arrived stamp that fails to write is an error and leaves the note UNSTAMPED', async () => {
    const { db, state } = fakeDb({ stampError: 'timeout' });
    state.notes['note-1'].summary = 'The real Fireflies overview.';
    const s = await runCollect(db, async () => [collected('job-1', 'note-1', draftText)], NOW);
    expect(s.summaryArrived).toBe(0);
    expect(s.errors).toBe(1);
    expect(state.inserted).toHaveLength(0);
    expect(state.notes['note-1'].aiDraftedAt).toBeNull();
  });

  it('with the summary still NULL, the same answer is recorded as tasks (unchanged)', async () => {
    const { db, state } = fakeDb();
    const s = await runCollect(db, async () => [collected('job-1', 'note-1', draftText)], NOW);
    expect(s.summaryArrived).toBe(0);
    expect(s.recorded).toBe(1);
    expect(state.inserted).toHaveLength(1);
  });
});

// ── round 3: the switch is real ─────────────────────────────────────────────

describe('runNoteDraftCron — switched off means nothing moves (round 3)', () => {
  function mixedJobs() {
    return {
      fresh: job('fresh', 'pending', ago(1)),
      stale: job('stale', 'pending', ago(9)),
      undated: job('undated', 'pending', null),
      claimed: job('claimed', 'claimed', ago(1)),
      running: job('running', 'running', ago(1)),
      doneUndelivered: job('doneUndelivered', 'done', ago(1)),
      err: job('err', 'error', ago(2)),
    };
  }
  function deps() {
    return {
      collect: vi.fn(async () => [
        collected('job-done', 'note-1', modelText({ summary: 'S', decisions: [], actions: [{ text: 'x' }] })),
      ]),
      fetchSentences: vi.fn(async () => ({ ok: true as const, data: [{ speakerName: 'A', text: 'We agreed.' }] })),
      enqueue: vi.fn(async () => ({ ok: true as const, jobId: 'j' })),
    };
  }

  it('disabled: no collect claim, no tasks, no stamps, no Fireflies call, no enqueue; EVERY pending job cancelled and stripped', async () => {
    const { db, state } = fakeDb({
      enabled: false,
      candidates: [cand('note-1', 'booking-1')],
      jobs: mixedJobs(),
    });
    const d = deps();
    const r = await runNoteDraftCron(db, d, NOW);

    expect(r.disabled).toBe(true);
    expect(d.collect).not.toHaveBeenCalled();
    expect(d.fetchSentences).not.toHaveBeenCalled();
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(state.inserted).toHaveLength(0);
    expect(state.stampCalls).toEqual([]);
    expect(r.collect).toBeNull();
    expect(r.enqueue).toBeNull();

    for (const id of ['fresh', 'stale', 'undated'] as const) {
      expect(state.jobs[id].status).toBe('canceled');
      expect('prompt' in state.jobs[id].payload).toBe(false);
      expect(state.jobs[id].payload.__reason).toBe(SWITCHED_OFF_REASON);
    }
    // In use or not yet collected: cannot be stopped from here, left alone.
    expect(state.jobs.claimed.status).toBe('claimed');
    expect(state.jobs.claimed.payload.prompt).toBe('TRANSCRIPT');
    expect(state.jobs.running.payload.prompt).toBe('TRANSCRIPT');
    expect(state.jobs.doneUndelivered.payload.prompt).toBe('TRANSCRIPT');
    // Retention still applies to a job that ended in error.
    expect('prompt' in state.jobs.err.payload).toBe(false);

    expect(noteDraftRouteBody(r)).toEqual({
      ok: true,
      disabled: true,
      pendingCanceled: 3,
      promptsStripped: 1,
      errors: 0,
      sweepError: null,
    });
  });

  it('disabled: a pending job the drain claims in between is left running with its prompt', async () => {
    const { db, state } = fakeDb({
      enabled: false,
      jobs: { fresh: job('fresh', 'pending', ago(1)) },
      claimedMidway: new Set(['fresh']),
    });
    const r = await runNoteDraftCron(db, deps(), NOW);
    expect(r.sweep?.canceled).toBe(0);
    expect(state.jobs.fresh.status).toBe('claimed');
    expect(state.jobs.fresh.payload.prompt).toBe('TRANSCRIPT');
  });

  it('enabled: collects, enqueues, and cancels only a pending job older than 7 days (unchanged)', async () => {
    const { db, state } = fakeDb({
      candidates: [cand('note-1', 'booking-1')],
      jobs: { fresh: job('fresh', 'pending', ago(1)), stale: job('stale', 'pending', ago(9)) },
    });
    const d = deps();
    const r = await runNoteDraftCron(db, { ...d, collect: vi.fn(async () => []) }, NOW);
    expect(r.disabled).toBe(false);
    expect(r.enqueue?.enqueued).toBe(1);
    expect(state.jobs.fresh.status).toBe('pending');
    expect(state.jobs.fresh.payload.prompt).toBe('TRANSCRIPT');
    expect(state.jobs.stale.status).toBe('canceled');
    expect(state.jobs.stale.payload.__reason).toBe(STALE_PENDING_REASON);
  });

  it('enabled: the collect claim IS called', async () => {
    const { db } = fakeDb();
    const d = deps();
    await runNoteDraftCron(db, d, NOW);
    expect(d.collect).toHaveBeenCalledTimes(1);
  });

  it('the switch cannot be read: nothing collected, enqueued or cancelled beyond the ordinary 7-day rule; ok:false', async () => {
    const { db, state } = fakeDb({
      switchError: 'statement timeout',
      candidates: [cand('note-1', 'booking-1')],
      jobs: { fresh: job('fresh', 'pending', ago(1)) },
    });
    const d = deps();
    const r = await runNoteDraftCron(db, d, NOW);
    expect(r.switchError).toBe('statement timeout');
    expect(r.disabled).toBe(false);
    expect(d.collect).not.toHaveBeenCalled();
    expect(d.fetchSentences).not.toHaveBeenCalled();
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(state.jobs.fresh.status).toBe('pending');
    const body = noteDraftRouteBody(r);
    expect(body.ok).toBe(false);
    expect(summarizeRoutineResult(200, body)).toMatch(/error: could not read the switch/);
  });
});

// ── round 3: a stopped run is visible in last_status ────────────────────────

describe('noteDraftRouteBody — a run that stopped early says why in last_status (round 3)', () => {
  async function runWith(over: Partial<FakeState>, fetchSentences: Parameters<typeof runEnqueue>[1]['fetchSentences']) {
    const { db } = fakeDb({ candidates: [cand('note-1', 'booking-1')], ...over });
    const enqueue = vi.fn(async () => ({ ok: true as const, jobId: 'j' }));
    const r = await runNoteDraftCron(db, { collect: async () => [], fetchSentences, enqueue }, NOW);
    const body = noteDraftRouteBody(r);
    return { body, status: summarizeRoutineResult(200, body) };
  }

  it.each([
    ['Fireflies 429', { ok: false, reason: 'rejected', scope: 'account', errorCode: 'too_many_requests', message: 'x' }, 'enqueue stopped: fireflies rejected (too_many_requests)'],
    ['Fireflies auth', { ok: false, reason: 'rejected', scope: 'account', errorCode: 'auth_failed', message: 'x' }, 'enqueue stopped: fireflies rejected (auth_failed)'],
    ['no key', { ok: false, reason: 'not_connected', scope: 'account', message: 'x' }, 'enqueue stopped: fireflies not_connected'],
  ] as const)('%s → ok:false and the reason is the status line', async (_l, answer, expected) => {
    const { body, status } = await runWith({}, async () => answer);
    expect(body.ok).toBe(false);
    expect(body.error).toBe(expected);
    expect(status).toBe(`HTTP 200 · error: ${expected}`);
  });

  it('could not list candidates → ok:false with that reason', async () => {
    const { db } = fakeDb();
    const broken: NoteDraftDb = { ...db, listCandidates: async () => null };
    const r = await runNoteDraftCron(
      broken,
      { collect: async () => [], fetchSentences: vi.fn(), enqueue: vi.fn() },
      NOW,
    );
    expect(summarizeRoutineResult(200, noteDraftRouteBody(r))).toBe(
      'HTTP 200 · error: enqueue stopped: could not list candidate notes',
    );
  });

  it('could not check interview bookings → ok:false with that reason', async () => {
    const { status } = await runWith({ interviews: null }, vi.fn());
    expect(status).toBe('HTTP 200 · error: enqueue stopped: could not check interview bookings');
  });

  it('collect failed → ok:false, enqueue skipped', async () => {
    const { db } = fakeDb();
    const r = await runNoteDraftCron(
      db,
      {
        collect: async () => {
          throw new Error('collect claim failed: boom');
        },
        fetchSentences: vi.fn(),
        enqueue: vi.fn(),
      },
      NOW,
    );
    expect(summarizeRoutineResult(200, noteDraftRouteBody(r))).toMatch(/error: collect failed, enqueue skipped/);
  });

  it('a normal run is ok:true and prints its counters, including skipped_transient when non-zero', async () => {
    const { body, status } = await runWith({}, async () => ({
      ok: false,
      reason: 'unreachable',
      scope: 'request',
      message: 'timeout',
    }));
    expect(body.ok).toBe(true);
    expect(body.skipped_transient).toBe(1);
    expect(status).toMatch(/^HTTP 200 · /);
    expect(status).toMatch(/skipped_transient 1/);
    expect(status).not.toMatch(/error/);
  });
});

describe('supabaseNoteDraftDb.isJobTypeEnabled — a failed read is not "off" (round 3)', () => {
  it('error → error; enabled row → on; disabled or missing row → off', async () => {
    const read = async (r: unknown) => supabaseNoteDraftDb(stubAdmin(r).admin).isJobTypeEnabled(NOTE_DRAFT_JOB);
    expect(await read({ data: null, error: { message: 'statement timeout' } })).toEqual({
      enabled: false,
      error: 'statement timeout',
    });
    expect(await read({ data: { enabled: true }, error: null })).toEqual({ enabled: true, error: null });
    expect(await read({ data: { enabled: false }, error: null })).toEqual({ enabled: false, error: null });
    expect(await read({ data: null, error: null })).toEqual({ enabled: false, error: null });
  });
});
