// Designation of a recruitment job, read from the WORDS IN ITS TITLE
// (BUG-006259).
//
// jkkn-terminology: official-hr-designations
// (Official HR job titles keep their exact wording — Director ruling 2026-10-09.)
//
// hr_recruitment_jobs has no designation column: the designation is typed
// freely into `title`, in mixed case, with abbreviations ("ASST PROF"),
// typos ("LAB ASSISSTANT") and suffixes ("Professor-Pedagogy of Computer
// Science", "TUTOR -  AHS"). This maps a title onto ONE fixed designation so
// the approvals list can be filtered by it.
//
// Each title gets exactly one designation, checked most-specific first, so
// "Professor" never also catches "Associate Professor" / "Assistant
// Professor", and "Lecturer" never also catches "Senior Lecturer".

export type JobDesignation =
  | 'professor'
  | 'associate_professor'
  | 'assistant_professor'
  | 'reader'
  | 'senior_lecturer'
  | 'lecturer'
  | 'tutor'
  | 'lab_assistant'
  | 'principal'
  | 'other';

/** Fixed option order for the filter dropdown. */
export const JOB_DESIGNATION_OPTIONS: ReadonlyArray<{
  value: JobDesignation;
  label: string;
}> = [
  { value: 'professor', label: 'Professor' },
  { value: 'associate_professor', label: 'Associate Professor' },
  { value: 'assistant_professor', label: 'Assistant Professor' },
  { value: 'reader', label: 'Reader' },
  { value: 'senior_lecturer', label: 'Senior Lecturer' },
  { value: 'lecturer', label: 'Lecturer' },
  { value: 'tutor', label: 'Tutor' },
  { value: 'lab_assistant', label: 'Lab Assistant' },
  { value: 'principal', label: 'Principal' },
  { value: 'other', label: 'Other' },
];

export const JOB_DESIGNATION_LABELS: Record<JobDesignation, string> =
  Object.fromEntries(
    JOB_DESIGNATION_OPTIONS.map((o) => [o.value, o.label])
  ) as Record<JobDesignation, string>;

/** Upper-case, letters only, single-spaced, common abbreviations/typos expanded. */
function normaliseTitle(title: string): string {
  return ` ${title.toUpperCase().replace(/[^A-Z]+/g, ' ').trim()} `
    .replace(/ ASSISSTANT /g, ' ASSISTANT ')
    .replace(/ ASST /g, ' ASSISTANT ')
    .replace(/ ASSOC /g, ' ASSOCIATE ')
    .replace(/ ASSO /g, ' ASSOCIATE ')
    .replace(/ PROF /g, ' PROFESSOR ');
}

// Most specific first; the first match wins.
const RULES: ReadonlyArray<[JobDesignation, RegExp]> = [
  ['associate_professor', / ASSOCIATE PROFESSOR /],
  ['assistant_professor', / ASSISTANT PROFESSOR /],
  ['professor', / PROFESSOR /],
  ['reader', / READER /],
  ['senior_lecturer', / SENIOR LECTURER /],
  ['lecturer', / LECTURER /],
  ['tutor', / TUTOR /],
  ['lab_assistant', / LAB(ORATORY)? ASSISTANT /],
  ['principal', / PRINCIPAL /],
];

/** The one designation a job title reads as; 'other' when none applies. */
export function designationOfJobTitle(
  title: string | null | undefined
): JobDesignation {
  if (!title) return 'other';
  const t = normaliseTitle(title);
  for (const [designation, re] of RULES) {
    if (re.test(t)) return designation;
  }
  return 'other';
}

/** True when the title reads as the given designation. */
export function jobTitleMatchesDesignation(
  title: string | null | undefined,
  designation: JobDesignation
): boolean {
  return designationOfJobTitle(title) === designation;
}
