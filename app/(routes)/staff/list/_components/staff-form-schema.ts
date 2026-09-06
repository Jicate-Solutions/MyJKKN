import { z } from 'zod';

// ─── Basic schema (always required — verbatim from former inline staffSchema) ──
//
// 2026-05-15: email + institution_email become optional when login_enabled=false
// (view-only / labour staff). The required-when-login-enabled rule is enforced
// in a superRefine below so the per-field error message stays specific.
export const basicStaffSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(1, 'Last name must be at least one characters'),
  gender: z.enum(['male', 'female', 'bigender']),
  date_of_birth: z.date({
    required_error: 'Date of birth is required'
  }),
  marital_status: z.enum(['single', 'married', 'divorced', 'widow']),
  blood_group: z
    .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A1+', 'A1B'])
    .optional(),
  email: z
    .string()
    .email('Invalid email format')
    .optional()
    .or(z.literal('')),
  institution_email: z
    .string()
    .email('Invalid email format')
    .refine(
      (val) => val.toLowerCase().endsWith('@jkkn.ac.in'),
      'Institution email must use @jkkn.ac.in domain (e.g., staff@jkkn.ac.in)'
    )
    .optional()
    .or(z.literal('')),
  phone: z.string().min(10, 'Phone number must be at least 10 characters'),
  staff_id: z.string().optional(),
  // Biometric enrolment (2026-08-06). The code is the Empcode printed by the
  // attendance machine; it is meaningless without knowing WHICH machine issued
  // it, because each machine numbers its own enrolments from 1. The pairing is
  // enforced by staff_biometric_scope_chk in the database and mirrored here so
  // the user sees it before saving.
  biometric_id: z.string().optional().nullable(),
  biometric_institution_id: z.string().optional().nullable(),
  profile_picture: z.string().optional(),
  address: z.string().optional(),
  // Required since 2026-08-28, and chosen from lib/data/locations.ts rather than
  // typed. Free text had produced nine spellings of "Tamil Nadu" and 50 district
  // values for ~20 real districts. Enforced on create AND edit.
  state: z.string().min(1, 'State is required'),
  district: z.string().min(1, 'District is required'),
  pincode: z.string().optional(),
  date_of_joining: z.date({
    required_error: 'Date of joining is required'
  }),
  designation: z.string().min(2, 'Designation is required'),
  category_id: z.string().min(1, 'Category is required'),
  role_key: z.string().min(1, 'Role is required'),
  institution_id: z.string().min(1, 'Institution is required'),
  // Department is now conditionally required based on category.is_teaching (see superRefine below)
  department_id: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  // 2026-05-15: when false, staff is "view-only" — no login, emails optional.
  // The form auto-derives this from selected category's allows_login unless
  // the user has manually toggled it. The "email required when login-enabled"
  // refinement lives on fullStaffSchema below (can't .merge() a refined schema).
  login_enabled: z.boolean().default(true),
  // Optional free-form labels for fetching staff subsets via the external API.
  // Normalized (trim/lowercase/dedupe) by the TagsInput component before submit.
  tags: z.array(z.string()).default([])
});

// ─── Repeater item schemas (used inside extendedStaffSchema) ──────────────────
const badgeItemSchema = z.object({ label: z.string().min(1), color: z.string().optional() });
const qualificationItemSchema = z.object({
  degree: z.string().min(1),
  institution: z.string().min(1),
  year: z.union([z.string(), z.number()]),
  specialization: z.string().optional(),
});
const specialisationItemSchema = z.object({ name: z.string().min(1) });
const experienceEntryItemSchema = z.object({
  role: z.string().min(1),
  organisation: z.string().min(1),
  from: z.string().min(1),
  to: z.string().nullable().optional(),
  description: z.string().optional(),
});
const researchFocusItemSchema = z.object({ area: z.string().min(1), description: z.string().optional() });
const publicationItemSchema = z.object({
  title: z.string().min(1),
  journal: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  doi: z.string().optional(),
  url: z.string().url().optional().or(z.literal('')),
  type: z.string().optional(),
});
const fundedProjectItemSchema = z.object({
  title: z.string().min(1),
  agency: z.string().optional(),
  amount: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
});
const certificationItemSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  credential_url: z.string().url().optional().or(z.literal('')),
});
const awardItemSchema = z.object({
  title: z.string().min(1),
  awarded_by: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  description: z.string().optional(),
});
const membershipItemSchema = z.object({
  body: z.string().min(1),
  role: z.string().optional(),
  since: z.union([z.string(), z.number()]).optional(),
});
const phdScholarItemSchema = z.object({
  name: z.string().min(1),
  topic: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
});
const faqItemSchema = z.object({ question: z.string().min(1), answer: z.string().min(1) });
const achievementItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  date: z.string().optional(),
  featured: z.boolean().optional(),
  category: z.string().optional(),
});

// ─── Extended schema (validated only when has_extended_profile === true) ──────
export const extendedStaffSchema = z.object({
  has_extended_profile: z.boolean(),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, hyphens only').nullable().optional(),
  status: z.enum(['draft', 'published']),
  display_order: z.coerce.number().int().min(0),
  experience_years: z.coerce.number().int().min(0),
  research_papers: z.coerce.number().int().min(0),
  phd_scholars: z.coerce.number().int().min(0),
  awards_won: z.coerce.number().int().min(0),
  pg_dissertations_guided: z.coerce.number().int().min(0),
  ug_projects_guided: z.coerce.number().int().min(0),
  qualification_summary: z.string().nullable().optional(),
  professional_summary: z.string().nullable().optional(),
  mentoring_description: z.string().nullable().optional(),
  google_scholar_url: z.string().url().nullable().optional().or(z.literal('')),
  researchgate_url: z.string().url().nullable().optional().or(z.literal('')),
  orcid_url: z.string().url().nullable().optional().or(z.literal('')),
  badges: z.array(badgeItemSchema),
  qualifications: z.array(qualificationItemSchema),
  specialisations: z.array(specialisationItemSchema),
  experience_entries: z.array(experienceEntryItemSchema),
  research_focus_areas: z.array(researchFocusItemSchema),
  publications: z.array(publicationItemSchema),
  funded_projects: z.array(fundedProjectItemSchema),
  certifications: z.array(certificationItemSchema),
  awards: z.array(awardItemSchema),
  memberships: z.array(membershipItemSchema),
  phd_scholars_list: z.array(phdScholarItemSchema),
  faqs: z.array(faqItemSchema),
  achievements: z.array(achievementItemSchema),
});

// Combined schema (used at submit time when extended toggle is on AND user clicks Save & Publish)
// The login_enabled-conditional email check lives here so .merge() composes.
export const fullStaffSchema = basicStaffSchema
  .merge(extendedStaffSchema)
  .superRefine((data, ctx) => {
    // Email is required ONLY for login-enabled staff. For view-only staff
    // (login_enabled=false) the service auto-generates synthetic emails.
    if (data.login_enabled !== false && (!data.email || data.email.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'Personal email is required for login-enabled staff'
      });
    }

    // The institution email IS the login identity: sync_staff_to_profiles
    // creates the profile row with `email = NEW.institution_email`, and it
    // wraps that whole block in a non-empty check. Leave it blank on a
    // login-enabled staff member and no profile is created at all — the record
    // saves, claims login_enabled = true, and the person can never sign in.
    // Five staff were created that way before this rule existed.
    if (
      data.login_enabled !== false &&
      (!data.institution_email || data.institution_email.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['institution_email'],
        message:
          'Institution email is required for login-enabled staff — it becomes their login. Turn off "Login user" for a view-only record.'
      });
    }

    // A biometric code without its machine has no namespace — 00002 on the
    // Main Office machine and 00002 on the Dental machine are different people.
    // Mirrors staff_biometric_scope_chk so the user is told here, not by a 23514.
    const hasCode = Boolean(data.biometric_id && data.biometric_id.trim() !== '');
    if (hasCode && !data.biometric_institution_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['biometric_institution_id'],
        message: 'Choose which machine issued this code'
      });
    }
  });

/**
 * The schema actually used by the form, which differs between create and edit.
 *
 * Biometric enrolment is required when CREATING only. 351 active staff have no
 * code on file, and the Empcode is printed by the attendance machine — it is not
 * something an operator can supply from the desk. Requiring it on edit would
 * block a phone-number correction behind a physical errand, so new staff must be
 * enrolled while the existing gap is closed at its own pace.
 */
export function buildStaffSchema(isCreating: boolean) {
  if (!isCreating) return fullStaffSchema;

  return fullStaffSchema.superRefine((data, ctx) => {
    if (!data.biometric_id || data.biometric_id.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['biometric_id'],
        message: 'Biometric code is required for new staff'
      });
    }
    if (!data.biometric_institution_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['biometric_institution_id'],
        message: 'Biometric machine is required for new staff'
      });
    }
  });
}

export type BasicFormValues    = z.infer<typeof basicStaffSchema>;
export type ExtendedFormValues = z.infer<typeof extendedStaffSchema>;
export type StaffFormValues    = z.infer<typeof fullStaffSchema>;
