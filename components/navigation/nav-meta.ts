/**
 * Optional per-page nav metadata override.
 *
 * Pages can export a `navMeta` const to customize how they appear in
 * AutoTabNav (label and icon). Both fields are optional.
 *
 * @example
 * // app/(routes)/admission/leads/page.tsx
 * export const navMeta: NavMeta = {
 *   label: 'All Leads',
 *   icon: 'Users',
 * };
 *
 * Without a navMeta export, AutoTabNav falls back to:
 *   label = title-cased URL segment (e.g. 'leads' → 'Leads')
 *   icon  = inferred from URL keywords (see scripts/generate-route-manifest.ts)
 *
 * The build script reads navMeta literals via regex; keep them as plain
 * object literals (no spreads, no computed keys) so the parser can find them.
 */

export interface NavMeta {
  label?: string;
  /** Lucide icon export name (e.g. 'Users', 'Settings', 'BarChart') */
  icon?: string;
}
