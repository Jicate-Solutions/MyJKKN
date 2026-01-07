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
    name: 'Learners',
    key: 'learners',
    permissions: [
      // Basic Learner Operations
      { key: 'learners.view', label: 'View Learners (Legacy - use specific permissions below)' },
      { key: 'learners.create', label: 'Create Learners' },
      { key: 'learners.edit', label: 'Edit Learners' },
      { key: 'learners.delete', label: 'Delete Learners' },

      // Specific Page Access (Granular Permissions)
      { key: 'learners.dashboard.view', label: 'View Learner Analytics Dashboard' },
      { key: 'learners.profiles.view', label: 'View Learner Profiles' },
      { key: 'learners.alumni.view', label: 'View Alumni & Graduates' },
      { key: 'learners.attendance.view', label: 'View Own Attendance (Students)' },

      // Learner Onboarding
      { key: 'learners.onboarding.view', label: 'View Learner Onboarding' },
      { key: 'learners.onboarding.edit', label: 'Edit Learner Onboarding' },
      { key: 'learners.onboarding.delete', label: 'Delete Learner Onboarding' },
      { key: 'learners.onboarding.bulk_update', label: 'Bulk Update Learners' },
      { key: 'learners.onboarding.bulk_update.export', label: 'Export Learners for Update' },
      { key: 'learners.onboarding.bulk_update.import', label: 'Import Learner Updates' },

      // Bulk Operations
      { key: 'learners.bulk_edit', label: 'Bulk Edit Learners' },
      { key: 'learners.bulk_edit.export', label: 'Export Learners for Editing' },
      { key: 'learners.bulk_edit.preview', label: 'Preview Bulk Edit Changes' },
      { key: 'learners.bulk_edit.apply', label: 'Apply Bulk Edit Changes' },
      { key: 'learners.bulk_create', label: 'Bulk Create Learners' },
      { key: 'learners.bulk_create.download_template', label: 'Download Bulk Create Template' },
      { key: 'learners.bulk_create.export_template', label: 'Download Bulk Create Template (Legacy)' },
      { key: 'learners.bulk_create.import', label: 'Import New Learners' },
      { key: 'learners.bulk_upload_images', label: 'Bulk Upload Learner Photos' },

      // Learner Lifecycle Management
      { key: 'learners.promotion.view', label: 'View Learner Promotion' },
      { key: 'learners.promotion.edit', label: 'Edit Learner Promotion' },
      { key: 'learners.graduated.view', label: 'View Graduated & Exited Learners' },
      { key: 'learners.graduated.edit', label: 'Edit Graduated & Exited Learners Status' },

      // Admission & Enquiries Management
      { key: 'learners.admissions.dashboard', label: 'View Admissions Analytics Dashboard' },
      { key: 'learners.admissions.view', label: 'View Admissions' },
      { key: 'learners.admissions.create', label: 'Create Admissions' },
      { key: 'learners.admissions.edit', label: 'Edit Admissions' },
      { key: 'learners.admissions.delete', label: 'Delete Admissions' },
      { key: 'learners.admissions.crm.view', label: 'View Enquiry CRM' },

      // Learner Enquiries Bulk Operations
      { key: 'learners.enquiries.bulk_upload', label: 'Bulk Upload Enquiries' },
      { key: 'learners.enquiries.bulk_status_update', label: 'Bulk Status Update for Enquiries' }
    ]
  },
  {
    name: 'Staff Management',
    key: 'staff',
    permissions: [
      { key: 'staff.dashboard.view', label: 'View Facilitators Analytics Dashboard' },
      { key: 'staff.categories.view', label: 'View Facilitators Categories' },
      { key: 'staff.categories.create', label: 'Create Facilitators Categories' },
      { key: 'staff.categories.edit', label: 'Edit Facilitators Categories' },
      { key: 'staff.categories.delete', label: 'Delete Facilitators Categories' },
      { key: 'staff.view', label: 'View Facilitators' },
      { key: 'staff.create', label: 'Create Facilitators' },
      { key: 'staff.edit', label: 'Edit Facilitators' },
      { key: 'staff.delete', label: 'Delete Facilitators' }
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
      { key: 'academic.staff.planning.view', label: 'View Facilitators Planning' },
      { key: 'academic.staff.planning.create', label: 'Create Facilitators Planning' },
      { key: 'academic.staff.planning.edit', label: 'Edit Facilitators Planning' },
      { key: 'academic.staff.planning.delete', label: 'Delete Facilitators Planning' },
      { key: 'academic.timetables.view', label: 'View Timetables' },
      { key: 'academic.timetables.create', label: 'Create Timetables' },
      { key: 'academic.timetables.edit', label: 'Edit Timetables' },
      { key: 'academic.timetables.delete', label: 'Delete Timetables' },
      { key: 'academic.timetables.templates.view', label: 'View Timetable Templates' },
      { key: 'academic.timetables.templates.create', label: 'Create Timetable Templates' },
      { key: 'academic.timetables.templates.edit', label: 'Edit Timetable Templates' },
      { key: 'academic.timetables.templates.delete', label: 'Delete Timetable Templates' },
      { key: 'academic.timetables.templates.analytics', label: 'View Template Analytics' },
      { key: 'faculty.calendar.view', label: 'View Facilitators Calendar' },
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
      },
      // Regulations Management
      { key: 'academic.regulations.view', label: 'View Regulations' },
      { key: 'academic.regulations.create', label: 'Create Regulations' },
      { key: 'academic.regulations.edit', label: 'Edit Regulations' },
      { key: 'academic.regulations.delete', label: 'Delete Regulations' },
      // Batches Management
      { key: 'academic.batches.view', label: 'View Batches' },
      { key: 'academic.batches.create', label: 'Create Batches' },
      { key: 'academic.batches.edit', label: 'Edit Batches' },
      { key: 'academic.batches.delete', label: 'Delete Batches' }
    ]
  },
  {
    name: 'Leave Management',
    key: 'leaves',
    permissions: [
      // Main Leave Operations
      { key: 'academic.leaves.view', label: 'View Leaves' },
      { key: 'academic.leaves.create', label: 'Create Leaves' },
      { key: 'academic.leaves.edit', label: 'Edit Leaves' },
      { key: 'academic.leaves.delete', label: 'Delete Leaves' },
      { key: 'academic.leaves.cancel', label: 'Cancel Leaves' },

      // Leave Types Management
      { key: 'academic.leaves.manage', label: 'Manage Leave Settings (Types & Workflows)' },

      // Leave Approvals (Scope-based) - CRITICAL: Must match approval service expectations
      { key: 'academic.leaves.approve.view', label: 'View Pending Approvals' },
      { key: 'academic.leaves.approve.institution', label: 'Approve Institution-wide Leaves' },
      { key: 'academic.leaves.approve.department', label: 'Approve Department Leaves' },
      { key: 'academic.leaves.approve.semester', label: 'Approve Semester Leaves' },
      { key: 'academic.leaves.approve.section', label: 'Approve Section Leaves' },
      { key: 'academic.leaves.reject', label: 'Reject Leaves' },

      // Leave Reports
      { key: 'academic.leaves.reports.view', label: 'View Leave Reports' },
      { key: 'academic.leaves.reports.export', label: 'Export Leave Reports' },

      // Leave Analytics
      { key: 'academic.leaves.analytics.view', label: 'View Leave Analytics' }
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
