// lib/services/bos/courses-schemas.ts
import { z } from 'zod';
import type { AcademicModel } from '@/types/bos';
import { isTempCourseCode } from '@/lib/services/bos/academic-model';

export const COURSE_PART_VALUES = ['Part I','Part II','Part III','Part IV','Part V'] as const;

export const COURSE_CATEGORY_VALUES = [
  'Theory','Practical','Project','Non Academic',
  'Theory + Practical','Theory + Project',
  'Field Work','Community Service','Group Project',
  // Nursing (inc_nursing): courses combine Theory + Lab/Skill-Lab + Clinical.
  // "Practical" here covers the lab/skill-lab hours; clinical is captured in
  // the syllabus nursing_workload (COE course row has no clinical field).
  'Clinical','Theory + Clinical','Theory + Practical + Clinical',
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
  // AICTE / Anna University engineering categories (used by CET and other
  // engineering institutions). These are the canonical Type strings the
  // bos-curriculum-pdf-to-import skill writes, so keeping them here lets the
  // manual New Course form offer them and lets Zod accept imported rows.
  'Engineering Science Courses','Professional Core Courses','Programme Elective',
  'Open Elective Courses','Employability Enhancement Courses',
  // Nursing (INC B.Sc Nursing) course heads. The INC curriculum categorises
  // courses as Foundational / Core / Elective, plus Mandatory Modules and
  // Self-study/Co-curricular (SSCC). Written by the bos-curriculum-pdf-to-import
  // nursing branch.
  'Foundational Course','Core Course','Elective Course',
  'Mandatory Module','Self-study/Co-curricular',
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

/**
 * Institutions that don't use the TN arts-college Part I–V / Roman-numeral
 * Level tiers (e.g., engineering, pharmacy). For these, the course form, import
 * template, and list table skip the Part & Level fields entirely.
 *   CET — engineering (Anna).
 *   COP — College of Pharmacy (both B.Pharm PCI-CBCS and Pharm.D Dr.MGR): PCI
 *         CBCS and the Dr. MGR year model have no Part/Level tiers.
 *   CNR — College of Nursing (INC B.Sc Nursing / TNMGRMU): competency-based,
 *         no Part/Level tiers.
 */
const PART_LEVEL_EXEMPT_CODES = new Set(['CET', 'COP', 'CNR']);

export function institutionSkipsPartLevel(institutionCode?: string | null): boolean {
  return PART_LEVEL_EXEMPT_CODES.has((institutionCode ?? '').trim().toUpperCase());
}

/**
 * Manual course form schema — model-aware.
 *   anna_univ / pci_pharm (B.Pharm) — semester + credits + coded courses: the
 *     original strict shape (code, credit, hours, category all required).
 *   mgr_ahs / mgr_pharmd (Pharm.D, AHS) — year-based, code-less, no credits:
 *     credit / hours / category become optional (source carries none), and an
 *     `academic_year` (1..6) is accepted. Codes are still validated by the
 *     alnum regex — Pharm.D uses generated alnum TEMP codes (see academic-model.ts
 *     makePharmdTempCode) which satisfy it.
 */
export function makeCourseFormSchema(model: AcademicModel = 'anna_univ') {
  const yearBased = model === 'mgr_ahs' || model === 'mgr_pharmd';
  // Dental (BDS/DCI): year-based, real codes that carry '-'/'/' separators
  // (e.g. 4201-P, 4223/P), no credits/category in source. Treat its Anna-only
  // fields as optional (like the year models) and widen the code charset.
  const dental = model === 'mgr_bds';
  const relaxed = yearBased || dental;
  // Nursing (INC) records per-SEMESTER contact hours (Theory 40–120, Clinical
  // 160+), not the engineering weekly L-T-P triple, so the 40-cap must lift.
  const nursing = model === 'inc_nursing';
  const HOURS_CAP = nursing ? 1200 : 40;
  // BDS course codes contain '-' and '/' (4201-P, 4223/P); every other model's
  // codes are strictly alphanumeric.
  const codeRe = dental ? /^[A-Z0-9/-]+$/i : /^[A-Z0-9]+$/i;
  const num = () => z.coerce.number().min(0).max(10);
  const hrs = () => z.coerce.number().int().min(0).max(HOURS_CAP);
  const mark = () => z.coerce.number().int().min(0);
  return z.object({
    course_code:       z.string().min(3).max(50).regex(codeRe, dental ? 'Letters, digits, - and / only' : 'Letters & digits only'),
    course_name:       z.string().min(3).max(255),
    board_id:          z.string().uuid('Select a board'),
    // Year/dental models have no course category in source.
    course_category:   relaxed ? z.enum(COURSE_CATEGORY_VALUES).optional() : z.enum(COURSE_CATEGORY_VALUES),
    // Optional: PG (and some non-tiered) courses don't carry a Part designation.
    course_part_master: z.enum(COURSE_PART_VALUES).optional(),
    // Optional: some courses (PG, audit, bridge, etc.) have no Type at creation.
    course_type:       z.enum(COURSE_TYPE_VALUES).optional(),
    // Optional: non-tiered courses (Internship, Project) have no Roman level.
    course_level:      z.enum(COURSE_LEVEL_VALUES).optional(),
    exam_duration:     z.coerce.number().int().min(0).max(8),
    // Pharm.D/AHS/BDS carry hours only, no credits → optional there.
    credit:            relaxed ? num().optional() : num(),
    theory_hours:      relaxed ? hrs().optional() : hrs(),
    // Optional — most courses have no tutorial component; blank defaults to 0.
    tutorial_hours:    hrs().optional().default(0),
    practical_hours:   relaxed ? hrs().optional() : hrs(),
    // No upper cap on marks — the max total varies by subject; only floor (>=0)
    // and integer-ness are enforced. Year/dental models may omit marks.
    //
    // *_max_mark is the QUESTION-PAPER ceiling (an ESE may be written for 100).
    // It is COE-owned: the Max Marks form no longer renders it, it only carries
    // the loaded value so an edit round-trips it untouched. Hence optional for
    // every model — a create simply defaults it to the converted mark.
    internal_max_mark: mark().optional(),
    external_max_mark: mark().optional(),
    // *_converted_mark is the WEIGHTAGE the component carries in total_max_mark
    // (that 100-mark paper may scale down to 50). This is the pair the Max Marks
    // form edits, so it inherits the required-ness the max pair used to have.
    internal_converted_mark: relaxed ? mark().optional() : mark(),
    external_converted_mark: relaxed ? mark().optional() : mark(),
    total_max_mark:    relaxed ? mark().optional() : mark(),
    // Year models (Pharm.D 1..5, AHS 1..3) locate the course by academic year.
    academic_year:     z.coerce.number().int().min(1).max(6).optional(),
  });
}

/** Default (anna_univ) schema — kept for back-compat with existing importers. */
export const courseFormSchema = makeCourseFormSchema('anna_univ');

// Input type: derived from the loosest (year-based) schema so the payload
// builder tolerates the optional pharmacy/AHS fields. Anna callers still pass
// every field; the extra optionality never rejects a valid strict payload.
export type CourseFormInput = z.infer<ReturnType<typeof makeCourseFormSchema>>;

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
    /**
     * Academic model for this course (resolved from the board). Pharmacy/AHS
     * (pci_pharm / mgr_pharmd / mgr_ahs) skip the CIA+ESE default and forward
     * academic_year. Defaults to 'anna_univ'.
     */
    academic_model?: AcademicModel;
  }
) {
  const model = ctx.academic_model ?? 'anna_univ';
  // Pharm.D/AHS and BDS have no Anna CIA+ESE scheme and no credits.
  const yearBased = model === 'mgr_ahs' || model === 'mgr_pharmd' || model === 'mgr_bds';
  const theory = form.theory_hours ?? 0;
  const tutorial = form.tutorial_hours ?? 0;
  const practical = form.practical_hours ?? 0;
  // The form edits the CONVERTED marks (the CIA/ESE weightage that sums to
  // total_max_mark). On a create the paper ceiling has no independent source, so
  // it defaults to the converted mark — they're equal for a normal course, and
  // a Theory+Practical course's real ceiling (ESE out of 100 → 50) is set later
  // in COE. An explicit *_max_mark only ever arrives from an edit round-trip.
  const internal = form.internal_converted_mark ?? form.internal_max_mark ?? 0;
  const external = form.external_converted_mark ?? form.external_max_mark ?? 0;
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
    // persists, the GET response will read back correctly. Year models
    // (Pharm.D/AHS) carry no credits → send null.
    credit: form.credit ?? null,
    credits: form.credit ?? null,
    exam_duration: form.exam_duration,
    theory_hours: theory,
    tutorial_hours: tutorial,
    practical_hours: practical,
    class_hours: theory + tutorial + practical,
    internal_max_mark: form.internal_max_mark ?? internal,
    external_max_mark: form.external_max_mark ?? external,
    internal_converted_mark: internal,
    external_converted_mark: external,
    // Always derived from the converted pair — never from the paper ceilings, and
    // never from a caller-supplied total. This is the value COE stores as the
    // course's headline total (e.g. CIA 50 + converted ESE 50 = 100, not 150).
    total_max_mark: internal + external,
    // Year model locator (Pharm.D 1..5, AHS 1..3). NOTE: requires the matching
    // COE `courses.academic_year` column — see the COE-repo hand-off in the COP
    // tech spec (§5.2). Harmless (ignored) until COE adds the column.
    academic_year: form.academic_year ?? null,
    is_temp_code: isTempCourseCode(form.course_code),
    // sensible defaults — pharmacy/AHS don't use the Anna CIA+ESE scheme.
    evaluation_type: yearBased ? null : ('CIA + ESE' as const),
    result_type: 'Mark' as const,
    status: true,
    credit_included: !yearBased,
    has_hall_ticket: true,
  };
}

/** Bulk import row schema — same as form + a 1-based row index for error reporting. */
export function makeImportRowSchema(model: AcademicModel = 'anna_univ') {
  return makeCourseFormSchema(model).extend({ __row: z.number().int().min(1) });
}
export const importRowSchema = makeImportRowSchema('anna_univ');

/** Client-side pre-upload validation of parsed Excel rows — board_id is
 *  picked in the import dialog (not typed in Excel), so it's omitted here. */
export function makeImportRowClientSchema(model: AcademicModel = 'anna_univ') {
  return makeCourseFormSchema(model).omit({ board_id: true });
}
export const importRowClientSchema = makeImportRowClientSchema('anna_univ');