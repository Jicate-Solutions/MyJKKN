// ============================================================================
// Low-risk fix gate — ONE rule in two runtimes (Director ruling 2026-09-15).
//   1. The SQL gate in fn_bug_cluster_fix_request carries a LITERAL copy of the
//      module's regex; this test fails the moment either side drifts.
//   2. Classification: money/marks/exams (Orchestration HELD_KEYWORDS), the
//      /fixallbugs danger-zone paths, and the ruling's attendance/admissions
//      are HELD; copy/layout/display paths are LOW; page URLs are judged by
//      path only; verdict files win over page URLs; empty is LOW.
// ============================================================================
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUG_FIX_HELD_KEYWORDS,
  buildHeldRegexSource,
  classifyBugFixRisk,
  riskPathsForCluster
} from '@/lib/bug-reports/fix-risk';
import { HELD_KEYWORDS } from '@/lib/services/orchestration/risk-tier';

const MIGRATION = 'supabase/migrations/20260915093000_bug_feedback_admin_confirm_and_lowrisk_gate.sql';

describe('fix-risk: the SQL gate and the TS module run the same regex', () => {
  it('the migration carries the module regex verbatim (single quotes doubled for SQL)', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const literal = `~* '${buildHeldRegexSource().replace(/'/g, "''")}'`;
    expect(sql).toContain(literal);
    expect(sql.split("~* '").length - 1).toBe(1); // exactly one gate regex in the file
  });
  it('reuses the Orchestration HELD_KEYWORDS rather than a second money/marks list', () => {
    for (const k of HELD_KEYWORDS) expect(BUG_FIX_HELD_KEYWORDS).toContain(k);
    expect(BUG_FIX_HELD_KEYWORDS).toContain('attendance');
    expect(BUG_FIX_HELD_KEYWORDS).toContain('admissions');
  });
});

describe('fix-risk: classification', () => {
  it.each([
    ['app/(routes)/billing/receipts/page.tsx', "'billing'"],
    ['lib/services/attendance/faculty-attendance-service.ts', "'attendance'"],
    ['app/(routes)/admission/leads/page.tsx', "'admission'"],
    ['lib/hooks/useGrades.tsx', "'Grades'"],
    ['lib/payroll/run.ts', "'payroll'"],
    ['supabase/migrations/20260915000000_x.sql', 'supabase/migrations'],
    ['supabase/setup/02_functions.sql', '.sql'],
    ['.github/workflows/ci.yml', '.github/workflows'],
    ['proxy.ts', null], // NOT middleware* — proxy.ts is a different file
    ['app/auth/login/page.tsx', "'auth'"],
    ['middleware.ts', 'middleware'],
    ['lib/supabase/rls/helpers.ts', 'rls'],
    ['vercel.json', 'vercel.json'],
    ['CLAUDE.md', 'CLAUDE.md'],
    ['.env.local', '.env']
  ])('%s → held (%s)', (path, token) => {
    const r = classifyBugFixRisk([path]);
    if (token === null) {
      expect(r.tier).toBe('low');
    } else {
      expect(r.tier).toBe('held');
      expect(r.heldPath).toBe(path);
      expect(r.reason).toContain(token);
    }
  });

  it.each([
    'app/(routes)/academic/timetables/page.tsx',
    'components/ui/badge.tsx',
    'app/(routes)/admin/bug-reports/_components/bug-groups-tab.tsx',
    'lib/utils/format-date.ts',
    'app/(routes)/learners/my-syllabus/page.tsx',
    'components/remarks-panel.tsx', // "remarks" is not "marks"
    'lib/coffee.ts' // "coffee" is not "fee"
  ])('%s → low', (path) => {
    expect(classifyBugFixRisk([path]).tier).toBe('low');
  });

  it('judges a page URL by its path only', () => {
    expect(classifyBugFixRisk(['https://www.jkkn.ai/billing/receipts?tab=paid']).tier).toBe('held');
    expect(classifyBugFixRisk(['https://www.jkkn.ai/academic/timetables?fee=1']).tier).toBe('low');
    expect(classifyBugFixRisk(['https://billing.example.com/academic/timetables']).tier).toBe('low');
  });

  it('verdict files decide when present; page URLs only when there is no verdict; empty is low', () => {
    expect(riskPathsForCluster(['components/ui/badge.tsx'], ['https://www.jkkn.ai/billing/x'])).toEqual([
      'components/ui/badge.tsx'
    ]);
    expect(riskPathsForCluster([], ['https://www.jkkn.ai/billing/x', null])).toEqual(['https://www.jkkn.ai/billing/x']);
    expect(classifyBugFixRisk([]).tier).toBe('low');
  });
});
