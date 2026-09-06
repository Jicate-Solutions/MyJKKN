// lib/constants/carre-auditable-modules.ts
// ============================================================================
// CARRE_AUDITABLE_MODULES — the people-facing modules the CARRE Coverage Map
// tracks. Keys are the top-level slugs from lib/navigation/modules.ts (MODULES),
// so a key maps 1:1 to a URL prefix (`/<key>`).
//
// THE INCLUDE / EXCLUDE RULE
//   INCLUDE a module when a LEARNER or STAFF MEMBER directly EXPERIENCES it as a
//   participant — the surfaces where CARRE's five pillars (Clarity, Appreciation,
//   Recognition, Respect, Empowerment) actually land on a human.
//   EXCLUDE pure infrastructure / back-office / system tooling that only admins
//   operate and that no participant "experiences" as an initiative:
//     dashboards & landings, user/role admin, org-structure config, the audit
//     tooling itself (a module never grades itself), audit-trail, accreditation
//     compliance paperwork, inventory/stockroom ops, system settings, bug
//     tooling, and personal top-bar surfaces (profile / notifications).
//
// This is a plain data array on purpose — a human reviews and prunes it. Each
// borderline call is flagged inline so it is easy to flip. If a slug is added
// to or removed from MODULES, reconcile it here.
//
// Excluded slugs (for the reviewer's audit trail):
//   ''  (Dashboard root), ai-query, users, organizations, ims (Inventory),
//   admin, audit, audit-trail, accreditation, system, my-bug-reports,
//   bug-leaderboard, profile, notifications, dashboard (Classic).
// ============================================================================

export interface CarreAuditableModule {
  /** Top-level slug from lib/navigation/modules.ts — the `/<key>` URL prefix. */
  key: string;
  /** Human-readable label (mirrors the MODULES label). */
  label: string;
}

export const CARRE_AUDITABLE_MODULES: CarreAuditableModule[] = [
  // ── Applications ──────────────────────────────────────────────────────
  { key: 'application-hub', label: 'Application Hub' },
  { key: 'my-kit', label: 'My Kit (Store Kits)' }, // participant surface of the IMS kit module — IMS itself stays excluded (stockroom ops)
  { key: 'applications', label: 'Applications' },

  // ── Academic & learning experiences ──────────────────────────────────
  { key: 'academic', label: 'Academic' },
  { key: 'learn', label: 'Learning' },
  { key: 'vac', label: 'Value Added Courses' },
  { key: 'bos', label: 'Board of Studies' }, // borderline: faculty curriculum governance (participatory)
  { key: 'foundation', label: 'Foundation Programme' }, // school students take diagnostics (participant-facing)

  // ── Learner-facing life on campus ─────────────────────────────────────
  { key: 'campus-living', label: 'Campus Living' }, // hostel / mess
  { key: 'admission', label: 'Admission CRM' },
  { key: 'learners', label: 'Learners' },
  { key: 'learners-council', label: 'Learners Council' },
  { key: 'moments', label: 'Family Moments' }, // parent engagement campaign
  { key: 'health', label: 'Health & Wellness' },
  { key: 'events', label: 'Events' }, // incl. induction (/events/induction)
  { key: 'startup-studio', label: 'Startup Studio' },
  { key: 'solutions', label: 'Solution Hub' },
  { key: 'improvement-board', label: 'Improvement Board' }, // MBA teaching-enterprise: Associates file improvement ideas (participant-facing)

  // ── Staff / faculty experiences ───────────────────────────────────────
  { key: 'faculty', label: 'Faculty' },
  { key: 'staff', label: 'Staff' }, // employee self-service
  { key: 'hr', label: 'HR' }, // borderline: employees experience HR services (leave/grievance)
  { key: 'projects', label: 'Projects' }, // staff work-management
  { key: 'meetings', label: 'Meetings' },
  { key: 'work-pulse', label: 'Work Pulse' },
  { key: 'ai-pulse', label: 'AI Pulse' },

  // ── Shared services people interact with ──────────────────────────────
  { key: 'billing', label: 'Billing' },
  { key: 'service-requests', label: 'Service Requests' },
  { key: 'resource-management', label: 'Resources' }, // booking / requesting resources
];

// Explicitly EXCLUDED slugs — infra / back-office / system tooling that no
// participant "experiences" as an initiative. Exported so the CI gate
// (scripts/ci/check-carre-coverage.sh) can assert every top-level module is
// classified as either auditable or excluded; a brand-new module that is
// NEITHER gets flagged for a decision. Keep in sync with the header comment.
export const CARRE_EXCLUDED_MODULES: string[] = [
  '', // Dashboard root landing
  'ai-query', // AI assistant tooling
  'users', // user / role admin
  'organizations', // org-structure config
  'ims', // inventory / stockroom ops
  'admin', // back-office admin
  'audit', // the audit tooling itself — a module never grades itself
  'audit-trail', // activity log
  'accreditation', // compliance paperwork, not a participant experience
  'tracker', // open compliance/tracking board — a back-office follow-up surface, not a participant experience
  'system', // system settings
  'my-bug-reports', // bug tooling
  'bug-leaderboard', // bug tooling
  'profile', // personal top-bar surface
  'notifications', // personal top-bar surface
  'dashboard', // Classic dashboard
];

