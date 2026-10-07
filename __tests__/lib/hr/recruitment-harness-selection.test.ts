import { describe, it, expect } from 'vitest';
import {
  buildStepReadyNudge,
  goLiveFromPolicy,
  indexSent,
  istDate,
  resolveStepApprovers,
  selectApprovalNudges,
  selectOfferNudges,
  selectScorecardNudges,
  userReachesInstitution,
  type Directory,
  type DirectoryUser,
  type HarnessCandidate,
  type HarnessInterview,
  type SentNudge,
} from '@/lib/hr/recruitment/harness-selection';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-10T04:00:00Z'); // 09:30 IST
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
/** Go-live well before every fixture, so the older tests see the cutoff as open. */
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

const COLLEGE_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const COLLEGE_A_SIBLING = 'aaaaaaaa-0000-0000-0000-000000000002';
const COLLEGE_B = 'bbbbbbbb-0000-0000-0000-000000000001';

function user(id: string, over: Partial<DirectoryUser> = {}): DirectoryUser {
  return {
    id,
    fullName: id,
    institutionId: COLLEGE_A,
    active: true,
    isSuperAdmin: false,
    roleKeys: [],
    allScope: false,
    grantInstitutionIds: [],
    canEditRecruitment: false,
    ...over,
  };
}

function directory(users: DirectoryUser[]): Directory {
  return {
    users: new Map(users.map((u) => [u.id, u])),
    counsellingCodeOf: new Map([
      [COLLEGE_A, 'CAS1'],
      [COLLEGE_A_SIBLING, 'CAS1'],
    ]),
    roleNameOf: new Map([
      ['hod', 'HOD'],
      ['hr_head', 'HR Head'],
      ['principal', 'Principal'],
    ]),
  };
}

const DIR = directory([
  user('hod-a', { roleKeys: ['hod'] }),
  user('hod-b', { roleKeys: ['hod'], institutionId: COLLEGE_B }),
  user('hod-b-granted', { roleKeys: ['hod'], institutionId: COLLEGE_B, grantInstitutionIds: [COLLEGE_A] }),
  user('hod-sibling', { roleKeys: ['hod'], institutionId: COLLEGE_A_SIBLING }),
  user('hod-inactive', { roleKeys: ['hod'], active: false }),
  user('principal-all', { roleKeys: ['principal'], institutionId: COLLEGE_B, allScope: true }),
  user('hr-head', { roleKeys: ['hr_head'], allScope: true }),
  user('pinned', { institutionId: COLLEGE_B }),
  user('creator-editor', { canEditRecruitment: true }),
  user('creator-no-edit', { canEditRecruitment: false }),
  user('panel-1'),
  user('panel-2'),
  user('panel-gone', { active: false }),
]);

function candidate(over: Partial<HarnessCandidate> = {}): HarnessCandidate {
  return {
    id: 'cand-1',
    name: 'Priya S',
    role_title: 'Accountant',
    status: 'pending_approval',
    institution_id: COLLEGE_A,
    approval_chain: [
      { approver_role: 'hod', status: 'pending', escalate_after_hours: 72 },
      { approver_role: 'principal', status: 'pending', escalate_after_hours: 72 },
    ],
    current_step: 0,
    submitted_at: hoursAgo(100),
    final_decided_at: null,
    expected_joining_date: null,
    actual_joining_date: null,
    offer_issued_at: null,
    job_id: null,
    ...over,
  };
}

const sentOf = (...rows: SentNudge[]) => indexSent(rows);

// ---------------------------------------------------------------------------
// Who is the step's approver
// ---------------------------------------------------------------------------

describe('resolveStepApprovers', () => {
  it('routes a pinned step to that one person, whatever their college', () => {
    expect(
      resolveStepApprovers({ approver_role: 'hod', approver_user_id: 'pinned', status: 'pending' }, COLLEGE_A, DIR),
    ).toEqual(['pinned']);
  });

  it('tells nobody when the pinned person is deactivated', () => {
    expect(
      resolveStepApprovers({ approver_user_id: 'hod-inactive', status: 'pending' }, COLLEGE_A, DIR),
    ).toEqual([]);
  });

  it('confines a role step to holders who can reach the candidate college, as the decide RPC does', () => {
    expect(resolveStepApprovers({ approver_role: 'HOD', status: 'pending' }, COLLEGE_A, DIR)).toEqual([
      'hod-a',
      'hod-b-granted',
      'hod-sibling',
    ]);
  });

  it('lets an all-scope role reach every college', () => {
    expect(resolveStepApprovers({ approver_role: 'principal', status: 'pending' }, COLLEGE_A, DIR)).toEqual([
      'principal-all',
    ]);
  });

  it('treats a candidate with no college as reachable by every holder', () => {
    expect(resolveStepApprovers({ approver_role: 'hod', status: 'pending' }, null, DIR)).toEqual([
      'hod-a',
      'hod-b',
      'hod-b-granted',
      'hod-sibling',
    ]);
  });

  it('does not treat a blank counselling code as a sibling link', () => {
    const dir = directory([user('x', { institutionId: COLLEGE_B })]);
    dir.counsellingCodeOf.clear();
    expect(userReachesInstitution(dir.users.get('x')!, COLLEGE_A, dir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R5 — approval reminder, then HR Head
// ---------------------------------------------------------------------------

describe('selectApprovalNudges', () => {
  it('says nothing before the step deadline', () => {
    const c = candidate({ submitted_at: hoursAgo(71) });
    expect(selectApprovalNudges([c], sentOf(), DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('reminds the step approver once the step deadline has passed', () => {
    const [n] = selectApprovalNudges([candidate({ submitted_at: hoursAgo(73) })], sentOf(), DIR, NOW, LONG_AGO);
    expect(n.kind).toBe('approval_reminder');
    expect(n.refKey).toBe('cand-1:0');
    expect(n.recipients).toEqual(['hod-a', 'hod-b-granted', 'hod-sibling']);
    expect(n.title).toContain('Priya S');
  });

  it('honours the step\'s own frozen escalate_after_hours', () => {
    const c = candidate({
      submitted_at: hoursAgo(30),
      approval_chain: [{ approver_role: 'hod', status: 'pending', escalate_after_hours: 24 }],
    });
    expect(selectApprovalNudges([c], sentOf(), DIR, NOW, LONG_AGO).map((n) => n.kind)).toEqual(['approval_reminder']);
  });

  it('times a later step from when the previous step was decided, not from submission', () => {
    const c = candidate({
      submitted_at: hoursAgo(500),
      current_step: 1,
      approval_chain: [
        { approver_role: 'hod', status: 'approved', decided_at: hoursAgo(10), escalate_after_hours: 72 },
        { approver_role: 'principal', status: 'pending', escalate_after_hours: 72 },
      ],
    });
    expect(selectApprovalNudges([c], sentOf(), DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('skips candidates that are no longer waiting for approval', () => {
    for (const status of ['approved', 'rejected', 'withdrawn', 'package_fixed']) {
      expect(selectApprovalNudges([candidate({ status, submitted_at: hoursAgo(300) })], sentOf(), DIR, NOW, LONG_AGO)).toEqual([]);
    }
  });

  it('sends only the reminder on the first run for a long-stuck step — the HR Head waits 48 hours more', () => {
    const out = selectApprovalNudges([candidate({ submitted_at: hoursAgo(24 * 30) })], sentOf(), DIR, NOW, LONG_AGO);
    expect(out.map((n) => n.kind)).toEqual(['approval_reminder']);
  });

  it('does not repeat the reminder, and holds the escalation until 48 hours after it', () => {
    const c = candidate({ submitted_at: hoursAgo(200) });
    const reminded = { kind: 'approval_reminder' as const, ref_key: 'cand-1:0', sent_at: hoursAgo(47) };
    expect(selectApprovalNudges([c], sentOf(reminded), DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('tells the HR Head 48 hours after the reminder, once', () => {
    const c = candidate({ submitted_at: hoursAgo(200) });
    const reminded = { kind: 'approval_reminder' as const, ref_key: 'cand-1:0', sent_at: hoursAgo(49) };
    const [n] = selectApprovalNudges([c], sentOf(reminded), DIR, NOW, LONG_AGO);
    expect(n.kind).toBe('approval_escalation');
    expect(n.recipients).toEqual(['hr-head']);
    expect(n.url).toBe('/hr/recruitment/candidates/cand-1');

    const escalated = { kind: 'approval_escalation' as const, ref_key: 'cand-1:0', sent_at: hoursAgo(1) };
    expect(selectApprovalNudges([c], sentOf(reminded, escalated), DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('still reaches the HR Head when nobody could decide the step', () => {
    const c = candidate({
      submitted_at: hoursAgo(200),
      approval_chain: [{ approver_role: 'board', status: 'pending', escalate_after_hours: 72 }],
    });
    const [reminder] = selectApprovalNudges([c], sentOf(), DIR, NOW, LONG_AGO);
    expect(reminder.recipients).toEqual([]);

    const recorded = { kind: 'approval_reminder' as const, ref_key: 'cand-1:0', sent_at: hoursAgo(50) };
    const [escalation] = selectApprovalNudges([c], sentOf(recorded), DIR, NOW, LONG_AGO);
    expect(escalation.kind).toBe('approval_escalation');
    expect(escalation.recipients).toEqual(['hr-head']);
    expect(escalation.body).toContain('reached no one');
  });

  it('treats the next step as a fresh clock with its own reminder', () => {
    const c = candidate({
      current_step: 1,
      approval_chain: [
        { approver_role: 'hod', status: 'approved', decided_at: hoursAgo(80), escalate_after_hours: 72 },
        { approver_role: 'principal', status: 'pending', escalate_after_hours: 72 },
      ],
    });
    const oldStep = { kind: 'approval_reminder' as const, ref_key: 'cand-1:0', sent_at: hoursAgo(100) };
    const [n] = selectApprovalNudges([c], sentOf(oldStep), DIR, NOW, LONG_AGO);
    expect(n.kind).toBe('approval_reminder');
    expect(n.refKey).toBe('cand-1:1');
    expect(n.recipients).toEqual(['principal-all']);
  });
});

// ---------------------------------------------------------------------------
// R6 — scorecards
// ---------------------------------------------------------------------------

describe('selectScorecardNudges', () => {
  const interview = (over: Partial<HarnessInterview> = {}): HarnessInterview => ({
    id: 'iv-1',
    candidate_id: 'cand-1',
    round_number: 1,
    round_name: 'Demo class',
    scheduled_at: hoursAgo(25),
    status: 'completed',
    panel_member_ids: ['panel-1', 'panel-2', 'panel-1'],
    ...over,
  });
  const cands = new Map([['cand-1', { id: 'cand-1', name: 'Priya S', role_title: 'Accountant', status: 'approved' }]]);

  it('waits 24 hours after the interview', () => {
    expect(selectScorecardNudges([interview({ scheduled_at: hoursAgo(23) })], new Set(), cands, sentOf(), DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('nudges each panel member whose scorecard is missing, once per person', () => {
    const out = selectScorecardNudges([interview()], new Set(['iv-1:panel-2']), cands, sentOf(), DIR, NOW, LONG_AGO);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'scorecard_missing',
      refKey: 'iv-1:panel-1',
      recipients: ['panel-1'],
      url: '/hr/recruitment/interviews/iv-1',
    });
  });

  it('never repeats a scorecard nudge', () => {
    const sent = sentOf(
      { kind: 'scorecard_missing', ref_key: 'iv-1:panel-1', sent_at: hoursAgo(1) },
      { kind: 'scorecard_missing', ref_key: 'iv-1:panel-2', sent_at: hoursAgo(1) },
    );
    expect(selectScorecardNudges([interview()], new Set(), cands, sent, DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('ignores cancelled and rescheduled interviews, and ones older than the lookback', () => {
    const out = selectScorecardNudges(
      [
        interview({ id: 'a', status: 'cancelled' }),
        interview({ id: 'b', status: 'rescheduled' }),
        interview({ id: 'c', scheduled_at: hoursAgo(24 * 15) }),
      ],
      new Set(),
      cands,
      sentOf(),
      DIR,
      NOW,
      LONG_AGO,
    );
    expect(out).toEqual([]);
  });

  it('does not chase a scorecard for a candidate who was rejected or withdrew', () => {
    const rejected = new Map([['cand-1', { id: 'cand-1', name: 'Priya S', role_title: '', status: 'rejected' }]]);
    expect(selectScorecardNudges([interview()], new Set(), rejected, sentOf(), DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('records a nudge with no recipient for a deactivated panel member, so it is not retried every day', () => {
    const [n] = selectScorecardNudges([interview({ panel_member_ids: ['panel-gone'] })], new Set(), cands, sentOf(), DIR, NOW, LONG_AGO);
    expect(n.recipients).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// R8 — offer and joining
// ---------------------------------------------------------------------------

describe('selectOfferNudges', () => {
  const editors = new Map([[COLLEGE_A, ['hr-1', 'hr-2']]]);
  const jobs = new Map<string, string | null>([
    ['job-editor', 'creator-editor'],
    ['job-no-edit', 'creator-no-edit'],
    ['job-no-creator', null],
  ]);

  it('waits two days after the package is fixed', () => {
    const c = candidate({ status: 'package_fixed' });
    const fixed = new Map([['cand-1', hoursAgo(47)]]);
    expect(selectOfferNudges([c], fixed, jobs, editors, sentOf(), DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('nudges the job creator when they can still edit recruitment', () => {
    const c = candidate({ status: 'package_fixed', job_id: 'job-editor' });
    const [n] = selectOfferNudges([c], new Map([['cand-1', hoursAgo(49)]]), jobs, editors, sentOf(), DIR, NOW, LONG_AGO);
    expect(n).toMatchObject({
      kind: 'offer_not_issued',
      refKey: 'cand-1',
      recipients: ['creator-editor'],
      url: '/hr/recruitment/approvals/job-editor',
    });
  });

  it('falls back to the college HR editors when the creator cannot act or there is no job', () => {
    for (const job_id of ['job-no-edit', 'job-no-creator', null]) {
      const c = candidate({ status: 'package_fixed', job_id });
      const [n] = selectOfferNudges([c], new Map([['cand-1', hoursAgo(72)]]), jobs, editors, sentOf(), DIR, NOW, LONG_AGO);
      expect(n.recipients).toEqual(['hr-1', 'hr-2']);
    }
  });

  it('falls back to the final approval time when no approved package row carries a time', () => {
    const c = candidate({ status: 'package_fixed', final_decided_at: hoursAgo(10), submitted_at: hoursAgo(900) });
    expect(selectOfferNudges([c], new Map(), jobs, editors, sentOf(), DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('never repeats the offer nudge', () => {
    const c = candidate({ status: 'package_fixed' });
    const sent = sentOf({ kind: 'offer_not_issued', ref_key: 'cand-1', sent_at: hoursAgo(5) });
    expect(selectOfferNudges([c], new Map([['cand-1', hoursAgo(99)]]), jobs, editors, sent, DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('asks for the joining outcome two days after the joining date (India time), keyed on the date', () => {
    // NOW is 10 Oct in India. Joining 8 Oct -> due; 9 Oct -> not yet.
    const due = candidate({ status: 'offer_issued', expected_joining_date: '2026-10-08' });
    const notYet = candidate({ id: 'cand-2', status: 'offer_issued', expected_joining_date: '2026-10-09' });
    const out = selectOfferNudges([due, notYet], new Map(), jobs, editors, sentOf(), DIR, NOW, LONG_AGO);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'joining_outcome_missing', refKey: 'cand-1:2026-10-08', recipients: ['hr-1', 'hr-2'] });
  });

  it('does not ask when the joining is recorded, or there is no joining date', () => {
    const joined = candidate({ status: 'offer_issued', expected_joining_date: '2026-09-01', actual_joining_date: '2026-09-01' });
    const undated = candidate({ id: 'cand-2', status: 'offer_issued' });
    expect(selectOfferNudges([joined, undated], new Map(), jobs, editors, sentOf(), DIR, NOW, LONG_AGO)).toEqual([]);
  });

  it('asks again only if HR moves the joining date', () => {
    const c = candidate({ status: 'offer_issued', expected_joining_date: '2026-10-01' });
    const sent = sentOf({ kind: 'joining_outcome_missing', ref_key: 'cand-1:2026-09-20', sent_at: hoursAgo(300) });
    expect(selectOfferNudges([c], new Map(), jobs, editors, sent, DIR, NOW, LONG_AGO).map((n) => n.refKey)).toEqual(['cand-1:2026-10-01']);
  });
});

// ---------------------------------------------------------------------------
// Step-ready notice on approve
// ---------------------------------------------------------------------------

describe('buildStepReadyNudge', () => {
  const advanced = candidate({
    current_step: 1,
    approval_chain: [
      { approver_role: 'hod', status: 'approved', decided_at: hoursAgo(0), escalate_after_hours: 72 },
      { approver_role: 'principal', status: 'pending', escalate_after_hours: 48 },
    ],
  });

  it('tells the next step\'s approver, leaving out whoever just acted', () => {
    const n = buildStepReadyNudge(advanced, 'hod-a', 'Dr Kumar', DIR)!;
    expect(n.recipients).toEqual(['principal-all']);
    expect(n.stepIndex).toBe(1);
    expect(n.body).toContain('Dr Kumar approved step 1 of 2');
    expect(n.body).toContain('48 hours');
    expect(buildStepReadyNudge(advanced, 'principal-all', 'P', DIR)!.recipients).toEqual([]);
  });

  it('sends nothing once the chain has finished', () => {
    expect(buildStepReadyNudge({ ...advanced, status: 'approved', current_step: 2 }, 'x', 'X', DIR)).toBeNull();
  });
});

describe('istDate', () => {
  it('rolls to the next day after 18:30 UTC', () => {
    expect(istDate(new Date('2026-10-01T18:29:00Z'))).toBe('2026-10-01');
    expect(istDate(new Date('2026-10-01T18:31:00Z'))).toBe('2026-10-02');
  });
});

// ---------------------------------------------------------------------------
// Go-live cutoff (Director, 7 Oct 2026): no reminders about items from before go-live
// ---------------------------------------------------------------------------

describe('go-live cutoff', () => {
  // Go-live 10 days before NOW. Every item below is overdue by its own rule;
  // only when its wait STARTED decides whether it is nudged.
  const GO_LIVE = new Date(NOW.getTime() - 10 * 24 * 3600_000);
  const before = hoursAgo(11 * 24); // a day before go-live
  const after = hoursAgo(9 * 24); // a day after go-live
  const cands = new Map([['cand-1', candidate()]]);
  const jobs = new Map([['job-1', 'creator-editor']]);
  const editors = new Map<string, string[]>();
  const interview = (over: Partial<HarnessInterview> = {}): HarnessInterview => ({
    id: 'iv-1',
    candidate_id: 'cand-1',
    round_number: 1,
    round_name: 'Demo class',
    scheduled_at: hoursAgo(25),
    status: 'completed',
    panel_member_ids: ['panel-1'],
    ...over,
  });

  function allKinds(startedAt: string, goLiveAt: Date) {
    const joining = startedAt.slice(0, 10);
    return [
      ...selectApprovalNudges([candidate({ submitted_at: startedAt })], sentOf(), DIR, NOW, goLiveAt),
      ...selectScorecardNudges([interview({ scheduled_at: startedAt })], new Set(), cands, sentOf(), DIR, NOW, goLiveAt),
      ...selectOfferNudges(
        [
          candidate({ id: 'cand-p', status: 'package_fixed', job_id: 'job-1' }),
          candidate({ id: 'cand-j', status: 'offer_issued', expected_joining_date: joining, actual_joining_date: null }),
        ],
        new Map([['cand-p', startedAt]]),
        jobs, editors, sentOf(), DIR, NOW, goLiveAt,
      ),
    ].map((n) => n.kind).sort();
  }

  const EVERY_KIND = ['approval_reminder', 'joining_outcome_missing', 'offer_not_issued', 'scorecard_missing'];

  it('(a) an item that started waiting BEFORE go-live gets no reminder', () => {
    expect(allKinds(before, GO_LIVE)).toEqual([]);
  });

  it('(b) an item that started waiting AFTER go-live is reminded as before', () => {
    expect(allKinds(after, GO_LIVE)).toEqual(EVERY_KIND);
  });

  it('(b) a later approval step of an old candidate counts from when THAT step began', () => {
    const c = candidate({
      submitted_at: hoursAgo(30 * 24),
      current_step: 1,
      approval_chain: [
        { approver_role: 'hod', status: 'approved', decided_at: after },
        { approver_role: 'principal', status: 'pending', escalate_after_hours: 72 },
      ],
    });
    expect(selectApprovalNudges([c], sentOf(), DIR, NOW, GO_LIVE).map((n) => n.kind)).toEqual(['approval_reminder']);
  });

  it('(c) with the cutoff row missing or unreadable, go-live is NOW and old items get none', () => {
    for (const stored of [undefined, null, 'not a date', 42, {}]) {
      expect(goLiveFromPolicy(stored, NOW)).toEqual(NOW);
      expect(allKinds(before, goLiveFromPolicy(stored, NOW))).toEqual([]);
      expect(allKinds(after, goLiveFromPolicy(stored, NOW))).toEqual([]);
    }
  });

  it('reads the timestamp Postgres stores with to_jsonb(now())', () => {
    expect(goLiveFromPolicy('2026-10-07T10:55:12.123456+00:00', NOW).toISOString()).toBe('2026-10-07T10:55:12.123Z');
  });
});
