/**
 * Standalone sidebar health check — runs the validator against a no-auth,
 * unfiltered view of the sidebar config.
 *
 * Usage:
 *   npx tsx scripts/check-sidebar-health.ts
 *
 * Exits with code 0 if healthy (no error-level issues), 1 otherwise. Can be
 * wired to CI via a later PR by adding:
 *   "check:sidebar": "tsx scripts/check-sidebar-health.ts"
 * to package.json scripts.
 *
 * Why not just import GetRoleBasedPages? Because it requires a pathname and
 * a RolePermissionData. For structural validation we just need the raw menu
 * config — passing a dummy pathname and super-admin role gives us everything
 * without needing DB access.
 */

import { GetRoleBasedPages } from '../lib/sidebarMenuLink';
import {
  validateSidebar,
  assertSidebarHealthy,
} from '../lib/sidebar-validator';

const groups = GetRoleBasedPages('/', {
  role_key: 'super_admin',
  permissions: {},
});

const issues = validateSidebar(groups);
const errors = issues.filter((i) => i.severity === 'error');
const warns = issues.filter((i) => i.severity === 'warn');

console.log(`\n=== Sidebar Health Check ===`);
console.log(`Groups analyzed: ${groups.length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warns.length}\n`);

if (warns.length > 0) {
  console.log(`⚠  WARNINGS (non-blocking):`);
  warns.forEach((w) => console.log(`   ${w.path}: ${w.message}`));
  console.log('');
}

if (errors.length > 0) {
  console.log(`✗  BLOCKING ISSUES:`);
  errors.forEach((e) => console.log(`   ${e.path}: ${e.message}`));
  console.log('');
}

// Throws with a summary if errors exist — non-zero exit for CI
try {
  assertSidebarHealthy(groups);
  console.log(`✓ Sidebar structure is healthy (no blocking issues).`);
  process.exit(0);
} catch (err) {
  console.error(`\n${(err as Error).message}\n`);
  process.exit(1);
}
