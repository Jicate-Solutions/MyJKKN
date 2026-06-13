// lib/services/bos/courses-schemas.ts
import { z } from 'zod';

export const COURSE_PART_VALUES = ['Part I','Part II','Part III','Part IV','Part V'] as const;

export const COURSE_CATEGORY_VALUES = [
  'Theory','Practical','Project','Non Academic',
  'Theory + Practical','Theory + Project',
  'Field Work','Community Service','Group Project',
] as const;

/**
 * Fallback list of course_type values. The live source of truth is COE's
 * GET /api/v1/course-info — surfaced via the `useCourseTypes` hook and the
 * `/api/bos/course-info` proxy. This array is kept ONLY for:
 *   - Excel import templates generated offline (no COE round-trip at build time)
 *   - Smoke/unit tests that should not network to COE
 * COE may add new types at any time, so do NOT validate user input against this.
 */
export const COURSE_TYPE_VALUES = [
  'Ability Enhancement','Additional Credit course','Advance learner course',
  'Audit Course','Bridge course','Core Practical','Core',
  'Discipline Specific elective Practical','Discipline Specific elective',
  'Elective Practical','Elective','English',
  'Extra Disciplinary Elective Practical','Extra Disciplinary',
  'Foundation Course','Generic Elective Practical','Generic Elective',
  'Internship','Language','Naanmuthalvan','Non Academic',
  'Non Major Elective Practical','Non Major Elective',
  'Practical','Professional Competency Skill','Project',
  'Skill Enhancement Practical','Skill Enhancement',
] as const;

export const COURSE_GROUP_VALUES = [
  'General','Elective - I','Elective - II','Elective - III',
  'Elective - IV','Elective - V','Elective - VI',
] as const;

/** Roman numerals I..XX (1..20) — COE pairs (course_type, course_level) into
 *  course_type_code (e.g., "Core" + "I" => "Core-I"). */
export const COURSE_LEVEL_VALUES = [
  'I','II','III','IV','V','VI','VII','VIII','IX','X',
  'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX',
] as const;

/** Manual form schema — exactly the 13 fields per design Section 2. */
export const courseFormSchema = z.object({
  course_code:       z.string().min(3).max(50).regex(/^[A-Z0-9]+$/i, 'Letters & digits only'),
  course_name:       z.string().min(3).max(255),
  board_id:          z.string().uuid('Select a board'),
  course_category:   z.enum(COURSE_CATEGORY_VALUES),
  // Optional: PG (and some non-tiered) courses don't carry a Part designation.
  // Allow blank so the form doesn't force "Part III" onto a PG row.
  course_part_master: z.enum(COURSE_PART_VALUES).optional(),
  // Optional: same rationale as course_part_master — some courses (PG, audit,
  // bridge, etc.) genuinely have no Type at the time of creation. Blank is
  // valid; don't force "Core" on save.
  course_type:       z.enum(COURSE_TYPE_VALUES).optional(),
  // Optional: some legacy / non-tiered courses (e.g., Internship, Project) have
  // no Roman-numeral level. Allow blank rather than forcing a default that
  // could silently corrupt those rows on save.
  course_level:      z.enum(COURSE_LEVEL_VALUES).optional(),
  exam_duration:     z.coerce.number().int().min(0).max(8),
  credit:            z.coerce.number().min(0).max(10),
  theory_hours:      z.coerce.number().int().min(0).max(40),
  practical_hours:   z.coerce.number().int().min(0).max(40),
  internal_max_mark: z.coerce.number().int().min(0).max(100),
  external_max_mark: z.coerce.number().int().min(0).max(100),
  total_max_mark:    z.coerce.number().int().min(0).max(200),
});

export type CourseFormInput = z.infer<typeof courseFormSchema>;

/** Server-side payload to POST to COE — adds defaults the form omits. */
export function toCoeCreatePayload(
  form: CourseFormInput,
  ctx: {
    institution_code: string;
    regulation_code: string;
    institutions_id: string;
    regulation_id?: string;
    /**
     * Board the course belongs to (COE board_code). Required for the
     * board-scope filter on /bos/courses to surface the new row; without it
     * the course is created with no board association and is invisible to
     * non-super-admin viewers.
     */
    board_code?: string;
    board_id?: string;
  }
) {
  return {
    institutions_id: ctx.institutions_id,
    regulation_id: ctx.regulation_id,
    institution_code: ctx.institution_code,
    regulation_code: ctx.regulation_code,
    // Pass both forms so COE persists whichever it expects.
    board_code: ctx.board_code,
    board_id: ctx.board_id,
    course_code: form.course_code.toUpperCase(),
    course_name: form.course_name.trim(),
    course_title: form.course_name.trim(),   // COE POST endpoint requires course_title
    display_code: form.course_code.toUpperCase(),  // mirror; UNIQUE in DB
    // QP (Question Paper) code mirrors the course_code by default. COE expects
    // it on the question paper join; defaulting to course_code keeps the
    // mapping 1:1 unless an institution explicitly overrides.
    qp_code: form.course_code.toUpperCase(),
    course_category: form.course_category,
    course_type: form.course_type,
    course_level: form.course_level,
    course_part_master: form.course_part_master,
    // COE accepts both `credit` (singular, canonical) and `credits` (plural
    // alias) in different code paths. Send both so whichever the POST endpoint
    // persists, the GET response will read back correctly.
    credit: form.credit,
    credits: form.credit,
    exam_duration: form.exam_duration,
    theory_hours: form.theory_hours,
    practical_hours: form.practical_hours,
    class_hours: form.theory_hours + form.practical_hours,
    internal_max_mark: form.internal_max_mark,
    external_max_mark: form.external_max_mark,
    total_max_mark: form.internal_max_mark + form.external_max_mark,
    // sensible defaults
    evaluation_type: 'CIA + ESE' as const,
    result_type: 'Mark' as const,
    status: true,
    credit_included: true,
    has_hall_ticket: true,
  };
}

/** Bulk import row schema — same as form + a 1-based row index for error reporting. */
export const importRowSchema = courseFormSchema.extend({
  __row: z.number().int().min(1),
});