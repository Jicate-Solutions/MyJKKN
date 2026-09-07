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

// profiles.gender domain. Title Case per profiles_gender_check (20260820160000);
// trg_normalize_gender_profiles canonicalises anything else on write.
// 'prefer_not_to_say' is gone - it was never stored on either learner table and the
// constraint now rejects it.
export const GENDERS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' }
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
    name: 'Foundation Programme',
    key: 'foundation',
    permissions: [
      { key: 'foundation.dashboard.view', label: 'View Foundation Programme' },
      { key: 'foundation.cohorts.view', label: 'View Foundation Cohorts' },
      { key: 'foundation.cohorts.manage', label: 'Manage Foundation Cohorts' },
      { key: 'foundation.students.view', label: 'View Foundation Students' },
      { key: 'foundation.students.manage', label: 'Manage Foundation Students' },
      { key: 'foundation.items.view', label: 'View Foundation Question Bank' },
      { key: 'foundation.items.manage', label: 'Author Foundation Questions' },
      { key: 'foundation.assessments.view', label: 'View Foundation Assessments' },
      { key: 'foundation.assessments.manage', label: 'Build Foundation Assessments' },
      // The learner-facing one. Everything above is an operator surface; this is
      // the only key that opens /foundation/practice, where questions are
      // actually answered. Grant it to the people sitting the programme.
      { key: 'foundation.practice.take', label: 'Answer Foundation Practice Questions' },
    ]
  },
  {
    name: 'Reference Data',
    key: 'reference',
    permissions: [
      { key: 'reference.catalogs.view', label: 'View Reference Catalogs' },
      { key: 'reference.catalogs.manage', label: 'Add/Edit Reference Catalog Entries' },
    ]
  },
  {
    // Projects module never had a permission category — its sidebar entry
    // was hidden for every non-super-admin (menu-visibility gap fix
    // 2026-07-12). Grant projects.view to roles in Role Management.
    name: 'Projects',
    key: 'projects',
    permissions: [
      { key: 'projects.view', label: 'View Projects Module' },
    ]
  },
  {
    // MBA teaching-enterprise: Management Associates file improvement ideas about
    // JKKN's own operations; facilitators + CEO office review/approve; only staff
    // (board.manage) can mark a fix applied/verified (propose-only enforced in DB).
    name: 'Improvement Board',
    key: 'improvement',
    permissions: [
      { key: 'improvement.ideas.view', label: 'View Improvement Board' },
      // Oversight read for the HOD and the principal, held separately from
      // improvement.ideas.view so the two populations stay independently
      // grantable and revocable: ideas.view marks a board PARTICIPANT (files
      // ideas, appears on the leaderboard), view_scoped marks a READER who
      // oversees the department the finding lands on. Both branches of the
      // RLS policy are institution-scoped, so a holder reads open ideas
      // raised inside their own institution and nothing from the other
      // colleges. Registered here because a key that is registered nowhere
      // cannot be granted through Role Management.
      { key: 'improvement.ideas.view_scoped', label: 'Read Improvement Ideas for Own Institution (HOD / Principal)' },
      { key: 'improvement.ideas.create', label: 'File Improvement Ideas' },
      { key: 'improvement.board.manage', label: 'Manage Improvement Board (review / approve / apply)' },
      // Assigning a role holder writes hr_additional_roles — institution-wide org data,
      // not a note on a playbook — so it is an officer action (CEO / CAO / EAO), held
      // separately from board.manage. Board managers can SEE holders, not change them.
      { key: 'improvement.area_role.assign', label: 'Assign Department Role Holders (CEO / CAO / EAO)' },
      // A department policy is an official institution document. Board managers may
      // draft one with AI and read it; only the CEO / CAO / EAO may UPLOAD the real
      // document or sign a draft off. Registered here so Role Management can grant it
      // — an unregistered key is ungrantable and silently becomes super-admin-only.
      { key: 'improvement.area_policy.approve', label: 'Upload / Approve Department Policy (CEO / CAO / EAO)' },
      { key: 'ceo_rounds.log', label: 'Log CEO Rounds' },
      { key: 'ceo_rounds.summary.write', label: 'Write CEO Rounds Summary' },
    ]
  },
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
      { key: 'users.permissions_audit.view', label: 'View Permissions Audit Dashboard' },
      // Added 2026-04-21 — Persona Design PR-3. Keys referenced by RLS on the
      // 3 scope-extension junction tables (user_block_access,
      // user_learner_relationship, user_contract_access) introduced in PR-1.
      // Grant these to hostel_office / chief_warden / super_admin to manage
      // the per-user grants that back block_scope / relationship_scope /
      // contract_scope (wired in PR-4).
      { key: 'users.block_access.view', label: 'View User→Block Access Grants' },
      { key: 'users.block_access.manage', label: 'Manage User→Block Access Grants' },
      { key: 'users.relationship.view', label: 'View User→Learner Relationships (Parents)' },
      { key: 'users.relationship.manage', label: 'Manage User→Learner Relationships (Parents)' },
      { key: 'users.contract_access.view', label: 'View User→Contract Access Grants (Vendors)' },
      { key: 'users.contract_access.manage', label: 'Manage User→Contract Access Grants (Vendors)' },
      // Added 2026-08-10 — JKKN permanent ID. `.view` gates the lookup page and
      // the two read RPCs (fn_resolve_person, fn_check_duplicate_person).
      // `.issue` gates fn_issue_jkkn_id AND the jkkn_identities INSERT/UPDATE
      // policies, so it is the whole write side of the register in one key.
      // Held only by administrator and coo. Granting it is a decision, not a
      // default — it lets the holder mint a permanent lifetime number for any
      // learner or team member, and rewrite identity rows via PostgREST.
      //
      // It is NOT needed to approve a course application: the issuer accepts
      // courses.applications.decide for the external_participant kind alone
      // (20260821070100). Do not tick this key just to unblock /courses.
      { key: 'users.jkkn_id.view', label: 'Look Up People by JKKN ID / Roll Number / Team Code' },
      { key: 'users.jkkn_id.issue', label: 'Issue a JKKN ID for Any Learner or Team Member' }
    ]
  },
  {
    // Added 2026-06-27 — Fresher Induction module (Phase 1). Keys referenced by
    // RLS on induction_* tables + the SECURITY DEFINER engine RPCs
    // (fn_induction_create_program / auto_enroll / auto_split_batches).
    // super_admin/admin bypass all three.
    //
    // 'induction.create' was split out of 'induction.manage' on 2026-08-21.
    // Before that, manage bundled create+enroll+batches+attendance in one key and
    // 654 users across ten roles held it — every Facilitator (493) and HOD (120)
    // could stand up a new induction. Creation is now its own key, held by
    // Induction Lead alone.
    //
    // WHY THE SPLIT IS SAFE OPERATIONALLY: fn_induction_create_program is the only
    // manage-gated RPC with NO `OR fn_induction_is_event_coordinator(...)` leg.
    // mark_attendance, upsert_session, auto_enroll, appoint_feedback_volunteer and
    // the rest all accept an appointed per-event coordinator, so taking manage away
    // from a role does not stop the people actually running an induction — it stops
    // them starting a new one. That is the whole point of the split.
    name: 'Induction',
    key: 'induction',
    permissions: [
      { key: 'induction.view', label: 'View Induction Programs' },
      { key: 'induction.create', label: 'Create Induction Program' },
      { key: 'induction.manage', label: 'Manage Induction (enroll, batches, attendance)' }
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
    // Added 2026-06-12 — Family Moments engine (Father's Day 2026 rollout,
    // NV CBSE + Matric HSS). Campaign-based parent engagement: teachers
    // collect child messages, parents receive tokenized public gift cards.
    name: 'Family Moments',
    key: 'moments',
    permissions: [
      { key: 'moments.submissions.create', label: 'Submit Child Messages (Teachers)' },
      { key: 'moments.campaigns.view', label: 'View Campaign Dashboards' },
      { key: 'moments.campaigns.manage', label: 'Create & Manage Campaigns' }
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
      { key: 'organizations.sections.delete', label: 'Delete Sections' },
      // 2026-08-04 — College Leadership (/organizations/leadership).
      // The ONE key behind naming a Principal, Vice Principal, IQAC Chairman,
      // IQAC Coordinator or Head of Department. It stands in for five keys the
      // underlying tables would otherwise demand — including roles.create and
      // roles.edit, which are NOT institution-scoped and would grant global
      // role management to a college officer. The writes happen inside
      // fn_set_college_leadership (SECURITY DEFINER) so this key grants nothing
      // anywhere else.
      //
      // Registered but granted to NO role: an unregistered key can never be
      // granted at all (this repo carries 77 such orphans), so it has to exist
      // here first. Who holds it is the Director's decision.
      {
        key: 'organizations.leadership.manage',
        label: 'Manage College Leadership (Principal, Vice Principal, IQAC, HoD)'
      }
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
      // 2026-08-05 — registered because learners_profiles' INSERT / UPDATE /
      // DELETE policies already gate on these three keys and none of them
      // existed here. They are deliberately NOT the same thing as
      // learners.create / edit / delete above: those cover the Learners module
      // screens, these are the row-level write rights on the profile table
      // itself, which the bulk import, the admission conversion and the
      // profile-sync paths all pass through.
      { key: 'learners.profiles.create', label: 'Create Learner Profile Records' },
      { key: 'learners.profiles.edit', label: 'Edit Learner Profile Records' },
      { key: 'learners.profiles.delete', label: 'Delete Learner Profile Records' },
      { key: 'learners.alumni.view', label: 'View Alumni & Graduates (Admin)' },
      { key: 'learners.bug_reports.view', label: 'View Bug Reports & Leaderboard' },
      // Gates the learner_contribution_scores RLS policy (lcs_admin_select), which
      // already referenced this key before it was registered here — so it could not
      // be granted from Role Management at all. Admin-only by Director decision
      // (2026-07-30): the risk BAND is visible to faculty and the learner, the
      // contribution/value RANKING is not.
      { key: 'learners.contribution.view', label: 'View Learner Contribution Ranking (Admin)' },

      // Learner 360 standing verdict (learner_360_verdicts).
      // The admin_note key is DELIBERATELY separate and grants access to a
      // DIFFERENT table (learner_360_verdicts_admin) holding the comparative
      // ranking language. RLS is row-level and cannot hide columns, so the two
      // audiences are split across two tables and two keys — granting
      // learners.standing.view must never reveal where a learner ranks.
      { key: 'learners.standing.view', label: 'View Learner Standing Verdicts (band, narrative, next steps)' },
      { key: 'learners.standing.admin_note.view', label: 'View Learner Standing ADMIN Notes (contribution + relative rank — leadership only)' },
      { key: 'learners.standing.override', label: 'Override a Learner Standing Verdict (human correction)' },
      // Gates fn_learner_360_record_intervention (20260930010000) — the
      // learner-360 return edge's ACT leg: recording the action a mentor or
      // counselor took on a standing verdict. Separate from .override on
      // purpose: correcting the AI's narrative and acting on a learner are
      // different responsibilities, grantable independently.
      { key: 'learners.standing.intervene', label: 'Record an Action Taken on a Learner Standing Verdict' },

      // Learner Portal Features (Student Self-Service)
      { key: 'learners.proof.view', label: 'View My Proof (Verified Skills Record self view)' },
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
      { key: 'learners.finance.edit', label: 'Edit Finance Details (Fee Structure)' },

      // School Master (Last School dropdown lookup)
      { key: 'learners.school_master.view', label: 'View School Master' },
      { key: 'learners.school_master.create', label: 'Create School Master Entries' },
      { key: 'learners.school_master.edit', label: 'Edit School Master Entries' },
      { key: 'learners.school_master.delete', label: 'Delete School Master Entries' },

      // Postal Codes (pincode → district lookup + map coordinates)
      { key: 'learners.postal_codes.view', label: 'View Postal Codes' },
      { key: 'learners.postal_codes.create', label: 'Create Postal Code Entries' },
      { key: 'learners.postal_codes.edit', label: 'Edit Postal Code Entries' },
      { key: 'learners.postal_codes.delete', label: 'Delete Postal Code Entries' }
    ]
  },
  {
    // Counselor Taxonomy Phase 1 (2026-04-27) — see specs/counselor-taxonomy-spec.md
    // Permission keys consumed by the new `learner_counselor` role seeded in
    // supabase/migrations/20260427_counselor_taxonomy_phase1.sql. Module pages
    // (/learners/counseling/*) land in Phase 2.
    name: 'Learner Counseling',
    key: 'learners_counseling',
    permissions: [
      { key: 'learners.counseling.view', label: 'View Learner Counseling Queue' },
      { key: 'learners.counseling.sessions.view', label: 'View Counseling Sessions' },
      { key: 'learners.counseling.sessions.create', label: 'Schedule & Log Counseling Sessions' },
      { key: 'learners.counseling.notes.create', label: 'Write Counseling Session Notes' },
      { key: 'learners.counseling.notes.view_own', label: 'View Own Counseling Notes (Author Only)' },
      { key: 'learners.at_risk.view', label: 'View At-Risk Learners Dashboard' },
      { key: 'learners.interventions.create', label: 'Create Learner Interventions' },
      { key: 'learners.interventions.close', label: 'Close Learner Interventions (Outcome)' }
    ]
  },
  {
    // Display name only — the audit gate (lib/permissions-audit/module-mappings.ts
    // deriveCategoryKey) matches on `key`, never on `name`, so this is safe to
    // retitle. Renamed 'Employee Management' → 'Employee' 2026-07-20 to match
    // the sidebar row.
    name: 'Employee',
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
      { key: 'staff.class_incharges.delete', label: 'Remove Class Incharges' },
      // 2026-08-05 — registered because staff_import_unmatched carries an ALL
      // policy on this key and it existed nowhere here. That table is the
      // reject pile of a bulk employee import: rows the importer could not
      // match to an existing person, which somebody has to open and resolve
      // by hand. Unregistered, the reject pile was super-admin-only.
      { key: 'staff.manage_imports', label: 'Resolve Unmatched Employee Import Rows' }
    ]
  },
  {
    name: 'Academic',
    key: 'academic',
    permissions: [
      { key: 'academic.parent_portal.manage', label: 'Manage Parent Portal Content' },
      { key: 'academic.parent_portal.user_data.manage', label: 'Manage Parent User Data & Passwords' },
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
      {
        key: 'academic.shared_teaching.label.view',
        label: 'View Shared Teaching Labels'
      },
      {
        key: 'academic.shared_teaching.label.manage',
        label: 'Label Shared Teaching Received'
      },
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
      // 2026-08-05 — registered because the RLS already DEMANDED it. The DELETE
      // policy on student_attendance calls user_has_permission on this key and
      // it existed nowhere in this catalog, so no role could hold it and every
      // non-admin delete was refused with no way to grant the right.
      { key: 'academic.attendance.delete', label: 'Delete Attendance Records' },
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
      // 2026-07-10: the SCF leadership panels used to gate on a hardcoded list of
      // legacy profiles.role names, so Role Management could not grant them at all
      // (a CEO holding every relevant toggle was still refused). The DB functions
      // now call user_has_permission() with these two keys. Split in two because
      // the learner-level panels are deliberately narrower than the college-level
      // ones — HoDs see the college roll-ups but not individual learner trajectories.
      {
        key: 'academic.session_feedback.leadership.view',
        label: 'View Leadership Feedback Panels (college-level)'
      },
      {
        key: 'academic.session_feedback.learner_detail.view',
        label: 'View Learner-Level Feedback Panels (trajectory, struggling notes)'
      },
      // 2026-07-10: the last hardcoded leader-role arrays in the SCF lane moved
      // onto Role Management switches (Director interview R2). The verdict-report
      // panels get their OWN read key (narrower than leadership.view — no HoD by
      // default); the three write keys gate the leadership OVERRIDE branches only:
      // assigned-faculty / teaching-evidence paths stay role-independent.
      {
        key: 'academic.session_feedback.verdict_report.view',
        label: 'View Verdict Report Panels (contradictions, track record)'
      },
      {
        key: 'academic.session_feedback.verdict.write',
        label: 'Set Loop-Note Verdicts (leadership override)'
      },
      // 2026-07-26: SCF note-safety loop Phase 0 — opens the learner-note
      // review queue to a named human reviewer (grantable via Role Management;
      // seeded on the scf_note_reviewer role). The DB gate on
      // fn_scf_learner_notes_review / _pending is is_super_admin() OR this
      // key. Key name is fixed by the note-safety spec (§6.3). Mixed prefix in
      // this category is deliberate precedent (see faculty.calendar.view above).
      {
        key: 'scf.notes.review',
        label: 'Review AI-Drafted Learner Support Notes (note-safety Phase 0)'
      },
      {
        key: 'academic.curriculum.lesson.manage',
        label: 'Manage Curriculum Lessons (leadership override: edit, approve/reject AI drafts)'
      },
      {
        key: 'academic.live_poll.manage',
        label: 'Manage Live Polls & Pulses (leadership override)'
      },
      // 2026-07-13: Exam IA Audit — the Registrar's in-person audit sheet.
      // Joins COE university-bound records (CIA provenance + registrations)
      // against MyJKKN's continuous day-one attendance, program-wise per exam.
      {
        key: 'academic.internal_marks.exam_audit.view',
        label: 'View Exam IA Audit (CIA provenance + eligibility cross-check)'
      },
      // 2026-07-27: gates EDITING the exam attendance eligibility thresholds
      // (platform_policies academic.exam_eligibility.attendance_pct /
      // .condonation_floor_pct). Previously any is_admin() role could move a
      // regulatory threshold; setting it to 0 would make every learner eligible.
      // Enforced in RLS by 20260727060000_exam_eligibility_manage_permission.sql —
      // granting this key is what actually confers the ability.
      {
        key: 'academic.exam_eligibility.manage',
        label: 'Change exam attendance eligibility thresholds (75% / 65%)'
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
      // IA Question Papers (CIA question-paper scaffolding + authoring; COE-backed)
      { key: 'academic.ia_question_paper.view', label: 'View Question Papers' },
      { key: 'academic.ia_question_paper.enter', label: 'Generate/Author Question Papers' },
      { key: 'academic.ia_question_paper.approve', label: 'Submit/Approve/Lock Question Papers' },
      { key: 'academic.ia_question_paper.export', label: 'Export Question Paper PDF' },
      // Internal Marks (CIA)
      { key: 'academic.internal-marks.view', label: 'View Internal Marks' },
      { key: 'academic.internal-marks.edit', label: 'Enter/Edit Internal Marks' },
      { key: 'academic.internal-marks.submit', label: 'Submit Internal Marks' },
      { key: 'academic.internal-marks.reports', label: 'View Internal Marks Reports' },
      // CIA Mark Entry (question-wise / direct) — /academic/mark-entry.
      // Separate from internal-marks: '.enter' is the grant that unlocks the
      // inputs, and it is meant for teaching staff + HODs. Leadership roles are
      // additionally forced view-only server-side regardless of this grant
      // (lib/utils/mark-entry/mark-entry-access.ts).
      { key: 'academic.mark-entry.view', label: 'View Mark Entry' },
      { key: 'academic.mark-entry.enter', label: 'Enter/Edit CIA Marks (Question-wise & Direct)' },
      // Course Grades (Faculty LTI grade view) — added 2026-04-27 (tier-2 chip-leak sweep)
      { key: 'academic.course-grades.view', label: 'View Course Grades (Faculty LTI Grade View)' }
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
      // Instalment plans (2026-08-13): config rows that let bill generation
      // split a yearly fee into N instalment bills, per programme x billing
      // category x academic year (migration 20260825013000 — Director-gated).
      // DORMANT until plans are configured; zero plans = single-bill behaviour
      // everywhere. These keys gate the RLS on billing_instalment_plans(_lines).
      // No admin page yet — the keys are registered now so the RLS lanes are
      // grantable from day one instead of being permanently super-admin-only.
      { key: 'billing.instalment_plans.view', label: 'View Instalment Plans' },
      { key: 'billing.instalment_plans.manage', label: 'Manage Instalment Plans' },
      { key: 'billing.schedule.view', label: 'View Schedule' },
      { key: 'billing.schedule.create', label: 'Create Schedule' },
      { key: 'billing.schedule.update', label: 'Update Schedule' },
      { key: 'billing.schedule.delete', label: 'Delete Schedule' },
      // Cancelling a bill writes off money, so it is deliberately NOT
      // billing.schedule.update: that key is held by 6 roles and also covers
      // fixing a typo. fn_cancel_student_bill gates on THIS key, and a trigger
      // rejects any other route into status='cancelled'.
      { key: 'billing.schedule.cancel', label: 'Cancel Bills' },
      // Bulk bill creation: the "Bulk Create" button on /billing/schedule and
      // the /billing/schedule/bulk-create flow (pick many learners, or upload
      // an Excel of bills). Separate from billing.schedule.create so the bulk
      // path can be revoked without removing single-bill creation.
      //
      // ADDITIVE, NOT A REPLACEMENT: every surface checks create AND
      // bulk_create together, because the RLS INSERT policy on
      // billing_student_bills still gates on billing.schedule.create. Granting
      // bulk_create alone would render the button and then fail every insert
      // with an RLS denial.
      { key: 'billing.schedule.bulk_create', label: 'Bulk Create Bills' },
      { key: 'billing.receipts.view', label: 'View Receipts' },
      { key: 'billing.receipts.create', label: 'Create Receipts' },
      { key: 'billing.receipts.edit', label: 'Edit Receipts' },
      { key: 'billing.receipts.delete', label: 'Delete/Void Receipts Directly' },
      { key: 'billing.receipts.generate', label: 'Generate Receipts' },
      // Bulk receipt generation from the Billing Schedule page: download a
      // pre-filled Excel of outstanding bills, fill "Paid Amount", upload, and
      // create one receipt per (student, paid date, payment mode) group — up to
      // 5000 bills per batch. Deliberately a SEPARATE key from
      // billing.receipts.create: the single-receipt key is held by 7 roles, and
      // one mis-filled sheet here writes thousands of payment rows at once, so
      // the bulk path is opted into per role rather than inherited.
      // The three API routes behind it run on the service-role client (RLS is
      // bypassed), so they check THIS key plus the caller's accessible
      // institutions — see lib/auth/bulk-receipt-access.ts.
      { key: 'billing.receipts.bulk_create', label: 'Bulk Generate Receipts (Excel Upload)' },
      // Cancelling a receipt reverses money, so it is split in two: staff RAISE
      // a request, and someone else DECIDES it.
      //
      // There is still deliberately no "cancel.approve" key, but the reason
      // changed on 2026-08-25. Approval is no longer hardcoded to
      // is_super_admin(); it is resolved from
      // billing_receipt_cancel_approval_flows, which a super admin configures
      // per institution (with an optional group-wide default) and which only a
      // super admin may write. Deciding authority therefore lives in that
      // table, NOT in Role Management — a key here would be a second, competing
      // source of truth for the same question. With no flow configured the
      // answer falls back to super-admin-only, exactly as it was before.
      //
      // Anyone holding billing.receipts.delete can still void directly and
      // bypass this, which is why it was revoked from the accounts roles and
      // from Chief Accountant.
      //
      // The key below was narrowed on 2026-08-25 to Chief Accountant alone
      // (migration 20260825120000). Note the consequence for the queue page: a
      // delegated approver will NOT hold it, which is why that page guards on
      // "requester OR configured approver" rather than on this key.
      { key: 'billing.receipts.cancel.request', label: 'Request Receipt Cancellation' },
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
      { key: 'billing.refunds.configure', label: 'Configure Refund Approval Flows' },
      { key: 'billing.apportionment.view', label: 'View Revenue Apportionment' },
      { key: 'billing.apportionment.create', label: 'Create Revenue Apportionment' },
      { key: 'billing.apportionment.edit', label: 'Edit Revenue Apportionment' },
      { key: 'billing.apportionment.delete', label: 'Delete Revenue Apportionment' },
      { key: 'billing.apportionment.approve', label: 'Approve Revenue Apportionment' },
      { key: 'billing.invoices.view', label: 'View Invoices' },
      { key: 'billing.invoices.create', label: 'Create Invoices' },
      { key: 'billing.invoices.edit', label: 'Edit Invoices' },
      { key: 'billing.invoices.delete', label: 'Delete Invoices' },
      { key: 'billing.invoices.send', label: 'Send Invoices' },

      // ── Learner bills (2026-08-05) ────────────────────────────────────────
      // A SEPARATE family from billing.invoices.* by Director's ruling, not a
      // rename of it. The two sound alike and are not the same object:
      // billing_student_bills holds 10,900 rows (the per-learner fee ledger the
      // whole schedule / receipt flow runs on) while billing_invoices holds 2.
      // Do not remap these onto the invoice keys.
      //
      // billing_student_bills carries TWO parallel permissive policy sets — one
      // naming billing.schedule.* (registered, and therefore the lane everyone
      // actually uses) and one naming billing.bills.*, which was registered
      // nowhere. Postgres ORs permissive policies, so the second set was not
      // blocking anybody; it was simply a lock with no key ever cut for it.
      // Registering makes that lane grantable so it can be used deliberately
      // instead of being dead weight. It grants nothing to anyone today.
      { key: 'billing.bills.view', label: 'View Learner Bills' },
      { key: 'billing.bills.create', label: 'Create Learner Bills' },
      { key: 'billing.bills.edit', label: 'Edit Learner Bills' },
      { key: 'billing.bills.delete', label: 'Delete Learner Bills' },

      { key: 'billing.onboarding.view', label: 'View Learner Onboarding' },
      { key: 'billing.onboarding.approve', label: 'Approve Learner Onboarding' },
      { key: 'billing.coverage.view', label: 'View Bill Coverage' },
      { key: 'billing.coverage.export', label: 'Export Bill Coverage' },
      { key: 'billing.reports.view', label: 'View Billing Reports' },
      { key: 'billing.analytics.view', label: 'View Billing Analytics' },
      { key: 'billing.analytics.export', label: 'Export Billing Analytics' },
      { key: 'billing.payment.view', label: 'View Payments' },
      { key: 'billing.payment.create', label: 'Record Payments' },
      { key: 'billing.payment.edit', label: 'Edit Payments' },
      { key: 'billing.payment.delete', label: 'Delete Payments' },
      { key: 'billing.activities.view', label: 'View Billing Activities' },
      { key: 'billing.payment_accounts.view', label: 'View Payment Gateway Accounts' },
      { key: 'billing.payment_accounts.manage', label: 'Manage Payment Gateway Accounts' },
      { key: 'billing.transport.view', label: 'View Transport Fees' },
      { key: 'billing.transport.collect', label: 'Collect Transport Fees online' },

      // ── Late payment charge (2026-08-07) ──────────────────────────────────
      // Platform-wide late-charge MECHANISM (Director's plan, rank 1). Built
      // OFF at every layer: the billing.late_charge.enabled policy row is
      // false, no schedule exists, and .waive is deliberately granted to NO
      // role — only the Director (super-admin bypass) can waive. .manage gates
      // the accrual RPC; nothing in this build calls it live.
      { key: 'billing.late_charges.view', label: 'View Late Payment Charges (preview + derivation)' },
      { key: 'billing.late_charges.manage', label: 'Run Late Charge Accrual' },
      { key: 'billing.late_charges.waive', label: 'Waive Late Payment Charges (Director only)' }
    ]
  },
  {
    name: 'HR Management',
    key: 'hr',
    permissions: [
      // Module gate — value behind '/hr' in lib/sidebarMenuLink.ts. Declared
      // here (2026-07-16) so Role Management can toggle it; previously a
      // reserved key only hr_admin held.
      { key: 'hr.view', label: 'Access HR Module' },
      // Recruitment (Phase 1A+1B shipped 2026-04-15) —
      // RLS keys referenced in supabase/setup/03_policies.sql for hr_recruitment_*
      { key: 'hr.recruitment.view', label: 'View Recruitment Candidates' },
      { key: 'hr.recruitment.create', label: 'Submit Recruitment Candidates' },
      { key: 'hr.recruitment.edit', label: 'Edit Recruitment Candidates' },
      { key: 'hr.recruitment.delete', label: 'Delete Recruitment Candidates' },
      { key: 'hr.recruitment.approve', label: 'Approve Recruitment Candidates' },
      // Override: act as any approver on a candidate's approval chain step
      // (hr_head / hr_admin / coo). Enforced in RecruitmentService.approveCandidate.
      { key: 'hr.recruitment.approve.override', label: 'Override Recruitment Approval Step' },
      { key: 'hr.recruitment.packages.view', label: 'View Candidate CTC Packages' },
      { key: 'hr.recruitment.packages.propose', label: 'Propose Candidate CTC Packages' },
      { key: 'hr.recruitment.packages.approve', label: 'Approve Candidate CTC Packages' },
      // 2026-08-02 — hr_recruitment_scorecards' SELECT policy demanded this key
      // and it existed nowhere, so interview scorecards were super-admin-only.
      // Kept as its OWN key rather than folded into hr.recruitment.view: a
      // scorecard is an interviewer's private assessment of a person, and every
      // recruiter who may list candidates should not automatically read it.
      { key: 'hr.recruitment.scorecards.view', label: 'View Interview Scorecards' },
      // Leave (Sprint 2) — genuinely enforced in hr_leave_* RLS since
      // 20260801002600_hr_leave_rls_permission_retrofit. Before that migration
      // this comment was aspirational: the policies gated on user_hr_access +
      // hardcoded 'hr_officer'/'hr_director' strings and no policy called
      // user_has_permission(), so granting these keys changed nothing.
      { key: 'hr.leave.view', label: 'View Leave Applications' },
      { key: 'hr.leave.apply', label: 'Apply for Leave' },
      { key: 'hr.leave.approve', label: 'Approve Leave Applications' },
      { key: 'hr.leave.cancel', label: 'Cancel Own Leave Pre-Approval' },
      { key: 'hr.leave.withdraw', label: 'Withdraw Own Leave Post-Approval' },
      { key: 'hr.leave.balance.view', label: 'View Leave Balances' },
      { key: 'hr.leave.encashment.view', label: 'View Leave Encashment Requests' },
      { key: 'hr.leave.encashment.approve', label: 'Approve Leave Encashment' },
      { key: 'hr.leave.types.manage', label: 'Manage HR Leave Types' },
      { key: 'hr.leave.balance.manage', label: 'Generate Leave Balances' },

      // ── HR academic years (2026-08-10) ───────────────────────────────────
      // The leave/payroll calendar HR owns, replacing the borrowed
      // academic_years. Only a manage key: hr_academic_years SELECT is open to
      // authenticated because every staff member's apply-leave drawer has to
      // resolve the current year, and gating four rows of dates behind a key
      // would mean granting it to 5,000+ users. Writes are what needs guarding.
      // Granted by 20260810120000_hr_academic_years.sql to the seven roles that
      // already hold hr.leave.balance.manage.
      { key: 'hr.academic_years.manage', label: 'Manage HR Academic Years' },

      // ── Payroll organisation (2026-07-31) ────────────────────────────────
      // WHO PAYS a staff member, held in hr_staff_payroll. Deliberately a
      // separate table and not a column on staff: Supabase RLS is row-level, so
      // a column would be readable by everyone who can read the staff row —
      // and StaffService, /api/api-management/staff and the MCP server all
      // select('*'). These two keys are the ONLY thing that exposes it; they
      // are genuinely enforced in hr_staff_payroll's RLS.
      // staff.institution_id means WHERE SOMEONE WORKS and is unaffected.
      { key: 'hr.payroll.institution.view', label: 'View Payroll Organisation' },
      { key: 'hr.payroll.institution.manage', label: 'Manage Payroll Organisation' },

      // ── Employee salary (2026-08-21) ─────────────────────────────────────
      // SEPARATE from the two keys above on purpose. Those say who may see
      // WHICH ORGANISATION pays someone; these say who may see HOW MUCH. An HR
      // user who maintains the payer directory is not automatically entitled to
      // everyone's pay, so the amount got its own pair rather than riding along.
      // Enforced by hr_staff_salaries RLS, which additionally lets anyone read
      // their OWN row — reading your own pay needs no HR permission.
      { key: 'hr.payroll.salary.view', label: 'View Employee Salary' },
      { key: 'hr.payroll.salary.manage', label: 'Manage Employee Salary' },

      // ── Employee bank account (2026-08-21) ───────────────────────────────
      // A THIRD pair, not a reuse of the salary keys. Amount and destination
      // are different questions: a payroll clerk who must see what someone
      // earns is not automatically entitled to the account it lands in, and an
      // account number is the one field on this whole module that a change to
      // redirects real money. Enforced by hr_staff_bank_accounts RLS, which —
      // unlike the salary table — does NOT let people read their own row: the
      // self-service surface for "which account am I paid into" does not exist
      // yet, and opening the read path before there is a screen for it would
      // only widen the blast radius.
      { key: 'hr.payroll.bank.view', label: 'View Employee Bank Account' },
      { key: 'hr.payroll.bank.manage', label: 'Manage Employee Bank Account' },

      // ── Salary register (2026-08-30) ─────────────────────────────────────
      // The frozen monthly register: closed attendance month + recorded salary
      // -> a per-institution pay register and its export workbook.
      //
      // A FOURTH pair rather than a reuse of the three above, because a
      // register is the one artefact that shows amount AND destination AND the
      // day counts behind them, for everybody at once. Someone entitled to
      // maintain one staff member's salary is not thereby entitled to the whole
      // institution's payroll on one screen.
      //
      // Granted to HR Head ALONE by 20260830150000_hr_salary_register.sql. That
      // is the only role already holding all four keys a run must read through
      // — hr.payroll.institution.view, hr.payroll.salary.view,
      // hr.payroll.bank.view, hr.attendance.period.view. Granting these to a
      // role missing any of them yields a run that SILENTLY omits people: RLS
      // returns zero rows and no error, so a short register looks like a
      // complete one.
      { key: 'hr.payroll.register.view', label: 'View Salary Register' },
      { key: 'hr.payroll.register.manage', label: 'Generate Salary Register' },

      // ── Employee Self Service (2026-07-21) ───────────────────────────────
      // Gates for the "Employee Self Service" sidebar group. Every key here
      // MUST also get a MENU_PERMISSIONS entry in lib/sidebarMenuLink.ts:
      // app/(routes)/hr/layout.tsx wraps the whole subtree in
      // RoutePermissionGuard, which resolves by LONGEST PREFIX, so any /hr/*
      // page lacking its own entry silently inherits '/hr' → 'hr.view' — held
      // by 2 of 75 roles. A key declared here without a menu entry does
      // nothing at all; the page stays blocked.
      //
      // Naming follows the `.view_own` convention (~14 existing keys, the
      // largest of six competing self-service conventions in this file). Do
      // not introduce a seventh.
      //
      // hr.attendance.view_self / regularize_self are NOT new — 22 roles have
      // carried them in custom_roles.permissions since the attendance sprint,
      // and the code already gates on them. They were simply never declared
      // here, so Role Management could not show them and the audit gate could
      // not see them. Declaring them is a catalog fix, not a grant.
      { key: 'hr.attendance.view_self', label: 'View Own Attendance' },
      { key: 'hr.attendance.regularize_self', label: 'Request Own Attendance Regularization' },

      // ── Attendance — the officer side (2026-08-05) ───────────────────────
      // Registered because the RLS already DEMANDED these six. The hr_attendance_*
      // tables (audit log, exceptions, records, regularizations, status types,
      // biometric devices, biometric punches, regularization reasons) name them
      // and none of them existed here, so on every one of those tables the only
      // permissive route was a key no role could hold: the whole biometric and
      // regularization back office read as empty rather than as forbidden.
      // Deliberately six keys and not one — marking your own punch, reading
      // everybody's, approving your team's, deciding a regularization,
      // overriding a record outright and exporting the tamper log are six
      // different amounts of trust.
      { key: 'hr.attendance.mark_self', label: 'Mark Own Attendance Punch' },
      { key: 'hr.attendance.view_all', label: 'View Attendance for Everyone' },
      { key: 'hr.attendance.approve_team', label: 'Approve Attendance for Own Team' },
      { key: 'hr.attendance.regularize_approve', label: 'Approve Attendance Regularization Requests' },
      { key: 'hr.attendance.override', label: 'Override Attendance Records & Biometric Configuration' },
      { key: 'hr.attendance.audit_export', label: 'Export the Attendance Audit Log' },

      // ── Attendance month close (2026-08-22) ──────────────────────────────
      // CLOSING the month is not the same as overriding a record.
      // hr.attendance.override lets an HR user correct one day; these two let
      // someone freeze an entire institution-month, after which nobody can
      // raise, decide or withdraw a leave / short time off / comp-off request
      // that touches it. Held by hr_head alone plus the Super Administrator.
      //
      // Enforced by hr_attendance_periods RLS, by hr_attendance_period_console
      // and fn_hr_lock_attendance_period, and — the part hr_payroll_periods
      // never had — by triggers on hr_attendance_records and
      // hr_leave_applications that refuse writes inside a closed month.
      //
      // REOPENING deliberately has NO key: it is super-admin-only and checked
      // with is_super_admin() inside fn_hr_reopen_attendance_period, so it
      // cannot be granted to a role by mistake.
      { key: 'hr.attendance.period.view', label: 'View Attendance Month Close' },
      { key: 'hr.attendance.period.manage', label: 'Close and Reopen Attendance Months' },

      // ── Shift timings (2026-08-06) ────────────────────────────────────────
      // Institution x staff-category x weekday working hours, with the
      // first/second half windows and the morning grace period that biometric
      // punch evaluation reads. Replaces the retired hr.shifts.* namespace,
      // whose only key (hr.shifts.view_own) gated a per-employee roster module
      // that was never used and is now removed.
      { key: 'hr.shift_timings.view', label: 'View Shift Timing Configuration' },
      { key: 'hr.shift_timings.manage', label: 'Configure Shift Timings' },

      // ── Training sessions & enrolments (2026-08-05) ───────────────────────
      // hr_training_sessions / hr_training_enrollments gate on these five and
      // they were registered nowhere, so the training back office was
      // super-admin-only. hr.training.view_own (below) is the self-service
      // half and is unaffected: it reads a person's own enrolments, while
      // these five run the programme.
      { key: 'hr.training.view', label: 'View Training Sessions & Enrolments' },
      { key: 'hr.training.create', label: 'Create Training Sessions' },
      { key: 'hr.training.edit', label: 'Edit Training Sessions & Enrolments' },
      { key: 'hr.training.delete', label: 'Delete Training Sessions & Enrolments' },
      { key: 'hr.training.enroll', label: 'Enrol People into Training Sessions' },
      { key: 'hr.assets.view_own', label: 'View Own Assigned Assets' },
      { key: 'hr.memos.view_own', label: 'View Own Memos' },
      { key: 'hr.performance_reviews.view_own', label: 'View Own Appraisal' },
      { key: 'hr.promotion.apply_own', label: 'Apply for Own Promotion' },
      { key: 'hr.training.view_own', label: 'View Own Training and Enroll' },
      { key: 'hr.fdp.view_own', label: 'View Own FDP Applications' },
      { key: 'hr.documents.view_own', label: 'Manage Own HR Documents' },
      { key: 'hr.forms.submit_own', label: 'Submit HR Forms' },
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
      { key: 'hr.dashboard.manage', label: 'Configure HR Command Center Widgets' },
      // Sanctioned faculty posts register (Wave 2A, 2026-07-26) —
      // /hr/admin/sanctioned-posts. The nightly hr-naac-evidence refresh
      // compares filled strength against this register to emit NAAC 2.2.1
      // (cadre strength vs sanctioned posts) evidence.
      { key: 'hr.sanctioned_posts.view', label: 'View Sanctioned Senior Learner Posts' },
      { key: 'hr.sanctioned_posts.manage', label: 'Manage Sanctioned Senior Learner Posts' }
    ]
  },
  {
    // Counselor Taxonomy Phase 1 (2026-04-27) — see specs/counselor-taxonomy-spec.md
    // Permission keys consumed by the new `staff_counselor` role seeded in
    // supabase/migrations/20260427_counselor_taxonomy_phase1.sql. Module pages
    // (/hr/counseling/*) land in Phase 2.
    name: 'Staff Counseling',
    key: 'hr_counseling',
    permissions: [
      { key: 'hr.counseling.view', label: 'View Staff Counseling Queue' },
      { key: 'hr.counseling.sessions.view', label: 'View Staff Counseling Sessions' },
      { key: 'hr.counseling.sessions.create', label: 'Schedule & Log Staff Counseling Sessions' },
      { key: 'hr.counseling.notes.create', label: 'Write Staff Counseling Session Notes' },
      { key: 'hr.counseling.notes.view_own', label: 'View Own Staff Counseling Notes (Author Only)' },
      { key: 'hr.grievance.view', label: 'View Staff Grievances Assigned to Counselor' },
      { key: 'hr.grievance.escalate', label: 'Escalate Grievance to Formal HR Process' },
      { key: 'hr.career_development.view', label: 'View Staff Career Development Sessions' }
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
      { key: 'notifications.view.all', label: 'View All Notifications' },
      {
        key: 'notifications.create.learners',
        label: 'Send Notifications to Learners Only'
      }
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

      // -----------------------------------------------------------------
      // NIF Coordinator substrate (PR-0, 2026-04-20)
      // SF100 granular CRUD + umbrella keys for remaining Studio submodules.
      // Seeded into custom_roles.nif_coordinator by migration
      //   20260420000001_nif_coordinator_role_and_audit.sql
      // -----------------------------------------------------------------

      // SF100 — Programs
      { key: 'startup_studio.sf100.program.view', label: 'SF100 — View Programs' },
      { key: 'startup_studio.sf100.program.create', label: 'SF100 — Create Programs' },
      { key: 'startup_studio.sf100.program.edit', label: 'SF100 — Edit Programs' },
      { key: 'startup_studio.sf100.program.archive', label: 'SF100 — Archive Programs (soft)' },
      // Note: startup_studio.sf100.program.delete intentionally reserved for super_admin only

      // SF100 — Teams (Enrollments)
      { key: 'startup_studio.sf100.team.view', label: 'SF100 — View Teams' },
      { key: 'startup_studio.sf100.team.create', label: 'SF100 — Create Teams (enroll)' },
      { key: 'startup_studio.sf100.team.edit', label: 'SF100 — Edit Team Details' },
      { key: 'startup_studio.sf100.team.archive', label: 'SF100 — Archive Teams (soft delete)' },
      { key: 'startup_studio.sf100.team.transfer', label: 'SF100 — Approve Team Transfers' },
      // Note: startup_studio.sf100.team.delete (hard purge) reserved for super_admin only

      // SF100 — Team Members
      { key: 'startup_studio.sf100.member.view', label: 'SF100 — View Team Members' },
      { key: 'startup_studio.sf100.member.create', label: 'SF100 — Add Team Members' },
      { key: 'startup_studio.sf100.member.edit', label: 'SF100 — Edit Team Member Details' },
      { key: 'startup_studio.sf100.member.remove', label: 'SF100 — Remove Team Members' },
      { key: 'startup_studio.sf100.member.transfer', label: 'SF100 — Transfer Member Between Teams' },

      // SF100 — Check-ins
      { key: 'startup_studio.sf100.check_in.view', label: 'SF100 — View Check-ins' },
      { key: 'startup_studio.sf100.check_in.create', label: 'SF100 — Create Check-ins (incl. on-behalf-of-team)' },
      { key: 'startup_studio.sf100.check_in.edit', label: 'SF100 — Edit Check-ins' },
      { key: 'startup_studio.sf100.check_in.delete', label: 'SF100 — Delete Check-ins (triggers metric recompute)' },

      // SF100 — Paid Users
      { key: 'startup_studio.sf100.paid_user.view', label: 'SF100 — View Paid Users' },
      { key: 'startup_studio.sf100.paid_user.create', label: 'SF100 — Add Paid Users' },
      { key: 'startup_studio.sf100.paid_user.edit', label: 'SF100 — Edit Paid Users' },
      { key: 'startup_studio.sf100.paid_user.delete', label: 'SF100 — Delete Paid Users (triggers revenue recompute)' },
      { key: 'startup_studio.sf100.paid_user.verify', label: 'SF100 — Verify Paid Users' },
      { key: 'startup_studio.sf100.paid_user.churn', label: 'SF100 — Mark Paid Users Churned' },

      // SF100 — Customer Interviews
      { key: 'startup_studio.sf100.interview.view', label: 'SF100 — View Customer Interviews' },
      { key: 'startup_studio.sf100.interview.create', label: 'SF100 — Create Customer Interviews' },
      { key: 'startup_studio.sf100.interview.edit', label: 'SF100 — Edit Customer Interviews' },
      { key: 'startup_studio.sf100.interview.delete', label: 'SF100 — Delete Customer Interviews' },

      // SF100 — Pivots
      { key: 'startup_studio.sf100.pivot.view', label: 'SF100 — View Pivots' },
      { key: 'startup_studio.sf100.pivot.create', label: 'SF100 — Record Pivots' },
      { key: 'startup_studio.sf100.pivot.edit', label: 'SF100 — Edit Pivots' },
      { key: 'startup_studio.sf100.pivot.delete', label: 'SF100 — Delete Pivots' },

      // SF100 — Exercises
      { key: 'startup_studio.sf100.exercise.view', label: 'SF100 — View Exercises' },
      { key: 'startup_studio.sf100.exercise.create', label: 'SF100 — Create Exercises' },
      { key: 'startup_studio.sf100.exercise.edit', label: 'SF100 — Edit Exercises' },
      { key: 'startup_studio.sf100.exercise.delete', label: 'SF100 — Delete Exercises' },
      { key: 'startup_studio.sf100.exercise.respond', label: 'SF100 — Submit Exercise Responses' },

      // SF100 — Roster Changes
      { key: 'startup_studio.sf100.roster_change.view', label: 'SF100 — View Roster Change Queue' },
      { key: 'startup_studio.sf100.roster_change.approve', label: 'SF100 — Approve/Reject Roster Changes' },
      { key: 'startup_studio.sf100.roster_change.cancel', label: 'SF100 — Cancel Pending Roster Change' },

      // SF100 — Audit Log
      { key: 'startup_studio.sf100.audit_log.view', label: 'SF100 — View Audit Log' },

      // -----------------------------------------------------------------
      // Foundations (Level 0) — pre-Appathon founder-formation on-ramp
      // Spec: specs/startup-studio-foundations-level0-spec-2026-06-01.md
      // Student participation is enrollment-gated (no perm key), matching SF100.
      // -----------------------------------------------------------------
      { key: 'startup_studio.foundations.view', label: 'Foundations — View cohorts & worksheets' },
      { key: 'startup_studio.foundations.manage', label: 'Foundations — Manage cohorts, worksheets & enrolment' },
      { key: 'startup_studio.foundations.review', label: 'Foundations — Review submissions (mentor feedback)' },

      // -----------------------------------------------------------------
      // School of Influence — programme settings (S2)
      // Spec: specs/school-of-influence-batches-2026-07-30.md §7
      // Gates /startup-studio/school-of-influence/admin/settings, which edits
      // the soi.* rows in platform_policies (who may apply, batch size, what
      // happens when a batch is full, the inactivity thresholds). Registered
      // here so Role Management can grant it — the same key is used by the
      // page guard AND by MENU_PERMISSIONS, so the nav chip and the page never
      // disagree. Super admins bypass both.
      // -----------------------------------------------------------------
      { key: 'startup_studio.school_of_influence.configure', label: 'School of Influencer — Configure programme settings' },

      // NIF Pipeline (Nattraja Incubation Forum)
      { key: 'startup_studio.nif.view', label: 'NIF — View Pipeline' },
      { key: 'startup_studio.nif.manage', label: 'NIF — Manage Candidates' },
      { key: 'startup_studio.nif.advance', label: 'NIF — Advance Stage' },
      { key: 'startup_studio.nif.reject', label: 'NIF — Reject Candidate' },

      // Other Studio submodules — umbrella keys (granular refinement as CRUD matures)
      { key: 'startup_studio.problem_bank.view', label: 'Problem Bank — View' },
      { key: 'startup_studio.problem_bank.manage', label: 'Problem Bank — Manage' },
      { key: 'startup_studio.mentors.view', label: 'Mentors — View' },
      { key: 'startup_studio.mentors.manage', label: 'Mentors — Manage' },
      { key: 'startup_studio.portfolio.view', label: 'Portfolio — View' },
      { key: 'startup_studio.portfolio.manage', label: 'Portfolio — Manage' },
      { key: 'startup_studio.cycles.view', label: 'Cycles — View' },
      { key: 'startup_studio.cycles.manage', label: 'Cycles — Manage' },
      { key: 'startup_studio.graduation.view', label: 'Graduation — View' },
      { key: 'startup_studio.graduation.manage', label: 'Graduation — Manage' },
      { key: 'startup_studio.trl.view', label: 'TRL — View' },
      { key: 'startup_studio.trl.manage', label: 'TRL — Manage' },
      { key: 'startup_studio.kpi.view', label: 'KPI — View' },
      { key: 'startup_studio.kpi.manage', label: 'KPI — Manage' },
      { key: 'startup_studio.finance.view', label: 'Finance/Grants — View' },
      { key: 'startup_studio.finance.manage', label: 'Finance/Grants — Manage' },
      { key: 'startup_studio.marketing.view', label: 'Marketing — View' },
      { key: 'startup_studio.marketing.manage', label: 'Marketing — Manage' },
      { key: 'startup_studio.analytics.view', label: 'Analytics — View' },
      { key: 'startup_studio.alumni.view', label: 'Alumni — View' },
      { key: 'startup_studio.alumni.manage', label: 'Alumni — Manage' },
      { key: 'startup_studio.governance.view', label: 'Governance — View' },
      { key: 'startup_studio.governance.manage', label: 'Governance — Manage' },
      { key: 'startup_studio.competitive.view', label: 'Competitive Intel — View' },
      { key: 'startup_studio.competitive.manage', label: 'Competitive Intel — Manage' },
      { key: 'startup_studio.risk.view', label: 'Risk Register — View' },
      { key: 'startup_studio.risk.manage', label: 'Risk Register — Manage' },
      { key: 'startup_studio.pipeline.view', label: 'Pipeline — View' },
      { key: 'startup_studio.pipeline.manage', label: 'Pipeline — Manage' },
      { key: 'startup_studio.teams.view', label: 'Teams — View' },
      { key: 'startup_studio.teams.manage', label: 'Teams — Manage' },
      { key: 'startup_studio.notify.send', label: 'Notifications — Send to Studio Participants' },
    ]
  },
  {
    name: 'Administration',
    key: 'admin',
    permissions: [
      // Added 2026-04-27 — menu-coverage baseline cleanup. The /admin parent
      // route was hidden for non-super-admins because no MENU_PERMISSIONS
      // entry existed. Use admin.view as the parent gate; child routes keep
      // their specific keys (admin.lifecycle.view, lti.monitor, pde.admin.*).
      { key: 'admin.view', label: 'View Administration Landing' },
      { key: 'admin.lifecycle.view', label: 'View Lifecycle Analytics Dashboard' },
      { key: 'system.bugs.view', label: 'View All Bug Reports (Admin)' },
      { key: 'audit.view', label: 'View Audit Trail' },
      { key: 'users.dashboard.view', label: 'View User Analytics Dashboard' },
      { key: 'ai_query.view', label: 'Access AI Assistant' },
      // Tier-2 chip-leak sweep 2026-04-27 — admin tools surfaced via
      // `/admin/*` chips that previously default-allowed for every role.
      { key: 'admin.reset_driver_passwords.manage', label: 'Bulk Reset Driver/Transport Passwords' },
      { key: 'admin.saml.manage', label: 'Manage SAML SSO Service Providers & Sessions' }
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
      { key: 'admission.leads.convert_to_admitted', label: 'Convert Lead to Admitted (creates learner profile)' },
      { key: 'admission.enquiries.activities.view', label: 'View Activities tab on Enquiry page' },
      { key: 'admission.enquiries.activities.create', label: 'Add notes / voice memos to Enquiry activities' },
      { key: 'admission.enquiries.checklist.view', label: 'View Checklist tab on Enquiry page' },
      { key: 'admission.enquiries.checklist.mark', label: 'Mark / unmark items on Enquiry checklist' },
      // 2026-08-05 — learner_self_fill_tokens' SELECT policy names this key and
      // nothing else, so nobody outside the super-admin bypass could read back
      // a self-fill link once issued. The token is what lets a lead complete
      // their own application form without an account, so issuing one is a
      // separate right from editing the lead.
      { key: 'admission.leads.student_form.generate', label: 'Issue Self-Fill Application Links to Leads' },

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
      // 2026-08-02 — admission_counselor_duty_log's SELECT policy demanded this
      // key and it existed nowhere. Kept separate from performance.view: a duty
      // log is an attendance-shaped record of an individual's working day.
      { key: 'admission.counselors.duty_log.view', label: 'View Counselor Duty Log' },
      // 2026-08-05 — registered because the RLS already DEMANDED them. The four
      // tables that decide which counselor gets which enquiry
      // (admission_counselor_institutions / _schedules / _sources and
      // admission_lead_cascade_history) name these two keys and nothing else,
      // so the whole routing setup was invisible and unchangeable outside the
      // super-admin bypass. Split view / manage because reading who is on duty
      // for which college is a far smaller thing than re-cutting the routing.
      { key: 'admission.counselors.team.view', label: 'View Counselor Coverage (colleges, rosters, sources, cascade history)' },
      { key: 'admission.counselors.team.manage', label: 'Manage Counselor Coverage (colleges, rosters, sources, cascade)' },

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
      { key: 'admission.settings.whatsapp.manage', label: 'Manage WhatsApp Numbers & Settings' },
      { key: 'admission.settings.seats.view', label: 'View Seat Configuration' },
      { key: 'admission.settings.seats.manage', label: 'Manage Seat Configuration' },
      { key: 'admission.settings.years.view', label: 'View Admission Years' },
      { key: 'admission.settings.years.create', label: 'Create Admission Years' },
      { key: 'admission.settings.years.edit', label: 'Edit Admission Years' },
      { key: 'admission.settings.years.delete', label: 'Delete Admission Years' },
      { key: 'admission.settings.statuses.view', label: 'View admission statuses' },
      { key: 'admission.settings.statuses.manage', label: 'Manage admission statuses' },
      { key: 'admission.settings.checklists.view', label: 'View Programme Checklists module' },
      { key: 'admission.settings.checklists.manage', label: 'Create / Edit / Delete Programme Checklists' },
      // 2026-08-05 — admission_forms, admission_form_submissions and
      // admission_form_abandon_log all gate on these two and neither existed
      // here, so the form builder AND everything captured through it — every
      // submission, and the abandon log that says where applicants gave up —
      // was unreadable to every role.
      { key: 'admission.settings.forms.view', label: 'View Admission Forms, Submissions & Abandon Log' },
      { key: 'admission.settings.forms.manage', label: 'Create / Edit / Delete Admission Forms' },

      // Gate Entry (2026-05-07) — kiosk capture flow for gate security
      { key: 'admission.gate_entry.create', label: 'Log Gate Entry (kiosk)' },
      { key: 'admission.gate_entry.view',   label: "View Today's Gate Entries" },
      { key: 'admission.gate_entry.manage', label: 'Manage Gate Entry Settings' },

      // Voice Memo (2026-05-09) — counselor records 30s English memo on call log;
      // Whisper cron analyzes for sentiment/summary/categories that flow into the
      // Lead Mood Digest (PR #779).
      { key: 'admission.voice_memo', label: 'Record Voice Memo on Call Log' },

      // Admission documents (2026-08-05). Flat under `admission_documents.*`
      // (not `admission.documents.*`) because that is the shape the RLS on
      // learner_admission_documents and admission_account_transition_log
      // already uses; renaming the key would mean rewriting live policies, and
      // this PR only makes what exists grantable. It was registered nowhere, so
      // an applicant's certificates and the record of their account being
      // switched over to a learner account were both super-admin-only.
      { key: 'admission_documents.manage', label: 'Manage Learner Admission Documents & Account Transitions' }
    ]
  },
  // Schools Network lives further down in this array (single canonical entry,
  // added 2026-06-30). It was briefly registered twice — category keys MUST be
  // unique: role-management "select all" and the audit UI look categories up
  // by key and silently drop duplicates.
  // Admission Fees (2026-05-07) — matrix-driven fee-structure module
  // Keys are flat under `admission_fees.*` (not `admission.fees.*`) because
  // RLS policies + service code reference them that way.
  {
    name: 'Admission Fees',
    key: 'admission_fees',
    permissions: [
      { key: 'admission_fees.read', label: 'View Fee Structures' },
      { key: 'admission_fees.manage', label: 'Create / Edit Fee Structures' },
      { key: 'admission_fees.delete', label: 'Delete Fee Structures' },
      { key: 'admission_fees.manage_adjustments', label: 'Manage Per-Learner Fee Adjustments' },
      { key: 'admission_fees.approve_change_event', label: 'Approve Fee Change Events' },
      { key: 'admission_fees.override', label: 'Override Resolved Fee Items' }
    ]
  },
  // School Fees (2026-08-13) — term-wise annual fee plans for
  // institutions.entity_type = 'school'. SEPARATE from Admission Fees above:
  // that module is cohort-locked on admission_year_id (a 4-year learner keeps
  // their admission-year sheet), while school plans re-fix every year on
  // academic_year_id. Keys are flat under `school_fees.*` to match the RLS on
  // school_fee_plans / school_term_calendars / school_fee_concession_* exactly
  // — a dotted variant like `school.fees.read` would silently deny with no error.
  {
    name: 'School Fees',
    key: 'school_fees',
    permissions: [
      { key: 'school_fees.read', label: 'View School Fee Plans, Term Calendar & Concessions' },
      { key: 'school_fees.manage', label: 'Create / Edit School Fee Plans & Term Calendar' },
      { key: 'school_fees.activate', label: 'Activate Plans & Create New Versions' },
      { key: 'school_fees.generate', label: 'Generate Yearly Fee Bills' },
      { key: 'school_fees.concession', label: 'Manage Concession Schemes & Learner Assignments' },
      { key: 'school_fees.collect', label: 'Collect Fee Payments & Issue Receipts (Counter)' }
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
  // Director's Desk (2026-08-04) — hand over any page; the handover IS the grant
  // Spec: specs/director-desk/SPEC.md
  //
  // These MUST be registered here even though they are never handed over — a key
  // absent from this file is UNGRANTABLE, because Role Management can only offer
  // what it can enumerate. fn_handover_key_is_blocked() permanently walls
  // `director.handover.%` from being handed over, so a deliberate trip to Role
  // Management is the ONLY way to obtain them. That is the intended friction:
  // it is what stops the master key from propagating (decision 5).
  // ======================================================================
  {
    name: "Director's Desk",
    key: 'director',
    permissions: [
      { key: 'director.handover.create', label: 'Hand over a page or job to someone' },
      { key: 'director.handover.view_all', label: "See every handover on the Director's desk" }
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
      { key: 'accreditation.naac.committees.meetings.manage', label: 'Record IQAC Meetings & Resolutions' },

      // NAAC DCF 2025 / AQAR export (super-admin path)
      { key: 'accreditation.naac.dcf_export', label: 'Export NAAC DCF / AQAR Workbook' },

      // NAAC 8.4 Learning Experience Survey + DPDPA 2023 consent
      { key: 'accreditation.naac.surveys.consent.submit', label: 'Submit DPDPA Consent' },
      { key: 'accreditation.naac.surveys.export', label: 'Export NAAC 8.4 Survey Data' },

      // Employer + alumni course feedback — the EXTERNAL half of NAAC 1.2
      // (bos_meetings supplies the internal half). view = see cycles, the chase
      // list and the comments; manage = create/open/close a cycle, build the
      // recipient list, remove a respondent on request.
      { key: 'accreditation.naac.surveys.stakeholder.view', label: 'View Employer & Alumni Feedback' },
      { key: 'accreditation.naac.surveys.stakeholder.manage', label: 'Run Employer & Alumni Feedback Cycles' },

      // NAAC AI narrative drafter — grounded, human-verified per-metric narratives.
      // view = see drafts; edit = owning Senior Learner edits + okays;
      // approve = Principal approve / Director submit / request revision;
      // manage = assign the owning Senior Learner for a metric.
      { key: 'accreditation.naac.narrative.view', label: 'View AI Criteria Narratives' },
      { key: 'accreditation.naac.narrative.edit', label: 'Edit & Okay AI Narrative (Owning Senior Learner)' },
      { key: 'accreditation.naac.narrative.approve', label: 'Approve / Submit AI Narrative (Principal / Director)' },
      { key: 'accreditation.naac.narrative.manage', label: 'Assign Narrative Owners (IQAC Coordinator)' },

      // Per-body dashboards (PR-A9 through PR-A15)
      { key: 'accreditation.nirf.view', label: 'View NIRF Dashboard' },
      { key: 'accreditation.nba.view', label: 'View NBA Dashboard' },
      { key: 'accreditation.qs.view', label: 'View QS Dashboard (Phase 2+)' },
      { key: 'accreditation.dci.view', label: 'View DCI Dashboard' },
      { key: 'accreditation.pci.view', label: 'View PCI Dashboard' },
      { key: 'accreditation.inc.view', label: 'View INC Dashboard' },
      { key: 'accreditation.ncte.view', label: 'View NCTE Dashboard' },
      { key: 'accreditation.aicte.view', label: 'View AICTE Dashboard' },
      { key: 'accreditation.ugc.view', label: 'View UGC Dashboard' },

      // Cluster Academic Council — a peer tab in the same row, but JKKN's own
      // governance body rather than an outside regulator, so it has no
      // scorecard and nothing to submit. Read-only: forming a council and
      // editing its roster stay on the committees hub under the
      // accreditation.naac.committees.* keys.
      { key: 'accreditation.cac.view', label: 'View Cluster Academic Council (CAC)' },

      // The UGC readiness checklist on the same page (2026-08-14) — a separate
      // key because the reading is narrower than the council's roster and
      // meeting record: it is a list of what the council has and has not done.
      // Registered here in the SAME pull request that grants it, so it can be
      // ticked in Role Management rather than being grantable only by hand —
      // an unregistered key is how this repo produced pages gated on something
      // nobody could hold.
      { key: 'accreditation.cac.readiness.view', label: 'View CAC UGC Readiness Checklist' },

      // CRUD retrofit 2026-04-23 — admin UIs for catalog tables (metrics + source registry).
      // Required for /accreditation/manage/metrics + the source-kind picker in evidence admin.
      { key: 'accreditation.metrics.view', label: 'View Accreditation Metrics Catalog' },
      { key: 'accreditation.metrics.manage', label: 'Manage Accreditation Metrics (add local/supplementary)' },
      { key: 'accreditation.source_registry.view', label: 'View Evidence Source Registry' },
      { key: 'accreditation.source_registry.manage', label: 'Manage Evidence Source Registry (admin only)' },

      // 2026-08-12 — the accreditation.evidence.view / .create / .manage trio
      // this PR originally registered here is NOT re-added: it landed on main
      // independently on 2026-08-05 (see the "the evidence ledger itself" block
      // further down this same list). Registering it twice would render the key
      // twice in Role Management. The reasoning is identical and is preserved at
      // its surviving site; only the duplicate is dropped.

      // Awarding-body registry + institution mapping (2026-08-06) —
      // /accreditation/manage/bodies. Which bodies a college answers to decides
      // its DENOMINATOR: before this existed, every institution was measured
      // against all 107 metrics including seven that could never apply to it.
      // `.manage` is deliberately not `.metrics.manage`: adding a metric to a
      // rubric and deciding which rubrics a college answers to at all are
      // different powers, and the second one changes every total on the screen.
      { key: 'accreditation.bodies.view', label: 'View Awarding Bodies & Institution Mapping' },
      { key: 'accreditation.bodies.manage', label: 'Manage Awarding Bodies & Institution Mapping' },

      // MoU / Grants register (C6, 2026-07-26) — /accreditation/manage/collaborations.
      // Rows auto-emit NAAC 7.9 (MoUs / industry collaborations) + 9.1 (grants) evidence.
      { key: 'accreditation.collaborations.view', label: 'View MoU & Grants Register' },
      { key: 'accreditation.collaborations.manage', label: 'Manage MoU & Grants Register (add/edit/delete records)' },

      // Monthly utility meter register (Attribute 10, 2026-07-26) —
      // /accreditation/manage/utility-readings. Readings auto-emit NAAC 10.2
      // (water & waste) + 10.3 (net-zero progress); a campus with no readings
      // emits nothing rather than a zero.
      { key: 'accreditation.sustainability_readings.view', label: 'View Monthly Utility Readings' },
      { key: 'accreditation.sustainability_readings.manage', label: 'Enter Monthly Utility Readings (per campus, per month)' },

      // IIQA — PR-IIQA-1 (2026-04-25). NAAC IIQA submission workflow.
      // accreditation_officer (existing system role) is the primary IIQA Coordinator;
      // principal signs off; super_admin / director submits to NAAC.
      // external_auditor_timeboxed gets the read_only_external key during peer review.
      { key: 'accreditation.iiqa.view', label: 'View IIQA Submission Dashboard' },
      { key: 'accreditation.iiqa.manage', label: 'Edit IIQA Static Facts + Snapshots (IQAC Coordinator)' },
      { key: 'accreditation.iiqa.submit', label: 'Submit IIQA Pack to NAAC (Director only — locks snapshots)' },
      { key: 'accreditation.iiqa.read_only_external', label: 'Read IIQA Pack (NAAC Peer Team — time-boxed)' },
      { key: 'accreditation.certificates.view', label: 'View Accreditation Certificates' },
      { key: 'accreditation.certificates.manage', label: 'Upload + Manage Accreditation Certificates' },

      // Twin-college re-stamp control 2026-07-10 (Director: "Build the
      // re-assignment control now") — releases HELD CO/PO rollups into the
      // evidence ledger by assigning the right college. Gates
      // fn_copo_restamp_rollup_institution (super admins bypass).
      { key: 'accreditation.evidence.restamp', label: 'Re-assign Held CO/PO Results to a College' },

      // 2026-08-05 — the evidence ledger itself. quality_evidence_mappings is
      // the "collect once, report many" spine (11,624 rows: one captured fact
      // mapped to every body that asks for it), and its SELECT / INSERT /
      // UPDATE policies name these three keys exclusively. None of the three
      // was registered, so the spine was readable and writable only through
      // the super-admin bypass, and three per-source evidence tables
      // (coe_naac_evidence, event_feedback_naac_evidence,
      // facility_teaching_naac_evidence) were unreadable for the same reason.
      { key: 'accreditation.evidence.view', label: 'View the Evidence Ledger (collect once, report many)' },
      { key: 'accreditation.evidence.create', label: 'Map Evidence to Accreditation Metrics' },
      { key: 'accreditation.evidence.manage', label: 'Edit & Re-map Existing Evidence' },

      // 2026-08-02 — registered because the RLS already DEMANDED them.
      // accreditation_survey_consents and accreditation_submissions carry
      // policies calling user_has_permission() on these six keys, none of which
      // existed here, so no role could ever hold one and every non-admin read
      // and write against those two tables was denied with no way to grant it.
      // Registering a key grants it to nobody — it only makes it assignable in
      // Role Management, which is the missing half of the lock.
      { key: 'accreditation.consents.view', label: 'View Accreditation Survey Consents' },
      { key: 'accreditation.consents.create', label: 'Record Accreditation Survey Consent' },
      { key: 'accreditation.consents.withdraw', label: 'Withdraw Accreditation Survey Consent' },
      { key: 'accreditation.submissions.view', label: 'View Accreditation Submissions' },
      { key: 'accreditation.submissions.create', label: 'Create Accreditation Submissions' },
      { key: 'accreditation.submissions.manage', label: 'Manage Accreditation Submissions' }
    ]
  },
  {
    // Grievance module — PR-A6a (module live) + CRUD retrofit 2026-04-23.
    // Categories are managed per-institution; tickets follow modernized RLS
    // that bypasses hardcoded role names in favor of these permission keys.
    name: 'Grievance',
    key: 'grievance',
    permissions: [
      { key: 'grievance.tickets.view', label: 'View Grievance Tickets' },
      { key: 'grievance.tickets.create', label: 'File Grievance Tickets' },
      { key: 'grievance.tickets.edit', label: 'Update Grievance Tickets (assign/comment/resolve)' },
      { key: 'grievance.tickets.delete', label: 'Delete Grievance Tickets (super-admin cleanup only)' },
      { key: 'grievance.categories.view', label: 'View Grievance Categories' },
      { key: 'grievance.categories.manage', label: 'Manage Grievance Categories (add local categories)' }
    ]
  },
  {
    // Permission keys mirror MENU_PERMISSIONS entries in lib/sidebarMenuLink.ts
    // for every /solutions/* route on production (jicate/main). Scope is
    // read/view today — write actions are guarded at the service layer.
    name: 'Solutions Hub',
    key: 'solutions',
    permissions: [
      // Dashboard
      { key: 'solutions.dashboard.view', label: 'View Solutions Dashboard' },

      // Pipeline
      { key: 'solutions.pipeline.view', label: 'View Solutions Pipeline' },
      { key: 'solutions.pipeline.analytics.view', label: 'View Pipeline Analytics' },

      // Parties
      { key: 'solutions.clients.view', label: 'View Clients' },
      { key: 'solutions.builders.view', label: 'View Builders' },

      // Training
      { key: 'solutions.training.view', label: 'View Training' },
      { key: 'solutions.training.programs.view', label: 'View Training Programs' },
      { key: 'solutions.training.sessions.view', label: 'View Training Sessions' },
      { key: 'solutions.training.cohort.view', label: 'View Training Cohorts' },

      // Content
      { key: 'solutions.content.view', label: 'View Content' },
      { key: 'solutions.content.deliverables.view', label: 'View Content Deliverables' },
      { key: 'solutions.content.production.view', label: 'View Content Production' },
      { key: 'solutions.content.queue.view', label: 'View Content Queue' },

      // Finance
      { key: 'solutions.payments.view', label: 'View Payments' },
      { key: 'solutions.earnings.view', label: 'View Earnings' },

      // Discovery & Outputs
      { key: 'solutions.discovery.view', label: 'View Discovery' },
      { key: 'solutions.publications.view', label: 'View Publications' },
      { key: 'solutions.products.view', label: 'View Products' },

      // Software
      { key: 'solutions.software.view', label: 'View Software Solutions' },
      { key: 'solutions.software.builders.view', label: 'View Software Builders' },
      { key: 'solutions.software.phases.view', label: 'View Software Phases' },

      // Specialty Tracks
      { key: 'solutions.matlab.view', label: 'View MATLAB Track' },
      { key: 'solutions.paradigm_shift.view', label: 'View Paradigm Shift' },

      // Compliance
      { key: 'solutions.compliance.view', label: 'View AI Solution Compliance' },

      // Department capability register (2026-08-01). /solutions/departments was
      // retired 2026-04-02 with its obsolete nomination workflow; the capability
      // editor went with it, which is why all 44 activated departments still
      // declare nothing. These keys gate the register that brings it back.
      { key: 'solutions.departments.view', label: 'View Department Capabilities' },
      {
        key: 'solutions.departments.capabilities.edit',
        label: 'Declare Department Capabilities',
      },

      // First real use (2026-09-07). The producing department records, at one
      // checkpoint, the first time somebody outside the team used the solution.
      // Both keys gate `sh_solution_first_use` in RLS, so leaving either
      // unregistered would make the table permanently super-admin-only.
      { key: 'solutions.first_use.view', label: 'View First Real Use' },
      { key: 'solutions.first_use.record', label: 'Record First Real Use' },

      // Societal capture (2026-08-28). A department records community work that
      // produced no invoice; the activity clock reads it so that closing
      // un-invoiced problems no longer marks the department dormant. Both keys
      // gate `sh_community_engagements` in RLS
      // (20261013000000_societal_capture_and_activity_clock.sql), so leaving
      // either unregistered would make the table permanently super-admin-only.
      { key: 'solutions.societal.view', label: 'View Community Engagements' },
      { key: 'solutions.societal.record', label: 'Record Community Engagements' },

      // Settings (tier-2 chip-leak sweep 2026-04-27)
      { key: 'solutions.settings.view', label: 'View Solutions Settings' }
    ]
  },
  {
    // Expanded 2026-04-21 — Persona Design PR-3 of 4. Replaces the baseline
    // `.view`-only stub. Catalogues all Campus Living permission keys so PR-4
    // can retrofit RLS on the 48 hostel_*/mess_* tables using stable keys.
    // Key groups below map 1:1 to submodules the module code already surfaces
    // (see lib/sidebarMenuLink.ts MENU_PERMISSIONS for enforcement points).
    name: 'Campus Living',
    key: 'campus_living',
    permissions: [
      // Module-level
      { key: 'campus_living.view', label: 'View Campus Living Module' },
      { key: 'campus_living.dashboard.view', label: 'View Campus Living Dashboard' },
      { key: 'campus_living.activity.view', label: 'View Activity Feed' },
      { key: 'campus_living.calendar.view', label: 'View Calendar' },
      { key: 'campus_living.settings.view', label: 'View Campus Living Settings' },
      { key: 'campus_living.settings.edit', label: 'Edit Campus Living Settings' },

      // Physical infrastructure — Blocks
      { key: 'campus_living.blocks.view', label: 'View Hostel Blocks' },
      { key: 'campus_living.blocks.create', label: 'Create Hostel Blocks' },
      { key: 'campus_living.blocks.edit', label: 'Edit Hostel Blocks' },
      { key: 'campus_living.blocks.delete', label: 'Delete Hostel Blocks' },
      { key: 'campus_living.blocks.warden_assign', label: 'Assign Warden to Block' },

      // Physical infrastructure — Rooms
      { key: 'campus_living.rooms.view', label: 'View Rooms' },
      { key: 'campus_living.rooms.create', label: 'Create Rooms' },
      { key: 'campus_living.rooms.edit', label: 'Edit Rooms' },
      { key: 'campus_living.rooms.delete', label: 'Delete Rooms' },
      { key: 'campus_living.rooms.inspect', label: 'Record Room Inspection' },

      // Physical infrastructure — Beds
      { key: 'campus_living.beds.view', label: 'View Beds' },
      { key: 'campus_living.beds.create', label: 'Create Beds' },
      { key: 'campus_living.beds.edit', label: 'Edit Beds' },
      { key: 'campus_living.beds.delete', label: 'Delete Beds' },
      { key: 'campus_living.beds.status_change', label: 'Change Bed Status' },

      // Allocations
      { key: 'campus_living.allocations.view', label: 'View Hostel Allocations' },
      { key: 'campus_living.allocations.view_own', label: 'View Own Allocation (Resident)' },
      { key: 'campus_living.allocations.create', label: 'Create Allocation' },
      { key: 'campus_living.allocations.edit', label: 'Edit Allocation' },
      { key: 'campus_living.allocations.transfer', label: 'Transfer Learner Between Rooms' },
      { key: 'campus_living.allocations.vacate', label: 'Vacate Allocation' },
      { key: 'campus_living.allocations.approve', label: 'Approve Allocation' },
      // Read-only conformance audit (/campus-living/allocations/audit). Granted
      // to NO role on purpose: user_has_permission() super-admin-bypasses, so
      // this is super-admin-only today and can be handed to a warden/registrar
      // from Role Management later without a code change. Never gate on a role
      // name — the RPC fn_hostel_allocation_audit reads THIS key.
      { key: 'campus_living.allocations.audit', label: 'View Allocation Audit (Super Admin)' },

      // Residents (master data — added 2026-04-22 PR-2, classifies non-learner residents: staff / international / married / visitor / other)
      { key: 'campus_living.residents.view', label: 'View Hostel Residents' },
      { key: 'campus_living.residents.create', label: 'Create Hostel Resident Record' },
      { key: 'campus_living.residents.edit', label: 'Edit Hostel Resident Record' },
      { key: 'campus_living.residents.delete', label: 'Delete Hostel Resident (no allocation history)' },

      // Category upgrades (office-side room/mess upgrades — single + bulk, added 2026-06-17)
      { key: 'campus_living.upgrades.manage', label: 'Manage Category Upgrades (Office-Side)' },

      // My Hostel — resident self-service portal (added 2026-05-31)
      { key: 'campus_living.my_hostel.view', label: 'View My Hostel (Resident Self-Service)' },
      { key: 'campus_living.profile.view_own', label: 'View Own Hostel Profile (Emergency/Medical)' },
      { key: 'campus_living.profile.edit_own', label: 'Edit Own Hostel Profile (Emergency/Medical)' },

      // Approval chains (engine master data — added 2026-04-22 PR-0, drives vacate + future workflows)
      { key: 'campus_living.approval_chains.view', label: 'View Approval Chain Rules' },
      { key: 'campus_living.approval_chains.create', label: 'Create Approval Chain Rule' },
      { key: 'campus_living.approval_chains.edit', label: 'Edit Approval Chain Rule (name / description / active / priority)' },
      { key: 'campus_living.approval_chains.delete', label: 'Delete Approval Chain Rule (no active runs)' },

      // Vacate requests (workflow — added 2026-04-22 PR-A, student-initiated hostel vacate with parent/warden/chief/dues approval chain)
      { key: 'campus_living.vacate_requests.view', label: 'View Hostel Vacate Requests' },
      { key: 'campus_living.vacate_requests.view_own', label: 'View Own Vacate Requests (Student / Resident)' },
      { key: 'campus_living.vacate_requests.submit', label: 'Submit Own Vacate Request' },
      { key: 'campus_living.vacate_requests.submit_on_behalf', label: 'Submit Vacate Request on Behalf of Student' },
      { key: 'campus_living.vacate_requests.approve_warden', label: 'Warden Approve Vacate Request' },
      { key: 'campus_living.vacate_requests.approve_chief', label: 'Chief Warden Approve Vacate Request' },
      { key: 'campus_living.vacate_requests.mark_clearance', label: 'Mark Dues Clearance Items' },
      { key: 'campus_living.vacate_requests.finalize', label: 'Finalize Vacate (trigger hostel_allocations.vacate)' },
      { key: 'campus_living.vacate_requests.cancel', label: 'Cancel Vacate Request (Admin / Hostel Office)' },

      // Wardens
      { key: 'campus_living.wardens.view', label: 'View Wardens' },
      { key: 'campus_living.wardens.assign', label: 'Assign Warden' },
      { key: 'campus_living.wardens.remove', label: 'Remove Warden' },

      // Gate passes
      { key: 'campus_living.gate_passes.view', label: 'View Gate Passes' },
      { key: 'campus_living.gate_passes.view_own', label: 'View Own Gate Passes (Hosteler)' },
      { key: 'campus_living.gate_passes.view_block', label: 'View Gate Passes for Assigned Block' },
      { key: 'campus_living.gate_passes.create', label: 'Request Gate Pass' },
      { key: 'campus_living.gate_passes.approve', label: 'Approve Gate Pass' },
      { key: 'campus_living.gate_passes.reject', label: 'Reject Gate Pass' },
      { key: 'campus_living.gate_passes.verify_at_gate', label: 'Verify Gate Pass at Gate' },

      // Visitors
      { key: 'campus_living.visitors.view', label: 'View Visitors' },
      { key: 'campus_living.visitors.log', label: 'Log New Visitor' },
      { key: 'campus_living.visitors.approve', label: 'Approve Visitor' },

      // Leave
      { key: 'campus_living.leave.view', label: 'View Leave Requests' },
      { key: 'campus_living.leave.view_own', label: 'View Own Leave (Hosteler)' },
      { key: 'campus_living.leave.view_block', label: 'View Leave for Assigned Block' },
      { key: 'campus_living.leave.request', label: 'Request Leave' },
      { key: 'campus_living.leave.parent_consent', label: 'Provide Parent Consent' },
      { key: 'campus_living.leave.warden_approve', label: 'Warden Approve Leave' },
      { key: 'campus_living.leave.chief_approve', label: 'Chief Warden Approve Leave' },

      // Leave Types (master data — added 2026-04-21 PR-3b, replaces enum)
      { key: 'campus_living.leave_types.view', label: 'View Hostel Leave Types' },
      { key: 'campus_living.leave_types.create', label: 'Create Hostel Leave Type' },
      { key: 'campus_living.leave_types.edit', label: 'Edit Hostel Leave Type' },
      { key: 'campus_living.leave_types.delete', label: 'Delete Hostel Leave Type (non-system only)' },

      // Attendance
      { key: 'campus_living.attendance.view', label: 'View Hostel Attendance' },
      { key: 'campus_living.attendance.mark', label: 'Mark Hostel Attendance' },
      { key: 'campus_living.attendance.edit', label: 'Edit Attendance Record' },
      { key: 'campus_living.attendance.export', label: 'Export Attendance' },

      // Maintenance
      { key: 'campus_living.maintenance.view', label: 'View Maintenance Tickets' },
      { key: 'campus_living.maintenance.create', label: 'Create Maintenance Ticket' },
      { key: 'campus_living.maintenance.assign', label: 'Assign Maintenance Ticket' },
      { key: 'campus_living.maintenance.close', label: 'Close Maintenance Ticket' },
      { key: 'campus_living.maintenance.approve_payment', label: 'Approve Vendor Payment' },

      // Housekeeping
      { key: 'campus_living.housekeeping.view', label: 'View Housekeeping Schedules' },
      { key: 'campus_living.housekeeping.schedule', label: 'Create/Edit Schedule' },
      { key: 'campus_living.housekeeping.mark_done', label: 'Mark Task Done' },

      // Laundry
      { key: 'campus_living.laundry.view', label: 'View Laundry Config' },
      { key: 'campus_living.laundry.config', label: 'Configure Laundry Service' },
      { key: 'campus_living.laundry.orders_manage', label: 'Manage Laundry Orders' },

      // Safety
      { key: 'campus_living.safety.view', label: 'View Safety Equipment' },
      { key: 'campus_living.safety.inspect', label: 'Record Safety Inspection' },
      { key: 'campus_living.safety.record', label: 'Record Safety Event' },
      { key: 'campus_living.safety.inspections.view', label: 'View Safety Inspections' },
      { key: 'campus_living.safety.incidents.view', label: 'View Safety Incidents' },
      { key: 'campus_living.safety.anti_ragging.view', label: 'View Anti-Ragging Incidents' },
      { key: 'campus_living.safety.anti_ragging.manage', label: 'Manage Anti-Ragging Cases' },

      // Health
      { key: 'campus_living.health.view', label: 'View Health Cases' },
      { key: 'campus_living.health.log_case', label: 'Log Health Case' },
      { key: 'campus_living.health.emergency', label: 'Trigger Health Emergency' },

      // Fees
      { key: 'campus_living.fees.view', label: 'View Hostel Fees' },
      { key: 'campus_living.fees.view_own', label: 'View Own Hostel Fees (Resident)' },
      { key: 'campus_living.fees.config', label: 'Configure Fee Structure' },
      { key: 'campus_living.fees.waive', label: 'Waive Fee' },
      { key: 'campus_living.fees.refund', label: 'Refund Fee' },

      // Deposits
      { key: 'campus_living.deposits.view', label: 'View Deposits' },
      { key: 'campus_living.deposits.record', label: 'Record Deposit' },
      { key: 'campus_living.deposits.refund', label: 'Refund Deposit' },

      // Mess — umbrella
      { key: 'campus_living.mess.view', label: 'View Mess Module' },

      // Mess — caterers
      { key: 'campus_living.mess.caterers.view', label: 'View Caterers' },
      { key: 'campus_living.mess.caterers.onboard', label: 'Onboard Caterer' },
      { key: 'campus_living.mess.caterers.suspend', label: 'Suspend Caterer' },
      { key: 'campus_living.mess.caterers.pay', label: 'Process Caterer Payment' },

      // Mess — menus
      { key: 'campus_living.mess.menu.view', label: 'View Mess Menu' },
      { key: 'campus_living.mess.menu.publish', label: 'Publish Menu' },
      { key: 'campus_living.mess.menu.approve', label: 'Approve Menu' },
      { key: 'campus_living.mess.menu.manage', label: 'Manage Menu Loop (recommendations + verdicts)' },

      // Mess — meals
      { key: 'campus_living.mess.meals.view', label: 'View Meal Records' },
      { key: 'campus_living.mess.meals.book', label: 'Book Meal' },
      { key: 'campus_living.mess.meals.cancel', label: 'Cancel Meal Booking' },

      // Mess — billing
      { key: 'campus_living.mess.billing.view', label: 'View Mess Billing' },
      { key: 'campus_living.mess.billing.reconcile', label: 'Reconcile Mess Billing' },
      { key: 'campus_living.mess.billing.export', label: 'Export Mess Billing' },

      // Mess — feedback + waste
      { key: 'campus_living.mess.feedback.view', label: 'View Mess Feedback' },
      { key: 'campus_living.mess.waste.view', label: 'View Mess Waste Log' },

      // Alerts
      { key: 'campus_living.alerts.view', label: 'View Alert Rules' },
      { key: 'campus_living.alerts.configure', label: 'Configure Alert Rules' },
      { key: 'campus_living.alerts.acknowledge', label: 'Acknowledge Alert' },

      // Pulse surveys
      { key: 'campus_living.pulse.view', label: 'View Pulse Surveys' },
      { key: 'campus_living.pulse.create', label: 'Create Pulse Survey' },
      { key: 'campus_living.pulse.respond', label: 'Respond to Pulse Survey' },

      // Wellness
      { key: 'campus_living.wellness.view', label: 'View Wellness Module' },

      // Community
      { key: 'campus_living.community.view', label: 'View Community Config' },
      { key: 'campus_living.community.manage', label: 'Manage Community Config' },
      { key: 'campus_living.community.post', label: 'Post to Community' },
      { key: 'campus_living.community.moderate', label: 'Moderate Community' },

      // Analytics
      { key: 'campus_living.analytics.view', label: 'View Analytics (all)' },
      { key: 'campus_living.analytics.occupancy', label: 'Analytics: Occupancy' },
      { key: 'campus_living.analytics.fees', label: 'Analytics: Fees' },
      { key: 'campus_living.analytics.mess', label: 'Analytics: Mess' },
      { key: 'campus_living.analytics.maintenance', label: 'Analytics: Maintenance' },
      { key: 'campus_living.analytics.safety', label: 'Analytics: Safety' },
      { key: 'campus_living.analytics.cross_domain', label: 'Analytics: Cross-Domain' },

      // Reports (accreditation)
      { key: 'campus_living.reports.view', label: 'View Reports' },
      { key: 'campus_living.reports.naac_4_1_4', label: 'NAAC 3.1 — Physical Infrastructure (Binary framework)' },
      { key: 'campus_living.reports.nirf_facilities', label: 'NIRF Facilities for Students' },
      { key: 'campus_living.reports.aicte_eoa', label: 'AICTE EOA Hostel Section' },
      { key: 'campus_living.reports.anti_ragging_quarterly', label: 'Anti-Ragging Quarterly Report' },

      // Parent portal
      { key: 'campus_living.parent_portal.view_child', label: 'Parent Portal — View Child' },
      { key: 'campus_living.parent_portal.consent', label: 'Parent Portal — Provide Consent' },
      { key: 'campus_living.parent_portal.pay_fee', label: 'Parent Portal — Pay Fee' },

      // Premium Room (paid SKU — added 2026-05-16 in Wave 1 spec)
      { key: 'campus_living.premium.configure_tier', label: 'Premium Room — Configure Tier Policy' },
      { key: 'campus_living.premium.pick_room', label: 'Premium Room — Self-Pick Room (Learner)' },
      { key: 'campus_living.premium.invite_roommate', label: 'Premium Room — Invite Roommate' },
      { key: 'campus_living.premium.override_pick', label: 'Premium Room — Override Pick (Chief Warden)' },
      { key: 'campus_living.premium.view_dashboard', label: 'Premium Room — View Dashboard' },

      // ══ The write half the catalog never had (2026-08-05) ════════════════
      // Everything above was written as intent verbs — record, config,
      // log_case, onboard, publish. The RLS on the hostel_* and mess_* tables
      // was written as plain CRUD — create, edit, delete — and those 61 keys
      // were registered nowhere. On 100+ table/command pairs the CRUD key is
      // the ONLY permissive route, so a warden holding every key in the list
      // above still could not delete an attendance row, edit a maintenance
      // ticket or record a health case: the write was refused, and because an
      // RLS denial returns zero rows with no error, the screen looked empty
      // rather than forbidden. Registering them here makes them grantable. It
      // grants them to nobody.
      //
      // Where a key below looks close to one above, they are not duplicates:
      // campus_living.fees.config edits the fee POLICY screens, while
      // campus_living.fees.edit is the row-level write on hostel_fee_config.
      // Grant both to whoever is meant to do the job.

      // Alerts — hostel_alert_rules + hostel_risk_alerts
      { key: 'campus_living.alerts.create', label: 'Create Alert Rules & Risk Alerts' },
      { key: 'campus_living.alerts.edit', label: 'Edit Alert Rules & Risk Alerts' },
      { key: 'campus_living.alerts.delete', label: 'Delete Alert Rules & Risk Alerts' },

      // Allocations — also covers the five tables that hang off an allocation
      // (emergency contacts, onboarding checklists + templates, roommate
      // preferences, waitlist), which all share this one delete key.
      { key: 'campus_living.allocations.delete', label: 'Delete Allocations & Their Attached Records' },

      // Attendance
      { key: 'campus_living.attendance.delete', label: 'Delete Hostel Attendance Records' },

      // Community config
      { key: 'campus_living.community.create', label: 'Create Community Configuration' },
      { key: 'campus_living.community.edit', label: 'Edit Community Configuration' },
      { key: 'campus_living.community.delete', label: 'Delete Community Configuration' },

      // Deposits
      { key: 'campus_living.deposits.create', label: 'Create Deposit Records' },
      { key: 'campus_living.deposits.edit', label: 'Edit Deposit Records' },
      { key: 'campus_living.deposits.delete', label: 'Delete Deposit Records' },

      // Fee configuration
      { key: 'campus_living.fees.create', label: 'Create Hostel Fee Configuration' },
      { key: 'campus_living.fees.edit', label: 'Edit Hostel Fee Configuration' },
      { key: 'campus_living.fees.delete', label: 'Delete Hostel Fee Configuration' },

      // Gate passes — also the gate access log
      { key: 'campus_living.gate_passes.edit', label: 'Edit Gate Passes & Gate Access Log' },
      { key: 'campus_living.gate_passes.delete', label: 'Delete Gate Passes & Gate Access Log Entries' },

      // Health cases
      { key: 'campus_living.health.create', label: 'Create Health Case Records' },
      { key: 'campus_living.health.edit', label: 'Edit Health Case Records' },
      { key: 'campus_living.health.delete', label: 'Delete Health Case Records' },

      // Laundry — configuration and orders
      { key: 'campus_living.laundry.create', label: 'Create Laundry Configuration & Orders' },
      { key: 'campus_living.laundry.edit', label: 'Edit Laundry Configuration & Orders' },
      { key: 'campus_living.laundry.delete', label: 'Delete Laundry Configuration & Orders' },

      // Leave — requests, leave-type configuration and curfew exceptions
      { key: 'campus_living.leave.create', label: 'Create Leave Requests, Leave Types & Curfew Exceptions' },
      { key: 'campus_living.leave.edit', label: 'Edit Leave Requests, Leave Types & Curfew Exceptions' },
      { key: 'campus_living.leave.delete', label: 'Delete Leave Requests, Leave Types & Curfew Exceptions' },

      // Maintenance — tickets, SLA config, AMC contracts, preventive schedules
      { key: 'campus_living.maintenance.edit', label: 'Edit Maintenance Tickets, SLAs, AMC Contracts & Preventive Schedules' },
      { key: 'campus_living.maintenance.delete', label: 'Delete Maintenance Tickets, SLAs, AMC Contracts & Preventive Schedules' },

      // Mess — billing periods and per-resident mess billing
      { key: 'campus_living.mess.billing.create', label: 'Create Mess Billing Periods & Resident Bills' },
      { key: 'campus_living.mess.billing.edit', label: 'Edit Mess Billing Periods & Resident Bills' },
      { key: 'campus_living.mess.billing.delete', label: 'Delete Mess Billing Periods & Resident Bills' },

      // Mess — caterers. create/edit/delete act on the caterer register;
      // book/publish/cancel act on caterer BLOCKS, the periods a caterer is
      // assigned to serve. The verbs come from the policy names, not from a
      // booking screen — read them as add / amend / withdraw a block.
      { key: 'campus_living.mess.caterers.create', label: 'Add Caterers to the Register' },
      { key: 'campus_living.mess.caterers.edit', label: 'Edit Caterers on the Register' },
      { key: 'campus_living.mess.caterers.delete', label: 'Remove Caterers from the Register' },
      { key: 'campus_living.mess.caterers.book', label: 'Assign a Caterer to a Service Block' },
      { key: 'campus_living.mess.caterers.publish', label: 'Amend a Caterer Service Block' },
      { key: 'campus_living.mess.caterers.cancel', label: 'Withdraw a Caterer Service Block' },

      // Mess — feedback rows. book / publish / cancel are again the policy
      // verbs for insert / update / delete on mess_feedback.
      { key: 'campus_living.mess.feedback.book', label: 'Record Mess Feedback' },
      { key: 'campus_living.mess.feedback.publish', label: 'Amend Mess Feedback' },
      { key: 'campus_living.mess.feedback.cancel', label: 'Delete Mess Feedback' },

      // Mess — meal bookings and served-meal records
      { key: 'campus_living.mess.meals.create', label: 'Create Meal Bookings & Meal Records' },
      { key: 'campus_living.mess.meals.edit', label: 'Edit Meal Bookings & Meal Records' },
      { key: 'campus_living.mess.meals.delete', label: 'Delete Meal Bookings & Meal Records' },

      // Mess — menu rows (campus_living.mess.menu.publish above is the
      // publish-the-menu action; these two are the row writes on mess_menus)
      { key: 'campus_living.mess.menu.book', label: 'Add Menu Entries' },
      { key: 'campus_living.mess.menu.cancel', label: 'Delete Menu Entries' },

      // Mess — waste log
      { key: 'campus_living.mess.waste.book', label: 'Record Mess Waste' },
      { key: 'campus_living.mess.waste.publish', label: 'Amend Mess Waste Entries' },
      { key: 'campus_living.mess.waste.cancel', label: 'Delete Mess Waste Entries' },

      // Pulse surveys — configuration and responses
      { key: 'campus_living.pulse.edit', label: 'Edit Pulse Survey Configuration & Responses' },
      { key: 'campus_living.pulse.delete', label: 'Delete Pulse Survey Configuration & Responses' },

      // Safety — incidents, the people named on them, inspections, equipment
      { key: 'campus_living.safety.create', label: 'Create Safety Incidents, Inspections & Equipment Records' },
      { key: 'campus_living.safety.edit', label: 'Edit Safety Incidents, Inspections & Equipment Records' },
      { key: 'campus_living.safety.delete', label: 'Delete Safety Incidents, Inspections & Equipment Records' },

      // Safety — anti-ragging affidavits (statutory, kept separate from the
      // general safety keys so the affidavit file can be held by fewer people)
      { key: 'campus_living.safety.anti_ragging.create', label: 'Create Anti-Ragging Affidavits' },
      { key: 'campus_living.safety.anti_ragging.edit', label: 'Edit Anti-Ragging Affidavits' },
      { key: 'campus_living.safety.anti_ragging.delete', label: 'Delete Anti-Ragging Affidavits' },

      // Visitors — the visitor log and the known-visitor list
      { key: 'campus_living.visitors.create', label: 'Create Visitor & Known-Visitor Records' },
      { key: 'campus_living.visitors.edit', label: 'Edit Visitor & Known-Visitor Records' },
      { key: 'campus_living.visitors.delete', label: 'Delete Visitor & Known-Visitor Records' },

      // Wardens — the warden register itself (campus_living.wardens.assign
      // above is the assign-to-a-block action)
      { key: 'campus_living.wardens.create', label: 'Create Warden Records' },
      { key: 'campus_living.wardens.edit', label: 'Edit Warden Records' },
      { key: 'campus_living.wardens.delete', label: 'Delete Warden Records' }
    ]
  },
  {
    // Baseline-only: app/api/documents/ exists but no documents.* permission
    // keys are enforced in lib/sidebarMenuLink.ts or in route guards on this
    // branch. Seeded `.view` until documents module adds enforcement.
    name: 'Documents',
    key: 'documents',
    permissions: [
      { key: 'documents.view', label: 'View Documents' }
    ]
  },
  {
    // Updated 2026-07-31: registers every learners_council.* key enforced by
    // MENU_PERMISSIONS in lib/sidebarMenuLink.ts (24 /learners-council/*
    // routes resolve to the 8 distinct section keys below). Previously only
    // `view` and `events.view` were registered, so the other enforced keys
    // could not be granted through Role Management at all.
    // `learners_council.view` is the module gate used by the in-app guide and
    // stays registered.
    name: 'Learners Council',
    key: 'learners_council',
    permissions: [
      { key: 'learners_council.view', label: 'View Learners Council' },
      { key: 'learners_council.dashboard.view', label: 'View Council Dashboard' },
      { key: 'learners_council.structure.view', label: 'View Council Structure' },
      {
        key: 'learners_council.communication.view',
        label: 'View Council Communication'
      },
      { key: 'learners_council.events.view', label: 'View Council Events' },
      { key: 'learners_council.od.view', label: 'View Council OD Requests' },
      { key: 'learners_council.selection.view', label: 'View Council Selection' },
      { key: 'learners_council.issues.view', label: 'View Council Issues' },
      { key: 'learners_council.settings.view', label: 'View Council Settings' }
    ]
  },
  {
    // Permission keys mirror MENU_PERMISSIONS entries in lib/sidebarMenuLink.ts
    // for every /learn/* route. PDE is the Personal Development Engine shipped
    // under the /learn namespace.
    name: 'PDE (Personal Development Engine)',
    key: 'pde',
    permissions: [
      { key: 'pde.quests.view', label: 'View Quests' },
      { key: 'pde.capabilities.view', label: 'View Capabilities' },
      { key: 'pde.build.view', label: 'View Build Hub' },
      { key: 'pde.channels.view', label: 'View Channels' },
      { key: 'pde.profile.view', label: 'View Learner Profile' },
      { key: 'pde.leaderboard.view', label: 'View Leaderboard' },
      // Added 2026-04-27 — menu-coverage baseline cleanup. Admin + Faculty
      // PDE surfaces (under /pde/admin/* and /pde/faculty/*) had no
      // MENU_PERMISSIONS entries and were hidden for every non-super-admin.
      // PDE Admin (Super Admin / IQAC / Lifecycle leads)
      { key: 'pde.admin.view', label: 'View PDE Admin Dashboard' },
      { key: 'pde.admin.assessments.view', label: 'View PDE Admin Assessments' },
      { key: 'pde.admin.at_risk.view', label: 'View PDE At-Risk Learners' },
      { key: 'pde.admin.capabilities.view', label: 'View PDE Admin Capabilities' },
      { key: 'pde.admin.engagement.view', label: 'View PDE Engagement Analytics' },
      { key: 'pde.admin.lti.view', label: 'View PDE LTI Configuration' },
      { key: 'pde.admin.quests.view', label: 'View PDE Admin Quests' },
      // PDE Faculty (Faculty / HOD / Mentor surface)
      { key: 'pde.faculty.view', label: 'View PDE Faculty Landing' },
      { key: 'pde.faculty.analytics.view', label: 'View PDE Faculty Analytics' },
      { key: 'pde.faculty.assessments.view', label: 'View PDE Faculty Assessments' },
      { key: 'pde.faculty.dashboard.view', label: 'View PDE Faculty Dashboard' },
      { key: 'pde.faculty.demonstrations.view', label: 'View PDE Faculty Demonstrations' },
      { key: 'pde.faculty.quests.view', label: 'View PDE Faculty Quests' }
    ]
  },
  {
    // Permission keys mirror MENU_PERMISSIONS entries in lib/sidebarMenuLink.ts
    // for every /vac/* route. Includes the single `.create` key enforced on
    // /vac/admin/courses/new — every other action is view-only at the sidebar
    // level (write actions are service-layer guarded).
    name: 'Value-Added Courses',
    key: 'vac',
    permissions: [
      // Learner-facing
      { key: 'vac.courses.view', label: 'View VAC Catalogue' },
      { key: 'vac.my_courses.view', label: 'View My Courses' },
      { key: 'vac.progress.view', label: 'View My Progress' },
      { key: 'vac.case.view', label: 'View CASE Track' },

      // Admin
      { key: 'vac.admin.view', label: 'View VAC Admin' },
      { key: 'vac.admin.courses.view', label: 'View Admin Courses' },
      { key: 'vac.admin.courses.create', label: 'Create Admin Course' },
      { key: 'vac.admin.enrollments.view', label: 'View Enrollments' },
      { key: 'vac.admin.analytics.view', label: 'View VAC Analytics' },
      { key: 'vac.admin.settings.view', label: 'View VAC Settings' },

      // CASE admin
      { key: 'vac.admin.case.view', label: 'View CASE Admin' },
      { key: 'vac.admin.case.tracks.view', label: 'View CASE Tracks' },
      { key: 'vac.admin.case.batches.view', label: 'View CASE Batches' },
      { key: 'vac.admin.case.readiness.view', label: 'View CASE Readiness' }
    ]
  },
  // Added 2026-04-22 — Audit Workflow Sprint 01
  {
    name: 'Audit Workflow',
    key: 'audit',
    permissions: [
      { key: 'audit.cycle.view', label: 'View Audit Cycles' },
      { key: 'audit.cycle.manage', label: 'Create / Manage Audit Cycles' },
      { key: 'audit.finding.view', label: 'View Audit Findings' },
      { key: 'audit.finding.log', label: 'Log New Audit Findings' },
      { key: 'audit.finding.review', label: 'Review Finding Rectifications' },
      { key: 'audit.finding.rectify', label: 'Rectify Assigned Findings' },
      { key: 'audit.evidence.upload', label: 'Upload Audit-Finding Evidence' },
      { key: 'audit.attestation.view', label: 'View Parameter Attestations' },
      { key: 'audit.attestation.sign', label: 'Sign Parameter Attestations (Lead Auditor)' },
      { key: 'audit.attestation.cosign', label: 'Co-sign Attestations (CAO / CEO / MD-CAIO)' },
      { key: 'audit.parameter.view', label: 'View Audit Parameter Catalog' },
      { key: 'audit.parameter.manage', label: 'Manage Institution-scoped Parameter Overrides' },
      { key: 'audit.finding_type.manage', label: 'Manage Finding-Type Master' },
      { key: 'audit.leadership.view', label: 'View In-Progress Findings (CAO / CEO / MD)' },
      { key: 'audit.external_auditor.manage', label: 'Manage Time-Boxed External Auditors (Admin)' }
    ]
  },
  // Added 2026-04-27 — tier-2 chip-leak sweep. The /bos module had no
  // catalog category, so its chip-level permissions had nowhere to live in
  // Role-Management UI. Five tier-2 sub-pages exist (compositions, experts,
  // meetings, reports, ta-da) and are now perm-gated via .view keys here.
  {
    name: 'Board of Studies',
    key: 'bos',
    permissions: [
      // Added 2026-04-27 — menu-coverage baseline cleanup. The /bos parent
      // route was hidden for non-super-admins because no MENU_PERMISSIONS
      // entry existed. Use bos.view as the parent gate; child routes keep
      // their specific tier-2 keys (bos.compositions.view, etc.).
      // 2026-05-16: Catalog rewritten to use canonical `academic.bos-<X>.<action>`
      // keys — the same format the runtime gates read (user_has_permission RPC,
      // usePermissions.canAccess, server-side guardian in lib/utils/bos/bos-access).
      // The legacy `bos.<X>.<action>` keys this catalog used to emit never matched
      // any read site, so the dialog's toggles authorised nothing. See migrations
      // 20260511, 20260512, 20260516_normalize, and 20260516010000_validate
      // for the history. Note: ta_da → ta-da (dash, matching BOS_MODULES.TA_DA).
      //
      // `bos.view` is kept (no `academic.` prefix) because it's the sidebar parent
      // gate at sidebarMenuLink.ts:497 ('/bos': 'bos.view'). It's auto-derived
      // by applyBOSFallback from any granular academic.bos-*.view, but exposing
      // it lets admins explicitly disable the entire BoS sidebar section.
      { key: 'bos.view', label: 'View Board of Studies Landing (sidebar gate)' },
      { key: 'academic.bos-compositions.view', label: 'View BoS Compositions' },
      { key: 'academic.bos-compositions.create', label: 'Create BoS Compositions' },
      { key: 'academic.bos-compositions.edit', label: 'Edit BoS Compositions' },
      { key: 'academic.bos-compositions.delete', label: 'Delete BoS Compositions' },
      { key: 'academic.bos-experts.view', label: 'View BoS Experts' },
      { key: 'academic.bos-experts.create', label: 'Create BoS Experts' },
      { key: 'academic.bos-experts.edit', label: 'Edit BoS Experts' },
      { key: 'academic.bos-experts.delete', label: 'Delete BoS Experts' },
      { key: 'academic.bos-meetings.view', label: 'View BoS Meetings' },
      { key: 'academic.bos-meetings.create', label: 'Create BoS Meetings' },
      { key: 'academic.bos-meetings.edit', label: 'Edit BoS Meetings' },
      { key: 'academic.bos-meetings.delete', label: 'Delete BoS Meetings' },
      { key: 'academic.bos-meetings.approve', label: 'Approve BoS Meetings' },
      { key: 'academic.bos-reports.view', label: 'View BoS Reports' },
      { key: 'academic.bos-reports.create', label: 'Create BoS Reports' },
      { key: 'academic.bos-reports.edit', label: 'Edit BoS Reports' },
      { key: 'academic.bos-reports.delete', label: 'Delete BoS Reports' },
      { key: 'academic.bos-reports.export', label: 'Export BoS Reports' },
      { key: 'academic.bos-ta-da.view', label: 'View BoS TA/DA Claims' },
      { key: 'academic.bos-ta-da.create', label: 'Create BoS TA/DA Claims' },
      { key: 'academic.bos-ta-da.edit', label: 'Edit BoS TA/DA Claims' },
      { key: 'academic.bos-ta-da.delete', label: 'Delete BoS TA/DA Claims' },
      { key: 'academic.bos-ta-da.approve', label: 'Approve BoS TA/DA Claims' },
      // Added 2026-06-10 — granted to faculty/school_faculty by DEFAULT_ROLE_PERMISSIONS
      // but missing here; uncataloged keys get mangled to underscore format by the
      // edit-role-dialog round-trip and rejected by trg_validate_custom_roles_permissions_format.
      { key: 'academic.bos-ta-da.submit', label: 'Submit BoS TA/DA Claims' },
      { key: 'academic.bos-members.view', label: 'View BoS Members' },
      { key: 'academic.bos-members.create', label: 'Create BoS Members' },
      { key: 'academic.bos-members.edit', label: 'Edit BoS Members' },
      { key: 'academic.bos-members.delete', label: 'Delete BoS Members' },
      // Added 2026-05-08 — BoS Courses & Course Scheme tabs
      { key: 'academic.bos-courses.view', label: 'View BoS Courses' },
      { key: 'academic.bos-courses.create', label: 'Create BoS Courses' },
      { key: 'academic.bos-courses.edit', label: 'Edit BoS Courses' },
      { key: 'academic.bos-courses.delete', label: 'Delete BoS Courses' },
      { key: 'academic.bos-courses.import', label: 'Import BoS Courses (Excel)' },
      { key: 'academic.bos-scheme.view', label: 'View BoS Course Scheme' },
      { key: 'academic.bos-scheme.edit', label: 'Edit BoS Course Scheme' },
      // Added 2026-05-11 — Taxonomy (regulation → category → sub-category tree).
      { key: 'academic.bos-taxonomy.view', label: 'View BoS Taxonomy' },
      { key: 'academic.bos-taxonomy.create', label: 'Create BoS Taxonomy Entries' },
      { key: 'academic.bos-taxonomy.edit', label: 'Edit BoS Taxonomy Entries' },
      { key: 'academic.bos-taxonomy.delete', label: 'Delete BoS Taxonomy Entries' },
      // Added 2026-05-11 — Syllabus (course syllabus versioning, replaces /syllabi).
      { key: 'academic.bos-syllabus.view', label: 'View BoS Syllabi' },
      { key: 'academic.bos-syllabus.create', label: 'Create BoS Syllabi' },
      { key: 'academic.bos-syllabus.edit', label: 'Edit BoS Syllabi' },
      { key: 'academic.bos-syllabus.delete', label: 'Delete BoS Syllabi' },
      { key: 'academic.bos-syllabus.approve', label: 'Approve BoS Syllabi' },
      { key: 'academic.bos-syllabus.export', label: 'Export BoS Syllabi' },
      // Added 2026-06-10 — granted to hod via migrations but missing here (same
      // mangling risk as academic.bos-ta-da.submit above).
      { key: 'academic.bos-syllabus.revise', label: 'Revise BoS Syllabi' },
      { key: 'academic.bos-syllabus.duplicate', label: 'Duplicate BoS Syllabi' },
      // Added 2026-05-08 — SOP (Standard Operating Procedure) document editor.
      // 'approve' is a separate gate so a chair/dean can approve without owning
      // edit rights, matching the meetings module's split (view/edit/approve).
      // 'export' is a separate gate so we can give read-only viewers PDF/DOCX
      // exports without granting edit access.
      { key: 'academic.bos-sop.view', label: 'View SOP Documents' },
      { key: 'academic.bos-sop.create', label: 'Create SOP Documents' },
      { key: 'academic.bos-sop.edit', label: 'Edit SOP Documents' },
      { key: 'academic.bos-sop.delete', label: 'Delete SOP Documents' },
      { key: 'academic.bos-sop.approve', label: 'Approve SOP Documents' },
      { key: 'academic.bos-sop.export', label: 'Export SOP Documents' },
      { key: 'academic.bos-sop.comment', label: 'Comment on SOP Documents' },

      // ── Legacy `bos.*` keys that RLS never stopped using (2026-08-05) ─────
      // The catalog note at the top of this category says the legacy
      // `bos.<X>.<action>` shape "never matched any read site". That is true of
      // the page guards; it is NOT true of the database. Three tables still
      // carry policies naming the legacy shape, and on all three it is the only
      // permissive route:
      //   bos_external_experts  -> bos.experts.view / create / edit / delete
      //   bos_course_reviews    -> bos.meetings.view / edit
      //   bos_documents         -> bos.meetings.view / edit
      // So the 216 external experts on the register, plus every course review
      // and meeting document, were readable only through the super-admin
      // bypass, no matter how many academic.bos-experts.* keys a role held.
      // Registered here so the right can actually be granted. The tidier fix is
      // to repoint those six policies at the canonical academic.bos-* keys and
      // retire these — that is a migration, and migrations are Director-gated,
      // so it is deliberately not in this PR.
      { key: 'bos.experts.view', label: 'View BoS External Expert Register (legacy key — enforced by RLS)' },
      { key: 'bos.experts.create', label: 'Add BoS External Experts (legacy key — enforced by RLS)' },
      { key: 'bos.experts.edit', label: 'Edit BoS External Experts (legacy key — enforced by RLS)' },
      { key: 'bos.experts.delete', label: 'Delete BoS External Experts (legacy key — enforced by RLS)' },
      { key: 'bos.meetings.view', label: 'View BoS Course Reviews & Meeting Documents (legacy key — enforced by RLS)' },
      { key: 'bos.meetings.edit', label: 'Edit BoS Course Reviews & Meeting Documents (legacy key — enforced by RLS)' },

      // ── Legacy `bos.*` keys that MENU_PERMISSIONS never stopped using (2026-08-14)
      // Same failure class as the RLS block above, one layer up. These two are
      // the SIDEBAR gates — lib/sidebarMenuLink.ts:1313 and :1325 map
      // '/bos/compositions' and '/bos/reports' to them — while the pages
      // themselves gate on the canonical keys (BosViewGuard 'academic.bos-
      // compositions', and hasBosPermission('academic.bos-reports.view') in
      // app/api/bos/reports/*). Because they were absent here, no role could
      // hold them, so both links were invisible to everyone but super admins
      // even when the role had complete working access to both pages by URL.
      // Registered so the right can be granted; first granted to bos_coordinator
      // (20260825010000). The tidier fix is to repoint those two
      // MENU_PERMISSIONS entries at the canonical academic.bos-*.view keys and
      // retire these — that changes sidebar visibility for every existing role,
      // so it is deliberately not bundled here.
      { key: 'bos.compositions.view', label: 'Show BoS Compositions in sidebar (legacy key — sidebar gate only)' },
      { key: 'bos.reports.view', label: 'Show BoS Reports in sidebar (legacy key — sidebar gate only)' }
    ]
  },
  // Added 2026-04-27 — menu-coverage baseline cleanup (Failure 1 of #511/#515
  // deferred CI gates). MENU_PERMISSIONS already enforces events.proposals.view
  // for /events/propose, but the events module had no PERMISSION_CATEGORIES
  // entry — Role-Management Edit dialog couldn't show toggles for it.
  // Includes marathon keys for /events/marathon and /events/marathon/new
  // surfaced by the same baseline sweep.
  {
    name: 'Events',
    key: 'events',
    permissions: [
      { key: 'events.view', label: 'View Events Landing' },
      { key: 'events.proposals.view', label: 'View Event Proposals' },
      { key: 'events.proposals.create', label: 'Create Event Proposals' },
      { key: 'events.marathon.view', label: 'View Marathon Events' },
      { key: 'events.marathon.create', label: 'Create Marathon Events' },
      // Events Platform Promotion — shared logistics
      { key: 'events.budget.approve', label: 'Approve Event Budgets (finance sign-off)' },
      { key: 'events.presets.manage', label: 'Publish Official Event Presets' },
      // Event-date requests (CARRE instrumentation, 2026-07-25): grants deciding
      // (confirm/decline/supersede) a raised "please confirm a date" request via
      // fn_event_date_request_decide. Raising needs no key (any proposal viewer).
      { key: 'events.dates.decide', label: 'Decide Event Date Requests (confirm/decline)' },
      // Events Hub row delete (2026-08-06). Seeded to NO role — super admins
      // pass via user_has_permission()'s bypass, everyone else is granted here
      // from Role Management. The DELETE it unlocks cascades through 43 child
      // tables (registrations, payment transactions, tournament matches …), so
      // it is deliberately not bundled into any existing events key.
      { key: 'events.delete', label: 'Delete Events (permanent — cascades registrations & payments)' }
    ]
  },
  // Course Events (2026-08-13). Paid, multi-session learning courses open to
  // learners, staff and external participants. See
  // docs/superpowers/specs/2026-08-13-course-events-design.md
  //
  // `courses.participant.self` is the ONLY key held by the Course Participant
  // role an external registrant is given at approval. It grants read of their
  // own enrollment, bills and receipts and nothing else — it is never bundled
  // into an admin key.
  {
    name: 'Courses',
    key: 'courses',
    permissions: [
      { key: 'courses.view', label: 'View Courses' },
      { key: 'courses.create', label: 'Create Courses' },
      { key: 'courses.edit', label: 'Edit Courses' },
      // Retained for the audit gate and for re-delegating deletion later, but it
      // no longer grants deletion on its own: course delete cascades through
      // enrollments, bills and payments, so both the course_events_delete RLS
      // policy and fn_course_delete_cascade check is_super_admin() instead.
      { key: 'courses.delete', label: 'Delete Courses (superseded — super admin only)' },
      { key: 'courses.packages.manage', label: 'Manage Course Packages & Installment Plans' },
      { key: 'courses.forms.manage', label: 'Manage Course Registration Forms' },
      { key: 'courses.sessions.manage', label: 'Manage Course Sessions & Venue Holds' },
      { key: 'courses.applications.view', label: 'View Course Applications' },
      { key: 'courses.applications.decide', label: 'Approve/Reject Course Applications (issues a JKKN ID)' },
      { key: 'courses.enrollments.manage', label: 'Manage Course Enrollments (withdraw, change package)' },
      { key: 'courses.billing.view', label: 'View Course Bills & Receipts' },
      { key: 'courses.billing.manage', label: 'Manage Course Billing (void bills, record offline payments)' },
      { key: 'courses.attendance.mark', label: 'Mark Course Session Attendance' },
      { key: 'courses.certificates.issue', label: 'Issue Course Certificates' },
      { key: 'courses.participant.self', label: 'View Own Course Enrollment & Bills (participant)' },
    ],
  },
  // Added 2026-04-27 — menu-coverage baseline cleanup. The /health/* tree
  // (9 sub-pages) had no MENU_PERMISSIONS entries and no catalog category;
  // every non-super-admin was hidden from Health & Wellness. Each tier-2
  // page gets a .view key so Role-Management can toggle granularly per role.
  {
    name: 'Health & Wellness',
    key: 'health',
    permissions: [
      { key: 'health.dashboard.view', label: 'View Health Dashboard' },
      { key: 'health.profile.view', label: 'View My Health Profile' },
      { key: 'health.leaderboard.view', label: 'View Health Leaderboard' },
      { key: 'health.sports.view', label: 'View Sports Profile' },
      { key: 'health.fitness.view', label: 'View Fitness Tests' },
      { key: 'health.training.view', label: 'View Training Log' },
      { key: 'health.achievements.view', label: 'View Achievements' },
      { key: 'health.assessments.view', label: 'View Mental Health Check-In' },
      { key: 'health.counselor.view', label: 'View Counselor Dashboard' },
      { key: 'health.programs.view', label: 'View Wellness Programs' },
      { key: 'health.programs.manage', label: 'Manage Wellness Programs' },
      // Added 2026-07-30 — tournament permission approver inbox. Gates
      // /health/sports/approvals AND the health_tournament_permissions RLS
      // policy, so the same key decides the page and the rows: granting it in
      // Role Management is the whole switch. Director-locked path is two
      // parties — the Physical Director files for the squad, the Principal
      // decides — so this belongs to the Principal and NOT to the role that
      // files, which would let one person approve their own request.
      { key: 'health.sports.approve', label: 'Approve Tournament Permission Requests' },
      // The other half of the two-party path. Grants FILING one request for a
      // whole squad (and reading back only what you filed) — deliberately a
      // different key from .approve so no single holder can do both.
      { key: 'health.sports.file_request', label: 'File Tournament Permission for a Squad' }
    ]
  },
  // Added 2026-06-22 — Sports Tournament Conducting (PR1). A tournament is an
  // events row (event_type='sports_tournament') on the shared events platform;
  // these keys gate the /events/tournament UI and the tournament_divisions RLS.
  // Granted to the new `sports_coordinator` role (see migration
  // 20260622110716_sports_tournament_pr1.sql).
  {
    name: 'Sports Tournaments',
    key: 'sports',
    permissions: [
      // browse = student-facing read-only page (/events/tournaments): open tournaments
      // + divisions + Register link. Never exposes entries, payments, budget or sponsors.
      // Granted to the student role; `view` gates the ADMIN subtree instead.
      { key: 'sports.tournaments.browse', label: 'Browse Open Tournaments (Students)' },
      { key: 'sports.tournaments.view', label: 'View Sports Tournaments (Admin)' },
      { key: 'sports.tournaments.create', label: 'Create Sports Tournaments' },
      { key: 'sports.tournaments.edit', label: 'Edit Sports Tournaments' },
      { key: 'sports.tournaments.manage', label: 'Manage Sports Tournaments (Divisions, Lifecycle)' }
    ]
  },
  // Added 2026-04-27 — IMS (Inventory Management System) module integration
  // into MyJKKN role-based access. Taxonomy follows Admission CRM precedent
  // (module-level granularity ~28 keys) plus critical action keys for
  // financial/audit separation: indents.approve, stock.adjust, sales.refund,
  // grn.receive, transfers.{dispatch,receive}. The lowercase 'ims' key maps
  // to module display name 'IMS' via module-mappings.ts derivation rule.
  {
    name: 'IMS',
    key: 'ims',
    permissions: [
      // Gateway — required for any access to /ims/*
      { key: 'ims.view', label: 'Access IMS Module' },

      // Dashboard & Financial overview
      { key: 'ims.dashboard.view', label: 'View IMS Dashboard' },
      { key: 'ims.financial.view', label: 'View IMS Financial Audit' },

      // Indents (request → approval workflow)
      { key: 'ims.indents.view', label: 'View Indent Requests' },
      { key: 'ims.indents.create', label: 'Create Indent Requests' },
      { key: 'ims.indents.edit', label: 'Edit Indent Requests' },
      { key: 'ims.indents.delete', label: 'Delete Indent Requests' },
      { key: 'ims.indents.approve', label: 'Approve / Reject Indent Requests' },

      // Inventory (items + categories)
      { key: 'ims.inventory.view', label: 'View Inventory Items' },
      { key: 'ims.inventory.create', label: 'Create Inventory Items' },
      { key: 'ims.inventory.edit', label: 'Edit Inventory Items' },
      { key: 'ims.inventory.delete', label: 'Delete Inventory Items' },
      { key: 'ims.inventory.bulk_import', label: 'Bulk Import Inventory (Excel)' },
      { key: 'ims.inventory.categories.manage', label: 'Manage Item Categories' },
      // Propose, don't apply. A role holding this (and NOT ims.inventory.edit)
      // opens the item form as normal, but Save raises a change request for a
      // super admin to approve — approving is what writes to the item.
      { key: 'ims.inventory.propose_edit', label: 'Request Item Changes (needs approval)' },
      { key: 'ims.inventory.approve_changes', label: 'Approve / Reject Item Change Requests' },

      // Stock (visibility + adjustments + GRN lifecycle)
      { key: 'ims.stock.view', label: 'View Stock (Summary, Batches, Department)' },
      { key: 'ims.stock.adjust', label: 'Adjust Stock (Write-off, Correction)' },
      { key: 'ims.stock.grn.view', label: 'View Goods Received Notes' },
      { key: 'ims.stock.grn.create', label: 'Create Goods Received Notes' },
      { key: 'ims.stock.grn.edit', label: 'Edit Goods Received Notes' },
      { key: 'ims.stock.grn.receive', label: 'Receive / Post Goods Received Notes' },

      // Sales (POS + refunds)
      { key: 'ims.sales.view', label: 'View Sales & History' },
      { key: 'ims.sales.create', label: 'Create Sales (POS)' },
      { key: 'ims.sales.refund', label: 'Refund / Void Sales' },

      // Inter-store / Inter-institution Transfers (supply shipments)
      { key: 'ims.transfers.view', label: 'View Supply Shipments / Transfers' },
      { key: 'ims.transfers.dispatch', label: 'Dispatch Supply Shipments' },
      { key: 'ims.transfers.receive', label: 'Receive Supply Shipments' },

      // Reports
      { key: 'ims.reports.view', label: 'View IMS Reports (Stock / Sales / Consumption / Indents / UPI)' },

      // Settings (master data)
      { key: 'ims.settings.view', label: 'View IMS Settings' },
      { key: 'ims.settings.stores.manage', label: 'Manage IMS Stores' },
      { key: 'ims.settings.suppliers.manage', label: 'Manage Suppliers' },
      { key: 'ims.settings.units.manage', label: 'Manage Units & Unit Conversions' },

      // Store Kits (PR-K2, 2026-07-12) — per-group item kits at the central
      // store. Spec: specs/store-kit-entitlements-spec-2026-07-12.md.
      // Grant NOTHING until the grn_verify rollout (feature ships dark).
      { key: 'ims.kits.view', label: 'View Kit Rules & Entitlements' },
      { key: 'ims.kits.manage', label: 'Manage Kit Rules (central store team)' },
      { key: 'ims.kits.handover', label: 'Record Kit Handovers (counter)' },
      { key: 'ims.kits.billing_flags.view', label: 'View Kit Billing Flags (accounts)' },
      { key: 'ims.kits.my.view', label: 'See My Kit (learners & staff self view)' }
    ]
  },
  {
    // Added 2026-07-07 — Centralized Procurement module (Phase 0).
    // Module-agnostic purchasing spine (PR → RFQ → Quotation → PO → GRN →
    // three-way-match), IMS as the first registered domain. Gateway key
    // `procurement.view` protects the /procurement tree; step-specific keys
    // separate raising a request (request_create) from approving it
    // (request_approve) and creating a PO (po_create) from approving it
    // (po_approve), so a store clerk can't self-approve their own spend.
    // Plan: docs/centralized-store/PLAN-procurement-v1.md §7.
    name: 'Procurement',
    key: 'procurement',
    permissions: [
      // Gateway — required for any access to /procurement/*
      { key: 'procurement.view', label: 'Access Procurement Module' },

      // Purchase Requests / Requisitions (raise vs approve are separate)
      { key: 'procurement.request_create', label: 'Create Purchase Requests' },
      { key: 'procurement.request_approve', label: 'Approve / Reject Purchase Requisitions' },

      // RFQ + Vendor Quotations
      { key: 'procurement.rfq_manage', label: 'Manage RFQs & Requirement Lists' },
      { key: 'procurement.rfq_approve', label: 'Review & Approve RFQs (before sending to vendors)' },
      { key: 'procurement.quotation_manage', label: 'Upload & Compare Vendor Quotations' },

      // Purchase Orders (create vs approve are separate)
      { key: 'procurement.po_create', label: 'Create Purchase Orders' },
      { key: 'procurement.po_approve', label: 'Approve / Reject Purchase Orders' },

      // Goods Receipt & three-way verification
      { key: 'procurement.grn_create', label: 'Create Goods Receipt Notes (against PO)' },
      { key: 'procurement.grn_verify', label: 'Verify GRNs (three-way match, post to inventory)' },

      // Vendor master
      { key: 'procurement.vendor_manage', label: 'Manage Vendors (procurement master data)' }
    ]
  },
  {
    // Added 2026-05-04 — AI Pulse module v3 (events-extension)
    // Spec: specs/myjkkn-ai-pulse-spec.md (PR #641, merged)
    // Substrate: PR #644 (wave-a1/ai-pulse-events-extension)
    // RLS hardening: PR #715 (wave-a1.1/ai-pulse-rls-hardening)
    //
    // Champion = Krishnaveni; Co-Champion = Ranjith (Ranjith@jkkn.ac.in)
    // Class Incharge reuses existing class_incharges table — no new role.
    name: 'AI Pulse',
    key: 'ai_pulse',
    permissions: [
      // Module-root visibility — gates the AI Pulse sidebar section.
      { key: 'ai_pulse.view', label: 'View AI Pulse Module' },
      // Learner self-service
      { key: 'aiPulse:view.self', label: 'View own AI Pulse cycle status' },
      { key: 'aiPulse:submit.domain_sync', label: 'Submit Domain-Sync artifact' },
      { key: 'aiPulse:submit.quiz', label: 'Submit live or async quiz' },
      { key: 'aiPulse:submit.publication', label: 'Submit IG/GitHub publication URLs' },
      { key: 'aiPulse:opt_out.leaderboard_individual', label: 'Opt out of leaderboard individual appearance' },
      // Class Incharge (reuses class_incharges table for section scoping)
      { key: 'aiPulse:rotation.manage', label: 'Manage section team rotation' },
      { key: 'aiPulse:attendance.mark', label: 'Mark live + async attendance' },
      { key: 'aiPulse:absence.escalate', label: 'Escalate Domain-Sync absence' },
      // Faculty (Lab Judge)
      { key: 'aiPulse:lab.score', label: 'Score Monday Lab presentation' },
      { key: 'aiPulse:gold.select', label: 'Select Gold Standard team' },
      { key: 'aiPulse:absence.excuse', label: 'Approve excused absence' },
      // Department Head
      { key: 'aiPulse:dept.heatmap', label: 'View department heatmap' },
      { key: 'aiPulse:dept.intervene', label: 'Trigger HOD-chat intervention' },
      // AI Pulse Champion + Co-Champion
      { key: 'aiPulse:cycles.manage', label: 'Manage weekly cycles (create/cancel/postpone)' },
      { key: 'aiPulse:topics.set', label: 'Set briefing topic per cycle' },
      { key: 'aiPulse:tool.feature', label: 'Pick featured tool per cycle + manage master list' },
      { key: 'aiPulse:anomaly.review', label: 'Review algorithmic anomaly flags monthly' },
      { key: 'aiPulse:quiz.author', label: 'Author bilingual quiz per cycle' },
      // External Judge (quarterly)
      { key: 'aiPulse:gold.judge_quarterly', label: 'Judge Gold Standard quarterly' },
      // IQAC
      { key: 'aiPulse:naac.evidence_export', label: 'Export NAAC evidence pack' },
      // Super Admin
      { key: 'aiPulse:policies.manage', label: 'Manage AI Pulse policies' },
      { key: 'aiPulse:value_lists.manage', label: 'Manage AI Pulse value-list master tables' }
    ]
  },
  {
    // HR/Appraisal Program — Phase 0 prerequisites (2026-05-07)
    // Spec set: specs/{SAMS-SLICE-1,HR-LEAVE-ACTIVATION,HR-ATTENDANCE-LIVE,
    // PROMOTION-RULEBOOK,VERIFIED-PUBLICATIONS,STUDENT-FEEDBACK}-SPEC.md
    // Plan set: docs/plans/2026-05-07-{module}-plan.md (6 modules + coordination)
    // 23 keys gated by this PR (#TBD); module pages land in subsequent PRs.
    name: 'Staff Appraisal & Performance (SAMS)',
    key: 'sams',
    permissions: [
      { key: 'sams.appraisal.self.read', label: 'Read own appraisal' },
      { key: 'sams.appraisal.self.write', label: 'Write own appraisal (before submit)' },
      { key: 'sams.appraisal.review', label: 'Review and approve appraisals (HoD/Principal)' },
      { key: 'sams.cycle.manage', label: 'Create / manage appraisal cycles' },
      { key: 'sams.metric.config', label: 'Configure metric definitions' },
      { key: 'sams.threshold.write', label: 'Tune metric thresholds (super-admin)' }
    ]
  },
  {
    name: 'Promotion & Career',
    key: 'hr_promotion',
    permissions: [
      { key: 'hr.promotion.criteria.write', label: 'Configure promotion criteria' },
      { key: 'hr.promotion.case.create', label: 'Create promotion case for candidate' },
      { key: 'hr.promotion.case.view', label: 'View promotion case-sheet' },
      { key: 'hr.promotion.case.decide', label: 'Director decision on promotion (approve / reject)' }
    ]
  },
  {
    // Single category for the whole `feedback.*` namespace — category keys
    // MUST be unique across PERMISSION_CATEGORIES (consumers look up by key).
    // Covers two features:
    //   1. Student Feedback (Course × Faculty) — feedback.student_course_faculty.*
    //   2. Universal Feedback Spine dashboard (/feedback, added 2026-06-26) —
    //      feedback.view grants non-admin roles (e.g. a dedicated feedback
    //      reviewer) access to AI-classified feedback_events across all
    //      sources (session_feedback, mess, parent, ig_comment, etc.).
    //      Super-admin and admin always have access via RLS.
    name: 'Feedback',
    key: 'feedback',
    permissions: [
      { key: 'feedback.view', label: 'View Feedback Dashboard (AI-classified events)' },
      { key: 'feedback.student_course_faculty.respond', label: 'Submit feedback response (student)' },
      { key: 'feedback.student_course_faculty.template.write', label: 'Configure feedback question template' },
      { key: 'feedback.student_course_faculty.faculty_view', label: 'View own ratings (faculty)' },
      { key: 'feedback.student_course_faculty.aggregate.view', label: 'View department aggregates (HoD)' }
    ]
  },
  {
    name: 'Research & Publications',
    key: 'research_publications',
    permissions: [
      { key: 'sh.publications.enrich', label: 'Enrich own publication entries (faculty)' },
      { key: 'sh.publications.verify', label: 'Verify publication entries (research-cell)' },
      { key: 'sh.publications.dashboard', label: 'Director progress dashboard' }
    ]
  },
  {
    // Phase 0 add-ons to existing HR scope (attendance config + leave dispute)
    name: 'HR Configuration (Phase 0)',
    key: 'hr_phase_0_config',
    permissions: [
      { key: 'hr.attendance.status_types.write', label: 'Configure attendance status types' },
      { key: 'hr.attendance.thresholds.write', label: 'Configure attendance thresholds' },
      { key: 'hr.leave.policies.write', label: 'Configure leave cadre policies' },
      { key: 'hr.leave.balance.dispute', label: 'Submit leave balance correction request' },
      { key: 'hr.leave.dispute.approve', label: 'Approve leave balance correction' },
      { key: 'admin.departments.hod.write', label: 'Assign Head of Department to a department' }
    ]
  },
  {
    // Platform Configuration — super_admin scope today (sidebar gates via 'super_admin'),
    // granular keys registered for forward-compat so admin-cell roles can be granted
    // ai_models.view without a sidebar rewrite. 2026-05-09.
    name: 'Platform Configuration',
    key: 'platform_config',
    permissions: [
      { key: 'platform.ai_models.view', label: 'View AI Model Config (provider/model + usage)' },
      { key: 'platform.ai_models.write', label: 'Change AI Model Config (provider/model + spend caps)' }
    ]
  },
  // ======================================================================
  // Module-root visibility for sections that have no other catalog entry.
  // These keys gate sidebar sections only — granular permissions for
  // sub-pages live in their respective module categories where applicable.
  // Added 2026-05-09 to close catalog gaps surfaced by the sidebar audit.
  // ======================================================================
  {
    name: 'Faculty',
    key: 'faculty',
    permissions: [
      { key: 'faculty.view', label: 'View Faculty Module' }
    ]
  },
  {
    name: 'Learning',
    key: 'learn',
    permissions: [
      { key: 'learn.view', label: 'View Learning Module' }
    ]
  },
  {
    name: 'Meetings',
    key: 'meetings',
    permissions: [
      { key: 'meetings.view', label: 'View Meetings Module' },
      // Universal Booking module reconcile (2026-06-19): catalog keys for the
      // 8 Calendly-parity surfaces merged in PRs #1466–#1474. RLS on the
      // routing/workflows/polls/contacts/webhooks tables references these via
      // user_has_permission(); registering them here makes them grantable in
      // Role Management. Super-admin bypass still applies.
      { key: 'meetings.routing.view', label: 'View Routing Forms' },
      { key: 'meetings.routing.manage', label: 'Manage Routing Forms' },
      { key: 'meetings.workflows.view', label: 'View Workflows' },
      { key: 'meetings.workflows.create', label: 'Create Workflows' },
      { key: 'meetings.workflows.edit', label: 'Edit Workflows' },
      { key: 'meetings.workflows.delete', label: 'Delete Workflows' },
      { key: 'meetings.polls.view', label: 'View Meeting Polls' },
      { key: 'meetings.polls.manage', label: 'Manage Meeting Polls' },
      { key: 'meetings.contacts.view', label: 'View Contacts' },
      // Business-card scanner. Replaces the job type's original
      // allow_rule = 'seat_owner', which resolved to the AI natural-language
      // QUERY feature's seat list — one user — and so locked the whole team out
      // of a feature Director decision 1 opens to everyone.
      { key: 'meetings.contacts.scan', label: 'Scan Business Cards' },
      { key: 'meetings.embed.manage', label: 'Manage Embed & Theming' },
      { key: 'meetings.analytics.view', label: 'View Meeting Analytics' },
      { key: 'meetings.webhooks.view', label: 'View Webhooks' },
      { key: 'meetings.webhooks.manage', label: 'Manage Webhooks' },
      // Recurring series + scheduling rules (Monthly Slate, pieces 1 and 2).
      // The RLS policies on meeting_recurring_series and the two rules tables
      // reference these via user_has_permission(); registering them here makes
      // them grantable in Role Management. The EAO reaches the Director's own
      // series through the EXISTING meeting_host_delegates link, so these keys
      // are for anyone else who needs the surface — not a replacement for it.
      { key: 'meetings.series.view', label: 'View Recurring Series' },
      { key: 'meetings.series.manage', label: 'Manage Recurring Series & Scheduling Rules' }
    ]
  },
  // ======================================================================
  // CDC (Career Development Centre) — 2026-05-21.
  // Closes the gap flagged in lib/permissions-audit/module-mappings.ts:196
  // ("CDC tables exist; no permission catalog yet"). RLS continues to honour
  // cdc_head / cdc_coordinator roles via is_cdc_head_or_super() helpers; the
  // helpers were extended in the same migration to OR with user_has_permission()
  // so custom roles granted cdc.* keys also pass RLS without losing the
  // existing hardcoded paths.
  // ======================================================================
  {
    name: 'Career Development Centre',
    key: 'cdc',
    permissions: [
      { key: 'cdc.view', label: 'View CDC Module (sidebar group)' },

      // Campus Drives
      { key: 'cdc.drives.view', label: 'View Campus Drives' },
      { key: 'cdc.drives.create', label: 'Create Campus Drives' },
      { key: 'cdc.drives.edit', label: 'Edit Campus Drives' },
      { key: 'cdc.drives.delete', label: 'Delete Campus Drives' },

      // Placements
      { key: 'cdc.placements.view', label: 'View Placements' },
      { key: 'cdc.placements.create', label: 'Create Placement Records' },
      { key: 'cdc.placements.edit', label: 'Edit Placement Records' },
      { key: 'cdc.placements.delete', label: 'Delete Placement Records' },

      // Internships
      { key: 'cdc.internships.view', label: 'View Internships' },
      { key: 'cdc.internships.create', label: 'Create Internship Records' },
      { key: 'cdc.internships.edit', label: 'Edit Internship Records' },
      { key: 'cdc.internships.delete', label: 'Delete Internship Records' },

      // Individual Development Plans
      { key: 'cdc.idp.view', label: 'View Individual Development Plans' },
      { key: 'cdc.idp.create', label: 'Create Individual Development Plans' },
      { key: 'cdc.idp.edit', label: 'Edit Individual Development Plans' },
      { key: 'cdc.idp.delete', label: 'Delete Individual Development Plans' },

      // Clubs
      { key: 'cdc.clubs.view', label: 'View Clubs' },
      { key: 'cdc.clubs.create', label: 'Create Clubs' },
      { key: 'cdc.clubs.edit', label: 'Edit Clubs' },
      { key: 'cdc.clubs.delete', label: 'Delete Clubs' },

      // Mentor Pairings
      { key: 'cdc.mentors.view', label: 'View Mentor Pairings' },
      { key: 'cdc.mentors.create', label: 'Create Mentor Pairings' },
      { key: 'cdc.mentors.edit', label: 'Edit Mentor Pairings' },
      { key: 'cdc.mentors.delete', label: 'Delete Mentor Pairings' },

      // Training Programmes
      { key: 'cdc.training.view', label: 'View Training Programmes' },
      { key: 'cdc.training.create', label: 'Create Training Programmes' },
      { key: 'cdc.training.edit', label: 'Edit Training Programmes' },
      { key: 'cdc.training.delete', label: 'Delete Training Programmes' },

      // UNNATI → UDYOG application tracker (BUG-004075)
      { key: 'cdc.udyog.view', label: 'View UDYOG Application Tracker' },
      { key: 'cdc.udyog.manage', label: 'Manage UDYOG Application Requirements' },

      // Opportunities Bulletin
      { key: 'cdc.bulletin.view', label: 'View Opportunities Bulletin' },
      { key: 'cdc.bulletin.create', label: 'Create Opportunities Bulletin Entries' },
      { key: 'cdc.bulletin.edit', label: 'Edit Opportunities Bulletin Entries' },
      { key: 'cdc.bulletin.delete', label: 'Delete Opportunities Bulletin Entries' },

      // Employer Requirement Intake (company job-vacancy submissions)
      { key: 'cdc.requirements.view', label: 'View Employer Requirements' },
      { key: 'cdc.requirements.create', label: 'Create Employer Requirements' },
      { key: 'cdc.requirements.edit', label: 'Edit Employer Requirements' },
      { key: 'cdc.requirements.delete', label: 'Delete Employer Requirements' },
      { key: 'cdc.requirements.review', label: 'Review / Approve Employer Requirement Submissions' },

      // Industry Mentors directory
      { key: 'cdc.industry_mentors.view', label: 'View Industry Mentors' },
      { key: 'cdc.industry_mentors.create', label: 'Create Industry Mentors' },
      { key: 'cdc.industry_mentors.edit', label: 'Edit Industry Mentors' },
      { key: 'cdc.industry_mentors.delete', label: 'Delete Industry Mentors' },

      // Industry Partners directory (public.industry_partners — COMPANIES, not
      // the individual mentors above). Read-only module: the business-card
      // scanner is the only writer today, so no create/edit/delete keys exist
      // yet. Add them when a manual-entry surface is actually built.
      { key: 'cdc.industry_partners.view', label: 'View Industry Partners' },

      // Reports & Exports (NAAC / AICTE / flex)
      { key: 'cdc.exports.view', label: 'View CDC Reports & Exports Page' },
      { key: 'cdc.exports.download', label: 'Download CDC Reports (NAAC / AICTE / CSV)' },

      // Government Job Readiness (TNPSC / RRB / banking / SSC / TN Police) — 2026-07-04.
      // Gates the /cdc/govt-readiness cohort-overlap view. Backfilled onto
      // cdc_head / cdc_coordinator via 20260704090200 migration.
      { key: 'cdc.govt_readiness.view', label: 'View Government Job Readiness (exam overlap)' }
    ]
  },
  // ======================================================================
  // Internship Module — operational permissions for cycles, sites,
  // preceptors, vehicles, and the learner journey (logbook, evaluations,
  // attendance, incidents, certificates). Distinct from CDC's
  // `cdc.internships.*` keys (which model placement-style internship records
  // within Career Development Centre). The /internships/* route family
  // shipped in PR #1209 used `super_admin` as a sidebar-permission stopgap;
  // these keys (added with this catalog) replace it so role-managed access
  // can scope cycles/sites/preceptors/vehicles per institution. The
  // `/internships/policy/*` admin-tier routes (relocated from `/admin/internship-policy/*`)
  // intentionally remain on `super_admin` (Director-only).
  // ======================================================================
  {
    name: 'Internship Module',
    key: 'internship',
    permissions: [
      // Internship Cycles (master scheduling period: dates, eligibility, capacity)
      { key: 'internship.cycles.view', label: 'View Internship Cycles' },
      { key: 'internship.cycles.create', label: 'Create Internship Cycle' },
      { key: 'internship.cycles.edit', label: 'Edit Internship Cycle' },
      { key: 'internship.cycles.delete', label: 'Delete Internship Cycle' },
      { key: 'internship.cycles.activate', label: 'Activate / Close Internship Cycle' },

      // Internship Sites (hospitals, clinics, industry partners hosting learners)
      { key: 'internship.sites.view', label: 'View Internship Sites' },
      { key: 'internship.sites.create', label: 'Create Internship Site' },
      { key: 'internship.sites.edit', label: 'Edit Internship Site' },
      { key: 'internship.sites.delete', label: 'Delete Internship Site' },

      // Preceptors (clinical instructors / site supervisors)
      { key: 'internship.preceptors.view', label: 'View Preceptors' },
      { key: 'internship.preceptors.create', label: 'Create Preceptor' },
      { key: 'internship.preceptors.edit', label: 'Edit Preceptor' },
      { key: 'internship.preceptors.delete', label: 'Delete Preceptor' },

      // Vehicles (transport allocation for internship rotations)
      { key: 'internship.vehicles.view', label: 'View Internship Vehicles' },
      { key: 'internship.vehicles.create', label: 'Create Internship Vehicle' },
      { key: 'internship.vehicles.edit', label: 'Edit Internship Vehicle' },
      { key: 'internship.vehicles.delete', label: 'Delete Internship Vehicle' },

      // Assignments (learner → site / preceptor / vehicle for a cycle)
      { key: 'internship.assignments.view', label: 'View Internship Assignments' },
      { key: 'internship.assignments.create', label: 'Create Internship Assignment' },
      { key: 'internship.assignments.edit', label: 'Edit Internship Assignment' },
      { key: 'internship.assignments.delete', label: 'Delete Internship Assignment' },

      // Logbook (learner-submitted daily / case-based entries)
      { key: 'internship.logbook.view', label: 'View Internship Logbook' },
      { key: 'internship.logbook.submit', label: 'Submit Logbook Entry' },
      { key: 'internship.logbook.approve', label: 'Approve / Reject Logbook Entry' },

      // Evaluations (preceptor / faculty evaluations of learner performance)
      { key: 'internship.evaluations.view', label: 'View Internship Evaluations' },
      { key: 'internship.evaluations.submit', label: 'Submit Internship Evaluation' },
      { key: 'internship.evaluations.approve', label: 'Approve / Finalise Internship Evaluation' },

      // Attendance (rotation attendance, with override for late corrections)
      { key: 'internship.attendance.view', label: 'View Internship Attendance' },
      { key: 'internship.attendance.mark', label: 'Mark Internship Attendance' },
      { key: 'internship.attendance.override', label: 'Override Internship Attendance Record' },

      // Incidents (site / safety / clinical incidents during rotations)
      { key: 'internship.incidents.view', label: 'View Internship Incidents' },
      { key: 'internship.incidents.report', label: 'Report Internship Incident' },
      { key: 'internship.incidents.escalate', label: 'Escalate Internship Incident' },

      // Certificates (completion certificates issued at end of internship)
      { key: 'internship.certificates.view', label: 'View Internship Certificates' },
      { key: 'internship.certificates.generate', label: 'Generate Internship Certificate' }
    ]
  },
  {
    // Social Media module (/admission/social/* + /admission/inbox/* surfaces).
    // Added 2026-06-11 — retrofit from SuperAdminOnly to granular keys.
    // Top-level `social.*` namespace ON PURPOSE (not `admission.social.*`):
    // PermissionGuard gives counselor / admission-global users a blanket
    // bypass for `admission.*` module keys, which would silently open
    // Dept Accounts (API keys), Meta Pixel and Audiences to every counselor.
    // RLS policies and API routes gate on these same keys.
    name: 'Social Media',
    key: 'social',
    permissions: [
      { key: 'social.view', label: 'View Social Hub Overview' },
      { key: 'social.insights.view', label: 'View Social Insights' },
      { key: 'social.instagram.view', label: 'View Instagram Analytics' },
      { key: 'social.instagram.manage', label: 'Manage Instagram Accounts (connect / discover / sync)' },
      { key: 'social.facebook.view', label: 'View Facebook Analytics' },
      { key: 'social.facebook.manage', label: 'Manage Facebook Pages (discover / sync)' },
      { key: 'social.lead_ads.view', label: 'View Lead Ads' },
      { key: 'social.lead_ads.manage', label: 'Manage Lead Ads (sync forms / field mappings / test)' },
      { key: 'social.ads.view', label: 'View Ads Insights' },
      { key: 'social.ads.manage', label: 'Manage Ad Accounts (discover / sync)' },
      { key: 'social.departments.view', label: 'View Department Social Accounts' },
      { key: 'social.departments.manage', label: 'Manage Department Social Accounts' },
      { key: 'social.attribution.view', label: 'View Attribution Reports' },
      { key: 'social.attribution.edit', label: 'Edit Attribution Window Policy' },
      { key: 'social.meta_pixel.view', label: 'View Meta Pixel Events' },
      { key: 'social.meta_pixel.manage', label: 'Manage Meta Pixel Configuration' },
      { key: 'social.meta_audiences.view', label: 'View Meta Audiences' },
      { key: 'social.meta_audiences.manage', label: 'Manage Meta Audiences' },
      { key: 'social.messenger.view', label: 'View Messenger / Instagram Inbox' },
      { key: 'social.messenger.send', label: 'Send Messenger / Instagram Replies' },
      // Added 2026-06-18 — Director's-View governance consequences surface.
      // Read-only page at /admission/social/governance that turns each live
      // social policy value into a plain-English consequence ("threshold = N
      // days → M handles flagged dormant"). Gated alongside social.view today;
      // its own key keeps future fine-grained control available.
      { key: 'social.governance.view', label: "View Social Governance (Director's View)" },
      // 2026-08-05 — social_loop_playbook's INSERT and UPDATE policies name
      // this key and nothing else, so the playbook that records what the social
      // loop learned from each cycle could only ever be written by a super
      // admin. Kept as one broad key because the table is a single artefact
      // that is either yours to keep or not.
      { key: 'social.manage', label: 'Write the Social Loop Playbook' }
    ]
  },
  // Added 2026-06-15 — catalog-coverage fix. MENU_PERMISSIONS enforces
  // rcltp.config.manage for /rcltp (MyJKKN reading-assessment module) but the
  // module had no PERMISSION_CATEGORIES entry, failing the repo-wide
  // permissions-catalog gate on every open PR and hiding the toggle from the
  // Role-Management Edit dialog.
  // Added 2026-07-28 — grantability fix. Eight rcltp.* keys were already being
  // enforced by page guards and RLS policies, but only rcltp.config.manage was
  // registered here. Role Management builds its checkboxes from this list, so
  // the other seven could never be granted through the UI (they had been seeded
  // straight into custom_roles rows), and rcltp.question.approve — required by
  // /rcltp/teacher/questions and by the rcltp_pbq_update_review policy — was
  // held by zero of 81 roles, making question approval super-admin-only.
  {
    name: 'RCLTP',
    key: 'rcltp',
    permissions: [
      { key: 'rcltp.config.manage', label: 'Manage RCLTP Config' },
      { key: 'rcltp.question.approve', label: 'Approve RCLTP Comprehension Questions' },
      { key: 'rcltp.review', label: 'Review & Approve RCLTP Remedial Plans' },
      { key: 'rcltp.assessment.manage', label: 'Manage RCLTP Assessments' },
      { key: 'rcltp.assessment.take', label: 'Take RCLTP Assessments' },
      { key: 'rcltp.report.view_all', label: 'View All RCLTP Reports' },
      { key: 'rcltp.report.view_class', label: 'View RCLTP Reports for a Section' },
      { key: 'rcltp.report.view_child', label: 'View RCLTP Reports for Own Ward' },
      { key: 'rcltp.report.view_own', label: 'View Own RCLTP Reports' },
      // 2026-08-02 — rcltp_badges, rcltp_learner_badges and rcltp_streaks all
      // gate on these two keys, neither of which existed here.
      { key: 'rcltp.reward.view', label: 'View RCLTP Badges & Streaks' },
      { key: 'rcltp.reward.config', label: 'Configure RCLTP Badges & Streak Rules' }
    ]
  },
  {
    // Attention Bar — 2026-08-02. The module had ZERO registered permission
    // keys while six tables (quick_action_audit, quick_action_config,
    // quick_action_rules, quick_action_state_queries,
    // notification_generator_config and its audit table) already carried RLS
    // policies calling user_has_permission() on these four. A key that is
    // registered nowhere cannot be granted anywhere, so those policies could
    // only ever pass for is_super_admin()/is_admin(). This registers them so
    // the access is grantable; it grants nothing to anybody by itself.
    name: 'Attention Bar',
    key: 'attention_bar',
    permissions: [
      { key: 'attention_bar.rules.view', label: 'View Attention Bar Rules' },
      { key: 'attention_bar.rules.manage', label: 'Manage Attention Bar Rules & Notification Generators' },
      { key: 'attention_bar.config.manage', label: 'Manage Attention Bar Config' },
      { key: 'attention_bar.audit.view', label: 'View Attention Bar Action Audit Trail' }
    ]
  },
  {
    name: 'Calendar',
    key: 'calendar',
    permissions: [
      { key: 'calendar.view', label: 'View Calendar' },
      { key: 'calendar.people_leave.view', label: 'View Person-Level Leave on Calendar' },
      // Added 2026-08-05 with the COE-backed calendar chips. Granted to every
      // staff role but NOT to learners (migration 20260805130000). The Exam
      // Schedule chip has no key of its own — it rides on calendar.view.
      { key: 'calendar.coe_calendar.view', label: 'View COE Academic Calendar on Calendar' },
      { key: 'calendar.holidays.manage', label: 'Manage Common Holidays & Events' },
      { key: 'calendar.config.manage', label: 'Manage Calendar Config (Feeds, Categories)' }
    ]
  },
  {
    // Added 2026-06-30 — Schools Network module. Tracks JKKN's K-12 outreach
    // (external schools + JKKN's own Matric/CBSE schools): sessions conducted,
    // contributions made, JKKN-side owners (outreach_coordinator /
    // program_lead faceted by program_partner_id), and program-partner
    // funding chains (CSR / grants / corporate sponsors).
    //
    // Two new application roles in custom_roles seed the access pattern:
    //   - outreach_coordinator — own assigned schools (via school_jkkn_owners)
    //   - program_lead         — schools their program partner touches
    // Super-admin / admin bypass via the canonical RLS triad.
    //
    // RLS policies on schools / school_contacts / school_sessions /
    // school_contributions / school_jkkn_owners / program_partners /
    // program_partner_grants reference these keys directly. Keep this catalog
    // and the spec section 5 role seeds in lock-step.
    name: 'Schools Network',
    key: 'schools_network',
    permissions: [
      { key: 'schools_network.schools.view', label: 'View Schools' },
      { key: 'schools_network.schools.create', label: 'Create Schools' },
      { key: 'schools_network.schools.edit', label: 'Edit Schools' },
      { key: 'schools_network.schools.delete', label: 'Delete Schools' },
      { key: 'schools_network.contacts.view', label: 'View School Contacts (HM / principal / teachers)' },
      { key: 'schools_network.contacts.create', label: 'Add School Contacts' },
      { key: 'schools_network.contacts.edit', label: 'Edit School Contacts' },
      { key: 'schools_network.sessions.view', label: 'View School Sessions' },
      { key: 'schools_network.sessions.create', label: 'Log School Sessions' },
      { key: 'schools_network.sessions.edit', label: 'Edit School Sessions' },
      { key: 'schools_network.contributions.view', label: 'View School Contributions' },
      { key: 'schools_network.contributions.create', label: 'Log School Contributions' },
      { key: 'schools_network.contributions.edit', label: 'Edit School Contributions' },
      { key: 'schools_network.owners.view', label: 'View JKKN-side Owner Assignments' },
      { key: 'schools_network.owners.manage', label: 'Assign / Revoke JKKN-side Owners' },
      { key: 'schools_network.partners.view', label: 'View Program Partners' },
      { key: 'schools_network.partners.edit', label: 'Edit Program Partners' },
      { key: 'schools_network.partners.manage', label: 'Manage Program Partners (create / archive)' },
      { key: 'schools_network.grants.view', label: 'View Program Partner Grants' },
      { key: 'schools_network.grants.manage', label: 'Manage Program Partner Grants' },
      { key: 'schools_network.master.view', label: 'View Schools Network Master Lists' },
      { key: 'schools_network.master.manage', label: 'Manage Schools Network Master Lists (session types, partner types, contact roles)' },
      { key: 'schools_network.portal.write', label: 'HM Portal Write Access (future v2)' }
    ]
  },
  {
    // Added 2026-07-05 — Cohort Core (shared cohort spine). Keys referenced by
    // RLS on cohort_* tables (cohorts / cohort_memberships / cohort_status_events;
    // migration 20260731040000_cohort_core_spine.sql). SELECT→cohort.view,
    // INSERT→cohort.create, UPDATE→cohort.edit, DELETE→cohort.manage. Grant
    // 'cohort.manage' to cohort coordinators; super_admin/admin bypass every policy.
    //
    // ⚠ THE FOUR KEYS ABOVE ARE PROGRAMME-BLIND. The spine's RLS is not scoped per
    // cohort kind, so any of them reaches EVERY programme sharing these tables —
    // sf100, foundations, cdc, trainer, mba_associate and school_of_influence
    // alike — within the holder's institution scope. Grant them only to someone
    // meant to run cohorts across the board.
    //
    // For a coordinator of ONE programme, use the programme-scoped keys below
    // instead. Added 2026-08-01, migration
    // 20260808220000_cohort_programme_scoped_permission_keys.sql. They are backed
    // by additional policies that sit BESIDE the four broad ones (the broad ones
    // are untouched), each pinned to kind='school_of_influence', and they open the
    // same doors for that programme and no other. Same action→key mapping:
    // SELECT→.view, INSERT→.create, UPDATE→.edit, DELETE→.manage; .manage also
    // opens fn_soi_can_manage_batch and fn_soi_can_review_applications, which gate
    // every School of Influence RPC.
    //
    // Grant a School of Influence coordinator ALL FOUR narrow keys together. The
    // .view key is load-bearing on the write paths, not merely a read convenience:
    // CohortService.createMembership does .insert().select().single(), so without
    // the read-back the accept lands the row, returns nothing, throws, and leaves
    // an orphan membership with the application still showing 'pending'.
    name: 'Cohort Core',
    key: 'cohort',
    permissions: [
      { key: 'cohort.view', label: 'View Cohorts (ALL programmes)' },
      { key: 'cohort.create', label: 'Create Cohorts (ALL programmes)' },
      { key: 'cohort.edit', label: 'Edit Cohorts (ALL programmes)' },
      { key: 'cohort.manage', label: 'Manage Cohorts (ALL programmes — delete, remove members, admin)' },
      { key: 'cohort.school_of_influence.view', label: 'School of Influencer — View batches and members' },
      { key: 'cohort.school_of_influence.create', label: 'School of Influencer — Create batches, accept applicants' },
      { key: 'cohort.school_of_influence.edit', label: 'School of Influencer — Edit batches and member status' },
      { key: 'cohort.school_of_influence.manage', label: 'School of Influencer — Run the programme (attendance, review queue, remove members)' }
    ]
  },
  {
    // Added 2026-07-23 — ID Card substrate (Phase 1A). Keys referenced by RLS
    // on id_card_templates / id_card_print_jobs and the student-photos storage
    // bucket (migration 20260507150000_id_card_substrate.sql). Seeded to
    // registrar + admission (admin keys) and student (my-cards.view) in the
    // same migration; super_admin/admin bypass every policy.
    name: 'ID Cards',
    key: 'id_cards',
    permissions: [
      { key: 'id_cards.templates.view', label: 'View ID Card Templates' },
      { key: 'id_cards.templates.create', label: 'Create ID Card Templates' },
      { key: 'id_cards.templates.edit', label: 'Edit ID Card Templates' },
      { key: 'id_cards.templates.delete', label: 'Delete ID Card Templates' },
      { key: 'id_cards.jobs.view', label: 'View All ID Card Print Jobs' },
      { key: 'id_cards.jobs.manage', label: 'Enqueue Print Jobs + Resolve Failures' },
      { key: 'id_cards.my-cards.view', label: 'View My Own ID Card Status' }
    ]
  },
  {
    // Added 2026-08-05 — Transport had NO category at all. Seventeen tms.* keys
    // are enforced by RLS across tms_route / tms_route_stop /
    // tms_route_possible_stop / tms_vehicle / tms_driver / tms_driver_mobile /
    // tms_transport_vacate_request and the four gps_* tables, and not one of
    // them existed in this catalog — so on 24 live routes, 35 vehicles and 31
    // drivers, every write and almost every read was refused for every role
    // except the super-admin bypass, silently and with an empty screen.
    name: 'Transport',
    key: 'tms',
    permissions: [
      // Routes — one key set covers the route, its stops, and the candidate
      // stops considered when planning it; the RLS treats the three as one
      // object because editing a route means editing its stop list.
      { key: 'tms.routes.view', label: 'View Routes & Stops' },
      { key: 'tms.routes.create', label: 'Create Routes & Stops' },
      { key: 'tms.routes.edit', label: 'Edit Routes & Stops' },
      { key: 'tms.routes.delete', label: 'Delete Routes & Stops' },

      // Vehicles
      { key: 'tms.vehicles.view', label: 'View Vehicles' },
      { key: 'tms.vehicles.create', label: 'Add Vehicles' },
      { key: 'tms.vehicles.edit', label: 'Edit Vehicles' },
      { key: 'tms.vehicles.delete', label: 'Delete Vehicles' },

      // Drivers. The register is view / manage; the mobile numbers are split
      // into their own four keys because a driver's phone number is personal
      // contact data and should be grantable separately from the roster.
      { key: 'tms.drivers.view', label: 'View Drivers' },
      { key: 'tms.drivers.manage', label: 'Add, Edit & Remove Drivers' },
      { key: 'tms.driver_mobiles.view', label: 'View Driver Mobile Numbers' },
      { key: 'tms.driver_mobiles.create', label: 'Add Driver Mobile Numbers' },
      { key: 'tms.driver_mobiles.edit', label: 'Edit Driver Mobile Numbers' },
      { key: 'tms.driver_mobiles.delete', label: 'Delete Driver Mobile Numbers' },

      // GPS. tracking.view is read-only live position and alerts;
      // settings.manage is the device register, sync jobs and location
      // history — i.e. the ability to change or erase the tracking record.
      { key: 'tms.tracking.view', label: 'View Live Vehicle Tracking & GPS Alerts' },
      { key: 'tms.settings.manage', label: 'Manage GPS Devices, Sync Jobs & Location History' },

      // Transport vacate requests (a learner stopping the bus service)
      { key: 'tms.vacate.view', label: 'View Transport Vacate Requests' }
    ]
  },
  {
    // Added 2026-08-05 — Referrals had NO category either. All four keys are
    // enforced by RLS on referral_categories, referral_category_eligibility,
    // referral_form_definitions / _fields and the referrals inbox, and none
    // was registered, so the referral programme could only be set up by a
    // super admin.
    name: 'Referrals',
    key: 'referrals',
    permissions: [
      { key: 'referrals.inbox.view', label: 'View the Referral Inbox' },
      { key: 'referrals.categories.manage', label: 'Manage Referral Categories' },
      { key: 'referrals.eligibility.manage', label: 'Manage Referral Category Eligibility' },
      { key: 'referrals.forms.manage', label: 'Manage Referral Forms & Fields' }
    ]
  }
];

export const PERMISSIONS = {
  // Notification permissions
  MANAGE_NOTIFICATIONS: 'manage_notifications',
  SEND_NOTIFICATIONS: 'send_notifications',
  VIEW_ALL_NOTIFICATIONS: 'view_all_notifications'
} as const;
