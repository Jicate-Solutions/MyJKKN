import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * HR — 9 logical module groups.
 *
 * Created 2026-05-10 in response to BUG-003301: COO reported that the HR
 * sidebar entry rendered as a single non-expandable link, hiding all the
 * sub-pages (recruitment, leave, employees, attendance, shifts, documents,
 * onboarding, policies). This config makes every page reachable via tier-2
 * group chips and tier-3 page chips, mirroring the admission-CRM pattern.
 *
 * Children entries (and their `matchPaths`) double as the orphan-coverage
 * manifest for `scripts/check-nav-reachability.ts`. Every URL we want the
 * nav-check to consider "discoverable" must appear here as a literal `href`
 * or an exact `matchPaths` entry.
 */
const config: ModuleNavConfig = {
  module: 'hr',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      href: '/hr',
      matchPaths: ['/hr'],
    },
    {
      label: 'Intelligence',
      icon: 'Brain',
      href: '/hr/intelligence',
      matchPaths: ['/hr/intelligence'],
    },
    {
      label: 'Recruitment',
      icon: 'UserPlus',
      href: '/hr/recruitment',
      matchPaths: ['/hr/recruitment'],
      children: [
        {
          label: 'Overview',
          icon: 'UserPlus',
          href: '/hr/recruitment',
          exact: true,
        },
        {
          label: 'Apply for Jobs',
          icon: 'FilePlus',
          href: '/hr/recruitment/submit',
          matchPaths: ['/hr/recruitment/submit'],
        },
        {
          label: 'Approvals',
          icon: 'ClipboardCheck',
          href: '/hr/recruitment/approvals',
          matchPaths: ['/hr/recruitment/approvals'],
        },
        {
          label: 'Jobs',
          icon: 'Briefcase',
          href: '/hr/recruitment/jobs',
          matchPaths: ['/hr/recruitment/jobs'],
        },
        // Candidates list page not yet built (only [id] detail exists).
        // Removed 2026-05-11 so the nav-config-href-audit gate ships
        // as-enforcing. app/(routes)/hr/recruitment/candidates/page.tsx now
        // exists, but only as a redirect to /hr/recruitment — it keeps the
        // bare URL from 404ing, it is NOT a destination. A real candidates
        // list is still the precondition for re-adding this nav entry;
        // pointing nav at a redirect is worse UX than no link at all.
        {
          label: 'My Submissions',
          icon: 'ClipboardList',
          href: '/hr/recruitment/my',
          matchPaths: ['/hr/recruitment/my'],
        },
      ],
    },
    {
      // Time Off workspace. Leave / Compensatory Off / Short Time Off /
      // Approvals are TABS within these routes, not separate nav entries —
      // listing every tab here would duplicate the in-page tab bar. Approvals
      // is intentionally absent: its visibility is a runtime capability
      // (hr_can_approve_leave), which a static nav config cannot express.
      label: 'Time Off',
      icon: 'CalendarDays',
      href: '/hr/leave/requests',
      matchPaths: ['/hr/leave'],
      children: [
        {
          label: 'Leave',
          icon: 'FilePlus',
          href: '/hr/leave/requests',
          matchPaths: ['/hr/leave/requests', '/hr/leave/apply', '/hr/leave/my-applications', '/hr/leave/balance'],
        },
        {
          label: 'Compensatory Off',
          icon: 'CalendarCheck',
          href: '/hr/leave/compensatory-off',
          matchPaths: ['/hr/leave/compensatory-off'],
        },
        {
          label: 'Short Time Off',
          icon: 'Timer',
          href: '/hr/leave/short-time-off',
          matchPaths: ['/hr/leave/short-time-off'],
        },
        {
          label: 'Approvals',
          icon: 'ClipboardCheck',
          href: '/hr/leave/approvals',
          matchPaths: ['/hr/leave/approvals', '/hr/leave/approve'],
        },
        {
          label: 'Calendar',
          icon: 'Calendar',
          href: '/hr/leave/calendar',
          matchPaths: ['/hr/leave/calendar'],
        },
        {
          label: 'Encashment',
          icon: 'IndianRupee',
          href: '/hr/leave/encashment',
          matchPaths: ['/hr/leave/encashment'],
        },
      ],
    },
    {
      // Deliberately NOT 'Employee List' — that label belongs to the /staff/list
      // sidebar entry (the write surface). This read-only lens has no sidebar
      // entry of its own and is reachable only as this chip.
      label: 'HR Directory',
      icon: 'UsersRound',
      href: '/hr/employees',
      matchPaths: ['/hr/employees'],
    },
    {
      label: 'Onboarding',
      icon: 'UserCog',
      href: '/hr/onboarding',
      matchPaths: ['/hr/onboarding'],
    },
    {
      label: 'My Assets',
      icon: 'Laptop',
      href: '/hr/my-assets',
      matchPaths: ['/hr/my-assets'],
    },
    {
      label: 'Offboarding',
      icon: 'LogOut',
      href: '/hr/offboarding',
      matchPaths: ['/hr/offboarding'],
    },
    {
      label: 'Attendance',
      icon: 'UserCheck',
      href: '/hr/attendance',
      matchPaths: ['/hr/attendance'],
      // 2026-08-09: /hr/attendance became the employee-facing My Attendance
      // page (Attendance Log + Calendar). 'Regularize Approvals' and 'Import
      // Punches' were removed from here and re-homed on the HR Admin group's
      // matchPaths below — they are HR-ops surfaces, and leaving them as
      // self-service chips advertised them to all 76 roles holding
      // hr.attendance.view_self.
      //
      // They MUST stay listed somewhere in this file: scripts/check-nav-reachability.ts
      // treats children hrefs and matchPaths as its orphan-coverage manifest,
      // so deleting them outright would count both routes against the
      // --max-unreachable 60 budget rather than merely hiding them.
      children: [
        {
          label: 'My Attendance',
          icon: 'UserCheck',
          href: '/hr/attendance',
          exact: true,
        },
        {
          label: 'Regularize',
          icon: 'ClipboardCheck',
          href: '/hr/attendance/regularize',
          matchPaths: ['/hr/attendance/regularize'],
        },
        {
          // Month close. Declared here in the SAME change as the route: a module
          // with hasNavConfig renders only the children in this file, so a
          // MENU_PERMISSIONS entry and a GetPages leaf alone would give a
          // sidebar row and no navbar chip.
          label: 'Month Close',
          icon: 'CalendarCheck',
          href: '/hr/attendance/close',
          matchPaths: ['/hr/attendance/close'],
        },
      ],
    },
    // The 'Shifts' group (/hr/shifts, /hr/shifts/my, /hr/shifts/approvals) was
    // removed 2026-08-06 along with the per-employee roster module it pointed at.
    // Shift configuration now lives at /hr/admin/shift-timings, reached from the
    // HR Admin hub and the sidebar — it is admin config, not a self-service tab.
    {
      label: 'Documents',
      icon: 'FileText',
      href: '/hr/documents',
      matchPaths: ['/hr/documents'],
      children: [
        {
          label: 'Overview',
          icon: 'FileText',
          href: '/hr/documents',
          exact: true,
        },
        {
          label: 'Verify Documents',
          icon: 'ShieldCheck',
          href: '/hr/documents/verify',
          matchPaths: ['/hr/documents/verify'],
        },
      ],
    },
    {
      label: 'Performance Reviews',
      icon: 'ClipboardCheck',
      href: '/hr/performance-reviews',
      matchPaths: ['/hr/performance-reviews'],
      children: [
        {
          label: 'My Appraisal',
          icon: 'ClipboardCheck',
          href: '/hr/performance-reviews',
          exact: true,
        },
        {
          label: 'Team Reviews',
          icon: 'UsersRound',
          href: '/hr/performance-reviews/team',
          matchPaths: ['/hr/performance-reviews/team'],
        },
      ],
    },
    {
      // WHO PAYS each team member (2026-07-31, PR #2694). The sidebar entry
      // shipped with that PR but this config did not, and a module with
      // hasNavConfig renders ONLY the groups declared here — AutoTabNav stops
      // auto-discovering manifest siblings — so the page had no chip and
      // check-nav-reachability reported /hr/payroll as an orphan.
      //
      // Anchored on the /hr/payroll hub rather than the leaf because
      // check-nav-reachability BFS-walks chips that actually RENDER and
      // explicitly ignores matchPaths — a path only counts as covered when
      // some chip links to it literally. That is safe only because
      // MENU_PERMISSIONS now maps '/hr/payroll' to the same HR-only key as the
      // leaf; chips inherit their gate from MENU_PERMISSIONS[href], so without
      // that entry this would fall through to 'hr.view' and render a chip
      // everyone in HR can see and nobody but HR can open.
      label: 'Payroll',
      icon: 'Wallet',
      href: '/hr/payroll',
      matchPaths: ['/hr/payroll'],
      children: [
        {
          label: 'Payroll Organisation',
          icon: 'Wallet',
          href: '/hr/payroll/organisation',
          matchPaths: ['/hr/payroll/organisation'],
        },
        {
          // WHAT EACH PERSON EARNS (2026-08-21). Added here for the reason the
          // block above records: hasNavConfig makes AutoTabNav render ONLY the
          // children declared in this file, so a MENU_PERMISSIONS entry, a
          // GetPages() submenu and a route-manifest row are together still not
          // enough to give the page a chip. It had all three and no chip.
          //
          // Gated on hr.payroll.salary.view, not the Payroll group's
          // hr.payroll.institution.view: chips inherit MENU_PERMISSIONS[href],
          // and seeing who pays someone is a different decision from seeing
          // what they are paid. Since 2026-08-21 that key is held by hr_head
          // alone (super admin passes via is_super_admin()), so this chip is
          // invisible to the rest of HR rather than visible-and-denied.
          label: 'Employee Salaries',
          icon: 'Banknote',
          href: '/hr/payroll/salaries',
          matchPaths: ['/hr/payroll/salaries'],
        },
        {
          // THE FOURTH TIME THIS GROUP LEARNED THE SAME LESSON (2026-09-02).
          // Shipped with a MENU_PERMISSIONS entry, a GetPages submenu row and a
          // route-manifest row -- and no chip, because hasNavConfig makes
          // AutoTabNav render only what is declared in this file.
          //
          // check:reachability did NOT catch it, and cannot: it SEEDS its BFS
          // from every literal href in lib/sidebarMenuLink.ts, so adding the
          // sidebar row made this route a seed and therefore reachable by
          // definition. The gate passing is not evidence of a chip.
          //
          // Directly after Employee Salaries because the bands are configuration
          // FOR that screen -- its TDS column is derived from them rather than
          // stored per person -- and because Salary Register has to stay last.
          //
          // Gated on hr.payroll.salary.view via MENU_PERMISSIONS[href], the same
          // key as Employee Salaries: setting the rate and seeing what people
          // earn are one decision by one person (hr_head, plus super admin).
          label: 'TDS Bands',
          icon: 'Percent',
          href: '/hr/payroll/tds-slabs',
          matchPaths: ['/hr/payroll/tds-slabs'],
        },
        {
          // Third payroll chip. Added in the SAME change as the route this
          // time: hasNavConfig means AutoTabNav renders only what is declared
          // here, so a MENU_PERMISSIONS entry and a GetPages leaf alone give a
          // sidebar row and no chip -- which is exactly how Employee Salaries
          // shipped half-wired.
          label: 'Bank Accounts',
          icon: 'Landmark',
          href: '/hr/payroll/bank-accounts',
          matchPaths: ['/hr/payroll/bank-accounts'],
        },
        {
          // Fourth payroll chip (2026-08-30). Shipped WITHOUT this entry first
          // and reproduced the exact failure the two blocks above document:
          // MENU_PERMISSIONS + a GetPages leaf + a route-manifest row gave a
          // sidebar row and NO chip, because hasNavConfig makes AutoTabNav
          // render only what is declared in this file. Three warnings in this
          // one group is enough — anything added under /hr/payroll/* needs a
          // child here, always.
          //
          // Last in the group because it is the step AFTER the three above are
          // populated: a register reads the payer directory, the salary and the
          // bank account, and reports whichever is missing.
          //
          // Gated on hr.payroll.register.view via MENU_PERMISSIONS[href] —
          // hr_head alone, plus super admin. A register is the one screen
          // showing amount AND destination AND day counts for everybody at
          // once, so it does not ride on any of the other three keys.
          label: 'Salary Register',
          icon: 'FileSpreadsheet',
          href: '/hr/payroll/register',
          matchPaths: ['/hr/payroll/register'],
        },
      ],
    },
    {
      label: 'Policies',
      icon: 'ShieldCheck',
      href: '/hr/policies',
      matchPaths: ['/hr/policies'],
    },
    {
      // 2026-06-10 admin-cluster relocation: /admin/hr → /hr/admin.
      // No explicit children — the deeper admin pages auto-surface via the
      // manifest walk (deeperTiersFromManifest), mirroring how the old
      // /admin auto-nav exposed them.
      //
      // The two /hr/attendance/* entries are here rather than under Attendance
      // because they are HR-ops surfaces that moved off the self-service page
      // on 2026-08-09. They do not live under /hr/admin/ on disk, so the
      // manifest walk cannot find them — they must be listed explicitly or
      // check-nav-reachability counts them as orphans.
      label: 'Admin',
      icon: 'Settings',
      href: '/hr/admin',
      matchPaths: [
        '/hr/admin',
        '/hr/admin/leave-types',
        '/hr/admin/leave-balances',
        '/hr/admin/academic-years',
        '/hr/admin/sanctioned-posts',
        '/hr/attendance/import',
        '/hr/attendance/regularize/approvals',
      ],
    },
  ],
};

export default config;
