/**
 * verify-pde-case-author-parse.ts — proves parseDraft consumes REAL Max-lane
 * output for the pde.case_author recipe. The fixture is the actual strict-JSON
 * a ₹0 drain returned for the oral-lichen-planus test case (2026-07-18).
 * Run:  npx tsx scripts/verify-pde-case-author-parse.ts   (exits non-zero on fail)
 *
 * The module's only `@/`-aliased import is type-only (erased by tsx at runtime),
 * so this relative import runs without tsconfig path resolution.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDraft, normalizeWeightsTo100, OSCE_DOMAINS } from '../lib/services/pde/case-author-draft';

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond) failures++;
};

const here = dirname(fileURLToPath(import.meta.url));
const answer = readFileSync(join(here, 'fixtures', 'pde-case-author-sample.txt'), 'utf8');

console.log('— real drain output —');
const draft = parseDraft(answer);
check('parseDraft returned a draft', draft !== null);
if (draft) {
  const sum = Object.values(draft.domain_weights).reduce((a, b) => a + b, 0);
  check('domain_weights sum to exactly 100', sum === 100);
  check('>= 5 questions', draft.questions.length >= 5);
  check('exactly one mcq_warmup', draft.questions.filter((q) => q.question_type === 'mcq_warmup').length === 1);
  check('every question has non-empty ground_truth', draft.questions.every((q) => q.metadata.ground_truth.trim().length > 0));
  check('every osce_domain is valid', draft.questions.every((q) => OSCE_DOMAINS.includes(q.metadata.osce_domain)));
  check('all five OSCE domains covered', new Set(draft.questions.map((q) => q.metadata.osce_domain)).size === 5);
  check('order_index is 1-based sequential', draft.questions.every((q, i) => q.order_index === i + 1));
}

console.log('— robustness —');
check('rejects garbage', parseDraft('not json at all') === null);
check('rejects empty', parseDraft('') === null);
check(
  'weights renormalize to 100',
  (() => {
    const w = normalizeWeightsTo100({
      data_gathering: 30, hypothesis_generation: 30, management_planning: 30,
      patient_communication: 30, professionalism: 30,
    });
    return w !== null && Object.values(w).reduce((a, b) => a + b, 0) === 100;
  })(),
);
check(
  'drops questions missing ground_truth',
  (() => {
    const d = parseDraft(
      JSON.stringify({
        domain_weights: { data_gathering: 20, hypothesis_generation: 20, management_planning: 20, patient_communication: 20, professionalism: 20 },
        questions: [
          { question_type: 'free_text_socratic', question_text: 'valid?', metadata: { osce_domain: 'data_gathering', ground_truth: 'yes', key_concepts: [] } },
          { question_type: 'free_text_socratic', question_text: 'no gt', metadata: { osce_domain: 'data_gathering', key_concepts: [] } },
          { question_type: 'free_text_socratic', question_text: 'q3', metadata: { osce_domain: 'hypothesis_generation', ground_truth: 'a', key_concepts: [] } },
          { question_type: 'free_text_socratic', question_text: 'q4', metadata: { osce_domain: 'management_planning', ground_truth: 'b', key_concepts: [] } },
        ],
      }),
    );
    // 4 in, 1 dropped for missing ground_truth → 3 kept
    return d !== null && d.questions.length === 3;
  })(),
);

if (failures > 0) {
  console.error(`\n✘ ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\n✔ all parse assertions passed');
