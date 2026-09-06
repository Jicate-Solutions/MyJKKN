#!/usr/bin/env tsx
/**
 * Nav Reachability Simulator — the permanent fix for "pages keep going missing".
 *
 * Runs BFS from every entry point in `lib/sidebarMenuLink.ts` through chip
 * clicks (using the same `resolveTiers` logic AutoTabNav renders at runtime)
 * and reports any static `page.tsx` URL that CANNOT be reached by the user
 * via a sequence of chip + sidebar clicks.
 *
 * Why this is better than the predecessor `assert-nav-coverage.mjs`:
 *
 *   Old detector asked: "is this URL DECLARED somewhere?" — literal href OR
 *   matchPaths OR navMeta.invokedFrom. That test has false-positives: a
 *   declaration can lie (matchPaths doesn't render chips; invokedFrom can
 *   point at a parent with no button). Over three iterations I wrote three
 *   proxies (#408, #416, #419) and each had a false-positive hole that
 *   users reported as missing pages (#440 Group Dashboard was the straw).
 *
 *   This simulator asks: "starting from the user's homepage, can I get to
 *   this URL by clicking chips?" That's the REAL UX question. No proxy.
 *
 * Invariant it guarantees: a PASS here means every static page.tsx on disk
 * is reachable via chip/sidebar clicks from `/`. A FAIL here means a
 * specific URL is invisible to users — the error message names it, names
 * the "closest" URL that's reachable, and suggests the fix.
 *
 * Seed set: every literal href in `lib/sidebarMenuLink.ts`. That's the
 * user's entry-point surface — every sidebar link is assumed reachable.
 *
 * Expansion rule: for each reachable URL, run `resolveTiers(url)` (from
 * `lib/navigation/tier-rendering.ts`) to get the chip tree AutoTabNav
 * would render. Every chip.href is reachable. BFS closure.
 *
 * Compared to the runtime: the simulator is byte-for-byte identical to
 * AutoTabNav's tier computation because both import from the same pure
 * module. If AutoTabNav's logic changes, so does the simulator.
 *
 * Run: `npm run check:reachability`.
 * Baseline: `--max-unreachable <N>` supports gradual tightening (same
 * pattern as the orphan baseline).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTiers } from '../lib/navigation/tier-rendering';

const APP_ROUTES = 'app/(routes)';
const SIDEBAR = 'lib/sidebarMenuLink.ts';

/**
 * Entry-point URLs that don't need to be chip-reachable — they're opened
 * via non-chip surfaces (top-bar avatar, payment-gateway callback, OAuth,
 * etc.). This mirrors `NAV_EXCLUDE` in the predecessor script.
 */
const NAV_EXCLUDE = new Set<string>([
  // Induction Session Catalog — the curated cross-college "best sessions" library.
  // Reached via the "Session catalog" button on the chip-reachable /events/induction
  // landing page (not a tier-strip destination). Gated induction.view in MENU_PERMISSIONS.
  '/events/induction/catalog',
  // Campus Walk fixer screen. Reached from the bell notification the walk task
  // raises, as `/campus-walk/fix?task=<id>` — it renders one specific ticket
  // (see its `searchParams: { task?: string }`) and shows a "no ticket" state
  // with no task id, so it has no standalone chip surface to be reached from.
  '/campus-walk/fix',
  // Top-bar avatar / bell targets
  '/profile',
  '/notifications',
  '/notifications/settings',
  '/dashboard',
  '/dashboard/classic',

  // Payment gateway callback landings
  '/billing/payment',
  '/billing/payment/success',
  '/billing/payment/failed',

  // Billing create-forms, button-invoked from their chip-reachable list page
  // (2026-08-25, when billing gained a nav-config and stopped rendering every
  // manifest sibling as a flat chip). Each was verified to have a real caller:
  //  - /billing/schedule/new         : "New Bill" from the Student Search table
  //  - /billing/schedule/bulk-create : bulk action on the Schedule table
  //  - /billing/receipts/new         : "New Receipt" on /billing/receipts
  //  - /billing/school-fees/new      : plan cards on /billing/school-fees, and
  //    it REQUIRES ?institution=&year=&program= — a bare chip would open broken.
  // /billing/receipts/templates is deliberately NOT here: nothing links to it,
  // so it keeps a real chip in the nav-config instead.
  '/billing/schedule/new',
  '/billing/schedule/bulk-create',
  '/billing/receipts/new',
  '/billing/school-fees/new',

  // SSO / admin-only one-shots
  '/admin/saml',
  '/admin/reset-driver-passwords',
  '/admin/whatsapp-byow/secret-rotation',
  '/system',

  // Internal design tool — the Element Gallery (Phase 1). Not a permissioned
  // module; reached by direct URL / a link we add later, so it has no chip surface.
  '/design-gallery',

  // Module root landings — redirect-to-first-child pages
  '/academic',
  '/admin',
  '/admission',
  '/audit',
  '/billing',
  '/events',
  '/faculty',
  '/health',
  '/ims', // IMS root — redirects to /ims/dashboard
  '/learn',
  '/learners',
  '/organizations',
  '/pde', // PDE module root (PR #1257) — redirects to nav.pde.default_landing (/pde/learn/demonstrations)
  '/resource-management',
  '/staff',
  '/startup-studio',
  '/okr/admin',

  // ────────────────────────────────────────────────────────────
  // 2026-06-10 admin-cluster relocation — admission (counselors +
  // policies). These super-admin config pages moved out of /admin/*
  // (where the filesystem-derived admin tree made them auto-chip-
  // reachable) into the admission namespace. Deliberately NOT wired
  // as nav-config chips: they're SuperAdminOnly/config surfaces and
  // chips would surface them to every admission user (sidebar-shows/
  // page-denies anti-pattern). The counselors/admin hub page links
  // its 5 sub-pages via cards; 307 redirects cover old bookmarks.
  // Same pattern as '/okr/admin' and '/pde/admin/compliance/per-college'.
  // ────────────────────────────────────────────────────────────
  '/admission/counselors/admin',
  '/admission/counselors/admin/alert-thresholds',
  '/admission/counselors/admin/routing-config',
  '/admission/counselors/admin/routing-errors',
  '/admission/counselors/admin/rule-types',
  '/admission/counselors/admin/tier-policy',
  '/admission/settings/lead-stages-policy',
  '/admission/settings/telephony-policies',
  // 2026-06-18 — social governance config (super-admin write-UI for the
  // social.* platform_policies rows). Same SuperAdminOnly/config rationale
  // as the counselors/settings policy pages above: a chip would surface it
  // to every social user (sidebar-shows/page-denies anti-pattern). Reached
  // directly + via the director's-view governance page's "Edit policy →" links.
  '/admission/social/admin/policies',
  // The /admission/social/admin parent is a redirect-to-first-child landing
  // (page.tsx → /admission/social/admin/policies) so the URL doesn't 404;
  // not a chip surface itself — same class as the module-root landings above.
  '/admission/social/admin',

  // ────────────────────────────────────────────────────────────
  // 2026-07-31 — School of Influence (S2). Both of these are
  // redirect-to-first-child landings whose ONLY reason to exist is
  // that Next.js 404s a directory with no page.tsx (the "Hub Page
  // Reachability" gate). Neither is a chip surface: the chip points
  // straight at .../admin/settings, which IS chip-reachable from the
  // Startup Studio nav-config group. Exactly the same class as
  // '/admission/social/admin' directly above.
  // ────────────────────────────────────────────────────────────
  '/startup-studio/school-of-influence',
  '/startup-studio/school-of-influence/admin',

  // ────────────────────────────────────────────────────────────
  // 2026-06-11 admin-cluster relocation wave-2 — departments
  // (HoD assignment). Moved out of /admin/departments (auto-chip-
  // reachable via the filesystem-derived admin tree) into the
  // organizations namespace. Deliberately NOT wired as a nav-config
  // chip: admin_or_super_admin policy surface (PolicyPageShell) —
  // a chip would surface it to every organizations user (sidebar-
  // shows/page-denies anti-pattern). 307 redirects cover old
  // bookmarks. Same pattern as the 2026-06-10 admission block above.
  // ────────────────────────────────────────────────────────────
  '/organizations/departments/hod-assignment',

  // ────────────────────────────────────────────────────────────
  // 2026-06-11 baseline repair — three orphans that landed via
  // direct-to-main commits (no PR, so the PR-time gate never ran)
  // and pushed the count to 53 > 50, breaking `npm run build` at
  // deploy time for everyone. All three are button-invoked pages
  // with a verified in-page link from a chip-reachable parent:
  //  - group-dashboard actions + setup: linked from the Pace tab
  //    (arps-pace-overview.tsx, "Phase 2E nav buttons", 2026-06-07).
  //  - school-defaults/audit: linked from the School Defaults page
  //    header "Audit log" button (added in this same PR — it was a
  //    true orphan with zero inbound links until now).
  // ────────────────────────────────────────────────────────────
  '/admission/group-dashboard/actions',
  '/admission/group-dashboard/setup',
  '/organizations/school-defaults/audit',

  // ────────────────────────────────────────────────────────────
  // Form pages invoked from list-page "+ New" / "Add" / "Create"
  // buttons. Not tier-strip destinations — the user clicks a row
  // action on the parent list, lands here, submits, returns to list.
  // Every entry below has a parent list page that IS chip-reachable.
  // ────────────────────────────────────────────────────────────

  // Billing apportionment rules — button-invoked ("Default Rules") from the
  // chip-reachable parent /billing/apportionment list page.
  '/billing/apportionment/rules',

  // Academic /new forms
  '/academic/batches/new',
  '/academic/leaves/new',
  '/academic/periods/new',
  '/academic/privileges/new',
  '/academic/regulations/new',
  '/academic/staff-planning/new',
  '/academic/timetables/new',
  '/academic/years/new',

  // Accreditation /new forms
  '/accreditation/naac/grievance/new',

  // Admin /new forms
  '/notifications/admin/audiences/new',
  '/pde/admin/assessments/create',
  '/pde/admin/quests/create',

  // Admission /new forms
  '/admission/consultants/new',
  '/admission/gd-pi/new',
  '/admission/leads/new',
  '/admission/settings/fees-structure/new',
  '/admission/settings/years/new',

  // Audit /new forms
  '/audit/cycles/new',

  // Billing /new forms
  '/billing/categories/new',
  '/billing/discounts/new',
  // Billing button-invoked bulk-action pages (linked from /billing/schedule header)
  '/billing/schedule/bulk-edit',

  // Board of Studies /new forms
  '/bos/compositions/new',
  '/bos/experts/new',
  '/bos/meetings/new',
  '/bos/syllabus/new',

  // Campus-living /new forms
  '/campus-living/allocations/new',
  '/campus-living/blocks/new',
  '/campus-living/gate-passes/new', // "Issue gate pass" form (button-invoked from /campus-living/gate-passes — added by PR #766 BUG-003897)
  '/campus-living/leave/new',
  '/campus-living/maintenance/new',
  '/campus-living/mess/caterers/new',
  '/campus-living/safety/incidents/new',
  '/campus-living/safety/inspections/new',
  // Campus-living button-invoked action pages
  '/campus-living/my-hostel/vacate-request', // "Request Vacate" form from /my-hostel
  '/campus-living/mess/meals/scan', // QR scan UI launched from /mess/meals page

  // Learner portal button-invoked sub-pages
  '/learners/my-profile/status', // status check invoked from /my-profile page
  '/learners/profiles/promotion', // admin promotion action from /profiles page

  // HR /new forms
  '/hr/employees/new',

  // IMS /new forms (invoked from list-page "+ New" buttons)
  '/ims/stock/grn/new',

  // Procurement /new forms (invoked from list-page "+ New" buttons)
  '/procurement/requests/new',
  // Quotations & comparison — button-invoked from the RFQ detail page
  '/procurement/rfqs/[id]/quotations',
  // GRN receiving form — button-invoked ("Create GRN") from the PO detail page
  '/procurement/grn/new',

  // OKR /new + /create wizard forms
  '/okr/elective/new',
  '/okr/objectives/new',
  '/okr/objectives/create',
  '/okr/objectives/create/organization',
  '/okr/objectives/create/tier1',
  '/okr/objectives/create/tier2',

  // Organizations /new forms
  '/organizations/courses/mappings/new',
  '/organizations/degrees/new',
  '/organizations/departments/new',
  '/organizations/institutions/new',
  '/organizations/programs/new',
  '/organizations/sections/new',
  '/organizations/semesters/new',

  // Resource Management /new forms
  '/resource-management/categories/sub-categories/new',
  '/resource-management/maintenance/new',
  '/resource-management/resources/new',

  // Service Requests /new forms
  '/service-requests/types/new',

  // Solutions /new forms
  '/solutions/builders/new',
  '/solutions/clients/new',
  '/solutions/content/production/new',
  '/solutions/discovery/new',
  '/solutions/new',
  '/solutions/payments/new',
  '/solutions/pipeline/new',
  '/solutions/products/new',
  '/solutions/publications/new',
  '/solutions/software/builders/new',
  '/solutions/training/cohort/new',

  // Staff /new forms
  '/staff/category/new',
  '/staff/list/new',

  // Startup Studio /new forms
  '/startup-studio/cycles/new',
  '/startup-studio/solve-for-100/exercises/create',

  // VAC /new forms
  '/vac/admin/courses/new',

  // Events — Phase 1A smoke-test page (PR #455). Reached via direct URL for
  // dev testing (scripts/local-auth.sh director@jkkn.ac.in /events/propose);
  // sidebar entry will land when the Events module is built out beyond Phase 1A.
  '/events/propose',

  // ════════════════════════════════════════════════════════════
  // Reachability-debt sweep — issue #1193 (2026-06-01).
  // Every entry below was VERIFIED as either (a) button-invoked from a
  // chip-reachable parent list page, or (b) served only to a non-staff
  // persona that never uses the staff sidebar. navMeta.invokedFrom is
  // IGNORED by this checker (see footer note) — these must live here.
  // Genuine UNWIRED destinations (/projects, /internships, /hr/* sub-
  // features, and 6 unlinked admin pages) were deliberately NOT added
  // here — they need real nav-config wiring by their module owners.
  // ════════════════════════════════════════════════════════════

  // Admin HR /new forms (button-invoked from the reachable list page)
  '/hr/admin/disciplinary/new',
  '/hr/admin/payroll/periods/new',
  '/hr/admin/training/new',
  // Admin button-invoked sub-views (linked from the reachable parent page)
  '/hr/admin/forms/submissions', // ← /hr/admin/forms "View submissions"
  '/hr/admin/performance-reviews/cycles', // ← /hr/admin/performance-reviews
  // Tier-singleton: lone child of /hr/admin/offboarding — the min-2-chip rule
  // hides single-chip tiers. Was auto-surfaced only by the old /admin
  // fallback nav pre-relocation (2026-06-10); no page links to it either.
  '/hr/admin/offboarding/retirements',
  '/pde/admin/compliance/per-college', // ← /pde/admin/compliance drill-down

  // Board of Studies /new forms
  '/bos/courses/new',
  '/bos/sop/new',
  '/bos/taxonomy/new',

  // CDC /new forms (each linked from its reachable list page "+ New" button)
  '/cdc/bulletin/new',
  '/cdc/clubs/new',
  '/cdc/drives/new',
  '/cdc/idp/new',
  '/cdc/industry-mentors/new',
  '/cdc/internships/new',
  '/cdc/mentors/new',
  '/cdc/placements/new',
  '/cdc/training/new',

  // Events /new form
  '/events/marathon/new',

  // Faculty / Learn PDE /new forms
  '/pde/faculty/cases/new',
  '/pde/learn/demonstrations/new',

  // IMS button-invoked sub-view (from the sale detail page)
  '/ims/sales/history',

  // Notifications sub-view (top-bar surface, like /notifications above)
  '/notifications/sent', // ← notification-center "Sent" tab

  // External education-consultant persona portal — reached via the
  // consultant's own login, NOT the staff sidebar. No staff chip surface
  // by design (managed from /admission/consultants/admin/portal-access).
  '/consultant-portal',
  '/consultant-portal/commissions',
  '/consultant-portal/leads',
  '/consultant-portal/leads/submit',
  '/consultant-portal/profile',
  '/consultant-portal/rewards',

  // Schools Network HM portal — external (headmaster/principal) persona
  // reached via magic-link email, NOT the staff sidebar. No staff chip
  // surface by design (HMs are not auth.users).
  '/schools-portal',
  '/schools-portal/login',
  '/schools-portal/verify',
  '/schools-portal/dashboard',
  '/schools-portal/update-contact',

  // SF100 external Mentor/Investor portal — external (no-JKKN-account) persona
  // reached via a coordinator-shared 6-digit code, NOT the staff sidebar. Same
  // isolated dual-auth shape as the parent/schools portals.
  '/external',
  '/external/login',

  // 2026-06-10 admin-cluster relocation — consultants. Super-admin policy
  // pages relocated from /admin/consultants/* ("one module = one URL
  // prefix"). Under /admin they were chip-reachable only via manifest
  // auto-render (no nav-config there); the admission module HAS a
  // nav-config, which suppresses auto-render, so the new paths have no
  // chip surface yet. Reached by direct URL / the 307 redirects from the
  // old paths. Follow-up: wire literal hrefs into admission nav-config.
  // The bare /admission/consultants/admin hub (card links to the 3 pages
  // below) exists so the cluster root + old-URL redirect don't 404.
  '/admission/consultants/admin',
  '/admission/consultants/admin/commission-triggers',
  '/admission/consultants/admin/portal-access',
  '/admission/consultants/admin/tier-policy',

  // ════════════════════════════════════════════════════════════
  // 2026-06-17 reachability re-tighten — three redirect/hub landings + two
  // button-invoked CARE pages that drifted in via recent direct-to-main
  // merges, pushing the count to 62 and prompting a baseline bump to 62
  // (a loosening). These are NOT genuine unwired destinations — each is a
  // redirect or a card-hub whose real targets ARE chip-reachable, exactly the
  // NAV_EXCLUDE convention. Excluding them brings the real count to 57, and the
  // baseline is re-tightened 62 → 58 (package.json) to undo the bump.
  //  - /academic/session-feedback : hub landing; cards link to the 4 persona
  //    sub-pages (learn/me/faculty/principal), which ARE chip-reachable.
  //  - /moments                   : redirect('/moments/submit').
  //  - /audit/care                : redirect('/audit/dashboard') (the CARE list
  //    lives on the audit dashboard; navMeta.invokedFrom is ignored here).
  //  - /audit/care/new            : "Open a CARE audit" form, button-invoked
  //    from the chip-reachable /audit/dashboard CARE section.
  //  - /audit/care/score          : token-less fallback for the invite-link
  //    scoring route (/audit/care/[cycleId]); no chip surface by design.
  //  - /audit/care/coverage       : CARRE Coverage Map (leadership view),
  //    button-invoked from the chip-reachable /audit/cycles header + the
  //    /audit/dashboard CARE/CARRE section; gated audit.cycle.view.
  // ════════════════════════════════════════════════════════════
  '/academic/session-feedback',
  '/moments',
  '/audit/care',
  '/audit/care/new',
  '/audit/care/score',
  '/audit/care/coverage',

  // ════════════════════════════════════════════════════════════
  // 2026-08-09 attendance split. /hr/attendance became the employee-facing
  // My Attendance page (Attendance Log + Calendar), so these two HR-ops
  // surfaces moved to cards on the chip-reachable /hr/admin hub.
  //
  // Deliberately NOT re-wired as nav-config children. Two reasons, both the
  // established convention here:
  //  1. Config-driven children are NOT permission-filtered (resolveTiers maps
  //     them straight to chips), so chips under the Attendance group would
  //     advertise a biometric importer and an approval queue to all 76 roles
  //     holding hr.attendance.view_self — the sidebar-shows/page-denies
  //     anti-pattern. Same reasoning as the /admission/counselors/admin block.
  //  2. They cannot move under the HR Admin group's children either: that
  //     group deliberately has none, so deeperTiersFromManifest walks from
  //     depth 3 and auto-surfaces all ~22 /hr/admin/* pages. Adding explicit
  //     children there would push the walk to depth 4 and orphan every one
  //     of them.
  //
  // Net unreachable count is unchanged by the split (these two were chip-
  // reachable before, and are excluded now), so --max-unreachable stays at 58.
  //  - /hr/attendance/import              : card on /hr/admin ("Import Biometric
  //    Punches"); /api/hr/attendance/import enforces hr.attendance.override.
  //  - /hr/attendance/regularize/approvals: card on /hr/admin ("Regularize
  //    Approvals"); the page self-gates on regularize_approve/approve_team.
  // ════════════════════════════════════════════════════════════
  '/hr/attendance/import',
  '/hr/attendance/regularize/approvals',
  //  - /audit/care/voice          : sealed participant scoring door (learner-
  //    gated by fn_carre_participant_context/score server-side). Unlisted by
  //    design — the Director opens a cycle's lane deliberately and shares the
  //    link; a sealed lane is not advertised platform-wide.
  '/audit/care/voice',
  //  - /audit/care/predict        : predict-then-see calibration mirror for
  //    team members (fn_carre_predict_* gate server-side). Unlisted like the
  //    voice door — shared per cycle with the team being audited.
  '/audit/care/predict',

  // Intentionally unlisted (Director decision 2026-07-24): the open Compliance &
  // Tracking Board is reached by a shared direct link, deliberately NOT on any nav
  // or chip surface. Open to all logged-in users; staff/faculty can write.
  '/tracker',

  // Button-invoked (2026-07-30): the multi-step Excel bulk-bill upload, reached
  // from the "Upload Excel" button on the chip-reachable
  // /billing/schedule/bulk-create. It is a review wizard (preview the sheet →
  // read the validation → confirm), not a destination anyone should land on
  // cold — arriving without a file in hand shows an empty dropzone. Same
  // relationship /audit/care/new has to /audit/dashboard. Gated
  // billing.schedule.create via MENU_PERMISSIONS + PermissionGuard.
  '/billing/schedule/bulk-create/upload',

  // NOTE (2026-06-23): /admission/social/governance is NO LONGER excluded.
  // It is now a properly-gated chip (MENU_PERMISSIONS['/admission/social/governance']
  // = 'social.view') reachable via the social module's AutoTabNav tier strip,
  // so it passes this gate as a real reachable surface. Its sibling admin
  // write-UI (/admission/social/admin + /admission/social/admin/policies) stays
  // excluded above — super-admin-only config, reached via the governance page's
  // "Edit policy →" links, not a tier-strip chip.

]);

/** Walk app/(routes)/ collecting {url} for every static page.tsx. */
function walkPages(dir: string, urlBase = ''): Array<{ url: string }> {
  const out: Array<{ url: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (/^\[.+\]$/.test(entry.name)) continue; // dynamic route — skip
      const segment = /^\(.*\)$/.test(entry.name) ? '' : '/' + entry.name;
      out.push(...walkPages(fullPath, urlBase + segment));
    } else if (entry.name === 'page.tsx') {
      out.push({ url: urlBase || '/' });
    }
  }
  return out;
}

/** Extract literal `href: '/...'` values from a file's source. */
function extractHrefs(content: string): string[] {
  const out: string[] = [];
  const rx = /['"]?href['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(content))) {
    if (m[1]!.startsWith('/')) out.push(m[1]!);
  }
  return out;
}

/**
 * BFS through chip clicks + sidebar links to find every reachable URL.
 */
function computeReachable(seed: Set<string>): Set<string> {
  const visited = new Set<string>(seed);
  const queue: string[] = [...seed];

  while (queue.length > 0) {
    const url = queue.shift()!;
    let tiers: ReturnType<typeof resolveTiers>;
    try {
      tiers = resolveTiers(url);
    } catch {
      continue; // defensive — malformed URL shouldn't crash the walk
    }
    for (const tier of tiers) {
      for (const chip of tier) {
        if (!visited.has(chip.href)) {
          visited.add(chip.href);
          queue.push(chip.href);
        }
      }
    }
  }
  return visited;
}

function parseMaxUnreachable(argv: string[]): number {
  if (argv.includes('--strict')) return 0;
  const i = argv.indexOf('--max-unreachable');
  if (i >= 0 && argv[i + 1] != null) {
    const n = parseInt(argv[i + 1]!, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 0; // strict by default
}

function main() {
  const maxUnreachable = parseMaxUnreachable(process.argv.slice(2));

  // --- Collect static page URLs ---
  const allPages = walkPages(APP_ROUTES).sort((a, b) =>
    a.url.localeCompare(b.url)
  );
  const staticPages = allPages.filter((p) => !/\[[^\]]+\]/.test(p.url));
  const staticUrls = new Set(staticPages.map((p) => p.url));

  // --- Build seed: every literal href in the sidebar is a user entry point ---
  const sidebarContent = readFileSync(SIDEBAR, 'utf8');
  const seed = new Set(extractHrefs(sidebarContent).filter((h) => h.startsWith('/')));

  // Include every top-level module's config href as an entry too — a user can
  // navigate to e.g. /admission from the Admission sidebar tile, then chip
  // from there.
  // (Sidebar parsing above covers this, but belt-and-braces.)

  // --- BFS expansion through chip clicks ---
  const reachable = computeReachable(seed);

  // --- Classify ---
  const unreachable: string[] = [];
  for (const { url } of staticPages) {
    if (NAV_EXCLUDE.has(url)) continue;
    if (reachable.has(url)) continue;
    unreachable.push(url);
  }

  // --- Report ---
  console.log(`[nav-reachability] Static pages:          ${staticPages.length}`);
  console.log(`[nav-reachability] Seed hrefs (sidebar):  ${seed.size}`);
  console.log(`[nav-reachability] Reachable via chips:   ${[...reachable].filter((u) => staticUrls.has(u)).length}`);
  console.log(`[nav-reachability] NAV_EXCLUDE allowlist: ${NAV_EXCLUDE.size}`);
  console.log(`[nav-reachability] Unreachable count:     ${unreachable.length}`);
  console.log(`[nav-reachability] Max-unreachable gate:  ${maxUnreachable}`);

  if (unreachable.length > 0) {
    console.log('');
    console.log(
      `UNREACHABLE PAGES — no chip/sidebar click sequence from / leads here:`
    );
    for (const u of unreachable) {
      // Suggest the closest reachable ancestor as the fix target
      const segments = u.split('/').filter(Boolean);
      let closest = '/';
      for (let i = 1; i <= segments.length; i++) {
        const candidate = '/' + segments.slice(0, i).join('/');
        if (reachable.has(candidate)) closest = candidate;
      }
      console.log(`  ${u}     (closest reachable: ${closest})`);
    }
    console.log('');
    console.log('Fix options for each unreachable page:');
    console.log(
      '  1. Add it as a literal `href` in a `children[]` under the appropriate'
    );
    console.log(
      "     group in that module's nav-config.ts. This is the real fix —"
    );
    console.log(
      '     AutoTabNav renders the child as a clickable chip.'
    );
    console.log(
      '  2. If it should be a top-level sidebar entry, add it to lib/sidebarMenuLink.ts.'
    );
    console.log(
      '  3. If it is genuinely a button-invoked / callback / redirect page with'
    );
    console.log(
      '     no user-facing chip surface, add it to NAV_EXCLUDE in this script.'
    );
    console.log('');
    console.log(
      `NOTE: matchPaths and navMeta.invokedFrom are IGNORED by this check —`
    );
    console.log(
      `only actual chip-click reachability counts. That's the point.`
    );
  }

  if (unreachable.length > maxUnreachable) {
    console.log('');
    console.log(
      `BUILD-GATE FAIL — ${unreachable.length} unreachable page(s) exceeds`
    );
    console.log(
      `max-unreachable=${maxUnreachable}. Fix per the options above, or raise`
    );
    console.log(
      `the baseline temporarily via --max-unreachable ${unreachable.length}.`
    );
    process.exit(1);
  }

  console.log('');
  if (unreachable.length === 0) {
    console.log('PASS — every static page is chip-reachable from the sidebar.');
  } else {
    console.log(
      `PASS (with baseline) — ${unreachable.length} unreachable within max-unreachable=${maxUnreachable}.`
    );
    console.log(
      `Tighten by lowering --max-unreachable in package.json as sweep PRs land.`
    );
  }
}

main();
