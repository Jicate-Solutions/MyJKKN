export const STUDENT_WIDGETS = [
  {
    id: 'student_attendance',
    title: 'My Attendance',
    description: 'Overall attendance percentage and stats',
    category: 'Academic',
  },
  {
    id: 'student_timetable_today',
    title: "Today's Classes",
    description: 'Your class schedule for today',
    category: 'Academic',
  },
  {
    id: 'student_billing',
    title: 'Fee Summary',
    description: 'Your fee payment status and outstanding balance',
    category: 'Finance',
  },
  {
    id: 'celebrations_today',
    title: "Today's Celebrations",
    description: 'Birthdays and work anniversaries today',
    category: 'Community',
  },
  {
    id: 'my_celebration_countdown',
    title: 'My Next Milestone',
    description: 'Countdown to your next birthday',
    category: 'Personal',
  },
];

export const FACULTY_WIDGETS = [
  {
    id: 'faculty_classes_today',
    title: "Today's Teaching Schedule",
    description: 'Classes you are teaching today',
    category: 'Academic',
  },
  {
    id: 'faculty_pending_attendance',
    title: 'Pending Attendance',
    description: 'Classes waiting for attendance submission',
    category: 'Academic',
  },
  {
    id: 'faculty_students_overview',
    title: 'My Students',
    description: 'Overview of students you teach',
    category: 'Academic',
  },
  {
    id: 'celebrations_today',
    title: "Today's Celebrations",
    description: 'Birthdays and work anniversaries today',
    category: 'Community',
  },
];

export const LEADERSHIP_WIDGETS = [
  {
    id: 'leadership_overview',
    title: 'Department Overview',
    description: 'Key metrics and statistics',
    category: 'Overview',
  },
  {
    id: 'leadership_attendance_summary',
    title: 'Attendance Summary',
    description: 'Department-wide attendance statistics',
    category: 'Academic',
  },
  {
    id: 'leadership_pending_approvals',
    title: 'Pending Approvals',
    description: 'Leave requests and other approvals',
    category: 'Administration',
  },
  {
    id: 'celebrations_today',
    title: "Today's Celebrations",
    description: 'Birthdays and work anniversaries today',
    category: 'Community',
  },
];

export const ADMIN_WIDGETS = [
  {
    id: 'admin_system_overview',
    title: 'System Overview',
    description: 'Institution-wide statistics and health',
    category: 'System',
  },
  {
    id: 'admin_recent_activity',
    title: 'Recent Activity',
    description: 'Latest system activities and logs',
    category: 'Activity',
  },
  {
    id: 'admin_at_risk_students',
    title: 'At-Risk Students',
    description: 'Students requiring attention',
    category: 'Academic',
  },
  {
    id: 'celebrations_today',
    title: "Today's Celebrations",
    description: 'Birthdays and work anniversaries today',
    category: 'Community',
  },
];

export function getWidgetsByRole(role: string) {
  switch (role) {
    case 'student':
      return STUDENT_WIDGETS;
    case 'faculty':
      return FACULTY_WIDGETS;
    case 'principal':
    case 'hod':
      return LEADERSHIP_WIDGETS;
    case 'super_admin':
    case 'admin':
      return ADMIN_WIDGETS;
    default:
      return [];
  }
}
