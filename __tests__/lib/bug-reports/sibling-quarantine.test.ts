/**
 * Quarantine of college-app bugs (status 'unverified', #4322). Their text came
 * in on a public key, so it must reach no export, bulk action or AI hand-off
 * until a person promotes the bug to 'new'.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { BUG_STATUS_TABS, ALL_BUG_STATUSES } from '@/lib/utils/bug-reports/status-tabs';
import { hasImageSignature } from '@/lib/bug-reports/sibling-intake';

const src = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

describe('quarantine: unverified college-app bugs', () => {
  it('is in no tab except All (statuses null), so New-tab exports and bulk actions never see it', () => {
    for (const tab of BUG_STATUS_TABS) {
      if (tab.statuses === null) continue;
      expect(tab.statuses).not.toContain('unverified');
    }
    // still findable through All's status filter
    expect(ALL_BUG_STATUSES).toContain('unverified');
  });

  it('the export route always excludes it', () => {
    expect(src('app/api/bug-reports/export/route.ts')).toMatch(/\.neq\('status', 'unverified'\)/);
  });

  it('the bulk status route never updates it', () => {
    const code = src('app/api/bug-reports/bulk-update-status/route.ts');
    expect(code).toMatch(/\.in\('id', reportIds\)\s*\.neq\('status', 'unverified'\)\s*\.select\('id'\)/);
    // and it reports, cascades and emails only the rows it actually changed
    expect(code).toMatch(/updatedCount: changedIds\.length/);
    expect(code).toMatch(/\.in\('duplicate_of', changedIds\)/);
  });

  it('never reaches the duplicate-check prompt as a candidate', () => {
    // the candidate function returns only open statuses ...
    const fn = src('supabase/migrations/20260802020000_bug_duplicate_check_job_and_candidates.sql');
    expect(fn).toMatch(/AND b\.status IN \('new', 'seen', 'in_progress'\)/);
    // ... and the handler filters again, in case that function ever changes
    expect(src('lib/api/bug-reports/handlers/duplicate-check.ts')).toMatch(
      /\.filter\(\s*\(c: CandidateRow\) => c\.status !== 'unverified'\s*\)/
    );
  });

  it('no status change can move a bug INTO unverified: only the intake sets it', () => {
    for (const file of ['lib/api/bug-reports/handlers/report.ts', 'app/api/bug-reports/bulk-update-status/route.ts']) {
      const targets = /status: z\.enum\(\[([^\]]*)\]\)/.exec(src(file))?.[1] ?? '';
      expect(targets, file).toMatch(/'new'/);
      expect(targets, file).not.toMatch(/unverified/);
    }
  });

  it('service-role paths apply the college-app row rule themselves (super admins only)', () => {
    expect(src('lib/api/bug-reports/handlers/report.ts')).toMatch(
      /scope\.application_id && !scope\.institution_id && !isSuperAdmin/
    );
    expect(src('app/api/bug-reports/export/route.ts')).toMatch(
      /isSuperAdmin \|\| bug\.metadata\?\.source !== 'sibling_app' \|\| bug\.institution_name/
    );
  });

  it.each(['ai-triage', 'duplicate-check', 'ai-reverify'])('the %s handler refuses it with 409', (h) => {
    const code = src(`lib/api/bug-reports/handlers/${h}.ts`);
    expect(code).toMatch(/select\(\s*'id, display_id, status,/);
    expect(code).toMatch(/if \(bug\.status === 'unverified'\)[\s\S]{0,300}status: 409/);
  });
});

describe('hasImageSignature', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const webp = Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1');
  it('accepts real signatures and refuses mismatches', () => {
    expect(hasImageSignature(png, 'image/png')).toBe(true);
    expect(hasImageSignature(jpg, 'image/jpeg')).toBe(true);
    expect(hasImageSignature(webp, 'image/webp')).toBe(true);
    expect(hasImageSignature(jpg, 'image/png')).toBe(false);
    expect(hasImageSignature(Buffer.from('<svg/>'), 'image/png')).toBe(false);
  });
});
