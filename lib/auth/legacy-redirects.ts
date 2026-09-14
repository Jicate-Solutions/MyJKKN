/**
 * Legacy path redirects — served from proxy.ts, NOT from next.config.ts.
 *
 * Route budget (2026-09-14): Vercel caps a deployment at 2048 routes. Every
 * next.config `redirects()` entry costs one route and every dynamic page or API
 * file (`[id]`) costs two. The 10:23 production build reached 2061 and failed
 * with `too_many_routes` (the 2026-09-03 build failed the same way at 2051).
 * A redirect answered by middleware costs no route at all, so the whole table
 * lives here. Same semantics as the `redirects()` entries it replaces:
 *
 *   • a PREFIX rule matches the bare path AND everything under it (Next's
 *     `:path*` means zero or more segments); the remainder is appended to `to`
 *   • an EXACT rule matches only that path (the two carve-outs that used to be
 *     listed ahead of their prefix twin: `/iqac` and `/admin/pde/naac-evidence`)
 *   • 308 = permanent, 307 = non-permanent (kept reversible), 301 = the older
 *     campaign entries that were already here in proxy.ts
 *   • the query string is preserved by the caller (URL clone, pathname swap)
 *
 * Order matters only where an exact rule shares a prefix with a later one —
 * keep exact rules ABOVE their prefix twin.
 */
export type LegacyRedirect = {
  from: string;
  to: string;
  status: 301 | 307 | 308;
  exact?: boolean;
};

export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [
  // Legacy drip-sequence routes relocated to /automations/ (2026-05-12).
  { from: '/admission/marketing/campaigns/monitoring', to: '/admission/marketing/automations/monitoring', status: 301, exact: true },
  { from: '/admission/marketing/campaigns/roi', to: '/admission/marketing/automations/roi', status: 301, exact: true },
  { from: '/admission/marketing/campaigns/segments', to: '/admission/marketing/automations/segments', status: 301, exact: true },
  // Learners nav consolidation (2026-07-06): "My Attendance Feedback" merged into
  // "Learning Studio Feedback"; the page no longer exists, so nothing lists it.
  { from: '/learners/my-attendance-feedback', to: '/learners/class-feedback', status: 307, exact: true },
  // PR-A1 (Compliance Unification Program 2026-04-17)
  { from: '/solutions/compliance', to: '/solutions/ai-solution-compliance', status: 308 },
  { from: '/api/solutions/compliance', to: '/api/solutions/ai-solution-compliance', status: 308 },
  // PR-A7: /iqac landing differs from /iqac/* — exact rule first
  { from: '/iqac', to: '/accreditation', status: 308, exact: true },
  { from: '/iqac', to: '/accreditation/naac', status: 308 },
  // PR-A4: NAAC evidence carve-out stays ahead of the /admin/pde prefix
  { from: '/admin/pde/naac-evidence', to: '/pde/admin/accreditation-evidence/naac', status: 308, exact: true },
  // PDE Module Extraction (2026-06-09)
  { from: '/admin/pde', to: '/pde/admin', status: 308 },
  { from: '/faculty/pde', to: '/pde/faculty', status: 308 },
  { from: '/learn/pde', to: '/pde/learn', status: 308 },
  // Internship URL migration (2026-06-02)
  { from: '/admin/internship-policy', to: '/internships/policy', status: 307 },
  // 2026-06-10 / 06-11 admin-cluster relocations
  { from: '/admin/consultants', to: '/admission/consultants/admin', status: 307 },
  { from: '/admin/counselors', to: '/admission/counselors/admin', status: 307 },
  { from: '/admin/lead-stages-policy', to: '/admission/settings/lead-stages-policy', status: 307 },
  { from: '/admin/telephony-policies', to: '/admission/settings/telephony-policies', status: 307 },
  { from: '/admin/social', to: '/admission/social', status: 307 },
  { from: '/admin/cdc', to: '/cdc/admin', status: 307 },
  { from: '/admin/hr', to: '/hr/admin', status: 307 },
  { from: '/admin/departments', to: '/organizations/departments/hod-assignment', status: 307 },
  { from: '/admin/lifecycle', to: '/learners/lifecycle', status: 307 },
  { from: '/admin/ai-query-tools', to: '/ai-query/admin', status: 307 },
  { from: '/admin/config/ai-pulse', to: '/ai-pulse/admin/policies', status: 307 },
  { from: '/admin/instagram-attribution', to: '/admission/social/attribution', status: 307 },
  { from: '/admin/integrations/meta-pixel', to: '/admission/social/meta-pixel', status: 307 },
  { from: '/admin/integrations/meta-audiences', to: '/admission/social/meta-audiences', status: 307 },
  { from: '/admin/voice-memo-monitor', to: '/admission/settings/voice-memo-monitor', status: 307 },
  { from: '/admin/exophone-mapping', to: '/admission/settings/exophone-mapping', status: 307 },
  { from: '/admin/notifications', to: '/notifications/admin', status: 307 },
];

/** The redirect for `pathname`, or null when it is not a legacy path. */
export function resolveLegacyRedirect(
  pathname: string
): { pathname: string; status: 301 | 307 | 308 } | null {
  for (const r of LEGACY_REDIRECTS) {
    if (pathname === r.from) return { pathname: r.to, status: r.status };
    if (!r.exact && pathname.startsWith(r.from + '/')) {
      return { pathname: r.to + pathname.slice(r.from.length), status: r.status };
    }
  }
  return null;
}
