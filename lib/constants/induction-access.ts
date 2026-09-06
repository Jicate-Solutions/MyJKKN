// Client-safe constant (NO server imports) — shared by server code
// (student-validation-service, OAuth callback) and client code (nav hook).
// Spec: specs/pre-onboarding-induction-access-2026-06-29.md
//
// Pre-onboarding admission-funnel statuses that get RESTRICTED induction-only
// access (My Induction + per-session feedback + profile completion) before being
// onboarded to `active`. Single source of truth — the OAuth callback's
// auto-provision lookup, the proxy/callback gate, the client nav filter, and the
// `auto_link_profile_to_approved_learner` trigger (SQL, mirrored manually) all key
// off this same list.
export const INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES = [
  'admitted',
  'reserved',
  'enquiry_submitted',
  'enquiry',
  // 'account' = login created during the account-transition (pre-active). Included
  // so learners auto-enrolled into a group induction (reserved/admitted/account)
  // can actually log in and reach My Induction. Spec: specs/pre-onboarding-induction-access-2026-06-29.md
  'account',
] as const;

export type InductionEligibleStatus =
  (typeof INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES)[number];

// ---------------------------------------------------------------------------
// The paths a pre-onboarding learner may actually reach.
//
// Enforced in two places that MUST agree: proxy.ts (the real gate — anything
// else redirects to /learners/my-induction) and sidebarMenuLink.ts (nav
// presentation — hides links that would only redirect). These lived as two
// hand-mirrored copies in those two files until 2026-09-02; a nav href the
// proxy bounces is a dead link, and a proxy-allowed page with no nav href is
// unreachable, so they are defined together here and drift-tested in
// __tests__/lib/induction-only-access.test.ts.
// ---------------------------------------------------------------------------

/** Exactly-matched paths. NOTE: /auth/* is already public in proxy.ts. */
export const INDUCTION_ONLY_EXACT_PATHS = new Set<string>([
  '/learners/my-profile', // profile completion — the My Induction nudge target
  '/unauthorized',
  '/error',
]);

/** Path prefixes; a whole module tree opens up per entry. */
export const INDUCTION_ONLY_PREFIXES = [
  '/learners/my-induction',
  // Reserved/admitted learners raise real requests before they are activated —
  // bus pass, fee concession, fee extension, bonafide. They already hold
  // role='student', so service_types.allowed_roles admits them; only this gate
  // stood in the way. Covers the hub, /new, /my-requests and request detail.
  '/service-requests',
  // AI literacy cycles start before activation. The student role already holds
  // ai_pulse.view / aiPulse:view.self / aiPulse:submit.publication, and every
  // page under here does its own server-side user_has_permission() check, so
  // the champion/admin pages stay shut on their own keys.
  '/ai-pulse',
] as const;

/** True when a pre-onboarding learner is allowed to load `path`. */
export const isInductionOnlyAllowedPath = (path: string): boolean => {
  if (INDUCTION_ONLY_EXACT_PATHS.has(path)) return true;
  for (const prefix of INDUCTION_ONLY_PREFIXES) {
    // `path === prefix || startsWith(prefix + '/')` — a bare startsWith would
    // also match '/service-requests-admin'.
    if (path === prefix || path.startsWith(prefix + '/')) return true;
  }
  return false;
};

/**
 * Sidebar entries kept for pre-onboarding learners. These are TOP-LEVEL menu
 * hrefs as built by GetPages() — the filter matches `menu.href` and drops
 * submenus, so listing a submenu href here would silently keep nothing.
 * Every href must be allowed by isInductionOnlyAllowedPath() — see the drift
 * guard test.
 */
export const INDUCTION_ONLY_NAV_HREFS = new Set<string>([
  '/learners/my-induction',
  '/learners/my-profile',
  '/service-requests',
  // No rewrite entry: /ai-pulse is an "any authenticated user" landing that
  // hides My Pulse / Champion Console behind its own checks, so the hub is the
  // right destination. Service Requests needs one because its hub is staff-shaped.
  '/ai-pulse',
]);

/**
 * Where an induction-only learner should actually land when the top-level entry
 * is an accordion they only get one leaf of. Same shape as the Campus Living
 * student rewrite in GetRoleBasedPages: retarget the href, drop the submenus.
 *
 * The Service Requests hub carries Approvals / Analytics / Manage Services tabs
 * that a pre-onboarding learner holds no permission for; My Requests is the leaf
 * they came for.
 */
export const INDUCTION_ONLY_NAV_REWRITES: Record<
  string,
  { href: string; label: string }
> = {
  '/service-requests': {
    href: '/service-requests/my-requests',
    label: 'Service Requests',
  },
};
