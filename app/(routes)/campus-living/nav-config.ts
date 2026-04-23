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
      label: 'Residents',
      icon: 'UsersRound',
      href: '/campus-living/residents',
      matchPaths: [
        '/campus-living/residents',
        '/campus-living/blocks',
        '/campus-living/allocations',
        '/campus-living/my-hostel',
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
          label: 'Allocations',
          icon: 'Bed',
          href: '/campus-living/allocations',
          matchPaths: ['/campus-living/allocations'],
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
          label: 'Vacate Requests',
          icon: 'LogOut',
          href: '/campus-living/vacate-requests',
          matchPaths: ['/campus-living/vacate-requests'],
        },
        {
          label: 'My Hostel',
          icon: 'Home',
          href: '/campus-living/my-hostel',
          matchPaths: ['/campus-living/my-hostel'],
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
          label: 'Wellness Surveys',
          icon: 'Heart',
          href: '/campus-living/wellness/surveys',
          matchPaths: ['/campus-living/wellness/surveys'],
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
    },
    {
      label: 'Insights',
      icon: 'BarChart3',
      href: '/campus-living/analytics',
      matchPaths: ['/campus-living/analytics', '/campus-living/reports'],
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
          label: 'Fee Config',
          icon: 'Coins',
          href: '/campus-living/settings/fee-config',
          matchPaths: ['/campus-living/settings/fee-config'],
        },
        {
          label: 'Leave Types',
          icon: 'CalendarOff',
          href: '/campus-living/settings/leave-types',
          matchPaths: ['/campus-living/settings/leave-types'],
        },
        {
          label: 'Approval Chains',
          icon: 'GitBranch',
          href: '/campus-living/settings/approval-chains',
          matchPaths: ['/campus-living/settings/approval-chains'],
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
      ],
    },
  ],
};

export default config;
