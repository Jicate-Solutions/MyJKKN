/**
 * lib/services/onemark/results-service — the OneMark Wave 3 results contract.
 *
 * Lane S3's `fn_onemark_cohort_results` and `fn_onemark_learner_report` do not
 * exist in the database while Lane A is built, so every test here runs against
 * FIXTURES of the agreed payload — never a live call. Cohort sizes 0, 1, 3, 5
 * and 40 are all covered because the min-learners threshold that hides
 * per-item statistics (ruling #9) sits between them.
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_LEARNERS_FOR_ITEM_STATS_DEFAULT,
  SCORE_LIST_CSV_COLUMNS,
  buildScoreListCsv,
  csvCell,
  itemStatsVisible,
  parseCohortResults,
  parseLearnerReport,
  scoreDistribution,
  scoreListFilename,
  submittedLearners,
  summarize,
  tagStrip,
  unitStrip,
} from '@/lib/services/onemark/results-service';

const EXAM = '11111111-1111-4111-8111-111111111111';
const ASSESSMENT = '22222222-2222-4222-8222-222222222222';

function learner(n: number, over: Record<string, unknown> = {}) {
  return {
    student_id: `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`,
    name: `Learner ${n}`,
    roll_no: `R${n}`,
    score: n % 16,
    max_score: 15,
    submitted_at: '2026-09-06T04:00:00Z',
    status: 'submitted',
    taken_digitally: n % 2 === 0,
    per_unit: [
      { key: 'unit-a', label: 'Electrostatics', correct: n % 4, total: 4 },
      { key: 'unit-b', label: 'Optics', correct: n % 3, total: 3 },
    ],
    per_tag: [{ key: 'numerical', label: 'Numerical', correct: n % 2, total: 2 }],
    ...over,
  };
}

/** A payload with `count` submitted learners, in the RPC's agreed shape. */
function cohortPayload(count: number, over: Record<string, unknown> = {}) {
  return {
    assessment: {
      id: ASSESSMENT,
      title: 'Physics Part-I mock 3',
      exam_definition_id: EXAM,
      exam_key: 'tn_hsc_physics',
      exam_name: 'Physics',
      cohort_label: 'Nattraja Vidhyalaya · 2026-27',
      state: 'PUBLISHED',
    },
    learners_total: count,
    learners_sat: count,
    min_learners_for_item_stats: 3,
    learners: Array.from({ length: count }, (_, i) => learner(i + 1)),
    items: [
      {
        item_id: '44444444-4444-4444-8444-444444444441',
        position: 1,
        unit_label: 'Electrostatics',
        p_value: 0.6,
        answered: count,
        top_distractor: { option_key: 'C', count: 2 },
        withdrawn: false,
      },
      {
        item_id: '44444444-4444-4444-8444-444444444442',
        position: 2,
        unit_label: 'Optics',
        p_value: 0.2,
        answered: count,
        top_distractor: { option_key: 'A', count: 5 },
        is_withdrawn: true,
      },
    ],
    ...over,
  };
}

describe('parseCohortResults — shape and tolerance', () => {
  it('reads the agreed payload whole', () => {
    const r = parseCohortResults(cohortPayload(3));
    expect(r.assessment.id).toBe(ASSESSMENT);
    expect(r.assessment.exam_definition_id).toBe(EXAM);
    expect(r.learners).toHaveLength(3);
    expect(r.learners[0].per_unit).toHaveLength(2);
    expect(r.items).toHaveLength(2);
    expect(r.min_learners_for_item_stats).toBe(3);
  });

  it('never throws on a missing, null or nonsense payload', () => {
    for (const bad of [null, undefined, 0, 'nope', [], { learners: 'x', items: 7 }]) {
      const r = parseCohortResults(bad);
      expect(r.learners).toEqual([]);
      expect(r.items).toEqual([]);
      expect(r.learners_sat).toBe(0);
      expect(r.min_learners_for_item_stats).toBe(MIN_LEARNERS_FOR_ITEM_STATS_DEFAULT);
    }
  });

  it('drops an entry with no id rather than inventing one', () => {
    const r = parseCohortResults(cohortPayload(1, { learners: [learner(1), { name: 'Ghost' }] }));
    expect(r.learners).toHaveLength(1);
  });

  it('accepts a numeric that arrived as a string', () => {
    const r = parseCohortResults(cohortPayload(1, { learners: [learner(1, { score: '9', max_score: '15' })] }));
    expect(r.learners[0].score).toBe(9);
    expect(r.learners[0].max_score).toBe(15);
  });
});

describe('ruling #8 — a withdrawn question is shown, never rescored', () => {
  it('flags a withdrawn item from either spelling', () => {
    const r = parseCohortResults(cohortPayload(3));
    expect(r.items[0].withdrawn).toBe(false);
    expect(r.items[1].withdrawn).toBe(true);
    const viaIsActive = parseCohortResults(
      cohortPayload(1, { items: [{ item_id: 'a', p_value: 0.5, answered: 1, is_active: false }] }),
    );
    expect(viaIsActive.items[0].withdrawn).toBe(true);
  });

  it('leaves the awarded score untouched when an item is withdrawn', () => {
    const payload = cohortPayload(3);
    const before = parseCohortResults(payload).learners.map((l) => l.score);
    const withWithdrawal = parseCohortResults({
      ...payload,
      items: payload.items.map((i) => ({ ...i, withdrawn: true })),
    });
    expect(withWithdrawal.learners.map((l) => l.score)).toEqual(before);
    expect(summarize(withWithdrawal).average).toBe(summarize(parseCohortResults(payload)).average);
  });
});

describe('ruling #9 — item statistics hide on a small cohort, the score list never does', () => {
  it.each([
    [0, false],
    [1, false],
    [2, false],
    [3, true],
    [5, true],
    [40, true],
  ])('%i submitted learners -> item stats visible = %s', (count, visible) => {
    const r = parseCohortResults(cohortPayload(count));
    expect(itemStatsVisible(r)).toBe(visible);
    // The score list is present at every size — it is never gated.
    expect(r.learners).toHaveLength(count);
  });

  it('honours a threshold the server read from the policy row', () => {
    const r = parseCohortResults(cohortPayload(3, { min_learners_for_item_stats: 5 }));
    expect(itemStatsVisible(r)).toBe(false);
    expect(itemStatsVisible(parseCohortResults(cohortPayload(5, { min_learners_for_item_stats: 5 })))).toBe(true);
  });
});

describe('derived numbers', () => {
  it('summarizes an empty cohort without dividing by zero', () => {
    const s = summarize(parseCohortResults(cohortPayload(0)));
    expect(s).toMatchObject({ sat: 0, average: null, average_pct: null, highest: null, lowest: null, digital: 0 });
  });

  it('summarizes one learner', () => {
    const r = parseCohortResults(cohortPayload(1, { learners: [learner(1, { score: 12, taken_digitally: true })] }));
    const s = summarize(r);
    expect(s).toMatchObject({ sat: 1, average: 12, average_pct: 80, highest: 12, lowest: 12, max_score: 15, digital: 1 });
  });

  it('counts only submitted sittings as sat', () => {
    const r = parseCohortResults(
      cohortPayload(0, {
        learners_sat: 1,
        learners_total: 3,
        learners: [
          learner(1, { score: 10, status: 'submitted' }),
          learner(2, { score: null, status: 'in_progress' }),
          learner(3, { score: null, status: 'not_started' }),
        ],
      }),
    );
    expect(submittedLearners(r)).toHaveLength(1);
    expect(summarize(r).average).toBe(10);
    expect(r.learners).toHaveLength(3);
  });

  it('builds a score distribution that holds every submitted learner', () => {
    const r = parseCohortResults(cohortPayload(40));
    const bands = scoreDistribution(r);
    expect(bands).toHaveLength(5);
    expect(bands.reduce((a, b) => a + b.count, 0)).toBe(submittedLearners(r).length);
  });

  it('puts a full score in the top band, not past it', () => {
    const r = parseCohortResults(cohortPayload(1, { learners: [learner(1, { score: 15, max_score: 15 })] }));
    const bands = scoreDistribution(r);
    expect(bands[bands.length - 1].count).toBe(1);
  });

  it('returns no bands when nothing has been sat', () => {
    expect(scoreDistribution(parseCohortResults(cohortPayload(0)))).toEqual([]);
  });

  it('rolls units and tags up across learners', () => {
    const r = parseCohortResults(
      cohortPayload(0, {
        learners_sat: 2,
        learners: [
          learner(1, {
            score: 5,
            per_unit: [{ key: 'unit-a', label: 'Electrostatics', correct: 1, total: 4 }],
            per_tag: [{ key: 'numerical', label: 'Numerical', correct: 0, total: 2 }],
          }),
          learner(2, {
            score: 6,
            per_unit: [{ key: 'unit-a', label: 'Electrostatics', correct: 3, total: 4 }],
            per_tag: [{ key: 'numerical', label: 'Numerical', correct: 2, total: 2 }],
          }),
        ],
      }),
    );
    expect(unitStrip(r)).toEqual([
      { key: 'unit-a', label: 'Electrostatics', correct: 4, total: 8, accuracy: 50 },
    ]);
    expect(tagStrip(r)[0].accuracy).toBe(50);
  });

  it('reports a bucket nobody attempted as null rather than zero', () => {
    const r = parseCohortResults(
      cohortPayload(0, {
        learners_sat: 1,
        learners: [learner(1, { score: 0, per_unit: [{ key: 'u', label: 'Unit', correct: 0, total: 0 }], per_tag: [] })],
      }),
    );
    expect(unitStrip(r)[0].accuracy).toBeNull();
  });
});

describe('ruling #14 — the export is names and scores, never an answer key', () => {
  it('has a closed column set with nothing about answers or explanations', () => {
    const header = SCORE_LIST_CSV_COLUMNS.join('|').toLowerCase();
    for (const forbidden of ['answer', 'key', 'explanation', 'option', 'correct option', 'rationale']) {
      expect(header).not.toContain(forbidden);
    }
    expect(SCORE_LIST_CSV_COLUMNS).toHaveLength(8);
  });

  it('emits the header plus one line per learner, at every cohort size', () => {
    for (const count of [0, 1, 3, 5, 40]) {
      const csv = buildScoreListCsv(parseCohortResults(cohortPayload(count)));
      const lines = csv.trimEnd().split('\r\n');
      expect(lines).toHaveLength(count + 1);
      expect(lines[0]).toBe(SCORE_LIST_CSV_COLUMNS.map((c) => `"${c}"`).join(','));
    }
  });

  it('carries no answer text even when the payload holds distractor keys', () => {
    const csv = buildScoreListCsv(parseCohortResults(cohortPayload(5)));
    // The item rows carry option keys A and C; none of that reaches the export.
    expect(csv).not.toContain('44444444-4444-4444-8444');
    expect(csv).not.toContain('Electrostatics');
    expect(csv).toContain('Learner 1');
  });

  it('writes the percentage and the decision-17 digital flag', () => {
    const csv = buildScoreListCsv(
      parseCohortResults(cohortPayload(1, { learners: [learner(1, { score: 12, max_score: 15, taken_digitally: true })] })),
    );
    expect(csv).toContain('"12","15","80"');
    expect(csv.trimEnd().endsWith('"Yes"')).toBe(true);
  });

  it('quotes, escapes and defuses a spreadsheet formula in a name', () => {
    expect(csvCell('Ravi "Kumar", S')).toBe('"Ravi ""Kumar"", S"');
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('+HYPERLINK("http://x")')).toBe(`"'+HYPERLINK(""http://x"")"`);
    expect(csvCell(null)).toBe('""');
  });

  it('names the file from the paper', () => {
    expect(scoreListFilename(parseCohortResults(cohortPayload(1)))).toBe(
      'onemark-scores-physics-part-i-mock-3.csv',
    );
    expect(scoreListFilename(parseCohortResults(cohortPayload(1, { assessment: { title: '' } })))).toBe(
      'onemark-scores-paper.csv',
    );
  });
});

describe('parseLearnerReport', () => {
  const payload = {
    student: {
      id: 'a1b2c3d4',
      name: 'Meena R',
      roll_no: 'R12',
      cohort_label: 'Nattraja · 2026-27',
    },
    exam: { id: EXAM, key: 'tn_hsc_physics', name: 'Physics' },
    progress: { attempted: 40, correct: 26 },
    topics: [
      { topic_id: 't1', label: 'Electrostatics', correct: 6, total: 10 },
      { topic_id: 't2', label: 'Optics', correct: 0, total: 0 },
    ],
    vault: { active: 4, mastered: 9, next_due: '2026-09-08T02:00:00Z' },
    sittings: [
      { attempt_id: 'a1', mode: 'live', score: 12, max_score: 15, submitted_at: '2026-09-05T05:00:00Z', status: 'submitted' },
      { attempt_id: 'a2', mode: 'practice', score: 7, max_score: 10, submitted_at: '2026-09-04T05:00:00Z', status: 'submitted' },
    ],
  };

  it('reads the agreed payload and derives accuracy when the RPC omits it', () => {
    const r = parseLearnerReport(payload);
    expect(r.student.name).toBe('Meena R');
    expect(r.exam.id).toBe(EXAM);
    expect(r.progress.accuracy).toBe(65);
    expect(r.topics[0].accuracy).toBe(60);
    expect(r.topics[1].accuracy).toBeNull();
    expect(r.vault).toEqual({ active: 4, mastered: 9, next_due_at: '2026-09-08T02:00:00Z' });
    expect(r.sittings).toHaveLength(2);
  });

  it('reads an accuracy the RPC sent as a fraction', () => {
    expect(parseLearnerReport({ ...payload, progress: { attempted: 40, correct: 26, accuracy: 0.65 } }).progress.accuracy).toBe(65);
  });

  it('never throws on a missing or nonsense payload', () => {
    for (const bad of [null, undefined, 'x', []]) {
      const r = parseLearnerReport(bad);
      expect(r.topics).toEqual([]);
      expect(r.sittings).toEqual([]);
      expect(r.progress).toEqual({ attempted: 0, correct: 0, accuracy: null });
      expect(r.vault).toEqual({ active: 0, mastered: 0, next_due_at: null });
    }
  });
});
