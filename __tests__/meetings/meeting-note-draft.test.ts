import { describe, it, expect, vi } from 'vitest';
import {
  AI_DRAFT_ACTION_PREFIX,
  LIMITS,
  NOTE_DRAFT_JOB,
  noteDraftDedupeKey,
  parseAndValidate,
  recordDraft,
  resolveOwner,
  runCollect,
  runEnqueue,
  selectEnqueueCandidates,
  supabaseNoteDraftDb,
  validateDueDate,
  type CandidateNote,
  type DraftNote,
  type NoteDraftDb,
} from '@/lib/services/meetings/meeting-note-draft';
import type { CollectedJobsLaneItem } from '@/lib/services/platform/ai-jobs-lane';

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
  candidates: CandidateNote[];
  interviews: Set<string> | null;
  summaryWrites: number;
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
    candidates: [],
    interviews: new Set(),
    summaryWrites: 0,
    ...over,
  };
  const db: NoteDraftDb = {
    async loadNote(id) {
      return state.notes[id] ?? null;
    },
    async loadParticipants() {
      return NOTE.participants;
    },
    async bookingHost(id) {
      return state.hosts[id] ?? null;
    },
    async countActionItems(id) {
      return state.existingItems[id] ?? 0;
    },
    async insertActionItems(rows) {
      state.inserted.push(...rows);
      return { error: null };
    },
    async stampDraft(id, aiDraft) {
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
      return { error: null };
    },
    async isJobTypeEnabled() {
      return state.enabled;
    },
    async listCandidates() {
      return state.candidates;
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

  it('inserts nothing when the booking has no host', async () => {
    const { db, state } = fakeDb({ hosts: {} });
    expect(await recordDraft(db, { note: NOTE, draft, jobId: 'job-1' })).toBe('no_host');
    expect(state.inserted).toHaveLength(0);
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

// ── the Supabase adapter: what actually reaches the database ────────────────

function stubAdmin(selectResult: unknown = { data: null, error: null }) {
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
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
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
});
