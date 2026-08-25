import { describe, it, expect } from 'vitest';
import {
  FREQUENCY_DAYS,
  activeMetricsForBody,
  buildDigestPreview,
  computeOwnerDigest,
  isDigestDue,
  metricsWithEvidence,
  nextSubmissionDeadline,
  resolveMetricOwners,
  shouldSendDigest,
  type DigestConfigRow,
  type EvidenceRow,
  type FrameworkMetric,
  type OwnerRow,
  type SubmissionRow,
} from '@/lib/services/accreditation/owner-digest';

// ---------------------------------------------------------------------------
// Fixtures. Shapes are the LIVE production ones (probed 2026-08-02):
// accreditation_metric_owners.metric_code is nullable and the table carries
// programme_id / assignment_status, none of which the merged migration shows.
// ---------------------------------------------------------------------------

const INST = '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334';
const OTHER_INST = '29c221d1-b918-4c46-9d67-857273b0b553';
const ALICE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000002';
const NOW = new Date('2026-08-02T09:00:00Z');

function owner(over: Partial<OwnerRow> & Pick<OwnerRow, 'id'>): OwnerRow {
  return {
    institution_id: INST,
    body_code: 'NAAC',
    metric_code: null,
    programme_id: null,
    owner_user_id: ALICE,
    assignment_status: 'confirmed',
    created_at: '2026-08-01T00:00:00Z',
    ...over,
  };
}

function metric(code: string, over: Partial<FrameworkMetric> = {}): FrameworkMetric {
  return {
    metric_code: code,
    metric_type: 'NAAC',
    metric_name: `Metric ${code}`,
    category: 'Curricular Aspects',
    is_active: true,
    ...over,
  };
}

function config(over: Partial<DigestConfigRow> = {}): DigestConfigRow {
  return {
    id: 'cfg-1',
    user_id: ALICE,
    institution_id: INST,
    body_code: 'NAAC',
    is_enabled: true,
    email: 'alice@jkkn.ac.in',
    frequency: 'weekly',
    last_sent_at: null,
    ...over,
  };
}

const METRICS = [metric('1.1.1'), metric('1.1.2'), metric('3.1.1')];

// ---------------------------------------------------------------------------
describe('isDigestDue — every uncertain branch stays quiet', () => {
  it('is due when it has never been sent', () => {
    const v = isDigestDue(config({ last_sent_at: null }), NOW);
    expect(v).toMatchObject({ due: true, reason: 'never_sent', intervalDays: 7 });
  });

  it('is not due when the config is disabled', () => {
    expect(isDigestDue(config({ is_enabled: false }), NOW).due).toBe(false);
  });

  it('is not due before the interval elapses', () => {
    const v = isDigestDue(config({ last_sent_at: '2026-07-30T09:00:00Z' }), NOW);
    expect(v.due).toBe(false);
    expect(v.reason).toBe('interval_not_elapsed');
    expect(v.daysSinceLastSent).toBe(3);
  });

  it('is due exactly on the boundary, not a moment before', () => {
    const justUnder = isDigestDue(config({ last_sent_at: '2026-07-26T09:00:01Z' }), NOW);
    const exactly = isDigestDue(config({ last_sent_at: '2026-07-26T09:00:00Z' }), NOW);
    expect(justUnder.due).toBe(false);
    expect(exactly.due).toBe(true);
  });

  it('honours each frequency', () => {
    // 10 days ago: daily/weekly have elapsed, fortnightly/monthly have not.
    const tenDaysAgo = '2026-07-23T09:00:00Z';
    expect(isDigestDue(config({ frequency: 'daily', last_sent_at: tenDaysAgo }), NOW).due).toBe(true);
    expect(isDigestDue(config({ frequency: 'weekly', last_sent_at: tenDaysAgo }), NOW).due).toBe(true);
    expect(isDigestDue(config({ frequency: 'fortnightly', last_sent_at: tenDaysAgo }), NOW).due).toBe(false);
    expect(isDigestDue(config({ frequency: 'monthly', last_sent_at: tenDaysAgo }), NOW).due).toBe(false);
    expect(FREQUENCY_DAYS.monthly).toBe(30);
  });

  it('refuses to send on a future last_sent_at rather than treating it as long ago', () => {
    const v = isDigestDue(config({ last_sent_at: '2027-01-01T00:00:00Z' }), NOW);
    expect(v.due).toBe(false);
    expect(v.reason).toBe('last_sent_in_future');
  });

  it('refuses to send on an unparseable last_sent_at', () => {
    const v = isDigestDue(config({ last_sent_at: 'not-a-date' }), NOW);
    expect(v.due).toBe(false);
    expect(v.reason).toBe('last_sent_unparseable');
  });

  it('refuses to send on a frequency it does not recognise', () => {
    const v = isDigestDue(config({ frequency: 'hourly' }), NOW);
    expect(v.due).toBe(false);
    expect(v.reason).toBe('unknown_frequency');
  });
});

// ---------------------------------------------------------------------------
describe('resolveMetricOwners — inheritance, override, and scope', () => {
  it('a NULL metric_code row owns every metric of that body', () => {
    const resolved = resolveMetricOwners([owner({ id: 'o1' })], METRICS, INST, 'NAAC');
    expect(resolved.size).toBe(3);
    for (const code of ['1.1.1', '1.1.2', '3.1.1']) {
      expect(resolved.get(code)).toMatchObject({ ownerUserId: ALICE, source: 'inherited' });
    }
  });

  it('an explicit row overrides the inherited body owner for that metric only', () => {
    const resolved = resolveMetricOwners(
      [owner({ id: 'o1' }), owner({ id: 'o2', metric_code: '3.1.1', owner_user_id: BOB })],
      METRICS,
      INST,
      'NAAC',
    );
    expect(resolved.get('3.1.1')).toMatchObject({ ownerUserId: BOB, source: 'explicit' });
    expect(resolved.get('1.1.1')).toMatchObject({ ownerUserId: ALICE, source: 'inherited' });
  });

  it('a programme-scoped row never satisfies institution-level ownership', () => {
    const resolved = resolveMetricOwners(
      [owner({ id: 'o1', programme_id: 'prog-1', owner_user_id: BOB })],
      METRICS,
      INST,
      'NAAC',
    );
    expect(resolved.size).toBe(0);
  });

  it('ignores rows belonging to another institution or another body', () => {
    const resolved = resolveMetricOwners(
      [
        owner({ id: 'o1', institution_id: OTHER_INST }),
        owner({ id: 'o2', body_code: 'NIRF' }),
      ],
      METRICS,
      INST,
      'NAAC',
    );
    expect(resolved.size).toBe(0);
  });

  it('picks the oldest body-owner row deterministically if the unique index ever fails', () => {
    const rows = [
      owner({ id: 'zzz', created_at: '2026-08-01T00:00:00Z', owner_user_id: BOB }),
      owner({ id: 'aaa', created_at: '2026-07-01T00:00:00Z', owner_user_id: ALICE }),
    ];
    expect(resolveMetricOwners(rows, METRICS, INST, 'NAAC').get('1.1.1')?.ownerUserId).toBe(ALICE);
    // Same answer whatever order the rows arrive in.
    expect(resolveMetricOwners([...rows].reverse(), METRICS, INST, 'NAAC').get('1.1.1')?.ownerUserId).toBe(ALICE);
  });

  it('carries the assignment status through rather than assuming acceptance', () => {
    const resolved = resolveMetricOwners([owner({ id: 'o1', assignment_status: 'pending' })], METRICS, INST, 'NAAC');
    expect(resolved.get('1.1.1')?.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
describe('activeMetricsForBody — mirrors .eq(is_active, true)', () => {
  it('excludes inactive metrics and NULL is_active, which the platform filter also excludes', () => {
    const rows = [metric('1.1.1'), metric('1.1.2', { is_active: false }), metric('1.1.3', { is_active: null })];
    expect(activeMetricsForBody(rows, 'NAAC').map((m) => m.metric_code)).toEqual(['1.1.1']);
  });

  it('scopes to the body, since metric_type IS the body', () => {
    const rows = [metric('1.1.1'), metric('R.1', { metric_type: 'NIRF' })];
    expect(activeMetricsForBody(rows, 'NIRF').map((m) => m.metric_code)).toEqual(['R.1']);
  });
});

// ---------------------------------------------------------------------------
describe('metricsWithEvidence', () => {
  const evidence: EvidenceRow[] = [
    { institution_id: INST, body_code: 'NAAC', metric_code: '1.1.1' },
    { institution_id: INST, body_code: 'NAAC', metric_code: '1.1.1' },
    { institution_id: OTHER_INST, body_code: 'NAAC', metric_code: '1.1.2' },
    { institution_id: INST, body_code: 'NIRF', metric_code: '3.1.1' },
  ];

  it('counts a metric as covered on one row, scoped to institution and body', () => {
    const covered = metricsWithEvidence(evidence, INST, 'NAAC');
    expect([...covered]).toEqual(['1.1.1']);
  });

  it('ignores an evidence row with no metric_code — it proves nothing about any metric', () => {
    const covered = metricsWithEvidence(
      [{ institution_id: INST, body_code: 'NAAC', metric_code: null }],
      INST,
      'NAAC',
    );
    expect(covered.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('nextSubmissionDeadline', () => {
  const base: SubmissionRow = {
    institution_id: INST,
    body_code: 'NAAC',
    due_date: '2026-09-01',
    status: 'draft',
    period_label: 'AY 2026-27',
  };

  it('picks the soonest open deadline', () => {
    const d = nextSubmissionDeadline(
      [base, { ...base, due_date: '2026-08-12' }, { ...base, due_date: '2026-12-01' }],
      INST,
      'NAAC',
      NOW,
    );
    expect(d?.dueDate).toBe('2026-08-12');
    expect(d?.daysUntilDue).toBe(10);
  });

  it('ignores submissions that are already accepted or withdrawn', () => {
    const d = nextSubmissionDeadline(
      [{ ...base, due_date: '2026-08-05', status: 'accepted' }, { ...base, due_date: '2026-08-05', status: 'withdrawn' }, base],
      INST,
      'NAAC',
      NOW,
    );
    expect(d?.dueDate).toBe('2026-09-01');
  });

  it('keeps an overdue filing and reports it as negative — being late is the point', () => {
    const d = nextSubmissionDeadline([{ ...base, due_date: '2026-07-01' }], INST, 'NAAC', NOW);
    expect(d?.daysUntilDue).toBeLessThan(0);
  });

  it('returns null when nothing is on file', () => {
    expect(nextSubmissionDeadline([], INST, 'NAAC', NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('computeOwnerDigest — the gap arithmetic', () => {
  it('reports only the confirmed metrics that lack evidence', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1' })],
      metrics: METRICS,
      evidence: [{ institution_id: INST, body_code: 'NAAC', metric_code: '1.1.1' }],
      submissions: [],
      now: NOW,
    });
    expect(digest.gaps.map((g) => g.metricCode)).toEqual(['1.1.2', '3.1.1']);
    expect(digest.ownedMetricCount).toBe(3);
    expect(digest.metricsWithEvidenceCount).toBe(1);
  });

  it('never addresses a person who has not accepted the assignment', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1', assignment_status: 'pending' })],
      metrics: METRICS,
      evidence: [],
      submissions: [],
      now: NOW,
    });
    expect(digest.gaps).toHaveLength(0);
    expect(digest.awaitingAcknowledgementCount).toBe(3);
    expect(shouldSendDigest(digest)).toBe(false);
  });

  it('never addresses a person who declined, and counts the refusal', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1', assignment_status: 'declined' })],
      metrics: METRICS,
      evidence: [],
      submissions: [],
      now: NOW,
    });
    expect(digest.gaps).toHaveLength(0);
    expect(digest.declinedCount).toBe(3);
  });

  it('a declined explicit row leaves the metric unowned instead of rerouting it to the body owner', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [
        owner({ id: 'o1' }), // Alice owns the body
        owner({ id: 'o2', metric_code: '3.1.1', owner_user_id: BOB, assignment_status: 'declined' }),
      ],
      metrics: METRICS,
      evidence: [],
      submissions: [],
      now: NOW,
    });
    // Alice is told about her two; 3.1.1 is Bob's refusal on the record, not her problem.
    expect(digest.gaps.map((g) => g.metricCode)).toEqual(['1.1.1', '1.1.2']);
  });

  it('does not tell the body owner about a metric explicitly owned by somebody else', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1' }), owner({ id: 'o2', metric_code: '1.1.1', owner_user_id: BOB })],
      metrics: METRICS,
      evidence: [],
      submissions: [],
      now: NOW,
    });
    expect(digest.gaps.map((g) => g.metricCode)).toEqual(['1.1.2', '3.1.1']);
  });

  it('marks how each gap reached this owner', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1' }), owner({ id: 'o2', metric_code: '3.1.1', owner_user_id: ALICE })],
      metrics: METRICS,
      evidence: [],
      submissions: [],
      now: NOW,
    });
    expect(digest.gaps.find((g) => g.metricCode === '3.1.1')?.source).toBe('explicit');
    expect(digest.gaps.find((g) => g.metricCode === '1.1.1')?.source).toBe('inherited');
  });

  it('does not leak another institution’s evidence into the coverage count', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1' })],
      metrics: METRICS,
      evidence: [{ institution_id: OTHER_INST, body_code: 'NAAC', metric_code: '1.1.1' }],
      submissions: [],
      now: NOW,
    });
    expect(digest.gaps).toHaveLength(3);
    expect(digest.metricsWithEvidenceCount).toBe(0);
  });

  it('sorts gaps numerically so 1.1.10 follows 1.1.2', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1' })],
      metrics: [metric('1.1.10'), metric('1.1.2')],
      evidence: [],
      submissions: [],
      now: NOW,
    });
    expect(digest.gaps.map((g) => g.metricCode)).toEqual(['1.1.2', '1.1.10']);
  });

  it('with no owners and no evidence, produces nothing to send — today’s real answer', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [],
      metrics: METRICS,
      evidence: [],
      submissions: [],
      now: NOW,
    });
    expect(digest.gaps).toHaveLength(0);
    expect(digest.ownedMetricCount).toBe(0);
    expect(shouldSendDigest(digest)).toBe(false);
  });

  it('an owner with every metric evidenced is not worth mailing', () => {
    const digest = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1' })],
      metrics: METRICS,
      evidence: METRICS.map((m) => ({ institution_id: INST, body_code: 'NAAC', metric_code: m.metric_code })),
      submissions: [],
      now: NOW,
    });
    expect(shouldSendDigest(digest)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('buildDigestPreview — the exact words, readable before anyone arms it', () => {
  const digest = computeOwnerDigest({
    config: config(),
    owners: [owner({ id: 'o1' })],
    metrics: METRICS,
    evidence: [{ institution_id: INST, body_code: 'NAAC', metric_code: '1.1.1' }],
    submissions: [
      { institution_id: INST, body_code: 'NAAC', due_date: '2026-08-12', status: 'draft', period_label: 'AY 2026-27' },
    ],
    now: NOW,
  });

  it('addresses the configured email and names every outstanding metric', () => {
    const preview = buildDigestPreview(digest);
    expect(preview.to).toBe('alice@jkkn.ac.in');
    expect(preview.gapCount).toBe(2);
    expect(preview.subject).toContain('2 metric(s)');
    expect(preview.body).toContain('1.1.2');
    expect(preview.body).toContain('3.1.1');
    expect(preview.body).not.toContain('1.1.1 Metric 1.1.1');
  });

  it('states the deadline', () => {
    expect(buildDigestPreview(digest).body).toContain('due in 10 day(s)');
  });

  it('says a filing is overdue rather than counting down past zero', () => {
    const overdue = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1' })],
      metrics: METRICS,
      evidence: [],
      submissions: [
        { institution_id: INST, body_code: 'NAAC', due_date: '2026-07-28', status: 'draft', period_label: null },
      ],
      now: NOW,
    });
    expect(buildDigestPreview(overdue).body).toContain('overdue');
  });

  it('mentions unaccepted assignments separately from the counted work', () => {
    const mixed = computeOwnerDigest({
      config: config(),
      owners: [
        owner({ id: 'o1' }),
        owner({ id: 'o2', metric_code: '3.1.1', assignment_status: 'pending' }),
      ],
      metrics: METRICS,
      evidence: [],
      submissions: [],
      now: NOW,
    });
    const preview = buildDigestPreview(mixed);
    expect(preview.gapCount).toBe(2);
    expect(preview.body).toContain('not yet accepted');
  });

  it('truncates a very long list instead of printing all 107 metrics', () => {
    const many = Array.from({ length: 30 }, (_, i) => metric(`9.${i + 1}`));
    const big = computeOwnerDigest({
      config: config(),
      owners: [owner({ id: 'o1' })],
      metrics: many,
      evidence: [],
      submissions: [],
      now: NOW,
    });
    const preview = buildDigestPreview(big);
    expect(preview.gapCount).toBe(30);
    expect(preview.body).toContain('...and 10 more.');
  });
});
