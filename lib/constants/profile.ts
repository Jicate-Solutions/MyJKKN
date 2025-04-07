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
  view_dashboard: true,
  view_profile: true
};

// Permission categories for UI
export const PERMISSION_CATEGORIES = [
  {
    name: 'User Management',
    permissions: [
      { key: 'view_users', label: 'View Users' },
      { key: 'manage_users', label: 'Manage Users' },
      { key: 'assign_roles', label: 'Assign Roles' },
      { key: 'manage_roles', label: 'Manage Roles' }
    ]
  },
  {
    name: 'Academic',
    permissions: [
      { key: 'view_courses', label: 'View Courses' },
      { key: 'manage_courses', label: 'Manage Courses' },
      { key: 'view_students', label: 'View Students' },
      { key: 'manage_grades', label: 'Manage Grades' },
      { key: 'view_academic_years', label: 'View Academic Years' },
      { key: 'manage_staff', label: 'Manage Staff' },
      { key: 'manage_timetables', label: 'Manage Timetables' }
    ]
  },
  {
    name: 'Applications',
    permissions: [
      { key: 'view_applications', label: 'View Applications' },
      { key: 'manage_applications', label: 'Manage Applications' },
      {
        key: 'manage_application_categories',
        label: 'Manage Application Categories'
      }
    ]
  },
  {
    name: 'Organizations',
    permissions: [
      { key: 'view_institutions', label: 'View Institutions' },
      { key: 'view_degrees', label: 'View Degrees' },
      { key: 'view_departments', label: 'View Departments' },
      { key: 'view_programs', label: 'View Programs' },
      { key: 'view_courses', label: 'View Courses' },
      { key: 'view_semesters', label: 'View Semesters' },
      { key: 'view_sections', label: 'View Sections' }
    ]
  },
  {
    name: 'Staff Management',
    permissions: [
      { key: 'view_staff_categories', label: 'View Staff Categories' },
      { key: 'view_staff', label: 'View Staff' }
    ]
  },
  {
    name: 'Resources',
    permissions: [
      { key: 'view_resources', label: 'View Resources' },
      { key: 'reserve_resources', label: 'Reserve Resources' },
      { key: 'manage_resources', label: 'Manage Resources' },
      { key: 'view_physical_resources', label: 'View Physical Resources' },
      { key: 'view_digital_resources', label: 'View Digital Resources' }
    ]
  },
  {
    name: 'System',
    permissions: [{ key: 'manage_api', label: 'Manage API' }]
  },
  {
    name: 'Example Module',
    permissions: [
      { key: 'view_module', label: 'View Module' },
      { key: 'create_module_items', label: 'Create Module Items' }
    ]
  },
  {
    name: 'Administration',
    permissions: [
      { key: 'view_reports', label: 'View Reports' },
      { key: 'manage_content', label: 'Manage Content' },
      { key: 'system_settings', label: 'System Settings' }
    ]
  }
];
