import { z } from 'zod';

// ─── Basic schema (always required — verbatim from former inline staffSchema) ──
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
  email: z.string().email('Invalid email format'),
  institution_email: z
    .string()
    .email('Invalid email format')
    .refine(
      (val) => val.toLowerCase().endsWith('@jkkn.ac.in'),
      'Institution email must use @jkkn.ac.in domain (e.g., staff@jkkn.ac.in)'
    )
    .optional(),
  phone: z.string().min(10, 'Phone number must be at least 10 characters'),
  staff_id: z.string().optional(),
  profile_picture: z.string().optional(),
  address: z.string().optional(),
  state: z.string().optional(),
  district: z.string().optional(),
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
  is_active: z.boolean().default(true)
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
export const fullStaffSchema = basicStaffSchema.merge(extendedStaffSchema);

export type BasicFormValues    = z.infer<typeof basicStaffSchema>;
export type ExtendedFormValues = z.infer<typeof extendedStaffSchema>;
export type StaffFormValues    = z.infer<typeof fullStaffSchema>;
