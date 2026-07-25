import { describe, it, expect } from 'vitest';
import {
  validateGrounding,
  type EvidenceRow,
  type GroundingContext,
} from '@/lib/services/accreditation/grounding-validator';

// ---------------------------------------------------------------------------
// Real evidence shape (a NAAC 7.3.f quality_evidence_mappings row, verbatim
// from prod 2026-07-24). This is the sole fact source the drafter may cite.
// ---------------------------------------------------------------------------
const ROW: EvidenceRow = {
  source_id: 'fe675154-8dbe-4bcc-8bea-88c7afece8f1',
  metric_code: '7.3.f',
  body_code: 'NAAC',
  metadata: {
    outcome: {
      kind: 'improvement',
      window_to: '2026-07-05',
      votes_same: 0,
      course_code: 'MR3691',
      votes_worse: 0,
      window_from: '2026-06-05',
      outcome_lift: 0.18,
      votes_better: 3,
      human_verdict: null,
      input_responses: 18,
      outcome_responses: 5,
      input_avg_understood: 3.67,
      outcome_avg_understood: 3.8,
    },
    loop_key: 'scf_teaching',
    loop_name: 'Session-Feedback Teaching Loop',
    measured_at: '2026-07-08T01:28:02.622169+00:00',
    delta_summary: 'improved',
  },
};

const CTX: GroundingContext = {
  period: 'AY 2026-27',
  metricCode: '7.3.f',
  metricName: 'Quality Assurance System — periodic stakeholder-satisfaction survey',
  scopeLabel: 'JKKN College',
};

describe('validateGrounding — the fraud gate', () => {
  // 1) A clean narrative citing only real evidence numbers/dates/codes.
  it('passes a fully grounded narrative', () => {
    const md = `During AY 2026-27, the Session-Feedback Teaching Loop ran 1 measured ` +
      `cycle for course MR3691 (window 2026-06-05 to 2026-07-05). Learner ` +
      `understanding rose from 3.67 to 3.80, with 3 of 5 respondents reporting ` +
      `improvement and 0 reporting a decline.`;
    const r = validateGrounding(md, [ROW], CTX);
    expect(r.verdict).toBe('grounded');
    expect(r.ungroundedTokens).toEqual([]);
  });

  // 2) An invented figure not present anywhere → ungrounded.
  it('rejects an invented number', () => {
    const md = `Learner satisfaction reached 92% this cycle.`;
    const r = validateGrounding(md, [ROW], CTX);
    expect(r.verdict).toBe('ungrounded');
    expect(r.ungroundedTokens).toContain('92');
  });

  // 3) Trailing-zero equivalence is allowed; a genuinely different value is not.
  it('treats 3.8 as equal to evidence 3.80 but rejects 3.9', () => {
    expect(validateGrounding('rose to 3.8', [ROW], CTX).verdict).toBe('grounded');
    const bad = validateGrounding('rose to 3.9', [ROW], CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('3.9');
  });

  // 4) Course-code grounding.
  it('accepts a real course code and rejects a fabricated one', () => {
    expect(validateGrounding('for course MR3691', [ROW], CTX).verdict).toBe('grounded');
    const bad = validateGrounding('for course MR9999', [ROW], CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('MR9999');
  });

  // 5) Date grounding against the measured window.
  it('accepts an in-evidence date and rejects an out-of-evidence date', () => {
    expect(validateGrounding('measured on 2026-07-05', [ROW], CTX).verdict).toBe('grounded');
    const bad = validateGrounding('submitted on 2026-12-31', [ROW], CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('2026-12-31');
  });

  // 6) Empty evidence + any number is never vacuously grounded.
  it('rejects any number when there is no evidence', () => {
    const r = validateGrounding('The loop ran 4 cycles.', [], {});
    expect(r.verdict).toBe('ungrounded');
    expect(r.ungroundedTokens).toContain('4');
  });

  // 7) Ratio numbers: both parts must be grounded.
  it('accepts 3/5 (both present) but rejects 4/5 (4 absent)', () => {
    expect(validateGrounding('3/5 respondents', [ROW], CTX).verdict).toBe('grounded');
    const bad = validateGrounding('4/5 respondents', [ROW], CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('4');
  });

  // 8) Structural aggregate: the row count is a number the validator recomputes.
  it('allows the recomputed evidence row count', () => {
    const two = [ROW, { ...ROW, source_id: 'a1', metadata: { ...ROW.metadata, loop_key: 'scf_teaching' } }];
    // "2 measured cycles" == evidence.length; grounded even though "2" is in no row.
    expect(validateGrounding('across 2 measured cycles', two, CTX).verdict).toBe('grounded');
  });

  // 9) Prose with no factual tokens is trivially grounded.
  it('passes prose with no numbers/dates/codes', () => {
    const md = `The institution operates a structured, closed-loop quality assurance system.`;
    expect(validateGrounding(md, [ROW], CTX).verdict).toBe('grounded');
  });

  // 10) The metric code fragment (7.3) is allowed via context.
  it('allows the metric code number fragment from context', () => {
    expect(validateGrounding('Under Metric 7.3, the institution…', [ROW], CTX).verdict).toBe('grounded');
  });
});
