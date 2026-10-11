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
    expect(src('app/api/bug-reports/bulk-update-status/route.ts')).toMatch(
      /\.in\('id', reportIds\)\.neq\('status', 'unverified'\)/
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
