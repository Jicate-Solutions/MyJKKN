// __tests__/pde/assessment-results-answer-shapes.test.ts
// ============================================================================
// Guards the answer lookup behind GET /api/pde/assessments/[id]/results.
//
// That route used to resolve one question's answer with
// `answers[q.id] ?? answers[q.order_index]` — a KEYED-MAP read, and the only
// shape nothing in production actually writes. The column really holds:
//
//   (A) SubmissionAnswer[]           lib/services/pde-service.ts::submitAnswers
//   (B) clinical envelopes[]         app/api/pde/clinical-reasoning/score
//   (C) { items, osce_score }        same write-back, live since PR #2629
//   (D) Record<questionKey, text>    reachable via the unvalidated submit route
//
// Against (A) the old expression returned either undefined or a whole answer
// OBJECT, which `String(...)` renders "[object Object]" — so nothing ever
// matched `correct_answer`. Every question graded false, every Fink dimension
// reported 0%, and no error was raised anywhere. These tests pin the fix.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { buildAnswerLookup } from '@/app/api/pde/assessments/[id]/results/route';

const Q1 = '11111111-1111-4111-8111-111111111111';
const Q2 = '22222222-2222-4222-8222-222222222222';
const Q3 = '33333333-3333-4333-8333-333333333333';

describe('buildAnswerLookup', () => {
  it('(A) resolves the SubmissionAnswer array the assessment path actually writes', () => {
    // Exactly what app/(routes)/learn/assess/[id]/page.tsx builds and
    // PDEService.submitAnswers persists.
    const find = buildAnswerLookup([
      { question_id: Q1, selected_answer: 'Periapical radiolucency', is_correct: true, points_earned: 2 },
      { question_id: Q2, selected_answer: 'False', is_correct: false, points_earned: 0 },
      { question_id: Q3, selected_answer: 'Reduced salivary flow', is_correct: true, points_earned: 1 },
    ]);

    expect(find(Q1, 1)).toBe('Periapical radiolucency');
    expect(find(Q2, 2)).toBe('False');
    expect(find(Q3, 3)).toBe('Reduced salivary flow');
  });

  it('(A) regression: the answer is a STRING, never the whole envelope object', () => {
    const answers = [
      { question_id: Q1, selected_answer: 'Periapical radiolucency', is_correct: true, points_earned: 2 },
    ];

    // What the route used to compute, reproduced verbatim.
    const legacy = (answers as never)[Q1 as never] ?? (answers as unknown as never[])[1] ?? null;
    expect(legacy).toBeNull(); // no UUID key, and order_index 1 is past the end
    expect(String({ question_id: Q1 })).toBe('[object Object]'); // the other legacy outcome

    const resolved = buildAnswerLookup(answers)(Q1, 1);
    expect(typeof resolved).toBe('string');
    expect(resolved).toBe('Periapical radiolucency');
    expect(String(resolved).toLowerCase().trim()).toBe('periapical radiolucency');
  });

  it('(B) resolves clinical envelopes positionally via 1-based q_number', () => {
    const find = buildAnswerLookup([
      { q_number: 1, student_answer: 'Acute apical periodontitis' },
      { q_number: 2, student_answer: 'Order a periapical radiograph' },
    ]);

    // No question_id in this shape, so order_index carries the match.
    expect(find(Q1, 1)).toBe('Acute apical periodontitis');
    expect(find(Q2, 2)).toBe('Order a periapical radiograph');
    expect(find(Q3, 3)).toBeNull();
  });

  it('(B) resolves the legacy question_id + answer_text envelope', () => {
    const find = buildAnswerLookup([{ question_id: Q2, answer_text: 'Chlorhexidine rinse' }]);
    expect(find(Q2, 9)).toBe('Chlorhexidine rinse');
  });

  it('(C) unwraps { items, osce_score } — the shape live since PR #2629', () => {
    const find = buildAnswerLookup({
      items: [
        { question_id: Q1, selected_answer: 'Periapical radiolucency', is_correct: true, points_earned: 2 },
        { question_id: Q2, selected_answer: 'True', is_correct: true, points_earned: 1 },
      ],
      osce_score: { percentage: 84, domains: [{ name: 'reasoning', score: 4 }] },
    });

    expect(find(Q1, 1)).toBe('Periapical radiolucency');
    expect(find(Q2, 2)).toBe('True');
    // The scoring envelope's own keys must never be mistaken for an answer.
    expect(find('osce_score', 99)).toBeNull();
    expect(find('items', 99)).toBeNull();
  });

  it('(D) still resolves a keyed map, which the submit route stores unvalidated', () => {
    const find = buildAnswerLookup({ [Q1]: 'Periapical radiolucency', [Q2]: 'False' });
    expect(find(Q1, 1)).toBe('Periapical radiolucency');
    expect(find(Q2, 2)).toBe('False');
    expect(find(Q3, 3)).toBeNull();
  });

  it('(D) still resolves a map keyed by order_index', () => {
    const find = buildAnswerLookup({ 1: 'Reduced salivary flow', 2: 'Chlorhexidine rinse' });
    expect(find(Q1, 1)).toBe('Reduced salivary flow');
    expect(find(Q2, 2)).toBe('Chlorhexidine rinse');
  });

  it('returns null for unanswered, empty and unreadable values without throwing', () => {
    expect(buildAnswerLookup(null)(Q1, 1)).toBeNull();
    expect(buildAnswerLookup(undefined)(Q1, 1)).toBeNull();
    expect(buildAnswerLookup([])(Q1, 1)).toBeNull();
    expect(buildAnswerLookup({})(Q1, 1)).toBeNull();
    expect(buildAnswerLookup('not-json')(Q1, 1)).toBeNull();
    expect(buildAnswerLookup({ items: [], osce_score: { percentage: 0 } })(Q1, 1)).toBeNull();
    // An envelope present but carrying no readable text is still unanswered.
    expect(buildAnswerLookup([{ question_id: Q1, points_earned: 0 }])(Q1, 1)).toBeNull();
    // A non-integer order_index must not index anything.
    expect(buildAnswerLookup([{ q_number: 1, student_answer: 'x' }])(Q1, 1.5)).toBeNull();
  });

  it('coerces numeric and boolean answers rather than dropping them', () => {
    const find = buildAnswerLookup([
      { question_id: Q1, selected_answer: 4 },
      { question_id: Q2, selected_answer: true },
    ]);
    expect(find(Q1, 1)).toBe('4');
    expect(find(Q2, 2)).toBe('true');
  });

  it('prefers question_id over position when both could match', () => {
    // Order on the wire differs from order_index — matching by id must win.
    const find = buildAnswerLookup([
      { question_id: Q2, selected_answer: 'second question answer' },
      { question_id: Q1, selected_answer: 'first question answer' },
    ]);
    expect(find(Q1, 1)).toBe('first question answer');
    expect(find(Q2, 2)).toBe('second question answer');
  });
});
