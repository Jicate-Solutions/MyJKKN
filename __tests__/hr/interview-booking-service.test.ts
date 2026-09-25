// The interview booking link's rules. The Director's decisions (#n) are the spec:
// memory project_interview_booking_link_decisions.

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CHANGE_CUTOFF_MIN,
  INTERVIEW_LINK_SOURCE,
  INTERVIEW_LINK_STAFF_SOURCE,
  findCandidatesByEmail,
  getChangeCutoffMin,
  isInsideChangeCutoff,
  isInterviewLinkSource,
  priorOutcomeAtBooking,
  resolveCandidateChoice,
  toPublicMatches,
  type CandidateMatchRow,
} from '@/lib/services/hr/interview-booking-service';

vi.mock('@/lib/services/meetings/public-host-service', () => ({ PublicHostService: {} }));

/** A query-builder double: every chained call records itself and returns the chain. */
function fakeDb(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'ilike', 'order', 'eq', 'limit']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return m === 'limit' ? Promise.resolve(result) : chain;
    };
  }
  return { db: chain as never, calls };
}

const NOW = new Date('2026-09-24T10:00:00Z');
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

describe('isInterviewLinkSource — the 2-hour rule never reaches an ordinary meeting (#11)', () => {
  it('is true for both link sources', () => {
    expect(isInterviewLinkSource(INTERVIEW_LINK_SOURCE)).toBe(true);
    expect(isInterviewLinkSource(INTERVIEW_LINK_STAFF_SOURCE)).toBe(true);
  });
  it('is false for every other source, including a meeting joined to an interview by hand', () => {
    for (const s of ['direct', 'meet-page', 'host-direct', 'trigger-engine', '', null, undefined]) {
      expect(isInterviewLinkSource(s as string)).toBe(false);
    }
  });
});

describe('isInsideChangeCutoff (#11)', () => {
  it('allows a change exactly at the cutoff and refuses one a minute inside it', () => {
    expect(isInsideChangeCutoff(minutesFromNow(120), 120, NOW)).toBe(false);
    expect(isInsideChangeCutoff(minutesFromNow(119), 120, NOW)).toBe(true);
  });
  it('allows a change well before the interview', () => {
    expect(isInsideChangeCutoff(minutesFromNow(60 * 24), 120, NOW)).toBe(false);
  });
  it('refuses once the interview has started or passed', () => {
    expect(isInsideChangeCutoff(minutesFromNow(0), 120, NOW)).toBe(true);
    expect(isInsideChangeCutoff(minutesFromNow(-30), 120, NOW)).toBe(true);
  });
  it('refuses an unreadable start time rather than letting it through', () => {
    expect(isInsideChangeCutoff('not a date', 120, NOW)).toBe(true);
  });
  it('treats a negative cutoff as zero and a non-number as the default', () => {
    expect(isInsideChangeCutoff(minutesFromNow(1), -50, NOW)).toBe(false);
    expect(isInsideChangeCutoff(minutesFromNow(DEFAULT_CHANGE_CUTOFF_MIN - 1), Number.NaN, NOW)).toBe(true);
  });
  it('follows an edited policy value, not a constant', () => {
    expect(isInsideChangeCutoff(minutesFromNow(100), 90, NOW)).toBe(false);
    expect(isInsideChangeCutoff(minutesFromNow(100), 180, NOW)).toBe(true);
  });
});

describe('getChangeCutoffMin — the policy row is the authority', () => {
  it('returns the row value', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 90, error: null });
    expect(await getChangeCutoffMin({ rpc } as never)).toBe(90);
    expect(rpc).toHaveBeenCalledWith('fn_get_policy_int', expect.objectContaining({
      p_key: 'hr.recruitment.interview_booking.change_cutoff_min',
      p_default: DEFAULT_CHANGE_CUTOFF_MIN,
    }));
  });
  it('falls back to the default when the read fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getChangeCutoffMin({ rpc } as never)).toBe(DEFAULT_CHANGE_CUTOFF_MIN);
  });
});

describe('toPublicMatches — what a stranger may see about a shared email (#7)', () => {
  const rows: CandidateMatchRow[] = [
    { id: 'c1', name: 'Ravi Kumar', role_title: 'Accounts Officer, Finance', status: 'submitted' },
    { id: 'c2', name: 'priya', role_title: 'Office Assistant', status: 'rejected' },
    { id: 'c3', name: '  ', role_title: '', status: 'submitted' },
  ];
  it('shows a first initial and the post, never a full name or a status', () => {
    const out = toPublicMatches(rows);
    expect(out[0]).toEqual({ id: 'c1', label: 'R. — applied for Accounts Officer, Finance' });
    expect(out[1]).toEqual({ id: 'c2', label: 'P. — applied for Office Assistant' });
    const text = JSON.stringify(out);
    expect(text).not.toContain('Ravi');
    expect(text).not.toContain('Kumar');
    expect(text).not.toContain('priya');
    expect(text).not.toContain('rejected');
  });
  it('still gives a usable label when the name and post are blank', () => {
    expect(toPublicMatches([rows[2]])[0].label).toBe('Applied for a post');
  });
});

describe('findCandidatesByEmail', () => {
  it('matches case-insensitively and escapes wildcards so a typed % cannot widen the match', async () => {
    const { db, calls } = fakeDb({ data: [], error: null });
    await findCandidatesByEmail(db, '  Some%One_x@Mail.COM ');
    const ilike = calls.find(([m]) => m === 'ilike');
    expect(ilike?.[1]).toEqual(['email', 'some\\%one\\_x@mail.com']);
  });
  it('does not query at all for a blank email', async () => {
    const { db, calls } = fakeDb({ data: [], error: null });
    expect(await findCandidatesByEmail(db, '   ')).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('resolveCandidateChoice — who is booking is settled BEFORE anything is booked', () => {
  const match = { id: 'cand-1', name: 'Ravi', role_title: 'Office Assistant', status: 'submitted', email: 'fam@x.com' };

  it('an email not on file is a new candidate (#4)', async () => {
    const { db } = fakeDb({ data: [], error: null });
    expect(await resolveCandidateChoice(db, 'new@x.com', null)).toEqual({ ok: true, choice: { kind: 'new' } });
  });

  it('an email on file must say which person — even with ONE match, because same email is not same person (#7)', async () => {
    const { db } = fakeDb({ data: [match], error: null });
    const r = await resolveCandidateChoice(db, 'fam@x.com', null);
    expect(r).toEqual({ ok: false, reason: 'needs_choice', matches: [{ id: 'cand-1', label: 'R. — applied for Office Assistant' }] });
  });

  it('a returning person picks themselves and books their next round (#5)', async () => {
    const { db } = fakeDb({ data: [match], error: null });
    const r = await resolveCandidateChoice(db, 'fam@x.com', { kind: 'existing', candidateId: 'cand-1' });
    expect(r).toEqual({ ok: true, choice: { kind: 'existing', candidateId: 'cand-1' } });
  });

  it('a second family member says "someone else" and becomes a new candidate (#7)', async () => {
    const { db } = fakeDb({ data: [match], error: null });
    expect(await resolveCandidateChoice(db, 'fam@x.com', { kind: 'new' })).toEqual({ ok: true, choice: { kind: 'new' } });
  });

  it('REFUSES a candidate id that does not share the typed email — a tampered request cannot hijack a record', async () => {
    const { db } = fakeDb({ data: [match], error: null });
    const r = await resolveCandidateChoice(db, 'fam@x.com', { kind: 'existing', candidateId: 'someone-elses-id' });
    expect(r).toEqual({ ok: false, reason: 'invalid_choice' });
  });

  it('ignores — never trusts — a candidate id when the email has no candidates at all', async () => {
    const { db } = fakeDb({ data: [], error: null });
    // Zero matches short-circuits to a new candidate; the stray id is ignored, never trusted.
    expect(await resolveCandidateChoice(db, 'new@x.com', { kind: 'existing', candidateId: 'any' }))
      .toEqual({ ok: true, choice: { kind: 'new' } });
  });
});

describe('priorOutcomeAtBooking — warn about a decision taken BEFORE the booking (#6)', () => {
  const booked = '2026-09-20T10:00:00Z';
  it('warns when the person was already rejected or hired', () => {
    expect(priorOutcomeAtBooking('rejected', '2026-09-01T00:00:00Z', booked)).toBe('rejected');
    expect(priorOutcomeAtBooking('joined', '2026-08-01T00:00:00Z', booked)).toBe('joined');
  });
  it('does NOT warn when the decision came after the booking — that is this interview\'s outcome', () => {
    expect(priorOutcomeAtBooking('rejected', '2026-09-21T00:00:00Z', booked)).toBeNull();
  });
  it('warns when no decision time was recorded — possibly stale beats silently missing', () => {
    expect(priorOutcomeAtBooking('rejected', null, booked)).toBe('rejected');
  });
  it('says nothing for any other status', () => {
    for (const s of ['submitted', 'approved', 'offer_issued', 'withdrawn', 'no_show']) {
      expect(priorOutcomeAtBooking(s, null, booked)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Review fixes, 2026-09-24
// ---------------------------------------------------------------------------

import {
  ROUND_STATUSES,
  interviewModeFor,
  normalizePhone,
  recordInterviewBooking,
  type RecordInterviewInput,
} from '@/lib/services/hr/interview-booking-service';

describe('findCandidatesByEmail — a "*" cannot turn the lookup into a wildcard (review #1)', () => {
  it('refuses an address containing "*" without querying at all', async () => {
    const { db, calls } = fakeDb({ data: [], error: null });
    for (const email of ['*@*.*', 'a*@x.com', '*']) {
      expect(await findCandidatesByEmail(db, email)).toEqual([]);
    }
    expect(calls).toHaveLength(0);
  });
  it('drops any row whose address is not exactly the typed one, whatever the query returned', async () => {
    const { db } = fakeDb({
      data: [
        { id: 'mine', name: 'A', role_title: 'Accounts Officer', status: 'submitted', email: 'Me@X.com ' },
        { id: 'not-mine', name: 'B', role_title: 'Office Assistant', status: 'submitted', email: 'someone-else@x.com' },
      ],
      error: null,
    });
    const rows = await findCandidatesByEmail(db, 'me@x.com');
    expect(rows.map((r) => r.id)).toEqual(['mine']);
    expect(rows[0]).not.toHaveProperty('email');
  });
});

describe('interviewModeFor — the meeting type decides, not a link that may arrive later (review #5)', () => {
  it('maps each location mode', () => {
    expect(interviewModeFor('online')).toBe('video');
    expect(interviewModeFor('phone')).toBe('phone');
    expect(interviewModeFor('in_person')).toBe('in_person');
  });
});

/**
 * A query-builder double that records every call per table and resolves each
 * awaited chain from a queue keyed by `${table}:${op}` (op = insert | select | update).
 */
function recordingDb(results: Record<string, Array<{ data?: unknown; error?: unknown; count?: number }>>) {
  const log: Array<{ table: string; op: string; calls: Array<[string, unknown[]]> }> = [];
  const from = (table: string) => {
    const entry = { table, op: 'select', calls: [] as Array<[string, unknown[]]> };
    log.push(entry);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'insert', 'update', 'eq', 'in', 'is', 'order', 'limit', 'single', 'maybeSingle']) {
      chain[m] = (...args: unknown[]) => {
        entry.calls.push([m, args]);
        if (m === 'insert' || m === 'update') entry.op = m;
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => {
      const q = results[`${table}:${entry.op}`] ?? [];
      resolve(q.shift() ?? { data: null, error: null });
    };
    return chain;
  };
  return { db: { from } as never, log };
}

const baseInput = (over: Partial<RecordInterviewInput> = {}): RecordInterviewInput => ({
  booking: { id: 'bk-1', start: '2026-10-01T04:30:00Z', end: '2026-10-01T05:00:00Z', videoUrl: null },
  locationMode: 'online',
  hostProfileId: 'host-1',
  createdBy: 'host-1',
  post: { id: 'job-1', title: 'Accounts Officer', role_category: 'non_teaching', institution_id: 'inst-1', hr_organization_id: 'org-1', status: 'open' },
  person: { name: 'Cand', email: 'Cand@X.com', phone: '9000000001' },
  answers: { currentJob: 'x', payExpectation: 'y', whyThisRole: 'z'.repeat(25) },
  choice: { kind: 'existing', candidateId: 'cand-1' },
  ...over,
});

describe('recordInterviewBooking', () => {
  it('counts only real sittings for the round — a cancelled or HR-rescheduled row is not a round (review #3)', async () => {
    const { db, log } = recordingDb({
      'hr_recruitment_interviews:select': [{ count: 1, error: null }],
      'hr_recruitment_interviews:insert': [{ data: { id: 'iv-1' }, error: null }],
    });
    const r = await recordInterviewBooking(db, baseInput());
    expect(r).toEqual({ success: true, candidateId: 'cand-1', interviewId: 'iv-1', round: 2, createdCandidate: false });
    const count = log.find((e) => e.table === 'hr_recruitment_interviews' && e.op === 'select');
    expect(count?.calls).toContainEqual(['in', ['status', ROUND_STATUSES]]);
    expect(ROUND_STATUSES).toEqual(['scheduled', 'completed', 'no_show']);
  });

  it('files an online interview as video even when no link exists yet (review #5)', async () => {
    const { db, log } = recordingDb({
      'hr_recruitment_interviews:select': [{ count: 0, error: null }],
      'hr_recruitment_interviews:insert': [{ data: { id: 'iv-1' }, error: null }],
    });
    await recordInterviewBooking(db, baseInput({ locationMode: 'online' }));
    const insert = log.find((e) => e.table === 'hr_recruitment_interviews' && e.op === 'insert');
    const row = insert?.calls.find(([m]) => m === 'insert')?.[1][0] as Record<string, unknown>;
    expect(row.mode).toBe('video');
    expect(row.panel_member_ids).toEqual(['host-1']);
    expect(row.booking_id).toBe('bk-1');
  });

  it('closes call-back requests by email, and by phone ONLY on requests that carry no email (review #4)', async () => {
    const { db, log } = recordingDb({
      'hr_recruitment_interviews:select': [{ count: 0, error: null }],
      'hr_recruitment_interviews:insert': [{ data: { id: 'iv-1' }, error: null }],
      // The phone candidates: open, this post, NO email. Stored as typed.
      'hr_interview_callback_requests:select': [
        { data: [{ id: 'cb-same', phone: '+91 90000 00001' }, { id: 'cb-other', phone: '98888 88888' }], error: null },
      ],
    });
    await recordInterviewBooking(db, baseInput());
    const cb = log.filter((e) => e.table === 'hr_interview_callback_requests');

    const byEmail = cb.find((e) => e.op === 'update' && e.calls.some(([m, a]) => m === 'eq' && a[0] === 'email'));
    expect(byEmail?.calls).toContainEqual(['eq', ['email', 'cand@x.com']]);
    expect(byEmail?.calls).toContainEqual(['eq', ['job_id', 'job-1']]);
    expect(byEmail?.calls).toContainEqual(['eq', ['status', 'open']]);

    // Phone: only requests with no email are even read …
    const read = cb.find((e) => e.op === 'select');
    expect(read?.calls).toContainEqual(['is', ['email', null]]);
    expect(read?.calls).toContainEqual(['eq', ['job_id', 'job-1']]);
    // … and only the one whose number is the SAME number, however it was typed, is closed.
    const byPhone = cb.find((e) => e.op === 'update' && e.calls.some(([m]) => m === 'in'));
    expect(byPhone?.calls).toContainEqual(['in', ['id', ['cb-same']]]);
  });

  it('does not attempt a phone close when no phone was given', async () => {
    const { db, log } = recordingDb({
      'hr_recruitment_interviews:select': [{ count: 0, error: null }],
      'hr_recruitment_interviews:insert': [{ data: { id: 'iv-1' }, error: null }],
    });
    await recordInterviewBooking(db, baseInput({ person: { name: 'C', email: 'c@x.com', phone: null } }));
    expect(log.filter((e) => e.table === 'hr_interview_callback_requests')).toHaveLength(1);
  });
});

describe('normalizePhone — a comparison key, never stored or dialled (review #6)', () => {
  it('meets the common spellings of one Indian mobile number', () => {
    for (const p of ['+91 90000 00001', '9000000001', '09000000001', '919000000001', '90000-00001', '(900) 000-0001']) {
      expect(normalizePhone(p)).toBe('9000000001');
    }
  });
  it('keeps different numbers different, and blank as blank', () => {
    expect(normalizePhone('98888 88888')).not.toBe(normalizePhone('9000000001'));
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
  });
});
