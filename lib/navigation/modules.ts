/**
 * MODULES — single source of truth for the platform's module list.
 *
 * **Module** (per spec D1, `specs/mobile-sidebar-bottomnav-spec.md`) =
 * one top-level URL prefix (`/<slug>`). 34 modules total, derived from
 * the root list of `lib/navigation/route-manifest.generated.ts`.
 *
 * **Wave 2b consumers** (added incrementally — none yet wired):
 *   - PR-S2 — sidebar restructure: one row per module under each section
 *   - PR-S3 — `<SidebarFlyout>` hover panel reading per-module nav-config
 *   - PR-S4 — `<MobileBottomNav>` horizontal-scroll strip of all modules
 *
 * **Scope of this file**: data only. Nothing imports it yet — that's
 * intentional. PR-S1 establishes the data shape with zero visible change;
 * PR-S2 onwards consumes it. Permission-aware filtering stays in
 * `lib/sidebarMenuLink.ts` for now (Wave 2b doesn't change permission
 * gates).
 *
 * **`hasNavConfig`** — true when `app/(routes)/<slug>/nav-config.ts`
 * exists. The 9 nav-config modules render explicit `groups[]` chips via
 * AutoTabNav; the other 25 fall back to manifest-derived chips per
 * decision D10. The flyout (PR-S3) uses this flag to choose between
 * config-driven labels vs route-manifest-derived labels.
 *
 * **`section`** — preserved from the current `lib/sidebarMenuLink.ts`
 * `groupLabel` values per spec D2 ("Preserves current visual grouping").
 * Sub-entries that today render inline (e.g. Organization Management's
 * Institutions / Departments / Programs) collapse into the parent
 * module's flyout — they are NOT separate sidebar rows after PR-S2.
 */

export interface Module {
  /** First URL segment (without leading slash). E.g. `'academic'`. Empty
   * string for the root `/` landing (which renders as the "Dashboard"
   * sidebar entry). */
  slug: string;
  /** Human-readable label for sidebar row + bottom-nav chip. */
  label: string;
  /** Lucide icon name (e.g. `'GraduationCap'`). Resolved at render time. */
  icon: string;
  /** Section header this module lives under (e.g. `'Academic Management'`). */
  section: string;
  /** True when `app/(routes)/<slug>/nav-config.ts` exists. */
  hasNavConfig: boolean;
}

/**
 * 34 modules derived from `lib/navigation/route-manifest.generated.ts`.
 * Order within each section preserves the current sidebar order so PR-S2
 * is a structural rewrite without re-sequencing.
 */
export const MODULES: Module[] = [
  // ── Overview ──────────────────────────────────────────────────────────
  { slug: '', label: 'Dashboard', icon: 'LayoutDashboard', section: 'Overview', hasNavConfig: false },
  { slug: 'ai-query', label: 'AI Assistant', icon: 'Sparkles', section: 'Overview', hasNavConfig: false },

  // ── User Management ───────────────────────────────────────────────────
  { slug: 'users', label: 'Users', icon: 'Users', section: 'User Management', hasNavConfig: false },

  // ── Applications ──────────────────────────────────────────────────────
  // Wave 2 (PR pending) merged 'Application Management' into 'Applications'.
  { slug: 'application-hub', label: 'Application Hub', icon: 'AppWindow', section: 'Applications', hasNavConfig: false },
  { slug: 'applications', label: 'Applications', icon: 'Files', section: 'Applications', hasNavConfig: false },

  // ── Organization ──────────────────────────────────────────────────────
  { slug: 'organizations', label: 'Organizations', icon: 'Building2', section: 'Organization', hasNavConfig: false },

  // ── Academic ──────────────────────────────────────────────────────────
  { slug: 'academic', label: 'Academic', icon: 'GraduationCap', section: 'Academic', hasNavConfig: true },

  // ── Campus Living ─────────────────────────────────────────────────────
  { slug: 'campus-living', label: 'Campus Living', icon: 'Home', section: 'Campus Living', hasNavConfig: true },

  // ── Admission CRM ─────────────────────────────────────────────────────
  { slug: 'admission', label: 'Admission CRM', icon: 'UserPlus', section: 'Admission CRM', hasNavConfig: true },

  // ── Employee Management ───────────────────────────────────────────────
  // Combined section housing both /staff (Staff) and /hr (HR) modules.
  // Renamed from 'Facilitators Management' / 'Human Resources' on
  // 2026-05-09 per product decision to unify under "Employee Management".
  { slug: 'staff', label: 'Staff', icon: 'Briefcase', section: 'Employee Management', hasNavConfig: false },
  { slug: 'hr', label: 'HR', icon: 'UsersRound', section: 'Employee Management', hasNavConfig: false },

  // ── Learners ──────────────────────────────────────────────────────────
  { slug: 'learners', label: 'Learners', icon: 'GraduationCap', section: 'Learners', hasNavConfig: false },

  // ── Billing & Accounts ────────────────────────────────────────────────
  { slug: 'billing', label: 'Billing', icon: 'Wallet', section: 'Billing & Accounts', hasNavConfig: false },

  // ── Resources ─────────────────────────────────────────────────────────
  { slug: 'resource-management', label: 'Resources', icon: 'Package', section: 'Resources', hasNavConfig: false },

  // ── Inventory (IMS) ───────────────────────────────────────────────────
  // Sister to Resources — distinct top-level /ims/* tree.
  { slug: 'ims', label: 'Inventory Management', icon: 'Package', section: 'Inventory (IMS)', hasNavConfig: false },

  // ── Service Requests ──────────────────────────────────────────────────
  { slug: 'service-requests', label: 'Service Requests', icon: 'Wrench', section: 'Service Requests', hasNavConfig: false },

  // ── Administration ────────────────────────────────────────────────────
  { slug: 'admin', label: 'Administration', icon: 'Shield', section: 'Administration', hasNavConfig: false },
  { slug: 'audit-trail', label: 'Audit Trail', icon: 'ScrollText', section: 'Administration', hasNavConfig: false },

  // ── OKR ───────────────────────────────────────────────────────────────
  { slug: 'okr', label: 'OKR & Performance', icon: 'Target', section: 'OKR', hasNavConfig: true },

  // ── AI Pulse ──────────────────────────────────────────────────────────
  // Productivity / activity insights tool — sits next to OKR & Work Pulse.
  { slug: 'ai-pulse', label: 'AI Pulse', icon: 'Sparkles', section: 'AI Pulse', hasNavConfig: false },

  // ── Learning & Courses ────────────────────────────────────────────────
  // Wave 2 (PR pending) merged 'Value Added Courses' into 'Learning & Courses'.
  { slug: 'learn', label: 'Learning', icon: 'BookOpen', section: 'Learning & Courses', hasNavConfig: false },

  // ── Health & Wellness ─────────────────────────────────────────────────
  { slug: 'health', label: 'Health & Wellness', icon: 'HeartPulse', section: 'Health & Wellness', hasNavConfig: false },

  // ── Events ────────────────────────────────────────────────────────────
  { slug: 'events', label: 'Events', icon: 'Calendar', section: 'Events', hasNavConfig: false },

  // ── Meetings ──────────────────────────────────────────────────────────
  // Scheduling / coordination tool — paired with Events.
  { slug: 'meetings', label: 'Meetings', icon: 'CalendarDays', section: 'Meetings', hasNavConfig: false },

  // ── Startup Studio ────────────────────────────────────────────────────
  { slug: 'startup-studio', label: 'Startup Studio', icon: 'Rocket', section: 'Startup Studio', hasNavConfig: true },

  // ── Solution Hub ──────────────────────────────────────────────────────
  { slug: 'solutions', label: 'Solution Hub', icon: 'Lightbulb', section: 'Solution Hub', hasNavConfig: true },

  // (Value Added Courses merged into 'Learning & Courses' above — Wave 2.)
  { slug: 'vac', label: 'Value Added Courses', icon: 'BookOpenCheck', section: 'Learning & Courses', hasNavConfig: false },

  // ── Work Pulse ────────────────────────────────────────────────────────
  { slug: 'work-pulse', label: 'Work Pulse', icon: 'Activity', section: 'Work Pulse', hasNavConfig: false },

  // ── Learners Council ──────────────────────────────────────────────────
  { slug: 'learners-council', label: 'Learners Council', icon: 'Vote', section: 'Learners Council', hasNavConfig: true },

  // ── Faculty ───────────────────────────────────────────────────────────
  { slug: 'faculty', label: 'Faculty', icon: 'UserCog', section: 'Faculty', hasNavConfig: false },

  // ── Audit Workflow ────────────────────────────────────────────────────
  { slug: 'audit', label: 'Audit Workflow', icon: 'ClipboardCheck', section: 'Audit Workflow', hasNavConfig: true },

  // ── Board of Studies ──────────────────────────────────────────────────
  // Academic governance — placed near Audit Workflow & Accreditation.
  { slug: 'bos', label: 'Board of Studies', icon: 'ClipboardList', section: 'Board of Studies', hasNavConfig: true },

  // ── Accreditation ─────────────────────────────────────────────────────
  { slug: 'accreditation', label: 'Accreditation', icon: 'Award', section: 'Accreditation', hasNavConfig: true },

  // ── System ────────────────────────────────────────────────────────────
  { slug: 'system', label: 'System', icon: 'Settings', section: 'System', hasNavConfig: false },
  { slug: 'my-bug-reports', label: 'My Bug Reports', icon: 'Bug', section: 'System', hasNavConfig: false },
  { slug: 'bug-leaderboard', label: 'Bug Leaderboard', icon: 'Trophy', section: 'System', hasNavConfig: false },

  // ── Top-bar surfaces (rendered in avatar/bell menus, not main sidebar,
  //    but included so the bottom-nav can surface them on mobile if
  //    needed and so the constant covers every top-level route) ─────────
  { slug: 'profile', label: 'Profile', icon: 'User', section: 'Top Bar', hasNavConfig: false },
  { slug: 'notifications', label: 'Notifications', icon: 'Bell', section: 'Top Bar', hasNavConfig: false },
  { slug: 'dashboard', label: 'Dashboard (Classic)', icon: 'LayoutGrid', section: 'Top Bar', hasNavConfig: false },
];

/** Look up a module by its slug. Returns `undefined` if no match. */
export function getModuleBySlug(slug: string): Module | undefined {
  return MODULES.find((m) => m.slug === slug);
}

/**
 * Derive the module slug from any URL pathname.
 *   `/admission/marketing/expos` → `'admission'`
 *   `/` → `''` (root → Dashboard module)
 *   `''` → `''`
 */
export function getModuleSlugFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] ?? '';
}

/**
 * Group modules by section, preserving insertion order. Useful for the
 * sidebar renderer (PR-S2) which needs `[section, modules[]]` pairs.
 *
 * Returns an array of `[section, Module[]]` tuples (NOT a `Record`) so
 * iteration order matches `MODULES` declaration order — section headers
 * appear in the same order as today's sidebar.
 */
export function getModulesBySection(): Array<[string, Module[]]> {
  const order: string[] = [];
  const groups = new Map<string, Module[]>();
  for (const m of MODULES) {
    if (!groups.has(m.section)) {
      groups.set(m.section, []);
      order.push(m.section);
    }
    groups.get(m.section)!.push(m);
  }
  return order.map((section) => [section, groups.get(section)!]);
}
