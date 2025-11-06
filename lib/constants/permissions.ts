// lib/constants/profile.ts

import { SYSTEM_ROLES } from '@/types/auth';

export const INSTITUTIONS = [
  { value: 'jkkn_dental', label: 'JKKN Dental College' },
  { value: 'jkkn_pharmacy', label: 'JKKN College of Pharmacy' },
  { value: 'jkkn_arts', label: 'JKKN College of Arts & Science' },
  { value: 'jkkn_engineering', label: 'JKKN College of Engineering' },
  { value: 'jkkn_nursing', label: 'JKKN College of Nursing' },
  { value: 'jkkn_education', label: 'JKKN College of Education' },
  {
    value: 'jkkn_allied_health_science',
    label: 'JKKN College of Allied Health & Science'
  },
  {
    value: 'jkkn_matriculation',
    label: 'JKKN Matriculation Higher Secondary School'
  },
  { value: 'jkkn_NV', label: 'JKKN Nattraja Vidhyalya' }
] as const;

export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' }
] as const;

export const DEPARTMENTS = {
  jkkn_dental: [
    'Oral Medicine & Radiology',
    'Periodontics',
    'Conservative Dentistry',
    'Prosthodontics',
    'Oral Surgery'
  ],
  jkkn_pharmacy: [
    'Pharmaceutics',
    'Pharmaceutical Chemistry',
    'Pharmacology',
    'Pharmacognosy'
  ],
  jkkn_arts: [
    'English',
    'Mathematics',
    'Physics',
    'Chemistry',
    'Computer Science'
  ],
  jkkn_engineering: [
    'Computer Science Engineering',
    'Mechanical Engineering',
    'Electrical Engineering',
    'Civil Engineering'
  ],
  jkkn_nursing: [
    'Medical Surgical Nursing',
    'Pediatric Nursing',
    'Mental Health Nursing',
    'Community Health Nursing'
  ],
  jkkn_education: [
    'Mathematics Education',
    'Science Education',
    'Language Education',
    'Physical Education'
  ],
  jkkn_allied_health_science: [
    'B.Sc. (Nursing)',
    'B.Sc. (Physiotherapy)',
    'B.Sc. (Medical Laboratory Technology)'
  ],
  jkkn_matriculation: ['10th Standard'],
  jkkn_NV: ['10th Standard']
} as const;

// Keep the static mapping for backward compatibility
export const ROLE_LABELS: Record<string, string> = {
  [SYSTEM_ROLES.STUDENT]: 'Student',
  [SYSTEM_ROLES.FACULTY]: 'Faculty',
  [SYSTEM_ROLES.ADMINISTRATOR]: 'Administrator',
  [SYSTEM_ROLES.SUPER_ADMIN]: 'Super Administrator',
  [SYSTEM_ROLES.STAFF]: 'Staff',
  [SYSTEM_ROLES.GUEST]: 'Guest',
  [SYSTEM_ROLES.PARENT]: 'Parent',
  [SYSTEM_ROLES.HOD]: 'HOD',
  [SYSTEM_ROLES.PRINCIPAL]: 'Principal'
} as const;

// Default permissions for new roles
export const DEFAULT_ROLE_PERMISSIONS = {
  view_dashboard: true, // Allows access to the dashboard page
  view_profile: true // Allows users to view their own profile
};

// Add comment explaining these default permissions
// These are the bare minimum permissions that all roles should have
// to allow basic navigation. Any other permissions must be explicitly granted.

// Permission groups for common operations
export const PERMISSION_GROUPS = [
  {
    id: 'full_access',
    name: 'Full Access',
    description: 'Complete access to create, view, edit and delete',
    permissions: ['create', 'view', 'edit', 'delete']
  },
  {
    id: 'read_only',
    name: 'Read Only',
    description: 'View-only access with no modification capabilities',
    permissions: ['view']
  },
  {
    id: 'manage',
    name: 'Manage',
    description: 'Can view and edit but cannot create or delete',
    permissions: ['view', 'edit']
  },
  {
    id: 'contribute',
    name: 'Contribute',
    description: 'Can view, create and edit but cannot delete',
    permissions: ['view', 'create', 'edit']
  }
];

// Permission categories for UI
export const PERMISSION_CATEGORIES = [
  {
    name: 'User Management',
    key: 'users',
    permissions: [
      { key: 'users.view', label: 'View Users' },
      { key: 'users.create', label: 'Create Users' },
      { key: 'users.edit', label: 'Edit Users' },
      { key: 'users.delete', label: 'Delete Users' },
      { key: 'users.activity.view', label: 'View User Activity Logs' },
      { key: 'users.activity.export', label: 'Export Activity Logs' },
      { key: 'users.activity.analytics', label: 'View Activity Analytics' },
      { key: 'roles.view', label: 'View Roles' },
      { key: 'roles.assign', label: 'Assign Roles' },
      { key: 'roles.create', label: 'Create Roles' },
      { key: 'roles.edit', label: 'Edit Roles' },
      { key: 'roles.delete', label: 'Delete Roles' }
    ]
  },
  {
    name: 'Application Hub',
    key: 'application_hub',
    permissions: [
      { key: 'application_hub.view', label: 'View Applications' },
      { key: 'application_hub.guidelines.view', label: 'View API Guidelines' }
    ]
  },
  {
    name: 'Applications Management',
    key: 'applications',
    permissions: [
      { key: 'applications.view', label: 'View Applications' },
      { key: 'applications.create', label: 'Create Applications' },
      { key: 'applications.edit', label: 'Edit Applications' },
      { key: 'applications.delete', label: 'Delete Applications' },
      { key: 'applications.categories.view', label: 'View Categories' },
      { key: 'applications.categories.create', label: 'Create Categories' },
      { key: 'applications.categories.edit', label: 'Edit Categories' },
      { key: 'applications.categories.delete', label: 'Delete Categories' }
    ]
  },
  {
    name: 'Organizations',
    key: 'organizations',
    permissions: [
      { key: 'organizations.institutions.view', label: 'View Institutions' },
      {
        key: 'organizations.institutions.create',
        label: 'Create Institutions'
      },
      { key: 'organizations.institutions.edit', label: 'Edit Institutions' },
      {
        key: 'organizations.institutions.delete',
        label: 'Delete Institutions'
      },
      { key: 'organizations.degrees.view', label: 'View Degrees' },
      { key: 'organizations.degrees.create', label: 'Create Degrees' },
      { key: 'organizations.degrees.edit', label: 'Edit Degrees' },
      { key: 'organizations.degrees.delete', label: 'Delete Degrees' },
      { key: 'organizations.departments.view', label: 'View Departments' },
      { key: 'organizations.departments.create', label: 'Create Departments' },
      { key: 'organizations.departments.edit', label: 'Edit Departments' },
      { key: 'organizations.departments.delete', label: 'Delete Departments' },
      { key: 'organizations.programs.view', label: 'View Programs' },
      { key: 'organizations.programs.create', label: 'Create Programs' },
      { key: 'organizations.programs.edit', label: 'Edit Programs' },
      { key: 'organizations.programs.delete', label: 'Delete Programs' },
      { key: 'organizations.courses.view', label: 'View Courses' },
      { key: 'organizations.courses.create', label: 'Create Courses' },
      { key: 'organizations.courses.edit', label: 'Edit Courses' },
      { key: 'organizations.courses.delete', label: 'Delete Courses' },
      {
        key: 'organizations.course.mappings.view',
        label: 'View Course Mappings'
      },
      {
        key: 'organizations.course.mappings.create',
        label: 'Create Course Mappings'
      },
      {
        key: 'organizations.course.mappings.edit',
        label: 'Edit Course Mappings'
      },
      {
        key: 'organizations.course.mappings.delete',
        label: 'Delete Course Mappings'
      },
      {
        key: 'organizations.dashboard.view',
        label: 'View Organization Dashboard'
      },
      { key: 'organizations.semesters.view', label: 'View Semesters' },
      { key: 'organizations.semesters.create', label: 'Create Semesters' },
      { key: 'organizations.semesters.edit', label: 'Edit Semesters' },
      { key: 'organizations.semesters.delete', label: 'Delete Semesters' },
      { key: 'organizations.sections.view', label: 'View Sections' },
      { key: 'organizations.sections.create', label: 'Create Sections' },
      { key: 'organizations.sections.edit', label: 'Edit Sections' },
      { key: 'organizations.sections.delete', label: 'Delete Sections' }
    ]
  },
  {
    name: 'Students',
    key: 'students',
    permissions: [
      { key: 'students.view', label: 'View Students' },
      { key: 'students.create', label: 'Create Students' },
      { key: 'students.edit', label: 'Edit Students' },
      { key: 'students.delete', label: 'Delete Students' },
      {
        key: 'students.dashboard.view',
        label: 'View Student Analytics Dashboard'
      },
      { key: 'students.onboarding.view', label: 'View Student Onboarding' },
      { key: 'students.onboarding.edit', label: 'Edit Student Onboarding' },
      { key: 'students.onboarding.delete', label: 'Delete Student Onboarding' },
      { key: 'students.onboarding.bulk_update', label: 'Bulk Update Students' },
      { key: 'students.onboarding.bulk_update.export', label: 'Export Students for Update' },
      { key: 'students.onboarding.bulk_update.import', label: 'Import Student Updates' },
      { key: 'students.bulk_edit', label: 'Bulk Edit Learners' },
      { key: 'students.bulk_edit.export', label: 'Export Learners for Editing' },
      { key: 'students.bulk_edit.preview', label: 'Preview Bulk Edit Changes' },
      { key: 'students.bulk_edit.apply', label: 'Apply Bulk Edit Changes' },
      { key: 'students.bulk_create', label: 'Bulk Create Students' },
      { key: 'students.bulk_create.download_template', label: 'Download Bulk Create Template' },
      { key: 'students.bulk_create.export_template', label: 'Download Bulk Create Template (Legacy)' },
      { key: 'students.bulk_create.import', label: 'Import New Students' },
      { key: 'students.bulk_upload_images', label: 'Bulk Upload Student Photos' },
      { key: 'students.promotion.view', label: 'View Student Promotion' },
      { key: 'students.promotion.edit', label: 'Edit Student Promotion' }
    ]
  },
  {
    name: 'Staff Management',
    key: 'staff',
    permissions: [
      { key: 'staff.dashboard.view', label: 'View Staff Analytics Dashboard' },
      { key: 'staff.categories.view', label: 'View Staff Categories' },
      { key: 'staff.categories.create', label: 'Create Staff Categories' },
      { key: 'staff.categories.edit', label: 'Edit Staff Categories' },
      { key: 'staff.categories.delete', label: 'Delete Staff Categories' },
      { key: 'staff.view', label: 'View Staff' },
      { key: 'staff.create', label: 'Create Staff' },
      { key: 'staff.edit', label: 'Edit Staff' },
      { key: 'staff.delete', label: 'Delete Staff' }
    ]
  },
  {
    name: 'Academic',
    key: 'academic',
    permissions: [
      { key: 'academic.years.view', label: 'View Academic Years' },
      { key: 'academic.years.create', label: 'Create Academic Years' },
      { key: 'academic.years.edit', label: 'Edit Academic Years' },
      { key: 'academic.years.delete', label: 'Delete Academic Years' },
      { key: 'academic.periods.view', label: 'View Periods' },
      { key: 'academic.periods.create', label: 'Create Periods' },
      { key: 'academic.periods.edit', label: 'Edit Periods' },
      { key: 'academic.periods.delete', label: 'Delete Periods' },
      { key: 'academic.staff.planning.view', label: 'View Staff Planning' },
      { key: 'academic.staff.planning.create', label: 'Create Staff Planning' },
      { key: 'academic.staff.planning.edit', label: 'Edit Staff Planning' },
      { key: 'academic.staff.planning.delete', label: 'Delete Staff Planning' },
      { key: 'academic.timetables.view', label: 'View Timetables' },
      { key: 'academic.timetables.create', label: 'Create Timetables' },
      { key: 'academic.timetables.edit', label: 'Edit Timetables' },
      { key: 'academic.timetables.delete', label: 'Delete Timetables' },
      { key: 'faculty.calendar.view', label: 'View Faculty Calendar' },
      { key: 'academic.attendance.view', label: 'View Attendance' },
      { key: 'academic.attendance.mark', label: 'Mark Attendance' },
      { key: 'academic.attendance.edit', label: 'Edit Attendance' },
      { key: 'academic.attendance.reports', label: 'View Attendance Reports' },
      {
        key: 'academic.attendance.reports.view',
        label: 'View Attendance Reports'
      },
      {
        key: 'academic.attendance.reports.export',
        label: 'Export Attendance Reports'
      },
      {
        key: 'academic.attendance.dashboard.view',
        label: 'View Attendance Dashboard'
      },
      {
        key: 'academic.attendance.dashboard.view_all_institutions',
        label: 'View Dashboard for All Institutions'
      }
    ]
  },
  {
    name: 'Admissions',
    key: 'admissions',
    permissions: [
      { key: 'admissions.dashboard', label: 'View Analytics Dashboard' },
      { key: 'admissions.view', label: 'View Admissions' },
      { key: 'admissions.create', label: 'Create Admissions' },
      { key: 'admissions.edit', label: 'Edit Admissions' },
      { key: 'admissions.delete', label: 'Delete Admissions' },
      { key: 'admissions.crm.view', label: 'View Enquiry CRM' }
    ]
  },
  {
    name: 'System',
    key: 'system',
    permissions: [
      { key: 'system.api.view', label: 'View API' },
      { key: 'system.api.create', label: 'Create API' },
      { key: 'system.api.edit', label: 'Edit API' },
      { key: 'system.api.delete', label: 'Delete API' }
    ]
  },
  {
    name: 'Billing Management',
    key: 'billing',
    permissions: [
      {
        key: 'billing.parent_categories.view',
        label: 'View Parent Categories'
      },
      {
        key: 'billing.parent_categories.create',
        label: 'Create Parent Categories'
      },
      {
        key: 'billing.parent_categories.edit',
        label: 'Edit Parent Categories'
      },
      {
        key: 'billing.parent_categories.delete',
        label: 'Delete Parent Categories'
      },
      { key: 'billing.sub_categories.view', label: 'View Sub Categories' },
      { key: 'billing.sub_categories.create', label: 'Create Sub Categories' },
      { key: 'billing.sub_categories.edit', label: 'Edit Sub Categories' },
      { key: 'billing.sub_categories.delete', label: 'Delete Sub Categories' },
      { key: 'billing.item_categories.view', label: 'View Item Categories' },
      {
        key: 'billing.item_categories.create',
        label: 'Create Item Categories'
      },
      { key: 'billing.item_categories.edit', label: 'Edit Item Categories' },
      {
        key: 'billing.item_categories.delete',
        label: 'Delete Item Categories'
      },
      { key: 'billing.schedule.view', label: 'View Schedule' },
      { key: 'billing.schedule.create', label: 'Create Schedule' },
      { key: 'billing.schedule.update', label: 'Update Schedule' },
      { key: 'billing.schedule.delete', label: 'Delete Schedule' },
      { key: 'billing.receipts.view', label: 'View Receipts' },
      { key: 'billing.receipts.create', label: 'Create Receipts' },
      { key: 'billing.receipts.edit', label: 'Edit Receipts' },
      { key: 'billing.receipts.delete', label: 'Delete Receipts' },
      { key: 'billing.receipts.generate', label: 'Generate Receipts' },
      { key: 'billing.discounts.view', label: 'View Discounts' },
      { key: 'billing.discounts.create', label: 'Create Discounts' },
      { key: 'billing.discounts.edit', label: 'Edit Discounts' },
      { key: 'billing.discounts.delete', label: 'Delete Discounts' },
      { key: 'billing.discounts.approve', label: 'Approve Discounts' },
      { key: 'billing.refunds.view', label: 'View Refunds' },
      { key: 'billing.refunds.create', label: 'Create Refunds' },
      { key: 'billing.refunds.edit', label: 'Edit Refunds' },
      { key: 'billing.refunds.delete', label: 'Delete Refunds' },
      { key: 'billing.refunds.approve', label: 'Approve Refunds' },
      { key: 'billing.refunds.process', label: 'Process Refunds' },
      { key: 'billing.invoices.view', label: 'View Invoices' },
      { key: 'billing.invoices.create', label: 'Create Invoices' },
      { key: 'billing.invoices.edit', label: 'Edit Invoices' },
      { key: 'billing.invoices.delete', label: 'Delete Invoices' },
      { key: 'billing.invoices.send', label: 'Send Invoices' },
      { key: 'billing.reports.view', label: 'View Billing Reports' }
    ]
  },
  {
    name: 'Resource Management',
    key: 'resources',
    permissions: [
      { key: 'resources.categories.view', label: 'View Resource Categories' },
      {
        key: 'resources.categories.create',
        label: 'Create Resource Categories'
      },
      { key: 'resources.categories.edit', label: 'Edit Resource Categories' },
      {
        key: 'resources.categories.delete',
        label: 'Delete Resource Categories'
      },
      {
        key: 'resources.subcategories.view',
        label: 'View Resource Subcategories'
      },
      {
        key: 'resources.subcategories.create',
        label: 'Create Resource Subcategories'
      },
      {
        key: 'resources.subcategories.edit',
        label: 'Edit Resource Subcategories'
      },
      {
        key: 'resources.subcategories.delete',
        label: 'Delete Resource Subcategories'
      },
      { key: 'resources.resources.view', label: 'View Resources' },
      { key: 'resources.resources.create', label: 'Create Resources' },
      { key: 'resources.resources.edit', label: 'Edit Resources' },
      { key: 'resources.resources.delete', label: 'Delete Resources' },
      { key: 'resources.reservations.view', label: 'View Reservations' },
      { key: 'resources.reservations.create', label: 'Create Reservations' },
      { key: 'resources.reservations.edit', label: 'Edit Reservations' },
      { key: 'resources.reservations.cancel', label: 'Cancel Reservations' },
      { key: 'resources.approvals.view', label: 'View Resource Approvals' },
      {
        key: 'resources.approvals.approve',
        label: 'Approve Resource Requests'
      },
      { key: 'resources.approvals.reject', label: 'Reject Resource Requests' },
      { key: 'resources.analytics.view', label: 'View Resource Analytics' },
      { key: 'resources.reports.view', label: 'View Resource Reports' }
    ]
  },
  {
    name: 'Notifications',
    key: 'notifications',
    permissions: [
      { key: 'notifications.view', label: 'View Notifications' },
      { key: 'notifications.create', label: 'Create Notifications' },
      { key: 'notifications.edit', label: 'Edit Notifications' },
      { key: 'notifications.delete', label: 'Delete Notifications' },
      { key: 'notifications.send', label: 'Send Notifications' },
      { key: 'notifications.view.all', label: 'View All Notifications' }
    ]
  }
];

export const PERMISSIONS = {
  // Notification permissions
  MANAGE_NOTIFICATIONS: 'manage_notifications',
  SEND_NOTIFICATIONS: 'send_notifications',
  VIEW_ALL_NOTIFICATIONS: 'view_all_notifications'
} as const;
