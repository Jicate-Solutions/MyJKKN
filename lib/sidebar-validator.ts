/**
 * Sidebar structural validator — enforces that new modules follow the nested
 * menu pattern instead of shipping as flat lists.
 *
 * Why this exists:
 *   - The recursive `Submenu` type + `FavoriteStar` rendering added in PR #314
 *     ENABLED deep nesting, but did not REQUIRE it.
 *   - Without enforcement, a developer adding a new module can still ship a
 *     flat list of 15+ top-level items, regressing the sidebar into the same
 *     cluttered state we just fixed.
 *   - Patterns only stick if the bad path is hard to take. This validator
 *     makes the bad path loud in dev and blocks the worst offenders in CI.
 *
 * Thresholds (Miller's 7±2 law):
 *   - WARN_THRESHOLD = 8  → dev-mode console warning with actionable guidance
 *   - ERROR_THRESHOLD = 15 → hard failure (used by CI test)
 */

import type { LucideIcon } from 'lucide-react';

const WARN_THRESHOLD = 8;
const ERROR_THRESHOLD = 15;

// Structural shape — decoupled from GetRoleBasedPages return type so this
// validator can be called against the raw config or the filtered output.
interface ValidatorMenuItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  submenus?: Array<{
    href: string;
    label: string;
    icon?: LucideIcon;
    submenus?: Array<unknown>;
  }>;
}

interface ValidatorMenuGroup {
  groupLabel?: string;
  menus: ValidatorMenuItem[];
}

export type SidebarIssueSeverity = 'warn' | 'error';

export interface SidebarIssue {
  severity: SidebarIssueSeverity;
  groupLabel: string;
  path: string;
  count: number;
  threshold: number;
  message: string;
}

/**
 * Recursively count flat items at each nesting level and flag any level that
 * has too many flat children. A "flat child" is one without its own submenus.
 */
function countFlatChildren(
  items: Array<{ submenus?: Array<unknown> }>
): number {
  return items.filter(
    (item) => !item.submenus || item.submenus.length === 0
  ).length;
}

/**
 * Validate a MenuGroup[] tree. Returns all issues found (empty array = clean).
 */
export function validateSidebar(
  groups: ValidatorMenuGroup[]
): SidebarIssue[] {
  const issues: SidebarIssue[] = [];

  for (const group of groups) {
    const groupLabel = group.groupLabel ?? '(unnamed)';
    const topLevelCount = group.menus.length;

    // Top-level check — too many direct children under a group
    if (topLevelCount >= ERROR_THRESHOLD) {
      issues.push({
        severity: 'error',
        groupLabel,
        path: groupLabel,
        count: topLevelCount,
        threshold: ERROR_THRESHOLD,
        message:
          `Group "${groupLabel}" has ${topLevelCount} top-level items (hard cap: ${ERROR_THRESHOLD - 1}). ` +
          `This is always a design failure. Group related items under nested parents — see Campus Living or Learners Council in sidebarMenuLink.ts for the pattern.`,
      });
    } else if (topLevelCount > WARN_THRESHOLD) {
      issues.push({
        severity: 'warn',
        groupLabel,
        path: groupLabel,
        count: topLevelCount,
        threshold: WARN_THRESHOLD,
        message:
          `Group "${groupLabel}" has ${topLevelCount} top-level items (suggested max: ${WARN_THRESHOLD}). ` +
          `Collapse this module to a single sidebar entry and move section tabs IN-PAGE — see Campus Living or Learners Council (lc-nav.tsx / cl-nav.tsx + SectionSubNav).`,
      });
    }

    // Wave 2b PR-S2 (2026-04-24, spec D2+D4): submenu-level UI checks
    // retired. Per the flat-sidebar spec, module rows' `submenus[]` arrays
    // are DATA that feeds the PR-S3 hover flyout — they are no longer
    // rendered inline in the sidebar. Only the top-level per-section count
    // still maps to a UI-clutter concern.
  }

  return issues;
}

/**
 * Dev-only: log all issues to the console. Call once per render (idempotent
 * because the log is tagged and deduplicated by pathname in React strict mode).
 * No-op in production.
 */
let loggedInThisSession = false;
export function logSidebarHealthDev(
  groups: ValidatorMenuGroup[]
): void {
  if (process.env.NODE_ENV === 'production') return;
  if (loggedInThisSession) return;
  loggedInThisSession = true;

  const issues = validateSidebar(groups);
  if (issues.length === 0) return;

  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');

  if (errors.length > 0) {
    console.error(
      `[Sidebar Health] ${errors.length} BLOCKING issue${errors.length > 1 ? 's' : ''} — groups exceeding the hard cap of ${ERROR_THRESHOLD - 1} items. These will fail CI.`
    );
    errors.forEach((e) => console.error(`  ✗ ${e.path}: ${e.message}`));
  }
  if (warns.length > 0) {
    console.warn(
      `[Sidebar Health] ${warns.length} warning${warns.length > 1 ? 's' : ''} — groups above the suggested ${WARN_THRESHOLD}-item threshold. Consider restructuring.`
    );
    warns.forEach((w) => console.warn(`  ⚠ ${w.path}: ${w.message}`));
  }
}

/**
 * CI entry point — throws if any ERROR-level issue exists.
 * Run via `npm run check:sidebar` or from a test file.
 */
export function assertSidebarHealthy(
  groups: ValidatorMenuGroup[]
): void {
  const issues = validateSidebar(groups);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    const summary = errors
      .map((e) => `  ✗ ${e.path}: ${e.count} items (max: ${ERROR_THRESHOLD - 1})`)
      .join('\n');
    throw new Error(
      `Sidebar structure has ${errors.length} blocking issue${errors.length > 1 ? 's' : ''}:\n${summary}\n\n` +
        `See lib/sidebar-validator.ts and Campus Living in sidebarMenuLink.ts for the nested pattern.`
    );
  }
}
