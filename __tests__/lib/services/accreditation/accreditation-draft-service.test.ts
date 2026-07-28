import { describe, it, expect } from 'vitest';
import {
  currentAcademicYearLabel,
  stripCitationMarkers,
  parseModelDraft,
  buildGroundingPrompt,
} from '@/lib/services/accreditation/accreditation-draft-service';
import { validateGrounding, type EvidenceRow } from '@/lib/services/accreditation/grounding-validator';

const ROW: EvidenceRow = {
  source_id: 'fe675154-8dbe-4bcc-8bea-88c7afece8f1',
  metric_code: '7.3.f',
  body_code: 'NAAC',
  metadata: {
    outcome: {
      course_code: 'MR3691', window_from: '2026-06-05', window_to: '2026-07-05',
      votes_better: 3, votes_same: 0, votes_worse: 0, outcome_responses: 5, input_responses: 18,
      input_avg_understood: 3.67, outcome_avg_understood: 3.8, outcome_lift: 0.18,
    },
    loop_name: 'Session-Feedback Teaching Loop', loop_key: 'scf_teaching',
  },
};

describe('currentAcademicYearLabel', () => {
  it('rolls over in June', () => {
    expect(currentAcademicYearLabel(new Date('2026-06-15T00:00:00Z'))).toBe('AY 2026-27');
    expect(currentAcademicYearLabel(new Date('2026-01-15T00:00:00Z'))).toBe('AY 2025-26');
  });
});

describe('stripCitationMarkers', () => {
  it('removes [E#] markers', () => {
    expect(stripCitationMarkers('rose to 3.80 [E1] with 3 of 5 [E2] better')).toBe(
      'rose to 3.80  with 3 of 5  better',
    );
  });

  // Regression (prod 2026-07-26): the model legitimately GROUPS citations when a
  // sentence draws on several records. Before the grouped form was stripped, the
  // literal string below survived into the validator, whose CODE_RE then read
  // E1…E8 as ungrounded factual codes and blocked a correct narrative.
  it('removes grouped [E#, E#] markers', () => {
    expect(stripCitationMarkers('The BoS met [E1, E2, E3, E4, E5, E7, E8] last term')).toBe(
      'The BoS met  last term',
    );
  });

  it('removes grouped markers with and without spaces', () => {
    expect(stripCitationMarkers('a [E1,E2] b [E1, E2] c [E10,  E11 ,E12] d')).toBe(
      'a  b  c  d',
    );
  });

  it('leaves a non-citation bracket alone', () => {
    expect(stripCitationMarkers('see [Table 2] and [E1]')).toBe('see [Table 2] and ');
  });

  it('leaves no E-marker residue for the validator to flag', () => {
    const stripped = stripCitationMarkers('BoS approved 4 revisions [E1, E2, E3].');
    expect(stripped).not.toMatch(/\bE\d+\b/);
  });
});

describe('parseModelDraft', () => {
  it('parses strict JSON with citations', () => {
    const d = parseModelDraft('{"narrative_md":"hello [E1]","citations":[{"marker":"E1","source_id":"x"}]}');
    expect(d.narrative_md).toBe('hello [E1]');
    expect(d.citations).toEqual([{ marker: 'E1', source_id: 'x' }]);
  });
  it('falls back to bare text when not JSON', () => {
    const d = parseModelDraft('Just some prose with no json.');
    expect(d.narrative_md).toBe('Just some prose with no json.');
    expect(d.citations).toEqual([]);
  });
  it('drops malformed citation entries', () => {
    const d = parseModelDraft('{"narrative_md":"x","citations":[{"marker":"E1"},{"marker":"E2","source_id":"y"}]}');
    expect(d.citations).toEqual([{ marker: 'E2', source_id: 'y' }]);
  });

  // Shape of a real blocked 7.10.1 draft on production (2026-07-26): the model
  // emitted a broken block, said so in English, then emitted the correct one.
  // The old first-{-to-last-} slice spanned both plus the sentence between them,
  // so JSON.parse threw and the ENTIRE blob was stored as the narrative —
  // dragging the embedded "marker": "E1" into the prose, where the grounding
  // gate rightly flagged it as an unaccounted code.
  it('takes the final block when the model corrects itself mid-reply', () => {
    const d = parseModelDraft(
      '```json\n{"narrative_md": "Retention is 100% [E1]"],"citations": [{"marker": "E1", "source_id": "a"}]}\n```\n\n' +
        'Wait, I need to fix a stray bracket. Let me correct that.\n\n' +
        '```json\n{"narrative_md": "Retention is 100% [E1].","citations": [{"marker": "E1", "source_id": "a"}]}\n```\n',
    );
    expect(d.narrative_md).toBe('Retention is 100% [E1].');
    expect(d.citations).toEqual([{ marker: 'E1', source_id: 'a' }]);
    // The failure that actually mattered: no markup or JSON left in the prose.
    expect(d.narrative_md).not.toContain('```');
    expect(d.narrative_md).not.toContain('narrative_md');
    expect(d.narrative_md).not.toContain('Wait, I need to fix');
  });

  it('accepts narrative_md as an array of paragraphs', () => {
    const d = parseModelDraft('{"narrative_md":["First para.","Second para."],"citations":[]}');
    expect(d.narrative_md).toBe('First para.\n\nSecond para.');
  });

  it('is not confused by braces inside the narrative prose', () => {
    const d = parseModelDraft('{"narrative_md":"The set {A, B} was reviewed [E1].","citations":[]}');
    expect(d.narrative_md).toBe('The set {A, B} was reviewed [E1].');
  });

  it('parses a single fenced JSON block', () => {
    const d = parseModelDraft('```json\n{"narrative_md":"Fenced but valid.","citations":[]}\n```');
    expect(d.narrative_md).toBe('Fenced but valid.');
  });

  it('strips a wrapping fence from a bare-markdown reply', () => {
    const d = parseModelDraft('```\nJust prose, no JSON at all.\n```');
    expect(d.narrative_md).toBe('Just prose, no JSON at all.');
    expect(d.citations).toEqual([]);
  });
});

describe('buildGroundingPrompt', () => {
  it('injects only the evidence facts + metric context', () => {
    const p = buildGroundingPrompt({
      metric: { metric_code: '7.3.f', metric_name: 'Quality Assurance System', category: 'Attribute 7' },
      rows: [ROW],
      period: 'AY 2026-27',
      scopeLabel: 'JKKN College',
    });
    expect(p).toContain('[E1] source_id=fe675154-8dbe-4bcc-8bea-88c7afece8f1');
    expect(p).toContain('7.3.f — Quality Assurance System');
    expect(p).toContain('AY 2026-27');
    expect(p).toContain('ONLY FACTS');
    expect(p).toContain('STRICT JSON');
  });

  it('ISO-DATE: instructs the model to reproduce dates in the evidence ISO form, not prose', () => {
    const p = buildGroundingPrompt({
      metric: { metric_code: '7.3.f', metric_name: 'Quality Assurance System', category: 'Attribute 7' },
      rows: [ROW],
      period: 'AY 2026-27',
      scopeLabel: 'JKKN College',
    });
    // Kills the prose-date false-positive class prompt-side: the model is told to
    // reproduce dates in the exact ISO digits (2026-06-05), never a prose reword
    // ("5 June 2026"). The grounding validator is intentionally left untouched.
    expect(p).toContain('exact ISO form');
    expect(p.toLowerCase()).toContain('never reword');
  });
});

describe('service + validator integration', () => {
  it('a grounded model reply survives strip-markers → validation', () => {
    // Simulated model output citing only real evidence values, with [E#] markers.
    const modelJson = JSON.stringify({
      narrative_md:
        'During AY 2026-27, the Session-Feedback Teaching Loop ran 1 measured cycle for course ' +
        'MR3691 (2026-06-05 to 2026-07-05) [E1]. Understanding rose from 3.67 to 3.80, with 3 of 5 ' +
        'respondents reporting improvement [E1].',
      citations: [{ marker: 'E1', source_id: ROW.source_id }],
    });
    const draft = parseModelDraft(modelJson);
    const clean = stripCitationMarkers(draft.narrative_md);
    const verdict = validateGrounding(clean, [ROW], { period: 'AY 2026-27', metricCode: '7.3.f' });
    expect(verdict.verdict).toBe('grounded');
  });

  it('a model reply with a fabricated figure is caught after strip', () => {
    const draft = parseModelDraft('{"narrative_md":"Satisfaction hit 97% [E1].","citations":[]}');
    const clean = stripCitationMarkers(draft.narrative_md);
    const verdict = validateGrounding(clean, [ROW], { period: 'AY 2026-27', metricCode: '7.3.f' });
    expect(verdict.verdict).toBe('ungrounded');
    expect(verdict.ungroundedTokens).toContain('97');
  });

  // Why the rank-3 prompt nudge matters: the validator keeps evidence dates
  // ATOMIC (ISO_DATE_RE) and does not leak their digits into the bare-number pool,
  // so the ISO form of a real evidence date is grounded. The fix is prompt-side
  // (steer the model to emit that ISO form) — the validator is correctly left as-is.
  it('DATE-FORM: the evidence date reproduced in ISO form is grounded', () => {
    const iso = validateGrounding(
      'The measured cycle ran from 2026-06-05 to 2026-07-05.',
      [ROW],
      { period: 'AY 2026-27', metricCode: '7.3.f' },
    );
    expect(iso.verdict).toBe('grounded');
  });
});

// ---------------------------------------------------------------------------
// Regression: lock in the 3 Director-confirmed policies (interview 2026-07-26)
// so a future edit cannot silently drop them.
// ---------------------------------------------------------------------------
describe('confirmed-behaviour regression (Director interview 2026-07-26)', () => {
  const prompt = buildGroundingPrompt({
    metric: { metric_code: '7.3.f', metric_name: 'Quality Assurance System', category: 'Attribute 7' },
    rows: [ROW],
    period: 'AY 2026-27',
    scopeLabel: 'JKKN College',
  });

  it('THIN-DATA: the prompt tells the model to admit thin/empty evidence', () => {
    expect(prompt.toLowerCase()).toContain('thin');
  });

  it('AI-MATH: the prompt forbids computing/deriving figures and percentages', () => {
    expect(prompt.toLowerCase()).toContain('never');
    expect(prompt.toLowerCase()).toMatch(/raw counts|derived percentage|compute/);
  });

  it('AI-MATH gate: a derived percentage not in the evidence is blocked', () => {
    const r = validateGrounding('Retention was 86% this year.', [ROW], { metricCode: '7.3.f' });
    expect(r.verdict).toBe('ungrounded');
    expect(r.ungroundedTokens).toContain('86');
  });

  it('HUMAN-EDIT gate: the SAME validator backs the human-edit re-check', () => {
    // okayNarrative re-runs validateGrounding on the edited text, so a human-typed
    // figure not in the evidence is rejected exactly like an AI-invented one.
    const r = validateGrounding('An editor added 250 graduates.', [ROW], { metricCode: '7.3.f' });
    expect(r.verdict).toBe('ungrounded');
    expect(r.ungroundedTokens).toContain('250');
  });
});
