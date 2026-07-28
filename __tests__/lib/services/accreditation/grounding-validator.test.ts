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

// ===========================================================================
// False-positive regressions — every case below was a REAL production draft
// (2026-07-26) that the gate wrongly flagged, blocking human approval.
// Each `rejects` counterpart proves the fix did not widen the gate.
// ===========================================================================

describe('validateGrounding — academic-year formats', () => {
  // Blocked live on metric 1.2: period label said 'AY 2026-27' while the prose
  // legitimately wrote the expanded '2026-2027', so 2027 read as invented.
  it('allows the expanded form of the period label academic year', () => {
    const r = validateGrounding('The 2026-2027 cycle is under review.', [ROW], CTX);
    expect(r.verdict).toBe('grounded');
  });

  it('allows the abbreviated and expanded years of an evidence academic year', () => {
    const rows: EvidenceRow[] = [
      { source_id: 'b1', metric_code: '1.2', metadata: { academic_year: '2024-2025' } },
    ];
    const ctx: GroundingContext = { period: 'AY 2026-27', metricCode: '1.2' };
    expect(validateGrounding('Revised in AY 2024-25.', rows, ctx).verdict).toBe('grounded');
    expect(validateGrounding('Revised across 2024-2025.', rows, ctx).verdict).toBe('grounded');
  });

  // The conservative half of the fix: only a genuine successor-year pair
  // expands, so an unrelated 4-digit number is still rejected.
  it('does NOT blanket-allow arbitrary four-digit numbers', () => {
    const bad = validateGrounding('The institution enrolled 2031 learners.', [ROW], CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('2031');
  });

  it('does NOT treat an ISO-date fragment as an academic year', () => {
    // '2026-06-05' is in evidence, so the DATE is allowed — but its '2026-06'
    // prefix must not license the year 2007 as an expansion of month 06.
    const bad = validateGrounding('window opened 2026-06-05, closing 2007.', [ROW], CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('2007');
  });

  it('rejects a non-successor year range', () => {
    const rows: EvidenceRow[] = [
      { source_id: 'b1', metric_code: '1.2', metadata: { academic_year: '2024-2025' } },
    ];
    const bad = validateGrounding('spanning 2024-2030', rows, { metricCode: '1.2' });
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('2030');
  });
});

describe('validateGrounding — full ISO timestamps are atomic', () => {
  const TS_ROW: EvidenceRow = {
    source_id: 'c1',
    metric_code: '5.1.1',
    metadata: { computed_at: '2026-07-26T04:29:45.706507+00:00', lessons_total: 2 },
  };
  const TS_CTX: GroundingContext = { period: 'AY 2026-27', metricCode: '5.1.1' };

  // Blocked live on metrics 2.2.2 / 5.1.1 / 5.3.1: the model quoted the evidence
  // timestamp verbatim, the old strip order left 'T04:29:45.706507+00:00'
  // behind, and the bare-number pass flagged '29' and '45.706507'.
  it('allows a verbatim-quoted evidence timestamp', () => {
    const r = validateGrounding('computed at 2026-07-26T04:29:45.706507+00:00', [TS_ROW], TS_CTX);
    expect(r.verdict).toBe('grounded');
    expect(r.ungroundedTokens).toEqual([]);
  });

  // Blocked live on metrics 2.2.3 / 3.4.1: the model quoted the same instant but
  // dropped the microseconds. Sub-second precision is not a factual claim.
  it('allows a quoted timestamp that truncates sub-second precision', () => {
    const r = validateGrounding('computed at 2026-07-26T04:29:45+00:00', [TS_ROW], TS_CTX);
    expect(r.verdict).toBe('grounded');
  });

  it('still rejects a timestamp differing by a whole second', () => {
    const bad = validateGrounding('computed at 2026-07-26T04:29:46+00:00', [TS_ROW], TS_CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('2026-07-26T04:29:46+00:00');
  });

  it('allows the date part of an evidence timestamp on its own', () => {
    expect(validateGrounding('measured on 2026-07-26', [TS_ROW], TS_CTX).verdict).toBe('grounded');
  });

  // Stricter than before: a fabricated timestamp is rejected WHOLE rather than
  // leaking whichever fragments happened to match.
  it('rejects a fabricated timestamp as one token', () => {
    const bad = validateGrounding('computed at 2026-07-26T09:15:00+00:00', [TS_ROW], TS_CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('2026-07-26T09:15:00+00:00');
  });

  // The time fragments of an evidence timestamp must NOT become quotable counts.
  it('does not let timestamp minutes leak in as a bare number', () => {
    const bad = validateGrounding('A total of 29 lessons were tagged.', [TS_ROW], TS_CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('29');
  });
});

describe('validateGrounding — numbers inside free-text evidence values', () => {
  // Blocked live on metrics 5.3.1 / 5.4.1 / 9.1: the model named the event
  // exactly as the evidence stored it, and the year inside the name was flagged.
  const EVENT_ROW: EvidenceRow = {
    source_id: 'd1',
    metric_code: '5.4.1',
    metadata: {
      event_name: 'Annual Cultural Day 2024 (Retro)',
      start_date: '2024-10-24T08:30:00+00:00',
      registrations_count: 0,
    },
  };
  const EVENT_CTX: GroundingContext = { period: 'AY 2026-27', metricCode: '5.4.1' };

  it('allows a number embedded in an evidence text value', () => {
    const r = validateGrounding('the "Annual Cultural Day 2024 (Retro)" event', [EVENT_ROW], EVENT_CTX);
    expect(r.verdict).toBe('grounded');
  });

  it('still rejects a number that appears nowhere in the evidence', () => {
    const bad = validateGrounding('the event drew 87 attendees', [EVENT_ROW], EVENT_CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('87');
  });

  // Prose-form dates are deliberately NOT grounded — allowing a bare
  // day-of-month would widen the numeric allowlist across the whole gate.
  it('still rejects a prose-form date rewritten from an evidence timestamp', () => {
    const bad = validateGrounding('held on 24 October 2024', [EVENT_ROW], EVENT_CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('24');
  });
});

describe('validateGrounding — criterion references are labels, not figures', () => {
  const RET_ROWS: EvidenceRow[] = [
    { source_id: 'e1', metric_code: '7.10.1', metadata: { retention_pct: 0 } },
  ];
  const RET_CTX: GroundingContext = { period: 'AY 2026-27', metricCode: '7.10.1' };

  // Blocked live on metric 7.10.1: the prose said "Attribute 7: Governance", but
  // NUMBER_RE only derived '7.10' and '1' from the code, never the bare '7'.
  it('allows a reference to a dotted prefix of the metric under review', () => {
    expect(validateGrounding('Under Attribute 7: Governance', RET_ROWS, RET_CTX).verdict).toBe('grounded');
    expect(validateGrounding('Criterion 7.10 covers retention', RET_ROWS, RET_CTX).verdict).toBe('grounded');
    expect(validateGrounding('Metric 7.10.1 reports retention', RET_ROWS, RET_CTX).verdict).toBe('grounded');
  });

  it('rejects a reference to an unrelated criterion', () => {
    const bad = validateGrounding('Under Attribute 9', RET_ROWS, RET_CTX);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('9');
  });

  // The important guard: the phrase scope means a metric-code digit never
  // becomes quotable as a free-standing figure.
  it('does NOT make a metric-code digit quotable as a bare count', () => {
    const rows: EvidenceRow[] = [
      { source_id: 'f1', metric_code: '3.2.1', metadata: { papers_published: 2 } },
    ];
    const ctx: GroundingContext = { metricCode: '3.2.1' };
    expect(validateGrounding('Under Criterion 3, research output', rows, ctx).verdict).toBe('grounded');
    const bad = validateGrounding('3 papers were published.', rows, ctx);
    expect(bad.verdict).toBe('ungrounded');
    expect(bad.ungroundedTokens).toContain('3');
  });
});

// ---------------------------------------------------------------------------
// Number-word compounds ('3-year', '5-day') — the number is the only factual
// part; the descriptor word is not evidence. Regression for the residual
// false-positive that systematically blocked Metric 7.10.1 (3-year retention).
// ---------------------------------------------------------------------------
describe('validateGrounding — number-word compounds', () => {
  const rows: EvidenceRow[] = [
    {
      source_id: 'r1',
      metric_code: '7.10.1',
      metadata: { measure: 'retention_3y', baseline_count: 21, retained_count: 18, retention_pct: 85.7 },
    },
  ];
  const ctx: GroundingContext = { metricCode: '7.10.1', period: 'AY 2026-27' };

  it('grounds a descriptor whose number is in the evidence (3 from retention_3y)', () => {
    const r = validateGrounding('Faculty retention over the 3-year window: 18 of 21 retained.', rows, ctx);
    expect(r.verdict).toBe('grounded');
    expect(r.ungroundedTokens).toEqual([]);
  });

  it('STILL blocks a fabricated figure in compound shape (92 not in evidence)', () => {
    const r = validateGrounding('Retention reached 92-percent this cycle.', rows, ctx);
    expect(r.verdict).toBe('ungrounded');
    expect(r.ungroundedTokens).toContain('92');
  });

  it('does not mistake a real alnum code for a compound (MR3691 stays code-checked)', () => {
    const r = validateGrounding('for course MR3691', rows, ctx);
    expect(r.verdict).toBe('ungrounded');
    expect(r.ungroundedTokens).toContain('MR3691');
  });
});
