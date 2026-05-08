// lib/services/bos/courses-schemas.ts
import { z } from 'zod';

export const COURSE_PART_VALUES = ['Part I','Part II','Part III','Part IV','Part V'] as const;

export const COURSE_CATEGORY_VALUES = [
  'Theory','Practical','Project','Non Academic',
  'Theory + Practical','Theory + Project',
  'Field Work','Community Service','Group Project',
] as const;

export const COURSE_TYPE_VALUES = [
  'Ability Enhancement','Additional Credit course','Advance learner course',
  'Audit Course','Bridge course','Core Practical','Core',
  'Discipline Specific elective Practical','Discipline Specific elective',
  'Elective Practical','Elective','English',
  'Extra Disciplinary Elective Practical','Extra Disciplinary',
  'Foundation Course','Generic Elective Practical','Generic Elective',
  'Internship','Language','Naanmuthalvan','Non Academic',
  'Non Major Elective Practical','Non Major Elective',
  'Practical','Project',
  'Skill Enhancement Practical','Skill Enhancement',
] as const;

export const COURSE_GROUP_VALUES = [
  'General','Elective - I','Elective - II','Elective - III',
  'Elective - IV','Elective - V','Elective - VI',
] as const;

/** Manual form schema — exactly the 13 fields per design Section 2. */
export const courseFormSchema = z.object({
  course_code:       z.string().min(3).max(50).regex(/^[A-Z0-9]+$/i, 'Letters & digits only'),
  course_name:       z.string().min(3).max(255),
  course_category:   z.enum(COURSE_CATEGORY_VALUES),
  course_part_master: z.enum(COURSE_PART_VALUES),
  course_type:       z.enum(COURSE_TYPE_VALUES),
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
  ctx: { institution_code: string; regulation_code: string; institutions_id: string; regulation_id?: string }
) {
  return {
    institutions_id: ctx.institutions_id,
    regulation_id: ctx.regulation_id,
    institution_code: ctx.institution_code,
    regulation_code: ctx.regulation_code,
    course_code: form.course_code.toUpperCase(),
    course_name: form.course_name.trim(),
    display_code: form.course_code.toUpperCase(),  // mirror; UNIQUE in DB
    course_category: form.course_category,
    course_type: form.course_type,
    course_part_master: form.course_part_master,
    credit: form.credit,
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
