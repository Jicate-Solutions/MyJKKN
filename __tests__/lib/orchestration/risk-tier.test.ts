/**
 * Tests for `classifyRiskTier` (lib/services/orchestration/risk-tier.ts).
 *
 * WHY THIS EXISTS
 *   The tier decides what the merge action will accept: a HELD PR needs an
 *   explicit acknowledgement, a LOW PR may merge unattended. Mis-classifying
 *   a fee or marks change as LOW would let it land with nobody looking; so
 *   the HELD-wins and never-LOW-on-doubt rules are pinned here as hard as the
 *   happy path.
 */
import { describe, it, expect } from 'vitest';
import { classifyRiskTier } from '@/lib/services/orchestration/risk-tier';

const notDraft = { isDraft: false, title: 'chore: tidy' };

describe('classifyRiskTier — HELD', () => {
  it('HELD by filename keyword (fees)', () => {
    const r = classifyRiskTier(['app/(routes)/fees/page.tsx'], notDraft);
    expect(r.tier).toBe('HELD');
    expect(r.reasons.join(' ')).toContain("'fees' in app/(routes)/fees/page.tsx");
  });

  it('HELD by migration path, even with no keyword anywhere', () => {
    const r = classifyRiskTier(['supabase/migrations/20261105000000_add_thing.sql'], notDraft);
    expect(r.tier).toBe('HELD');
    expect(r.reasons[0]).toMatch(/^migration: supabase\/migrations\//);
  });

  it('HELD by any .sql file outside migrations', () => {
    const r = classifyRiskTier(['scripts/backfill.SQL'], notDraft);
    expect(r.tier).toBe('HELD');
    expect(r.reasons[0]).toMatch(/^sql file:/);
  });

  it('HELD by title keyword when every file is docs', () => {
    const r = classifyRiskTier(['docs/overview.md'], { isDraft: false, title: 'docs: explain the refund flow' });
    expect(r.tier).toBe('HELD');
    expect(r.reasons).toContain("title mentions 'refund'");
  });

  it('HELD beats LOW — an all-tests PR that touches a marks test is HELD', () => {
    const r = classifyRiskTier(['__tests__/lib/marks-service.test.ts', 'README.md'], notDraft);
    expect(r.tier).toBe('HELD');
  });

  it('matches word-ish boundaries: underscores, dashes, camelCase, dots', () => {
    expect(classifyRiskTier(['lib/student_marks.ts'], notDraft).tier).toBe('HELD');
    expect(classifyRiskTier(['lib/fee-structure.ts'], notDraft).tier).toBe('HELD');
    expect(classifyRiskTier(['hooks/useGrades.tsx'], notDraft).tier).toBe('HELD');
    expect(classifyRiskTier(['lib/Exam.ts'], notDraft).tier).toBe('HELD');
  });

  it('does NOT fire on substrings inside other words (coffee, remarks, upgrade, example)', () => {
    const r = classifyRiskTier(['lib/coffee.ts', 'lib/remarks.ts', 'lib/upgrade.ts', 'lib/example.ts'], notDraft);
    expect(r.tier).toBe('NORMAL');
  });
});

describe('classifyRiskTier — LOW', () => {
  it('LOW when every file is docs / types / tests / lint config', () => {
    const r = classifyRiskTier(
      [
        'README.md',
        'docs/guide/setup.md',
        'types/orchestration.ts',
        'lib/foo.d.ts',
        '__tests__/lib/thing.test.ts',
        'lib/other.spec.ts',
        '.eslintrc.json',
        '.prettierrc',
        'eslint.config.mjs',
      ],
      notDraft
    );
    expect(r.tier).toBe('LOW');
    expect(r.reasons[0]).toContain('all 9 file(s)');
  });

  it('NOT LOW when one app file is mixed in', () => {
    const r = classifyRiskTier(['README.md', 'lib/services/thing.ts'], notDraft);
    expect(r.tier).toBe('NORMAL');
    expect(r.reasons[0]).toContain('lib/services/thing.ts');
  });

  it('NOT LOW for a draft, even when every file is low', () => {
    const r = classifyRiskTier(['README.md'], { isDraft: true, title: 'docs' });
    expect(r.tier).toBe('NORMAL');
    expect(r.reasons[0]).toContain('draft');
  });

  it('NOT LOW on an empty file list — NORMAL, never LOW on empty', () => {
    const r = classifyRiskTier([], notDraft);
    expect(r.tier).toBe('NORMAL');
    expect(r.reasons[0]).toContain('no changed files');
  });

  it('a workflow yml is NOT low — workflows gate other merges', () => {
    const r = classifyRiskTier(['.github/workflows/lib-unit-suite.yml'], notDraft);
    expect(r.tier).toBe('NORMAL');
  });
});

describe('classifyRiskTier — NORMAL', () => {
  it('ordinary app code is NORMAL and names the first files', () => {
    const r = classifyRiskTier(['app/page.tsx', 'lib/a.ts', 'lib/b.ts', 'lib/c.ts', 'lib/d.ts'], notDraft);
    expect(r.tier).toBe('NORMAL');
    expect(r.reasons[0]).toContain('(+2 more)');
  });
});
