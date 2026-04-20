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
      { key: 'roles.delete', label: 'Delete Roles' },
      { key: 'users.permissions_audit.view', label: 'View Permissions Audit Dashboard' }
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
      // Admin Features
      { key: 'learners.dashboard.view', label: 'View Learners Analytics Dashboard' },
      { key: 'learners.profiles.view', label: 'View Learner Profiles (Admin)' },
      { key: 'learners.alumni.view', label: 'View Alumni & Graduates (Admin)' },
      { key: 'learners.bug_reports.view', label: 'View Bug Reports & Leaderboard' },

      // Learner Portal Features (Student Self-Service)
      { key: 'learners.my-timetable.view', label: 'View My Timetable (Students)' },
      { key: 'learners.my-attendance.view', label: 'View My Attendance (Students)' },
      { key: 'learners.my-profile.view', label: 'View My Profile (Students)' },
      { key: 'learners.my-profile.edit', label: 'Edit My Profile (Students)' },

      // Legacy permissions (deprecated - use my-* versions above)
      { key: 'learners.attendance.view', label: 'View Own Attendance (Students) - DEPRECATED: Use learners.my-attendance.view' },
      { key: 'learners.timetable.view', label: 'View Own Timetable (Students) - DEPRECATED: Use learners.my-timetable.view' },

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
      { key: 'learners.admissions.mark_account', label: 'Mark as Account' },
      { key: 'learners.admissions.transfer', label: 'Transfer Enquiry to Another Institution' },
      { key: 'learners.admissions.crm.view', label: 'View Enquiry CRM' },

      // Learner Enquiries Bulk Operations
      { key: 'learners.enquiries.bulk_upload', label: 'Bulk Upload Enquiries' },
      { key: 'learners.enquiries.bulk_status_update', label: 'Bulk Status Update for Enquiries' },

      // Learner Profile Change Requests
      { key: 'learners.change-requests.view', label: 'View Profile Change Requests' },
      { key: 'learners.change-requests.approve', label: 'Approve Profile Change Requests' },
      { key: 'learners.change-requests.reject', label: 'Reject Profile Change Requests' },

      // Learner Finance Section
      { key: 'learners.finance.view', label: 'View Finance Details (Fee Structure)' },
      { key: 'learners.finance.edit', label: 'Edit Finance Details (Fee Structure)' }
    ]
  },
  {
    name: 'Employee Management',
    key: 'staff',
    permissions: [
      { key: 'staff.dashboard.view', label: 'View Employee Analytics Dashboard' },
      { key: 'staff.categories.view', label: 'View Employee Categories' },
      { key: 'staff.categories.create', label: 'Create Employee Categories' },
      { key: 'staff.categories.edit', label: 'Edit Employee Categories' },
      { key: 'staff.categories.delete', label: 'Delete Employee Categories' },
      { key: 'staff.view', label: 'View Employees' },
      { key: 'staff.create', label: 'Create Employees' },
      { key: 'staff.edit', label: 'Edit Employees' },
      { key: 'staff.delete', label: 'Delete Employees' },
      { key: 'staff.status_update', label: 'Update Employee Status' },
      { key: 'staff.class_incharges.view', label: 'View Class Incharges' },
      { key: 'staff.class_incharges.create', label: 'Assign Class Incharges' },
      { key: 'staff.class_incharges.delete', label: 'Remove Class Incharges' }
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
      { key: 'academic.staff.planning.view', label: 'View Employee Planning' },
      { key: 'academic.staff.planning.create', label: 'Create Employee Planning' },
      { key: 'academic.staff.planning.edit', label: 'Edit Employee Planning' },
      { key: 'academic.staff.planning.delete', label: 'Delete Employee Planning' },
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
      {
        key: 'academic.attendance.consolidation.view',
        label: 'View Consolidation Reports'
      },
      {
        key: 'academic.attendance.consolidation.export',
        label: 'Export Consolidation Reports'
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
      { key: 'academic.batches.delete', label: 'Delete Batches' },
      // Internal Marks (CIA)
      { key: 'academic.internal-marks.view', label: 'View Internal Marks' },
      { key: 'academic.internal-marks.edit', label: 'Enter/Edit Internal Marks' },
      { key: 'academic.internal-marks.submit', label: 'Submit Internal Marks' },
      { key: 'academic.internal-marks.reports', label: 'View Internal Marks Reports' }
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
    name: 'Leave/OnDuty Application System',
    key: 'leave_onduty',
    permissions: [
      // Academic/Admin Permissions
      { key: 'academic.leave_onduty.approve', label: 'View & Process Approvals (Academic)' },
      { key: 'academic.leave_onduty.manage', label: 'Manage Workflow Settings (Academic)' },
      { key: 'academic.leave_onduty.reports', label: 'View Reports & Analytics (Academic)' },

      // Learner/Student Permissions
      { key: 'learners.leave_onduty.apply', label: 'Apply for Leave/OnDuty (Students)' },
      { key: 'learners.leave_onduty.view', label: 'View My Applications (Students)' },
      { key: 'learners.leave_onduty.edit', label: 'Edit My Applications (Students)' },
      { key: 'learners.leave_onduty.cancel', label: 'Cancel My Applications (Students)' }
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
      { key: 'billing.categories.view', label: 'View Billing Categories' },
      { key: 'billing.categories.create', label: 'Create Billing Categories' },
      { key: 'billing.categories.edit', label: 'Edit Billing Categories' },
      { key: 'billing.categories.delete', label: 'Delete Billing Categories' },
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
      { key: 'billing.onboarding.view', label: 'View Learner Onboarding' },
      { key: 'billing.onboarding.approve', label: 'Approve Learner Onboarding' },
      { key: 'billing.reports.view', label: 'View Billing Reports' }
    ]
  },
  {
    name: 'HR Management',
    key: 'hr',
    permissions: [
      // Recruitment (Phase 1A+1B shipped 2026-04-15) —
      // RLS keys referenced in supabase/setup/03_policies.sql for hr_recruitment_*
      { key: 'hr.recruitment.view', label: 'View Recruitment Candidates' },
      { key: 'hr.recruitment.create', label: 'Submit Recruitment Candidates' },
      { key: 'hr.recruitment.edit', label: 'Edit Recruitment Candidates' },
      { key: 'hr.recruitment.delete', label: 'Delete Recruitment Candidates' },
      { key: 'hr.recruitment.approve', label: 'Approve Recruitment Candidates' },
      { key: 'hr.recruitment.packages.view', label: 'View Candidate CTC Packages' },
      { key: 'hr.recruitment.packages.propose', label: 'Propose Candidate CTC Packages' },
      { key: 'hr.recruitment.packages.approve', label: 'Approve Candidate CTC Packages' },
      // Leave (Sprint 2) — RLS keys referenced in hr_leave_* policies
      { key: 'hr.leave.view', label: 'View Leave Applications' },
      { key: 'hr.leave.apply', label: 'Apply for Leave' },
      { key: 'hr.leave.approve', label: 'Approve Leave Applications' },
      { key: 'hr.leave.cancel', label: 'Cancel Own Leave Pre-Approval' },
      { key: 'hr.leave.withdraw', label: 'Withdraw Own Leave Post-Approval' },
      { key: 'hr.leave.balance.view', label: 'View Leave Balances' },
      { key: 'hr.leave.encashment.view', label: 'View Leave Encashment Requests' },
      { key: 'hr.leave.encashment.approve', label: 'Approve Leave Encashment' },
      // Employees (Sprint 1) — HR employee directory
      { key: 'hr.employees.view', label: 'View Employee Directory' },
      { key: 'hr.employees.create', label: 'Add New Employees' },
      { key: 'hr.employees.edit', label: 'Edit Employee Details' },
      { key: 'hr.employees.delete', label: 'Deactivate Employees' },
      { key: 'hr.employees.export', label: 'Export Employee Data' },
      // Policies (Sprint 3) — HR policy tables
      { key: 'hr.policies.view', label: 'View HR Policies' },
      { key: 'hr.policies.create', label: 'Create Policy Entries' },
      { key: 'hr.policies.edit', label: 'Edit Policy Entries' },
      { key: 'hr.policies.history.view', label: 'View Policy Change History' },
      // Onboarding (Sprint 4) — hr_onboarding_checklists cadre templates
      { key: 'hr.onboarding.view', label: 'View Onboarding Checklists' },
      { key: 'hr.onboarding.manage', label: 'Manage Onboarding Templates' },
      { key: 'hr.onboarding.execute', label: 'Execute Onboarding Steps' },
      // Dashboard (Sprint 6) — HR Command Center
      { key: 'hr.dashboard.view', label: 'View HR Command Center' },
      { key: 'hr.dashboard.manage', label: 'Configure HR Command Center Widgets' }
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
      { key: 'resources.reports.view', label: 'View Resource Reports' },
      { key: 'resources.maintenance.view', label: 'View Resource Maintenance' },
      { key: 'resources.maintenance.create', label: 'Create Maintenance Records' },
      { key: 'resources.maintenance.edit', label: 'Edit Maintenance Records' }
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
  },
  {
    name: 'LTI Management',
    key: 'lti',
    permissions: [
      // LTI Tool Configuration
      { key: 'lti.tools.view', label: 'View LTI Tools' },
      { key: 'lti.tools.create', label: 'Create LTI Tools' },
      { key: 'lti.tools.edit', label: 'Edit LTI Tools' },
      { key: 'lti.tools.delete', label: 'Delete LTI Tools' },

      // LTI Monitoring & Analytics
      { key: 'lti.monitor', label: 'Access LTI Monitoring Dashboards' },
      { key: 'lti.analytics.view', label: 'View LTI Analytics' },
      { key: 'lti.grade_sync.view', label: 'View Grade Sync Status' },
      { key: 'lti.launches.view', label: 'View Launch Debug Logs' },

      // LTI Launches
      { key: 'lti.launches.create', label: 'Launch LTI Tools' },
      { key: 'lti.launches.debug', label: 'Debug LTI Launches' }
    ]
  },
  {
    name: 'Service Requests',
    key: 'service_requests',
    permissions: [
      { key: 'service_requests.types.view', label: 'View Service Types' },
      { key: 'service_requests.types.create', label: 'Create Service Types' },
      { key: 'service_requests.types.edit', label: 'Edit Service Types' },
      { key: 'service_requests.types.delete', label: 'Delete Service Types' },
      { key: 'service_requests.submit', label: 'Submit Service Requests' },
      { key: 'service_requests.view_own', label: 'View Own Requests' },
      { key: 'service_requests.view_all', label: 'View All Requests' },
      { key: 'service_requests.edit_own', label: 'Edit Own Requests' },
      { key: 'service_requests.cancel_own', label: 'Cancel Own Requests' },
      { key: 'service_requests.approve', label: 'Approve/Reject Requests' },
      { key: 'service_requests.fulfill', label: 'Mark Requests Fulfilled' },
      { key: 'service_requests.close', label: 'Close Requests' },
      { key: 'service_requests.analytics.view', label: 'View Analytics' },
      { key: 'service_requests.external_api.manage', label: 'Manage External API' },
    ]
  },
  {
    name: 'Startup Studio',
    key: 'startup_studio',
    permissions: [
      // Events
      { key: 'startup_studio.events.view', label: 'View Events' },
      { key: 'startup_studio.events.create', label: 'Create Events' },
      { key: 'startup_studio.events.manage', label: 'Manage Events (Edit, Status, Config)' },

      // Registrations
      { key: 'startup_studio.registrations.view', label: 'View Registrations' },
      { key: 'startup_studio.registrations.manage', label: 'Manage Registrations (Check-in, Lovable Verify)' },

      // Venues & Staff
      { key: 'startup_studio.venues.manage', label: 'Manage Venues & Staff Assignments' },

      // Submissions
      { key: 'startup_studio.submissions.view', label: 'View Submissions' },
      { key: 'startup_studio.submissions.verify_mrr', label: 'Verify/Reject MRR Claims' },

      // Leaderboard
      { key: 'startup_studio.leaderboard.view', label: 'View Leaderboard' },
      { key: 'startup_studio.leaderboard.publish', label: 'Publish/Unpublish Results' },

      // Demo Day
      { key: 'startup_studio.demo_day.manage', label: 'Manage Demo Day Slots' },

      // Evaluations
      { key: 'startup_studio.evaluations.manage', label: 'Manage Demo Day Evaluations' },

      // Checklists
      { key: 'startup_studio.checklists.manage', label: 'Manage Event Checklists' },
    ]
  },
  {
    name: 'Administration',
    key: 'admin',
    permissions: [
      { key: 'admin.lifecycle.view', label: 'View Lifecycle Analytics Dashboard' },
      { key: 'system.bugs.view', label: 'View All Bug Reports (Admin)' },
      { key: 'audit.view', label: 'View Audit Trail' },
      { key: 'users.dashboard.view', label: 'View User Analytics Dashboard' },
      { key: 'ai_query.view', label: 'Access AI Assistant' }
    ]
  },
  {
    name: 'Admission CRM',
    key: 'admission',
    permissions: [
      // Dashboard & Analytics
      { key: 'admission.dashboard.view', label: 'View Admission Dashboard' },
      { key: 'admission.analytics.view', label: 'View Admission Analytics' },
      { key: 'admission.group_dashboard.view', label: 'View Group Dashboard' },
      { key: 'admission.insights.view', label: 'View AI Insights' },

      // Lead Management
      { key: 'admission.leads.view', label: 'View Leads' },
      { key: 'admission.leads.create', label: 'Create Leads' },
      { key: 'admission.leads.edit', label: 'Edit Leads' },
      { key: 'admission.leads.delete', label: 'Delete Leads' },
      { key: 'admission.leads.assign', label: 'Assign Leads to Counselors' },
      { key: 'admission.leads.bulk_upload', label: 'Bulk Upload Leads' },
      { key: 'admission.leads.bulk_status_update', label: 'Bulk Update Lead Status' },
      { key: 'admission.leads.export', label: 'Export Leads' },

      // Application Management
      { key: 'admission.applications.view', label: 'View Applications' },
      { key: 'admission.applications.create', label: 'Create Applications' },
      { key: 'admission.applications.edit', label: 'Edit Applications' },
      { key: 'admission.applications.delete', label: 'Delete Applications' },
      { key: 'admission.applications.approve', label: 'Approve/Reject Applications' },

      // Counselor Management
      { key: 'admission.counselors.view', label: 'View Counselors' },
      { key: 'admission.counselors.create', label: 'Create Counselors' },
      { key: 'admission.counselors.edit', label: 'Edit Counselors' },
      { key: 'admission.counselors.delete', label: 'Delete Counselors' },
      { key: 'admission.counselors.performance.view', label: 'View Counselor Performance' },

      // Consultant Management
      { key: 'admission.consultants.view', label: 'View Education Consultants' },
      { key: 'admission.consultants.create', label: 'Create Education Consultants' },
      { key: 'admission.consultants.edit', label: 'Edit Education Consultants' },
      { key: 'admission.consultants.delete', label: 'Delete Education Consultants' },
      { key: 'admission.consultants.analytics.view', label: 'View Consultant Analytics' },
      { key: 'admission.consultants.commissions.view', label: 'View Commissions' },
      { key: 'admission.consultants.commissions.manage', label: 'Manage Commissions & Payouts' },
      { key: 'admission.consultants.referrals.view', label: 'View Referrals' },
      { key: 'admission.consultants.rewards.view', label: 'View Rewards' },
      { key: 'admission.consultants.rewards.manage', label: 'Manage Rewards Configuration' },

      // Marketing & Campaigns
      { key: 'admission.marketing.view', label: 'View Marketing Campaigns' },
      { key: 'admission.marketing.create', label: 'Create Marketing Campaigns' },
      { key: 'admission.marketing.edit', label: 'Edit Marketing Campaigns' },
      { key: 'admission.marketing.delete', label: 'Delete Marketing Campaigns' },
      { key: 'admission.marketing.chat.view', label: 'View WhatsApp Chat' },
      { key: 'admission.marketing.chat.manage', label: 'Manage WhatsApp Chat' },
      { key: 'admission.marketing.chatbot.view', label: 'View Chatbot' },
      { key: 'admission.marketing.chatbot.manage', label: 'Manage Chatbot & Knowledge Base' },
      { key: 'admission.marketing.voice.view', label: 'View Voice Agents & Broadcast' },
      { key: 'admission.marketing.voice.manage', label: 'Manage Voice Agents & Broadcast' },
      { key: 'admission.marketing.expos.view', label: 'View Expos & Events' },
      { key: 'admission.marketing.expos.create', label: 'Create Expos & Events' },
      { key: 'admission.marketing.expos.edit', label: 'Edit Expos & Events' },
      { key: 'admission.marketing.expos.delete', label: 'Delete Expos & Events' },

      // Data Quality
      { key: 'admission.data_quality.view', label: 'View Data Quality Reports' },
      { key: 'admission.data_quality.manage', label: 'Manage Data Quality (Dedup, Validation)' },

      // Settings & Configuration
      { key: 'admission.settings.view', label: 'View Admission Settings' },
      { key: 'admission.settings.manage', label: 'Manage Admission Settings' },
      { key: 'admission.settings.templates.view', label: 'View Communication Templates' },
      { key: 'admission.settings.templates.manage', label: 'Manage Communication Templates' },
      { key: 'admission.settings.workflows.view', label: 'View Workflows' },
      { key: 'admission.settings.workflows.manage', label: 'Manage Workflows & Configuration' },
      { key: 'admission.settings.assignment.view', label: 'View Assignment Rules' },
      { key: 'admission.settings.assignment.manage', label: 'Manage Assignment Rules' },
      { key: 'admission.settings.sources.view', label: 'View Lead Sources' },
      { key: 'admission.settings.sources.manage', label: 'Manage Lead Sources' },
      { key: 'admission.settings.whatsapp.view', label: 'View WhatsApp Settings' },
      { key: 'admission.settings.whatsapp.manage', label: 'Manage WhatsApp Numbers & Settings' }
    ]
  },
  {
    name: 'Work Pulse',
    key: 'work_pulse',
    permissions: [
      { key: 'work_pulse.view', label: 'View Work Pulse (My Pulse)' },
      { key: 'work_pulse.all.view', label: 'View All Submissions (Admin)' },
      { key: 'work_pulse.agents.view', label: 'View Agent Opportunity Board' },
      { key: 'work_pulse.impact.view', label: 'View Impact Dashboard' }
    ]
  },
  // Dashboard v2 (2026-04-15) — Operational Nervous System
  // Spec: specs/myjkkn-dashboard-v2-spec.md §6.6
  {
    name: 'Dashboard v2',
    key: 'dashboard',
    permissions: [
      { key: 'dashboard.director.view', label: 'View Director dashboard' },
      { key: 'dashboard.queue.approve.waiver', label: 'Approve fee waivers from queue' },
      { key: 'dashboard.queue.approve.leave', label: 'Approve leave requests (>3 days) from queue' },
      { key: 'dashboard.queue.approve.purchase', label: 'Approve purchases (>₹50k) from queue' },
      { key: 'dashboard.queue.approve.travel', label: 'Approve staff travel from queue' },
      { key: 'dashboard.queue.resolve.grievance', label: 'Resolve tier-3 grievances from queue' },
      { key: 'dashboard.leaderboard.view', label: 'View counselor leaderboards (SLA + Conversion)' },
      { key: 'dashboard.broadcast.initiate', label: 'Initiate Broadcast Rescue for cold leads' },
      { key: 'dashboard.broadcast.claim', label: 'Claim Broadcast Rescue leads' },
      { key: 'dashboard.anomaly.acknowledge', label: 'Acknowledge anomaly alerts' }
    ]
  },
  // ======================================================================
  // Faculty Innovation Portfolio (spec v1.0.0 — 2026-04-15) — merged from jicate/main via PR #188
  // ======================================================================
  {
    name: 'Faculty Innovation',
    key: 'faculty_innovation',
    permissions: [
      // Initiative actions
      { key: 'faculty_innovation.initiative.submit', label: 'Submit Initiative' },
      { key: 'faculty_innovation.initiative.view_own', label: 'View Own Initiatives' },
      { key: 'faculty_innovation.initiative.view_all_institution', label: 'View All Institution Initiatives' },
      { key: 'faculty_innovation.initiative.approve', label: 'Approve Initiatives' },
      { key: 'faculty_innovation.initiative.reject', label: 'Reject Initiatives' },
      { key: 'faculty_innovation.initiative.withdraw', label: 'Withdraw Own Initiative' },
      { key: 'faculty_innovation.initiative.export', label: 'Export Initiatives (NAAC/NBA/AICTE)' },

      // IP (confidentiality-sensitive — Week 2 features; keys reserved now)
      { key: 'faculty_innovation.ip.view', label: 'View IP / Patent Filings' },
      { key: 'faculty_innovation.ip.edit', label: 'Edit IP / Patent Filings' },
      { key: 'faculty_innovation.ip.register', label: 'Register New IP Filing' },

      // Collaboration requests
      { key: 'faculty_innovation.collab_request.create', label: 'Create Cross-College Collab Request' },
      { key: 'faculty_innovation.collab_request.respond', label: 'Respond to Collab Request' },

      // Admin actions
      { key: 'faculty_innovation.admin.retro_load', label: 'Retro-load Initiatives' },
      { key: 'faculty_innovation.admin.bulk_import', label: 'Bulk Import Initiatives' }
    ]
  },
  // Added 2026-04-16 - OKR module resurrection from clean-ss-deploy
  // Strategic driver: Cluster Academic Council uses OKR as primary tracking layer
  // Cascading levels: organization -> institution -> department -> individual
  // Tiers: tier_1 (strategic), tier_2 (operational), tier_3 (execution)
  {
    name: 'OKR (Objectives & Key Results)',
    key: 'okr',
    permissions: [
      // Top-level module visibility
      { key: 'okr.view', label: 'View OKR Module' },

      // Objectives CRUD
      { key: 'okr.objectives.view', label: 'View Objectives' },
      { key: 'okr.objectives.create', label: 'Create Objectives' },
      { key: 'okr.objectives.edit', label: 'Edit Objectives' },
      { key: 'okr.objectives.delete', label: 'Delete Objectives' },

      // Tier-level objective creation (strategic gate)
      { key: 'okr.objectives.create.tier1', label: 'Create Tier 1 (Strategic/Org) Objectives' },
      { key: 'okr.objectives.create.tier2', label: 'Create Tier 2 (Institution) Objectives' },
      { key: 'okr.objectives.create.tier3', label: 'Create Tier 3 (Department) Objectives' },
      { key: 'okr.objectives.create.organization', label: 'Create Organization-level Objectives' },

      // Key Results (KRs) CRUD
      { key: 'okr.key_results.view', label: 'View Key Results' },
      { key: 'okr.key_results.create', label: 'Create Key Results' },
      { key: 'okr.key_results.edit', label: 'Edit Key Results' },
      { key: 'okr.key_results.delete', label: 'Delete Key Results' },

      // Weekly check-ins
      { key: 'okr.checkin.view', label: 'View Check-ins' },
      { key: 'okr.checkin.create', label: 'Submit Weekly Check-in' },
      { key: 'okr.checkin.edit', label: 'Edit Own Check-in' },

      // Views by scope
      { key: 'okr.organization.view', label: 'View Organization OKRs' },
      { key: 'okr.department.view', label: 'View Department OKRs' },
      { key: 'okr.team.view', label: 'View Team OKRs' },
      { key: 'okr.cascade.view', label: 'View OKR Cascade' },

      // Elective (Learner self-defined OKRs)
      { key: 'okr.elective.view', label: 'View Elective OKRs' },
      { key: 'okr.elective.create', label: 'Create Elective OKR' },
      { key: 'okr.elective.edit', label: 'Edit Elective OKR' },

      // ABCD matrix (process quality vs progress outcome)
      { key: 'okr.abcd.view', label: 'View ABCD Matrix' },
      { key: 'okr.abcd.rate', label: 'Submit Process Rating' },

      // Analytics & reporting
      { key: 'okr.analytics.view', label: 'View OKR Analytics' },
      { key: 'okr.stats.view', label: 'View OKR Statistics' },

      // Compliance tracking (weekly check-in adherence)
      { key: 'okr.compliance.view', label: 'View Own Compliance Status' },
      { key: 'okr.compliance.view_all', label: 'View All Users Compliance' },
      { key: 'okr.admin.view', label: 'View Admin Compliance Dashboard' },

      // Management (objective/KR assignment, cascade editing)
      { key: 'okr.manage.view', label: 'Access Manage OKR View' },
      { key: 'okr.manage.assign', label: 'Assign Objectives to Users' },

      // Dependencies, tasks, risks (tier_1 features)
      { key: 'okr.dependencies.view', label: 'View OKR Dependencies' },
      { key: 'okr.dependencies.manage', label: 'Manage OKR Dependencies' },
      { key: 'okr.tasks.view', label: 'View RACI Tasks' },
      { key: 'okr.tasks.manage', label: 'Manage RACI Tasks' },
      { key: 'okr.risks.view', label: 'View Risk Register' },
      { key: 'okr.risks.manage', label: 'Manage Risk Register' },

      // Auto-track (metric engine for auto-updated KRs)
      { key: 'okr.auto_track.view', label: 'View Auto-Track Sources' },
      { key: 'okr.auto_track.manage', label: 'Configure Auto-Track Sources' },

      // Export (NAAC / NBA / accreditation reporting downstream)
      { key: 'okr.export', label: 'Export OKR Data' }
    ]
  },
  {
    name: 'Accreditation',
    key: 'accreditation',
    permissions: [
      // Landing + coverage (PR-A7)
      { key: 'accreditation.view', label: 'View Accreditation Landing' },
      { key: 'accreditation.coverage.view', label: 'View Cross-Body Coverage Matrix' },

      // NAAC IQAC committees (PR-A8 c2)
      { key: 'accreditation.naac.view', label: 'View NAAC Dashboard' },
      { key: 'accreditation.naac.committees.view', label: 'View IQAC Committees' },
      { key: 'accreditation.naac.committees.create', label: 'Create IQAC Committees' },
      { key: 'accreditation.naac.committees.edit', label: 'Edit IQAC Committees' },
      { key: 'accreditation.naac.committees.delete', label: 'Deactivate IQAC Committees' },
      { key: 'accreditation.naac.committees.members.manage', label: 'Manage IQAC Committee Members' },

      // NAAC DCF 2025 / AQAR export (super-admin path)
      { key: 'accreditation.naac.dcf_export', label: 'Export NAAC DCF / AQAR Workbook' },

      // NAAC 8.4 Learning Experience Survey + DPDPA 2023 consent
      { key: 'accreditation.naac.surveys.consent.submit', label: 'Submit DPDPA Consent' },
      { key: 'accreditation.naac.surveys.export', label: 'Export NAAC 8.4 Survey Data' },

      // Per-body dashboards (PR-A9 through PR-A15)
      { key: 'accreditation.nirf.view', label: 'View NIRF Dashboard' },
      { key: 'accreditation.nba.view', label: 'View NBA Dashboard' },
      { key: 'accreditation.qs.view', label: 'View QS Dashboard (Phase 2+)' },
      { key: 'accreditation.dci.view', label: 'View DCI Dashboard' },
      { key: 'accreditation.pci.view', label: 'View PCI Dashboard' },
      { key: 'accreditation.inc.view', label: 'View INC Dashboard' },
      { key: 'accreditation.ncte.view', label: 'View NCTE Dashboard' },
      { key: 'accreditation.aicte.view', label: 'View AICTE Dashboard' },
      { key: 'accreditation.ugc.view', label: 'View UGC Dashboard' }
    ]
  }
];

export const PERMISSIONS = {
  // Notification permissions
  MANAGE_NOTIFICATIONS: 'manage_notifications',
  SEND_NOTIFICATIONS: 'send_notifications',
  VIEW_ALL_NOTIFICATIONS: 'view_all_notifications'
} as const;
