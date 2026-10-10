/**
 * Regression guard for the question-wise CIA entry rules.
 *
 * These rules MIRROR COE's `lib/cia/question-marks.ts` — the two implementations
 * must agree or faculty get a grid that accepts marks the server then rejects.
 * COE is the authority; this file exists so a well-meaning refactor on the
 * MyJKKN side cannot quietly drift away from it.
 *
 * The cases worth keeping are the counter-intuitive ones:
 *   - "answer any N" counts GROUPS, so an OR pair is ONE answer, not two.
 *   - num_to_answer only binds when 0 < num_to_answer < num_questions; a part
 *     where they are equal is unrestricted and must never lock its last cell.
 *   - A question that already holds a mark is never locked, or an OR pair
 *     becomes a one-way door the user cannot switch.
 *   - sum(all questions) > component max is NORMAL with choice questions and
 *     must not be flagged.
 *   - Attainment counts only ATTEMPTED questions, so a skipped optional
 *     question is absent from the denominator rather than scored zero.
 *
 * Run: npm run check:mark-entry-rules
 */

import {
  buildEntryPaper, lockReasonFor, validateLearnerMarks, computeAttainment,
  rankPapers, guessTargetComponent, sumMarks,
} from '../lib/utils/mark-entry/entry-rules';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + ' ' + extra); }
};

// PART B: Q6a/Q6b are an OR pair (same question_number); Q7a/Q7b another.
// PART C: Q8..Q11 — answer any 2 of 4.
const questions: any = [
  { id: 'q6a', part_label: 'B', question_number: 6, sub_label: 'a', marks: 5, co_code: 'CO1', k_level: 'K2', display_order: 1, is_choice_alternative: false },
  { id: 'q6b', part_label: 'B', question_number: 6, sub_label: 'b', marks: 5, co_code: 'CO1', k_level: 'K2', display_order: 2, is_choice_alternative: true },
  { id: 'q7a', part_label: 'B', question_number: 7, sub_label: 'a', marks: 5, co_code: 'CO2', k_level: 'K3', display_order: 3, is_choice_alternative: false },
  { id: 'q7b', part_label: 'B', question_number: 7, sub_label: 'b', marks: 5, co_code: 'CO2', k_level: 'K3', display_order: 4, is_choice_alternative: true },
  { id: 'q8',  part_label: 'C', question_number: 8,  marks: 10, co_code: 'CO3', k_level: 'K4', display_order: 5, is_choice_alternative: false },
  { id: 'q9',  part_label: 'C', question_number: 9,  marks: 10, co_code: 'CO3', k_level: 'K4', display_order: 6, is_choice_alternative: false },
  { id: 'q10', part_label: 'C', question_number: 10, marks: 10, co_code: 'CO4', k_level: 'K5', display_order: 7, is_choice_alternative: false },
  { id: 'q11', part_label: 'C', question_number: 11, marks: 10, co_code: 'CO4', k_level: 'K5', display_order: 8, is_choice_alternative: false },
];
const templateParts: any = [
  { part_label: 'B', num_questions: 2, num_to_answer: 2 },   // NOT a restriction (== num_questions)
  { part_label: 'C', num_questions: 4, num_to_answer: 2 },   // real "answer any 2 of 4"
];

const { questions: qs, parts, questionsTotal } = buildEntryPaper(questions, templateParts);

console.log('\n1. buildEntryPaper');
check('choice_group pairs 6a/6b', qs[0].choice_group === qs[1].choice_group && qs[0].choice_group === 'B|6');
check('6 and 7 are different groups', qs[0].choice_group !== qs[2].choice_group);
check('Part B has 2 groups (OR pair counts once)', parts.find(p => p.part_label === 'B')!.group_count === 2);
check('Part B num_to_answer null (not a real restriction)', parts.find(p => p.part_label === 'B')!.num_to_answer === null,
  'got ' + parts.find(p => p.part_label === 'B')!.num_to_answer);
check('Part C num_to_answer = 2', parts.find(p => p.part_label === 'C')!.num_to_answer === 2);
check('questionsTotal = 60', questionsTotal === 60, 'got ' + questionsTotal);

console.log('\n2. OR pair locking');
let marks: Record<string, number> = {};
check('nothing locked when empty', lockReasonFor(qs[1], qs, parts, marks) === null);
marks = { q6a: 4 };
check('filling 6a locks 6b', lockReasonFor(qs[1], qs, parts, marks) === 'or-sibling');
check('6a itself stays editable (can be cleared)', lockReasonFor(qs[0], qs, parts, marks) === null);
check('7a unaffected by 6a', lockReasonFor(qs[2], qs, parts, marks) === null);
delete marks.q6a;
check('clearing 6a reopens 6b', lockReasonFor(qs[1], qs, parts, marks) === null);

console.log('\n3. answer-any-N counts GROUPS not questions');
const qC = qs.filter(q => q.part_label === 'C');
marks = { q8: 10, q9: 10 };
check('2 of 4 answered -> q10 locks', lockReasonFor(qC[2], qs, parts, marks) === 'answer-limit');
check('...and q11 locks', lockReasonFor(qC[3], qs, parts, marks) === 'answer-limit');
check('...but q8 stays editable', lockReasonFor(qC[0], qs, parts, marks) === null);
delete marks.q9;
check('clearing one reopens q10', lockReasonFor(qC[2], qs, parts, marks) === null);
marks = { q6a: 5, q7a: 5 };
check('two OR pairs answered in B never hits an answer-limit',
  lockReasonFor(qs[1], qs, parts, marks) === 'or-sibling' && lockReasonFor(qs[3], qs, parts, marks) === 'or-sibling');

console.log('\n4. validateLearnerMarks');
check('clean run passes', validateLearnerMarks({ q6a: 5, q8: 10 }, qs, parts, 30).length === 0);
check('over question max rejected',
  validateLearnerMarks({ q6a: 7 }, qs, parts, 30).some(e => /exceeds question max \(5\)/.test(e)));
check('both OR branches rejected',
  validateLearnerMarks({ q6a: 5, q6b: 5 }, qs, parts, 30).some(e => /only one of/.test(e)));
check('exceeding answer-any-N rejected',
  validateLearnerMarks({ q8: 10, q9: 10, q10: 10 }, qs, parts, 60).some(e => /limit is 2/.test(e)));
check('non-integer rejected',
  validateLearnerMarks({ q6a: 2.5 }, qs, parts, 30).some(e => /whole number/.test(e)));
check('over component max rejected',
  validateLearnerMarks({ q8: 10, q9: 10 }, qs, parts, 15).some(e => /exceeds component max/.test(e)));
check('paper total > component max is NOT an error by itself',
  validateLearnerMarks({ q6a: 5 }, qs, parts, 30).length === 0);
check('unknown question id rejected',
  validateLearnerMarks({ nope: 1 }, qs, parts, 30).some(e => /Unknown question/.test(e)));
check('sumMarks', sumMarks({ q6a: 5, q8: 10 }) === 15);

console.log('\n5. attainment excludes unattempted');
const learners: any = [
  { student_id: 's1', marks: { q6a: 5, q8: 5 } },
  { student_id: 's2', marks: { q6a: 0, q8: 10 } },
  { student_id: 's3', marks: {} },
  { student_id: 's4', marks: {}, is_absent: true },
];
const att = computeAttainment(learners, qs);
check('learnersEntered counts only those with marks', att.learnersEntered === 2, 'got ' + att.learnersEntered);
const co1 = att.co.find(b => b.key === 'CO1')!;
const co3 = att.co.find(b => b.key === 'CO3')!;
check('CO1 = 5/10 = 50%', co1.obtained === 5 && co1.max === 10 && co1.percentage === 50,
  'got ' + co1.obtained + '/' + co1.max + ' ' + co1.percentage);
check('CO3 = 15/20 = 75%', co3.obtained === 15 && co3.max === 20 && co3.percentage === 75);
check('CO2 (never attempted) absent from buckets, not 0%', !att.co.some(b => b.key === 'CO2'));
check('absent learner does not drag attainment down', co1.max === 10);
check('K-levels bucketed', att.kLevel.some(b => b.key === 'K2') && att.kLevel.some(b => b.key === 'K4'));

console.log('\n6. rankPapers status gate');
const papers: any = [
  { id: 'd', status: 'draft', set_number: 1, authored: true },
  { id: 'a', status: 'approved', set_number: 2, authored: true },
  { id: 's', status: 'submitted', set_number: 1, authored: true },
  { id: 'l', status: 'locked', set_number: 3, authored: true },
];
const ranked = rankPapers(papers);
check('drafts excluded', !ranked.some(p => p.id === 'd'));
check('submitted excluded — only an approved paper opens entry', !ranked.some(p => p.id === 's'));
check('locked > approved', ranked.map(p => p.id).join(',') === 'l,a', ranked.map(p => p.id).join(','));
check('all-draft -> empty (drives the pending_papers notice)',
  rankPapers([{ id: 'd', status: 'draft', set_number: 1 }] as any).length === 0);
check('all-submitted -> empty',
  rankPapers([{ id: 's', status: 'submitted', set_number: 1 }] as any).length === 0);
check('foreign cia_setting_id dropped',
  rankPapers([{ id: 'x', status: 'approved', set_number: 1, cia_setting_id: 'OTHER' }] as any, 'MINE').length === 0);
check('null cia_setting_id kept (the normal case)',
  rankPapers([{ id: 'y', status: 'approved', set_number: 1, cia_setting_id: null }] as any, 'MINE').length === 1);

console.log('\n7. guessTargetComponent');
const comps: any = [
  { code: 'attendance', max_marks: 30 },
  { code: 'assignment', max_marks: 10 },
  { code: 'test_1', max_marks: 30 },
];
check('never picks attendance even on an exact max match', guessTargetComponent(comps, 30)!.code === 'test_1');
check('falls back to first non-attendance', guessTargetComponent(comps, 999)!.code === 'assignment');

console.log('\n8. split questions (sub-divisions i / ii)');
// Q12a is split into i (8) + ii (7); Q12b is its unsplit OR alternative.
// Q13 is split too, with no alternative.
const splitQuestions: any = [
  {
    id: 'q12a', part_label: 'B', question_number: 12, sub_label: 'a', marks: 15, display_order: 1, is_choice_alternative: false,
    question_text: 'Stem',
    sub_questions: [
      { id: 's12a2', label: 'ii', marks: 7, co_code: 'CO2', k_level: 'K3', display_order: 2 },
      { id: 's12a1', label: 'i', marks: 8, co_code: 'CO1', k_level: 'K2', display_order: 1 },
    ],
  },
  { id: 'q12b', part_label: 'B', question_number: 12, sub_label: 'b', marks: 15, co_code: 'CO1', k_level: 'K2', display_order: 2, is_choice_alternative: true },
  {
    id: 'q13', part_label: 'B', question_number: 13, marks: 10, display_order: 3, is_choice_alternative: false,
    sub_questions: [
      { id: 's13a', label: 'i', marks: 5, co_code: 'CO3', k_level: 'K4', display_order: 1 },
      { id: 's13b', label: 'ii', marks: 5, co_code: 'CO3', k_level: 'K4', display_order: 2 },
    ],
  },
];
const split = buildEntryPaper(splitQuestions, [{ part_label: 'B', num_questions: 2, num_to_answer: 2 }] as any);
const sq = split.questions;
const byKey = (id: string) => sq.find(q => q.id === id)!;
check('one column per sub-division, parent dropped',
  sq.map(q => q.id).join(',') === 's12a1,s12a2,q12b,s13a,s13b', sq.map(q => q.id).join(','));
check('sub labels read "12a i" / "12a ii"', byKey('s12a1').label === '12a i' && byKey('s12a2').label === '12a ii');
check('sub carries its own marks / CO / K', byKey('s12a1').marks === 8 && byKey('s12a2').co_code === 'CO2' && byKey('s12a2').k_level === 'K3');
check('subs share the parent branch + group', byKey('s12a1').branch_id === 'q12a' && byKey('s12a2').branch_id === 'q12a'
  && byKey('s12a1').choice_group === byKey('q12b').choice_group && byKey('s12a1').parent_id === 'q12a');
check('questionsTotal counts subs, not parent twice', split.questionsTotal === 40, 'got ' + split.questionsTotal);
check('a split question is still ONE group', split.parts[0].group_count === 2, 'got ' + split.parts[0].group_count);
marks = { s12a1: 6 };
check('answering 12a-i leaves 12a-ii open', lockReasonFor(byKey('s12a2'), sq, split.parts, marks) === null);
check('...and locks the OR branch 12b', lockReasonFor(byKey('q12b'), sq, split.parts, marks) === 'or-sibling');
marks = { q12b: 10 };
check('answering 12b locks both sub-divisions of 12a',
  lockReasonFor(byKey('s12a1'), sq, split.parts, marks) === 'or-sibling'
  && lockReasonFor(byKey('s12a2'), sq, split.parts, marks) === 'or-sibling');
check('both sub-divisions of one branch validate clean',
  validateLearnerMarks({ s12a1: 8, s12a2: 7, s13a: 5, s13b: 5 }, sq, split.parts, 30).length === 0);
check('sub-division over its own max rejected',
  validateLearnerMarks({ s12a1: 9 }, sq, split.parts, 30).some(e => /Q12a i mark \(9\) exceeds question max \(8\)/.test(e)));
check('sub-division + other branch rejected, named once per branch',
  validateLearnerMarks({ s12a1: 8, s12a2: 7, q12b: 5 }, sq, split.parts, 60).some(e => e === 'only one of Q12a i / Q12b may be answered (OR choice)'));
check('mark filed under the split PARENT id is rejected as unknown',
  validateLearnerMarks({ q12a: 15 }, sq, split.parts, 30).some(e => /Unknown question/.test(e)));
const splitAtt = computeAttainment([{ student_id: 's1', marks: { s12a1: 4, s12a2: 7 } }] as any, sq);
check('attainment buckets by the SUB CO', splitAtt.co.find(b => b.key === 'CO1')!.max === 8 && splitAtt.co.find(b => b.key === 'CO2')!.obtained === 7);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
