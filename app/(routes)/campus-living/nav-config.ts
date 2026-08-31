import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Campus Living — 7 workflow buckets + tier-3 chips per bucket.
 *
 * Mirrors the original CLNav design (see _components/cl-nav.tsx) but as
 * data. AutoTabNav reads this to render tier-2 chips (7 buckets) + tier-3
 * chips (sub-features) when a bucket is active.
 *
 * Every sub-feature page under /campus-living is either:
 *   (a) a chip here (reachable via nav), or
 *   (b) a button-invoked sub-page that declares `navMeta.invokedFrom`.
 */
const config: ModuleNavConfig = {
  module: 'campus-living',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      href: '/campus-living/dashboard',
      matchPaths: ['/campus-living/dashboard'],
    },
    {
      label: 'My Hostel',
      icon: 'Home',
      href: '/campus-living/my-hostel',
      matchPaths: ['/campus-living/my-hostel', '/campus-living/my-hostel/premium'],
      children: [
        { label: 'My Hostel', icon: 'Home', href: '/campus-living/my-hostel', matchPaths: ['/campus-living/my-hostel'] },
        { label: 'My Meals', icon: 'UtensilsCrossed', href: '/campus-living/my-hostel/my-meals', matchPaths: ['/campus-living/my-hostel/my-meals'] },
        { label: 'Guide', icon: 'BookText', href: '/campus-living/my-hostel/guide', matchPaths: ['/campus-living/my-hostel/guide'] },
        { label: 'Room Cleaning', icon: 'Brush', href: '/campus-living/my-hostel/housekeeping', matchPaths: ['/campus-living/my-hostel/housekeeping'] },
        { label: 'Premium Room', icon: 'Sparkles', href: '/campus-living/my-hostel/premium', matchPaths: ['/campus-living/my-hostel/premium'] },
        { label: 'Pick Room', icon: 'BedDouble', href: '/campus-living/my-hostel/premium/pick-room', matchPaths: ['/campus-living/my-hostel/premium/pick-room'] },
        { label: 'Invite Roommate', icon: 'UserPlus', href: '/campus-living/my-hostel/premium/invite-roommate', matchPaths: ['/campus-living/my-hostel/premium/invite-roommate'] },
      ],
    },
    {
      label: 'Residents',
      icon: 'UsersRound',
      href: '/campus-living/residents',
      matchPaths: [
        '/campus-living/residents',
        '/campus-living/blocks',
        '/campus-living/wardens',
        '/campus-living/allocations',
        '/campus-living/vacate-requests',
      ],
      children: [
        {
          label: 'Residents',
          icon: 'UsersRound',
          href: '/campus-living/residents',
          matchPaths: ['/campus-living/residents'],
        },
        {
          label: 'Blocks',
          icon: 'Building2',
          href: '/campus-living/blocks',
          matchPaths: ['/campus-living/blocks'],
        },
        {
          label: 'Wardens',
          icon: 'ShieldCheck',
          href: '/campus-living/wardens',
          matchPaths: ['/campus-living/wardens'],
        },
        {
          label: 'Allocations',
          icon: 'Bed',
          href: '/campus-living/allocations',
          matchPaths: ['/campus-living/allocations'],
        },
        {
          label: 'Auto-Allocate',
          icon: 'Wand2',
          href: '/campus-living/allocations/auto',
          matchPaths: ['/campus-living/allocations/auto'],
        },
        {
          label: 'Allocation Batches',
          icon: 'ClipboardCheck',
          href: '/campus-living/allocations/batches',
          matchPaths: ['/campus-living/allocations/batches'],
        },
        {
          label: 'Allocation Audit',
          icon: 'ShieldQuestion',
          href: '/campus-living/allocations/audit',
          matchPaths: ['/campus-living/allocations/audit'],
        },
        {
          label: 'Pending Approvals',
          icon: 'ClipboardList',
          href: '/campus-living/allocations/pending',
          matchPaths: ['/campus-living/allocations/pending'],
        },
        {
          label: 'Waitlist',
          icon: 'ListOrdered',
          href: '/campus-living/allocations/waitlist',
          matchPaths: ['/campus-living/allocations/waitlist'],
        },
        {
          label: 'Roommate Matching',
          icon: 'Users',
          href: '/campus-living/allocations/roommate-matching',
          matchPaths: ['/campus-living/allocations/roommate-matching'],
        },
        {
          label: 'Onboarding',
          icon: 'ClipboardCheck',
          href: '/campus-living/allocations/onboarding',
          matchPaths: ['/campus-living/allocations/onboarding'],
        },
        {
          label: 'Onboarding Templates',
          icon: 'FileText',
          href: '/campus-living/allocations/onboarding/templates',
        },
        {
          label: 'Vacate Requests',
          icon: 'LogOut',
          href: '/campus-living/vacate-requests',
          matchPaths: ['/campus-living/vacate-requests'],
        },
      ],
    },
    {
      label: 'Attendance',
      icon: 'UserCheck',
      href: '/campus-living/attendance',
      matchPaths: [
        '/campus-living/attendance',
        '/campus-living/leave',
        '/campus-living/gate-passes',
        '/campus-living/visitors',
      ],
      children: [
        {
          label: 'Attendance',
          icon: 'UserCheck',
          href: '/campus-living/attendance',
          matchPaths: ['/campus-living/attendance'],
        },
        {
          label: 'Mark Attendance',
          icon: 'CheckCircle2',
          href: '/campus-living/attendance/mark',
          matchPaths: ['/campus-living/attendance/mark'],
        },
        {
          label: 'Absentees',
          icon: 'UserX',
          href: '/campus-living/attendance/absentees',
          matchPaths: ['/campus-living/attendance/absentees'],
        },
        {
          label: 'History',
          icon: 'History',
          href: '/campus-living/attendance/history',
          matchPaths: ['/campus-living/attendance/history'],
        },
        {
          label: 'Leave',
          icon: 'CalendarOff',
          href: '/campus-living/leave',
          matchPaths: ['/campus-living/leave'],
        },
        {
          label: 'Gate Passes',
          icon: 'LogIn',
          href: '/campus-living/gate-passes',
          matchPaths: ['/campus-living/gate-passes'],
        },
        {
          label: 'Gate Scan',
          icon: 'ScanLine',
          href: '/campus-living/gate-passes/scan',
          matchPaths: ['/campus-living/gate-passes/scan'],
        },
        {
          label: 'Visitors',
          icon: 'UserPlus',
          href: '/campus-living/visitors',
          matchPaths: ['/campus-living/visitors'],
        },
        {
          label: 'Known Visitors',
          icon: 'Users',
          href: '/campus-living/visitors/known',
          matchPaths: ['/campus-living/visitors/known'],
        },
        {
          label: 'Register Visitor',
          icon: 'UserPlus2',
          href: '/campus-living/visitors/register',
          matchPaths: ['/campus-living/visitors/register'],
        },
      ],
    },
    {
      label: 'Services',
      icon: 'UtensilsCrossed',
      href: '/campus-living/mess',
      matchPaths: [
        '/campus-living/mess',
        '/campus-living/laundry',
        '/campus-living/housekeeping',
      ],
      children: [
        {
          label: 'Mess',
          icon: 'UtensilsCrossed',
          href: '/campus-living/mess',
          matchPaths: ['/campus-living/mess'],
        },
        {
          label: 'Mess Categories',
          icon: 'Tags',
          href: '/campus-living/mess/categories',
          matchPaths: ['/campus-living/mess/categories'],
        },
        {
          label: 'Menu',
          icon: 'BookOpen',
          href: '/campus-living/mess/menu',
          matchPaths: ['/campus-living/mess/menu'],
        },
        {
          label: 'Meals',
          icon: 'Utensils',
          href: '/campus-living/mess/meals',
          matchPaths: ['/campus-living/mess/meals'],
        },
        {
          label: 'Bookings',
          icon: 'CalendarCheck',
          href: '/campus-living/mess/bookings',
          matchPaths: ['/campus-living/mess/bookings'],
        },
        {
          label: 'Caterers',
          icon: 'ChefHat',
          href: '/campus-living/mess/caterers',
          matchPaths: ['/campus-living/mess/caterers'],
        },
        {
          label: 'Billing',
          icon: 'Receipt',
          href: '/campus-living/mess/billing',
          matchPaths: ['/campus-living/mess/billing'],
        },
        {
          label: 'Feedback',
          icon: 'MessageSquare',
          href: '/campus-living/mess/feedback',
          matchPaths: ['/campus-living/mess/feedback'],
        },
        {
          label: 'Waste',
          icon: 'Trash2',
          href: '/campus-living/mess/waste',
          matchPaths: ['/campus-living/mess/waste'],
        },
        // ── Mess admin surfaces relocated from /admin/mess (2026-06-01) ──
        {
          label: 'Menu Editor',
          icon: 'CalendarRange',
          href: '/campus-living/mess/menu-editor/classic',
          matchPaths: ['/campus-living/mess/menu-editor'],
        },
        {
          label: 'Item Library',
          icon: 'BookOpen',
          href: '/campus-living/mess/library',
          matchPaths: ['/campus-living/mess/library'],
        },
        {
          label: 'Caterer Management',
          icon: 'ChefHat',
          href: '/campus-living/mess/caterer-management',
          matchPaths: ['/campus-living/mess/caterer-management'],
        },
        {
          label: 'Rating Insights',
          icon: 'BarChart3',
          href: '/campus-living/mess/insights',
          matchPaths: ['/campus-living/mess/insights'],
        },
        {
          label: 'Mess Policies',
          icon: 'Settings',
          href: '/campus-living/mess/policies',
          matchPaths: ['/campus-living/mess/policies'],
        },
        {
          label: 'Laundry',
          icon: 'WashingMachine',
          href: '/campus-living/laundry',
        },
        {
          label: 'Laundry Orders',
          icon: 'Shirt',
          href: '/campus-living/laundry/orders',
          matchPaths: ['/campus-living/laundry/orders'],
        },
        {
          label: 'Laundry Schedule',
          icon: 'CalendarClock',
          href: '/campus-living/laundry/schedule',
          matchPaths: ['/campus-living/laundry/schedule'],
        },
        {
          label: 'Laundry Settings',
          icon: 'Settings2',
          href: '/campus-living/laundry/settings',
          matchPaths: ['/campus-living/laundry/settings'],
        },
        {
          label: 'Housekeeping',
          icon: 'Brush',
          href: '/campus-living/housekeeping',
        },
        {
          label: 'Housekeeping Tasks',
          icon: 'Sparkles',
          href: '/campus-living/housekeeping/tasks',
          matchPaths: ['/campus-living/housekeeping/tasks'],
        },
        {
          label: 'Housekeeping Schedules',
          icon: 'CalendarDays',
          href: '/campus-living/housekeeping/schedules',
          matchPaths: ['/campus-living/housekeeping/schedules'],
        },
        {
          label: 'Housekeeping Bookings',
          icon: 'CalendarCheck',
          href: '/campus-living/housekeeping/bookings',
          matchPaths: ['/campus-living/housekeeping/bookings'],
        },
      ],
    },
    {
      label: 'Facility',
      icon: 'Wrench',
      href: '/campus-living/maintenance',
      matchPaths: [
        '/campus-living/maintenance',
        '/campus-living/safety',
        '/campus-living/wellness',
        '/campus-living/health',
      ],
      children: [
        {
          label: 'Maintenance',
          icon: 'Wrench',
          href: '/campus-living/maintenance',
          matchPaths: ['/campus-living/maintenance'],
        },
        {
          label: 'Preventive',
          icon: 'ShieldCheck',
          href: '/campus-living/maintenance/preventive',
          matchPaths: ['/campus-living/maintenance/preventive'],
        },
        {
          label: 'Preventive Tasks',
          icon: 'ListChecks',
          href: '/campus-living/maintenance/preventive/tasks',
        },
        {
          label: 'Contracts',
          icon: 'FileSignature',
          href: '/campus-living/maintenance/contracts',
          matchPaths: ['/campus-living/maintenance/contracts'],
        },
        {
          label: 'Safety',
          icon: 'Shield',
          href: '/campus-living/safety',
          matchPaths: ['/campus-living/safety'],
        },
        {
          label: 'Incidents',
          icon: 'AlertTriangle',
          href: '/campus-living/safety/incidents',
          matchPaths: ['/campus-living/safety/incidents'],
        },
        {
          label: 'Inspections',
          icon: 'ClipboardList',
          href: '/campus-living/safety/inspections',
          matchPaths: ['/campus-living/safety/inspections'],
        },
        {
          label: 'Access Log',
          icon: 'KeyRound',
          href: '/campus-living/safety/access-log',
          matchPaths: ['/campus-living/safety/access-log'],
        },
        {
          label: 'Anti-Ragging',
          icon: 'ShieldAlert',
          href: '/campus-living/safety/anti-ragging',
          matchPaths: ['/campus-living/safety/anti-ragging'],
        },
        {
          label: 'Curfew Exceptions',
          icon: 'Clock',
          href: '/campus-living/safety/curfew-exceptions',
          matchPaths: ['/campus-living/safety/curfew-exceptions'],
        },
        {
          label: 'Emergency Contacts',
          icon: 'PhoneCall',
          href: '/campus-living/safety/emergency-contacts',
          matchPaths: ['/campus-living/safety/emergency-contacts'],
        },
        {
          label: 'Wellness',
          icon: 'Heart',
          href: '/campus-living/wellness',
        },
        {
          label: 'Wellness Surveys',
          icon: 'HeartPulse',
          href: '/campus-living/wellness/surveys',
          matchPaths: ['/campus-living/wellness/surveys'],
        },
        {
          label: 'Health',
          icon: 'Stethoscope',
          href: '/campus-living/health',
        },
      ],
    },
    {
      label: 'Community',
      icon: 'Users',
      href: '/campus-living/community',
      matchPaths: [
        '/campus-living/community',
        '/campus-living/activity',
        '/campus-living/calendar',
      ],
      children: [
        {
          label: 'Community Home',
          icon: 'Users',
          href: '/campus-living/community',
          exact: true,
        },
        {
          label: 'Activity Feed',
          icon: 'Activity',
          href: '/campus-living/activity',
        },
        {
          label: 'Calendar',
          icon: 'CalendarDays',
          href: '/campus-living/calendar',
        },
        {
          label: 'Settings',
          icon: 'Settings',
          href: '/campus-living/community/settings',
        },
      ],
    },
    {
      label: 'Insights',
      icon: 'BarChart3',
      href: '/campus-living/analytics',
      matchPaths: [
        '/campus-living/analytics',
        '/campus-living/reports',
        '/campus-living/settle-preview',
      ],
      children: [
        {
          label: 'Analytics Home',
          icon: 'BarChart3',
          href: '/campus-living/analytics',
          matchPaths: ['/campus-living/analytics'],
        },
        {
          label: 'Occupancy',
          icon: 'LineChart',
          href: '/campus-living/analytics/occupancy',
          matchPaths: ['/campus-living/analytics/occupancy'],
        },
        {
          label: 'Attendance',
          icon: 'UserCheck',
          href: '/campus-living/analytics/attendance',
          matchPaths: ['/campus-living/analytics/attendance'],
        },
        {
          label: 'Mess Analytics',
          icon: 'UtensilsCrossed',
          href: '/campus-living/analytics/mess',
          matchPaths: ['/campus-living/analytics/mess'],
        },
        {
          label: 'Maintenance Analytics',
          icon: 'Wrench',
          href: '/campus-living/analytics/maintenance',
          matchPaths: ['/campus-living/analytics/maintenance'],
        },
        {
          label: 'Safety Analytics',
          icon: 'Shield',
          href: '/campus-living/analytics/safety',
          matchPaths: ['/campus-living/analytics/safety'],
        },
        {
          label: 'Fees Analytics',
          icon: 'IndianRupee',
          href: '/campus-living/analytics/fees',
          matchPaths: ['/campus-living/analytics/fees'],
        },
        {
          label: 'Bill Practice Run',
          icon: 'BedDouble',
          href: '/campus-living/settle-preview',
          matchPaths: ['/campus-living/settle-preview'],
        },
        {
          label: 'Cross-Domain',
          icon: 'Layers',
          href: '/campus-living/analytics/cross-domain',
          matchPaths: ['/campus-living/analytics/cross-domain'],
        },
        {
          label: 'Alerts',
          icon: 'Bell',
          href: '/campus-living/analytics/alerts',
          matchPaths: ['/campus-living/analytics/alerts'],
        },
        {
          label: 'Alert Rules',
          icon: 'BellRing',
          href: '/campus-living/analytics/alert-rules',
          matchPaths: ['/campus-living/analytics/alert-rules'],
        },
        {
          label: 'Reports Home',
          icon: 'FileText',
          href: '/campus-living/reports',
        },
        {
          label: 'Occupancy Report',
          icon: 'FileBarChart',
          href: '/campus-living/reports/occupancy',
          matchPaths: ['/campus-living/reports/occupancy'],
        },
        {
          label: 'Attendance Register',
          icon: 'FileText',
          href: '/campus-living/reports/attendance-register',
          matchPaths: ['/campus-living/reports/attendance-register'],
        },
        {
          label: 'Fee Collection',
          icon: 'FileSpreadsheet',
          href: '/campus-living/reports/fee-collection',
          matchPaths: ['/campus-living/reports/fee-collection'],
        },
        {
          label: 'Visitor Register',
          icon: 'FileUser',
          href: '/campus-living/reports/visitor-register',
          matchPaths: ['/campus-living/reports/visitor-register'],
        },
        {
          label: 'Safety Audit',
          icon: 'ShieldCheck',
          href: '/campus-living/reports/safety-audit',
          matchPaths: ['/campus-living/reports/safety-audit'],
        },
        {
          label: 'Anti-Ragging Compliance',
          icon: 'FileWarning',
          href: '/campus-living/reports/anti-ragging-compliance',
          matchPaths: ['/campus-living/reports/anti-ragging-compliance'],
        },
      ],
    },
    {
      label: 'Settings',
      icon: 'Settings',
      href: '/campus-living/settings',
      matchPaths: ['/campus-living/settings'],
      children: [
        {
          label: 'General',
          icon: 'Sliders',
          href: '/campus-living/settings/general',
          matchPaths: ['/campus-living/settings/general'],
        },
        {
          label: 'Hostel Rooms Categories',
          icon: 'LayoutGrid',
          href: '/campus-living/settings/categories',
          matchPaths: ['/campus-living/settings/categories'],
        },
        {
          label: 'Program Eligibility',
          icon: 'ListChecks',
          href: '/campus-living/settings/program-eligibility',
          matchPaths: ['/campus-living/settings/program-eligibility'],
        },
        {
          label: 'Allocations & Eligibility',
          icon: 'ListChecks',
          href: '/campus-living/settings/allocations',
          matchPaths: ['/campus-living/settings/allocations'],
        },
        {
          label: 'Amenities',
          icon: 'Wifi',
          href: '/campus-living/settings/amenities',
          matchPaths: ['/campus-living/settings/amenities'],
        },
        {
          label: 'Billable Amenities',
          icon: 'Wind',
          href: '/campus-living/settings/billable-amenities',
          matchPaths: ['/campus-living/settings/billable-amenities'],
        },
        {
          label: 'AC / Category Audit',
          icon: 'ClipboardCheck',
          href: '/campus-living/settings/ac-amenity-audit',
          matchPaths: ['/campus-living/settings/ac-amenity-audit'],
        },
        {
          label: 'Hostel Years',
          icon: 'CalendarRange',
          href: '/campus-living/settings/hostel-years',
          matchPaths: ['/campus-living/settings/hostel-years'],
        },
        {
          label: 'Admission Packages',
          icon: 'Package',
          href: '/campus-living/settings/packages',
          matchPaths: ['/campus-living/settings/packages'],
        },
        {
          label: 'Housekeeping Booking',
          icon: 'Brush',
          href: '/campus-living/settings/housekeeping',
          matchPaths: ['/campus-living/settings/housekeeping'],
        },
        {
          label: 'Choose Your Menu',
          icon: 'UtensilsCrossed',
          href: '/campus-living/settings/choose-your-menu',
          matchPaths: ['/campus-living/settings/choose-your-menu'],
        },
        {
          label: 'Mess & Daily Services',
          icon: 'Sliders',
          href: '/campus-living/settings/mess-services',
          matchPaths: ['/campus-living/settings/mess-services'],
        },
        {
          label: 'Fee Config',
          icon: 'Coins',
          href: '/campus-living/settings/fee-config',
          matchPaths: ['/campus-living/settings/fee-config'],
        },
        {
          label: 'Fees & Economics',
          icon: 'Sliders',
          href: '/campus-living/settings/fees-economics',
          matchPaths: ['/campus-living/settings/fees-economics'],
        },
        {
          label: 'Leave Types',
          icon: 'CalendarOff',
          href: '/campus-living/settings/leave-types',
          matchPaths: ['/campus-living/settings/leave-types'],
        },
        {
          label: 'Menu Loop',
          icon: 'RefreshCw',
          href: '/campus-living/mess/menu-loop',
          matchPaths: ['/campus-living/mess/menu-loop'],
        },
        {
          label: 'Approval Chains',
          icon: 'GitBranch',
          href: '/campus-living/settings/approval-chains',
          matchPaths: ['/campus-living/settings/approval-chains'],
        },
        {
          label: 'Policies & Workflows',
          icon: 'Sliders',
          href: '/campus-living/settings/policies-workflows',
          matchPaths: ['/campus-living/settings/policies-workflows'],
        },
        {
          label: 'Maintenance SLA',
          icon: 'Timer',
          href: '/campus-living/settings/maintenance-sla',
          matchPaths: ['/campus-living/settings/maintenance-sla'],
        },
        {
          label: 'Notification Rules',
          icon: 'BellRing',
          href: '/campus-living/settings/notification-rules',
          matchPaths: ['/campus-living/settings/notification-rules'],
        },
        // ── Hostel admin surfaces relocated from /admin/hostel (2026-06-01) ──
        {
          label: 'Curfew Policies',
          icon: 'Clock',
          href: '/campus-living/settings/curfew',
          matchPaths: ['/campus-living/settings/curfew'],
        },
        // ── Premium Room (admin surfaces, now in-module) ────────────
        // Relocated 2026-06-01 from /admin/campus-living/* into the Campus
        // Living module so there's no separate admin module. Access is gated
        // at the page level via SuperAdminOnly + campus_living.premium.*
        // (view_dashboard / configure_tier / override_pick).
        {
          label: 'Premium Dashboard',
          icon: 'LayoutGrid',
          href: '/campus-living/premium/dashboard',
          matchPaths: ['/campus-living/premium/dashboard'],
        },
        {
          label: 'Premium Tier Policy',
          icon: 'BedDouble',
          href: '/campus-living/premium/tier-policy',
          matchPaths: ['/campus-living/premium/tier-policy'],
        },
        {
          label: 'Premium Override',
          icon: 'ShieldCheck',
          href: '/campus-living/premium/override',
          matchPaths: ['/campus-living/premium/override'],
        },
        {
          label: 'Premium Audit Log',
          icon: 'History',
          href: '/campus-living/premium/audit-log',
          matchPaths: ['/campus-living/premium/audit-log'],
        },
        {
          label: 'Premium Allocation Rules',
          icon: 'Settings2',
          href: '/campus-living/premium/allocation-rules',
          matchPaths: ['/campus-living/premium/allocation-rules'],
        },
      ],
    },
  ],
};

export default config;
