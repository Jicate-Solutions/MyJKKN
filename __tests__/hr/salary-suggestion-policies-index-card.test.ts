/**
 * The "Salary suggestion" card on /hr/admin/policies is shown to super admins
 * only.
 *
 * The index opens for hr.policies.view, and its menu entry for
 * hr.dashboard.view — far more people than the super admins who may open the
 * page the card links to (the amounts are pay figures; only the Director
 * changes them). The page is a server component that reads is_super_admin()
 * itself, so this reads its source: the card must be marked superAdminOnly,
 * and the list rendered must be filtered on a STRICT `=== true` answer (an
 * error or null hides the card).
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-policies-index-card.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'app/(routes)/hr/admin/policies/page.tsx'), 'utf8');

describe('the salary suggestion card on the HR policies index', () => {
  it('is marked super-admin only', () => {
    const entry = SRC.slice(SRC.indexOf("href: '/hr/admin/policies/salary-suggestion'"));
    const block = entry.slice(0, entry.indexOf('},'));
    expect(block).toMatch(/superAdminOnly:\s*true/);
  });

  it('the index asks is_super_admin() on the server and hides such cards unless the answer is exactly true', () => {
    expect(SRC).toMatch(/await supabase\.rpc\('is_super_admin'\)/);
    expect(SRC).toMatch(
      /POLICY_EDITORS\.filter\(\(entry\) => !entry\.superAdminOnly \|\| superAdmin === true\)/
    );
    expect(SRC).toMatch(/\{editors\.map\(\(entry\) =>/);
    expect(SRC).not.toMatch(/\{POLICY_EDITORS\.map\(/);
  });
});
