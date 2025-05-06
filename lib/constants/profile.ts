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
  [SYSTEM_ROLES.GUEST]: 'Guest'
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
        key: 'organizations.course_mappings.view',
        label: 'View Course Mappings'
      },
      {
        key: 'organizations.course_mappings.create',
        label: 'Create Course Mappings'
      },
      {
        key: 'organizations.course_mappings.edit',
        label: 'Edit Course Mappings'
      },
      {
        key: 'organizations.course_mappings.delete',
        label: 'Delete Course Mappings'
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
      { key: 'students.edit', label: 'Edit Students' },
      { key: 'students.promotion.view', label: 'View Promotion' },
      { key: 'students.promotion.edit', label: 'Edit Promotion' }
    ]
  },
  {
    name: 'Staff Management',
    key: 'staff',
    permissions: [
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
      { key: 'academic.staff_planning.view', label: 'View Staff Planning' },
      { key: 'academic.staff_planning.create', label: 'Create Staff Planning' },
      { key: 'academic.staff_planning.edit', label: 'Edit Staff Planning' },
      { key: 'academic.staff_planning.delete', label: 'Delete Staff Planning' },
      { key: 'academic.timetables.view', label: 'View Timetables' },
      { key: 'academic.timetables.create', label: 'Create Timetables' },
      { key: 'academic.timetables.edit', label: 'Edit Timetables' },
      { key: 'academic.timetables.delete', label: 'Delete Timetables' }
    ]
  },
  {
    name: 'Admissions',
    key: 'admissions',
    permissions: [
      { key: 'admissions.view', label: 'View Admissions' },
      { key: 'admissions.create', label: 'Create Admissions' },
      { key: 'admissions.edit', label: 'Edit Admissions' },
      { key: 'admissions.delete', label: 'Delete Admissions' },
      { key: 'admissions.crm.view', label: 'View CRM' }
    ]
  },
  {
    name: 'Physical Resources Management',
    key: 'physical_resources',
    permissions: [
      { key: 'physical_resources.dashboard.view', label: 'View Dashboard' },
      { key: 'physical_resources.view', label: 'View Resources' },
      { key: 'physical_resources.create', label: 'Create Resources' },
      { key: 'physical_resources.edit', label: 'Edit Resources' },
      { key: 'physical_resources.delete', label: 'Delete Resources' },
      { key: 'physical_resources.categories.view', label: 'View Categories' },
      {
        key: 'physical_resources.categories.create',
        label: 'Create Categories'
      },
      { key: 'physical_resources.categories.edit', label: 'Edit Categories' },
      {
        key: 'physical_resources.categories.delete',
        label: 'Delete Categories'
      },
      {
        key: 'physical_resources.reservations.view',
        label: 'View Reservations'
      },
      {
        key: 'physical_resources.reservations.create',
        label: 'Create Reservations'
      },
      {
        key: 'physical_resources.reservations.edit',
        label: 'Edit Reservations'
      },
      {
        key: 'physical_resources.reservations.delete',
        label: 'Delete Reservations'
      },
      { key: 'physical_resources.policies.view', label: 'View Policies' },
      { key: 'physical_resources.policies.create', label: 'Create Policies' },
      { key: 'physical_resources.policies.edit', label: 'Edit Policies' },
      { key: 'physical_resources.policies.delete', label: 'Delete Policies' },
      { key: 'physical_resources.reports.view', label: 'View Reports' },
      { key: 'physical_resources.requests.view', label: 'View Requests' },
      { key: 'physical_resources.requests.create', label: 'Create Requests' },
      { key: 'physical_resources.requests.approve', label: 'Approve Requests' },
      { key: 'physical_resources.requests.reject', label: 'Reject Requests' }
    ]
  },
  {
    name: 'Digital Resources Management',
    key: 'digital_resources',
    permissions: [
      { key: 'digital_resources.dashboard.view', label: 'View Dashboard' },
      { key: 'digital_resources.view', label: 'View Resources' },
      { key: 'digital_resources.create', label: 'Create Resources' },
      { key: 'digital_resources.edit', label: 'Edit Resources' },
      { key: 'digital_resources.delete', label: 'Delete Resources' },
      { key: 'digital_resources.categories.view', label: 'View Categories' },
      {
        key: 'digital_resources.categories.create',
        label: 'Create Categories'
      },
      { key: 'digital_resources.categories.edit', label: 'Edit Categories' },
      {
        key: 'digital_resources.categories.delete',
        label: 'Delete Categories'
      },
      {
        key: 'digital_resources.reservations.view',
        label: 'View Reservations'
      },
      {
        key: 'digital_resources.reservations.create',
        label: 'Create Reservations'
      },
      {
        key: 'digital_resources.reservations.edit',
        label: 'Edit Reservations'
      },
      {
        key: 'digital_resources.reservations.delete',
        label: 'Delete Reservations'
      },
      { key: 'digital_resources.reports.view', label: 'View Reports' },
      { key: 'digital_resources.requests.view', label: 'View Requests' },
      { key: 'digital_resources.requests.create', label: 'Create Requests' },
      { key: 'digital_resources.requests.approve', label: 'Approve Requests' },
      { key: 'digital_resources.requests.reject', label: 'Reject Requests' }
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
  }
];
