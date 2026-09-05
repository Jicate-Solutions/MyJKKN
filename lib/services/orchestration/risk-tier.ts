// lib/services/orchestration/risk-tier.ts
//
// Risk classifier for pull requests tracked by the Orchestration Console.
// Pure function, no I/O, no `server-only` — importable from tests, routes and
// the sync cron alike. The GitHub reads that feed it live in pr-risk.ts.
//
// Three tiers, and what each one unlocks in the merge action
// (app/api/admin/orchestration/actions/merge/route.ts):
//
//   HELD    touches money, marks, exams or the database schema. Merging needs
//           `confirm: true` AND an explicit `tierAck: 'HELD'` — the caller has
//           to say the word.
//   NORMAL  everything else. Merging needs `confirm: true` (unchanged).
//   LOW     docs / types / tests / lint config only, and not a draft. The ONLY
//           tier the console will merge with `unattended: true`.
//
// HELD always beats LOW: a docs-only PR titled "fee restructure" is HELD.
// An empty file list is NORMAL, never LOW — "nothing to look at" is not the
// same as "safe", and a truncated or failed file read must not read as safe.

export type RiskTier = 'HELD' | 'LOW' | 'NORMAL';

export interface RiskTierResult {
  tier: RiskTier;
  reasons: string[];
}

export interface RiskTierMeta {
  isDraft: boolean;
  title: string;
}

/**
 * Words that mark a change as HELD when they appear in a file path or the PR
 * title. Matched case-insensitively as whole words, where "word" tolerates the
 * separators paths use: `fee-structure.ts`, `student_marks.sql`, `Fees/`,
 * `useGrades.tsx` all hit; `coffee.ts` and `remarks.ts` do not.
 */
export const HELD_KEYWORDS: readonly string[] = [
  'fee',
  'fees',
  'billing',
  'bill',
  'invoice',
  'payment',
  'payroll',
  'salary',
  'refund',
  'ledger',
  'scholarship',
  'score',
  'scores',
  'mark',
  'marks',
  'grade',
  'grades',
  'grading',
  'result',
  'results',
  'exam',
  'assessment',
  'transcript',
];

// One regex for all keywords. Boundaries are "not a letter or digit" on both
// sides so `_`, `-`, `/`, `.`, `(` and the string edges all count as edges,
// and a camelCase boundary (`useGrades`) counts too via the lookbehind on a
// lowercase→uppercase change.
const HELD_KEYWORD_RE = new RegExp(
  `(?<![a-z0-9])(?:${HELD_KEYWORDS.join('|')})(?![a-z0-9])`,
  'i'
);

// camelCase → separate words so `studentMarks.ts` reads as `student Marks.ts`.
function splitCamel(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function heldKeywordHit(text: string): string | null {
  const m = splitCamel(text).match(HELD_KEYWORD_RE);
  return m ? m[0].toLowerCase() : null;
}

function isMigrationPath(path: string): boolean {
  return path.startsWith('supabase/migrations/');
}

function isSqlFile(path: string): boolean {
  return path.toLowerCase().endsWith('.sql');
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/**
 * The LOW set. A PR is LOW only if EVERY changed file matches one of these.
 * Deliberately narrow: `.github/workflows/*.yml` is NOT low — a workflow
 * change can alter which gates run on every other PR, which is exactly the
 * kind of change that should never land unattended.
 */
function isLowRiskFile(path: string): boolean {
  const lower = path.toLowerCase();
  const base = basename(lower);

  if (lower.endsWith('.md')) return true;
  if (lower.startsWith('docs/')) return true;
  if (lower.endsWith('.d.ts')) return true;
  if (lower.startsWith('types/')) return true;
  if (lower.startsWith('__tests__/')) return true;
  if (lower.endsWith('.test.ts') || lower.endsWith('.test.tsx') || lower.endsWith('.spec.ts')) return true;
  if (base.startsWith('.eslintrc')) return true;
  if (base.startsWith('.prettierrc')) return true;
  if (base.startsWith('eslint.config.')) return true;
  return false;
}

/**
 * Classifies a pull request from its changed file paths and metadata.
 *
 * Order of evaluation is the order of safety: HELD is decided first and is
 * final; LOW is only considered once no HELD signal exists; anything left is
 * NORMAL. `reasons` names the pattern that decided it so the console can show
 * WHY a PR is held rather than a bare badge.
 */
export function classifyRiskTier(files: string[], meta: RiskTierMeta): RiskTierResult {
  const reasons: string[] = [];

  // ── HELD ────────────────────────────────────────────────────────────────
  const titleHit = heldKeywordHit(meta.title ?? '');
  if (titleHit) reasons.push(`title mentions '${titleHit}'`);

  for (const file of files) {
    if (isMigrationPath(file)) {
      reasons.push(`migration: ${file}`);
      continue;
    }
    if (isSqlFile(file)) {
      reasons.push(`sql file: ${file}`);
      continue;
    }
    const hit = heldKeywordHit(file);
    if (hit) reasons.push(`'${hit}' in ${file}`);
  }

  if (reasons.length > 0) {
    return { tier: 'HELD', reasons };
  }

  // ── LOW ─────────────────────────────────────────────────────────────────
  if (files.length === 0) {
    return { tier: 'NORMAL', reasons: ['no changed files reported — never LOW on empty'] };
  }
  if (meta.isDraft) {
    return { tier: 'NORMAL', reasons: ['draft PR — never LOW'] };
  }
  const outside = files.filter((f) => !isLowRiskFile(f));
  if (outside.length === 0) {
    return { tier: 'LOW', reasons: [`all ${files.length} file(s) are docs/types/tests/lint config`] };
  }

  // ── NORMAL ──────────────────────────────────────────────────────────────
  const shown = outside.slice(0, 3).join(', ');
  const more = outside.length > 3 ? ` (+${outside.length - 3} more)` : '';
  return { tier: 'NORMAL', reasons: [`app code changed: ${shown}${more}`] };
}
