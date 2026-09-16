// lib/bug-reports/fix-risk.ts
//
// Risk tier for "② write the fix" on the Groups tab (Director ruling
// 2026-09-15: super admins may trigger fixes from the app TODAY for low-risk
// screens only; anything touching money, grades, payroll, attendance, fees,
// admissions or a migration stays with the bugs desk and the Director until
// loop gate f flips).
//
// ONE source, three consumers:
//   - the Groups tab (button vs "held" notice),
//   - fn_bug_cluster_fix_request (the REAL gate — refuses held groups unless
//     called by the service role; the SQL carries a LITERAL copy of
//     buildHeldRegexSource(), and __tests__/lib/bug-reports/fix-risk.test.ts
//     asserts the migration's literal equals this module's output),
//   - anyone else who needs to say "is this path sensitive".
//
// Composition (nothing here is a second list of an existing thing):
//   HELD_KEYWORDS       — money / marks / exams, from the Orchestration
//                         Console's classifier (lib/services/orchestration/risk-tier.ts).
//   BUG_FIX_HELD_PATH_RULES — the danger-zone globs the /fixallbugs skill and
//                         the Max-lane fix runner (~/jkkn-max-lane/bug-cluster-fix.mjs
//                         FORBIDDEN) refuse to touch: auth, middleware, migrations,
//                         rls, policies, payment, billing, checkout, .env,
//                         vercel.json, CLAUDE.md. Copied verbatim; the runner's
//                         extra `app/(routes)/admin/` rule is deliberately NOT
//                         here (the Groups tab itself lives there).
//   EXTRA_HELD_KEYWORDS — the Director's ruling adds attendance and admissions,
//                         which neither list carries; and .github/workflows.
import { HELD_KEYWORDS } from '@/lib/services/orchestration/risk-tier';

export type BugFixRiskTier = 'held' | 'low';

export interface BugFixRisk {
  tier: BugFixRiskTier;
  /** The first path that decided `held`, or null. */
  heldPath: string | null;
  /** Human reason for the notice ("'billing' in /billing/receipts"). */
  reason: string | null;
}

export const EXTRA_HELD_KEYWORDS: readonly string[] = ['attendance', 'admission', 'admissions'];

export const BUG_FIX_HELD_KEYWORDS: readonly string[] = [...HELD_KEYWORDS, ...EXTRA_HELD_KEYWORDS];

/** Path-shaped rules, POSIX-ERE/JS-common syntax only (no lookaround, no \b). */
export const BUG_FIX_HELD_PATH_RULES: readonly string[] = [
  '(^|/)supabase/migrations/',
  '\\.sql$',
  '(^|/)\\.github/workflows/',
  '(^|/)(auth|middleware[^/]*|rls|policies|payment[^/]*|billing[^/]*|checkout[^/]*)(/|$)',
  '(^|/)\\.env',
  '(^|/)vercel\\.json$',
  '(^|/)CLAUDE\\.md$'
];

/**
 * The one regex, as source text, so SQL and TS run the SAME rule.
 * Case-insensitive on both sides (JS `i`, SQL `~*`). Keyword boundaries are
 * "not a letter or digit" — `_`, `-`, `/`, `.`, `(` and the string edges all
 * count. camelCase is split BEFORE matching (see splitCamel / the SQL
 * regexp_replace) so `useGrades.tsx` reads as `use Grades.tsx`.
 */
export function buildHeldRegexSource(): string {
  const kw = `(^|[^a-z0-9])(${BUG_FIX_HELD_KEYWORDS.join('|')})([^a-z0-9]|$)`;
  return `${kw}|${BUG_FIX_HELD_PATH_RULES.join('|')}`;
}

export const HELD_REGEX_SOURCE = buildHeldRegexSource();
const HELD_RE = new RegExp(HELD_REGEX_SOURCE, 'i');

/** Mirror of the SQL `regexp_replace(p, '([a-z0-9])([A-Z])', '\1 \2', 'g')`. */
export function splitCamel(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/** A page URL is judged by its path only (host and query never decide risk). */
export function pathOfUrl(u: string): string {
  try {
    if (/^https?:\/\//i.test(u)) return new URL(u).pathname;
  } catch {
    /* fall through — treat as a path */
  }
  return u.split('?')[0].split('#')[0];
}

export function heldPathHit(path: string): boolean {
  return HELD_RE.test(splitCamel(path));
}

/**
 * Classify a group from the paths that describe it: the fixability verdict's
 * `files` when a verdict exists, else the members' page URLs. An EMPTY list
 * is `low` — a group with no verdict and no page URLs has nothing to judge,
 * and the RPC applies the same rule on the same inputs.
 */
export function classifyBugFixRisk(paths: readonly string[]): BugFixRisk {
  for (const raw of paths) {
    if (!raw) continue;
    const p = pathOfUrl(raw);
    if (heldPathHit(p)) {
      const m = splitCamel(p).match(HELD_RE);
      // keep a leading '.' (".sql", ".env"), drop the boundary chars around a keyword
      const token = m ? m[0].replace(/^[^a-z0-9.]+/i, '').replace(/[^a-z0-9]+$/i, '') : p;
      return { tier: 'held', heldPath: p, reason: `'${token}' in ${p}` };
    }
  }
  return { tier: 'low', heldPath: null, reason: null };
}

/** Paths to judge for a cluster: verdict files first, else members' page URLs. */
export function riskPathsForCluster(
  verdictFiles: readonly string[] | null | undefined,
  memberPageUrls: readonly (string | null | undefined)[]
): string[] {
  if (verdictFiles && verdictFiles.length > 0) return [...verdictFiles];
  return memberPageUrls.filter((u): u is string => !!u);
}
