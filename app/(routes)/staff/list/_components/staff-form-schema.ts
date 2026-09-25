import { z } from 'zod';
import { validatePhone } from '@/lib/utils/staff-field-validators';

/** Relationship choices for the staff emergency contact; 'Other' reveals a text box. */
export const EMERGENCY_RELATIONSHIPS = [
  'Father',
  'Mother',
  'Spouse',
  'Brother',
  'Sister',
  'Son',
  'Daughter',
  'Guardian',
  'Friend',
  'Other'
] as const;

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
  // Emergency contact (2026-09-25). Optional as a whole, but a half-filled
  // contact is rejected in applyStaffRules. For relationship "Other", the
  // typed text lives in emergency_contact_relationship_other and replaces
  // 'Other' on submit.
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_relationship: z.string().optional().nullable(),
  emergency_contact_relationship_other: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
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
// Required for a PUBLISHED profile (owner's ruling on BUG-005982, option B).
// The messages are spelled out because a bare "Required" / "Invalid input" in
// a toast does not tell a HOD which box to fill.
const qualificationItemSchema = z.object({
  degree: z.string({ required_error: 'Degree is required' }).min(1, 'Degree is required'),
  institution: z
    .string({ required_error: 'Institution is required' })
    .min(1, 'Institution is required'),
  year: z.union([z.string(), z.number()], {
    errorMap: () => ({ message: 'Year is required' })
  }),
  specialization: z.string().optional(),
});
const specialisationItemSchema = z.object({ name: z.string().min(1) });
const experienceEntryItemSchema = z.object({
  role: z.string({ required_error: 'Role is required' }).min(1, 'Role is required'),
  organisation: z
    .string({ required_error: 'Organisation is required' })
    .min(1, 'Organisation is required'),
  from: z.string({ required_error: 'From year is required' }).min(1, 'From year is required'),
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

// Cross-field rules shared by the strict combined schema and the form resolver.
// Typed loosely because both object shapes carry every field these rules read.
function applyStaffRules(
  data: {
    login_enabled?: boolean;
    email?: string;
    institution_email?: string;
    biometric_id?: string | null;
    biometric_institution_id?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_relationship?: string | null;
    emergency_contact_relationship_other?: string | null;
    emergency_contact_phone?: string | null;
  },
  ctx: z.RefinementCtx
) {
    // Emergency contact: all-or-nothing on name + phone, so a record never
    // carries a number with no one to ask for, or a name with no number.
    const ecName = data.emergency_contact_name?.trim() ?? '';
    const ecPhone = data.emergency_contact_phone?.trim() ?? '';
    const ecRelation = data.emergency_contact_relationship?.trim() ?? '';
    if (ecName || ecPhone || ecRelation) {
      if (!ecName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['emergency_contact_name'],
          message: 'Emergency contact name is required when a contact is entered'
        });
      }
      if (!ecPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['emergency_contact_phone'],
          message: 'Emergency contact phone is required when a contact is entered'
        });
      }
    }
    if (ecPhone && !validatePhone(ecPhone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergency_contact_phone'],
        message: 'Enter a valid phone number (at least 10 digits)'
      });
    }
    if (ecRelation === 'Other' && !data.emergency_contact_relationship_other?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergency_contact_relationship_other'],
        message: 'Specify the relationship'
      });
    }

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
}

// Strict combined schema: every public-profile repeater row validated.
export const fullStaffSchema = basicStaffSchema
  .merge(extendedStaffSchema)
  .superRefine(applyStaffRules);

// The form resolver's version. Identical, except repeater rows are carried
// through unvalidated. The resolver runs on EVERY save, and it used to run the
// strict row schemas too, so a published record holding a qualification with
// no year could not be saved by anyone — and because the invalid handler only
// knows basic fields, the click did nothing and said nothing (BUG-005982,
// BUG-005983; 20 active staff affected on 2026-09-15). The strict rows are
// enforced in onSubmit whenever the record is, or becomes, published, where a
// failure is reported with the tab and field. z.any() keeps the rows in the
// parsed output; an omitted key would be stripped and wipe the data on save.
const lenientRepeaterRows = {
  badges: z.array(z.any()),
  qualifications: z.array(z.any()),
  specialisations: z.array(z.any()),
  experience_entries: z.array(z.any()),
  research_focus_areas: z.array(z.any()),
  publications: z.array(z.any()),
  funded_projects: z.array(z.any()),
  certifications: z.array(z.any()),
  awards: z.array(z.any()),
  memberships: z.array(z.any()),
  phd_scholars_list: z.array(z.any()),
  faqs: z.array(z.any()),
  achievements: z.array(z.any())
};

const formStaffSchema = basicStaffSchema
  .merge(extendedStaffSchema.extend(lenientRepeaterRows))
  .superRefine(applyStaffRules);

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
  if (!isCreating) return formStaffSchema;

  return formStaffSchema.superRefine((data, ctx) => {
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

// Singular row labels for the repeater arrays, so an issue at
// ['qualifications', 1, 'year'] reads "Qualification 2: Year is required".
const REPEATER_ROW_LABEL: Record<string, string> = {
  badges: 'Badge',
  qualifications: 'Qualification',
  specialisations: 'Specialisation',
  experience_entries: 'Experience entry',
  research_focus_areas: 'Research focus area',
  publications: 'Publication',
  funded_projects: 'Funded project',
  certifications: 'Certification',
  awards: 'Award',
  memberships: 'Membership',
  phd_scholars_list: 'PhD scholar',
  faqs: 'FAQ',
  achievements: 'Achievement'
};

/**
 * Summarise profile validation issues for a toast: which top-level field to
 * send the user to, how many problems there are, and the first one in words.
 */
export function describeProfileIssues(issues: z.ZodIssue[]): {
  firstField: string | undefined;
  count: number;
  firstMessage: string;
} {
  const first = issues[0];
  if (!first) return { firstField: undefined, count: 0, firstMessage: '' };

  const [field, index] = first.path;
  const rowLabel = typeof field === 'string' ? REPEATER_ROW_LABEL[field] : undefined;
  const where =
    rowLabel && typeof index === 'number'
      ? `${rowLabel} ${index + 1}`
      : String(field ?? '').replace(/_/g, ' ');

  return {
    firstField: typeof field === 'string' ? field : undefined,
    count: issues.length,
    firstMessage: where ? `${where}: ${first.message}` : first.message
  };
}

export type BasicFormValues    = z.infer<typeof basicStaffSchema>;
export type ExtendedFormValues = z.infer<typeof extendedStaffSchema>;
export type StaffFormValues    = z.infer<typeof fullStaffSchema>;
