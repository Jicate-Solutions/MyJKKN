// ─── Role-Based Default Favorites ────────────────────────────────────────────
// When a user has zero favorites, we auto-populate based on their role.
// This gives new users immediate value without manual setup.

export const ROLE_DEFAULT_FAVORITES: Record<string, Array<{ path: string; title: string; module: string; iconName: string }>> = {
  faculty: [
    { path: '/academic/attendance', title: 'Mark Attendance', module: 'Academic Management', iconName: 'ClipboardCheck' },
    { path: '/academic/timetables', title: 'Timetables', module: 'Academic Management', iconName: 'CalendarClock' },
    { path: '/learners/profiles', title: 'Student Profiles', module: 'Learners', iconName: 'Users' },
    { path: '/work-pulse', title: 'My Pulse', module: 'Work Pulse', iconName: 'Activity' },
  ],
  student: [
    { path: '/learners/my-timetable', title: 'My Timetable', module: 'Learners', iconName: 'CalendarClock' },
    { path: '/learners/my-attendance', title: 'My Attendance', module: 'Learners', iconName: 'ClipboardCheck' },
    { path: '/learners/my-profile', title: 'My Profile', module: 'Learners', iconName: 'Users' },
    { path: '/service-requests/my-requests', title: 'My Requests', module: 'Service Requests', iconName: 'ClipboardList' },
  ],
  admin: [
    { path: '/', title: 'Dashboard', module: 'Overview', iconName: 'Home' },
    { path: '/users', title: 'All Users', module: 'User Management', iconName: 'Users' },
    { path: '/billing/invoices', title: 'Invoices', module: 'Accounts', iconName: 'FileBarChart' },
    { path: '/billing/receipts', title: 'Receipts', module: 'Accounts', iconName: 'FileText' },
    { path: '/academic/attendance/dashboard', title: 'Attendance Dashboard', module: 'Academic Management', iconName: 'ClipboardCheck' },
  ],
  hod: [
    { path: '/academic/attendance/dashboard', title: 'Attendance Dashboard', module: 'Academic Management', iconName: 'ClipboardCheck' },
    { path: '/staff/list', title: 'Employee List', module: 'Employee Management', iconName: 'Users' },
    { path: '/academic/timetables', title: 'Timetables', module: 'Academic Management', iconName: 'CalendarClock' },
    { path: '/learners/profiles', title: 'Student Profiles', module: 'Learners', iconName: 'Users' },
  ],
  principal: [
    { path: '/', title: 'Dashboard', module: 'Overview', iconName: 'Home' },
    { path: '/academic/attendance/dashboard', title: 'Attendance Dashboard', module: 'Academic Management', iconName: 'ClipboardCheck' },
    { path: '/billing/reports', title: 'Billing Reports', module: 'Accounts', iconName: 'BarChart' },
    { path: '/admission/dashboard', title: 'Admission Dashboard', module: 'Admission CRM', iconName: 'LayoutGrid' },
  ],
  counselor: [
    { path: '/admission/leads', title: 'Leads', module: 'Admission CRM', iconName: 'UserPlus' },
    { path: '/admission/counselors', title: 'Counselors', module: 'Admission CRM', iconName: 'HeadphonesIcon' },
    { path: '/admission/applications', title: 'Applications', module: 'Admission CRM', iconName: 'FileText' },
    { path: '/admission/dashboard', title: 'Dashboard', module: 'Admission CRM', iconName: 'LayoutGrid' },
  ],
};

/**
 * Get default favorites for a role. Returns empty array if no defaults defined.
 */
export function getDefaultFavoritesForRole(roleKey: string): Array<{ path: string; title: string; module: string; iconName: string }> {
  return ROLE_DEFAULT_FAVORITES[roleKey] || [];
}
