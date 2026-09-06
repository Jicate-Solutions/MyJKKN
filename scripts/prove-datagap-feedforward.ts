/**
 * PROOF — the data-gap feed-forward / explore wire (Phase 4, Task 2).
 * ============================================================================
 *
 * Runs the REAL buildRankingPrompt (lib/services/mba-data-gap/rank-data-gaps-
 * prompt.ts) over a fixed synthetic scenario and asserts that the measured
 * per-area hit-rate now reaches the ranker's decision input:
 *
 *   - an UNPROVEN area (0 accepted gaps — like the 11 dark departments) carries
 *     an explicit "explore, give it a fair shot" nudge, and the instructions
 *     rank it ABOVE a tried-but-unproductive area;
 *   - a PROVEN area shows its hit-rate (exploit);
 *   - a tried-loser shows its low hit-rate (the only thing ranked down).
 *
 * A "no diff" between the pre-loop prompt (no measured outcomes) and the
 * post-loop prompt (outcomes measured) would mean the loop is not wired. The
 * final rank is still LLM-assigned — as it always was; what this proves is that
 * the measured OUTCOME now changes the ranking INPUT (the feed-forward edge).
 *
 * Run: npx tsx scripts/prove-datagap-feedforward.ts
 */

import {
  buildRankingPrompt,
  type RankableGap,
  type AreaTrackRecord,
} from '../lib/services/mba-data-gap/rank-data-gaps-prompt';

const AREA = {
  dental: '00000000-0000-0000-0000-0000000000d1', // UNPROVEN — a dark department
  admissions: '00000000-0000-0000-0000-0000000000a1', // PROVEN — pays off
  library: '00000000-0000-0000-0000-0000000000b1', // tried repeatedly, no payoff
};

const gaps: RankableGap[] = [
  {
    id: 'gap-dental',
    institution_id: 'inst-1',
    area_id: AREA.dental,
    gap_type: 'not_captured',
    title: 'Dental chair utilisation is not analysed',
    what_missing: 'per-chair daily utilisation',
    what_analysis: 'idle-capacity by session',
    what_decision: 'rostering of clinical hours',
  },
  {
    id: 'gap-admissions',
    institution_id: 'inst-1',
    area_id: AREA.admissions,
    gap_type: 'not_surfaced',
    title: 'Enquiry-to-application conversion by source',
    what_missing: 'source attribution on enquiries',
    what_analysis: 'channel ROI',
    what_decision: 'where to spend outreach budget',
  },
  {
    id: 'gap-library',
    institution_id: 'inst-1',
    area_id: AREA.library,
    gap_type: 'not_surfaced',
    title: 'Footfall by hour',
    what_missing: 'turnstile counts',
    what_analysis: 'peak-hour staffing',
    what_decision: 'library desk rota',
  },
];

const areaLabel = new Map<string, string>([
  [AREA.dental, 'Dental'],
  [AREA.admissions, 'Admissions'],
  [AREA.library, 'Library'],
]);
// One gap filed per area in this scenario.
const areaFreq = new Map<string, number>([
  [AREA.dental, 1],
  [AREA.admissions, 1],
  [AREA.library, 1],
]);

// BEFORE — the pre-loop state: no gaps measured yet, so no track record exists.
const trackEmpty = new Map<string, AreaTrackRecord>();

// AFTER — outcomes have been measured by fn_mba_measure_gap_outcomes:
const trackMeasured = new Map<string, AreaTrackRecord>([
  [AREA.admissions, { accepted: 5, produced: 4, hit_rate_pct: 80 }], // proven
  [AREA.library, { accepted: 6, produced: 0, hit_rate_pct: 0 }], // tried, no payoff
  // Dental absent → unproven (0 accepted) → explore.
]);

const before = buildRankingPrompt(gaps, areaLabel, areaFreq, trackEmpty);
const after = buildRankingPrompt(gaps, areaLabel, areaFreq, trackMeasured);

function block(prompt: string, gapId: string): string {
  const lines = prompt.split('\n');
  const start = lines.findIndex((l) => l.includes(`gap_id: ${gapId}`));
  return lines.slice(start, start + 6).join('\n');
}

const checks: Array<[string, boolean]> = [
  [
    'AFTER: unproven Dental carries the explore nudge',
    /Dental[\s\S]*?UNPROVEN \(give it a fair shot: explore\)/.test(after),
  ],
  [
    'AFTER: proven Admissions shows its 80% hit-rate (exploit)',
    after.includes('4 of 5 accepted gaps in this area led to an applied improvement (80% hit-rate)'),
  ],
  [
    'AFTER: tried-loser Library shows its 0% hit-rate',
    after.includes('0 of 6 accepted gaps in this area led to an applied improvement (0% hit-rate)'),
  ],
  [
    'AFTER: instructions rank an unproven area ABOVE a tried-unproductive one',
    after.includes('an unproven area should rank ABOVE an area that has been tried repeatedly'),
  ],
  [
    'BEFORE (cold start): every area reads UNPROVEN → explore (dark depts get a fair shot)',
    (before.match(/UNPROVEN \(give it a fair shot: explore\)/g) || []).length === 3,
  ],
  [
    'WIRE: the two prompts DIFFER (no-diff would mean no loop)',
    before !== after,
  ],
];

console.log('── Dental (unproven) block — BEFORE any measured outcomes ──');
console.log(block(before, 'gap-dental'));
console.log('\n── Dental (unproven) block — AFTER outcomes measured ──');
console.log(block(after, 'gap-dental'));
console.log('\n── Admissions (proven) block — AFTER ──');
console.log(block(after, 'gap-admissions'));
console.log('\n── Assertions ──');

let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${label}`);
  if (!pass) ok = false;
}

console.log(
  ok
    ? '\n✅ PROOF PASSED — the measured hit-rate feeds the next ranking; unproven areas explore-up.'
    : '\n❌ PROOF FAILED',
);
process.exit(ok ? 0 : 1);
