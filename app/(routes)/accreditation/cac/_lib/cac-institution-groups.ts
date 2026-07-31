/**
 * Splitting the 14 institution rows into the three groups the metrics table shows.
 *
 * The Director's third locked decision was "all institutions, with schools shown
 * separately". Listing the 14 rows for the first time showed why the decision
 * needed a third group as well: four of them are not teaching institutions at
 * all. Jicate Solutions is the software vendor, JKKN Main Office is
 * administration, Nattraja Incubation Forum is an incubator, and JKKN Testing
 * Institution is test data. Publications and pass percentage against a test
 * fixture are not an honest empty row — they are noise that makes the real
 * empty rows harder to see. So they get their own group, collapsed, rather than
 * being dropped (dropping them silently would hide that they exist) or mixed in.
 *
 * How each group is decided, and why:
 *
 *   Colleges — `iqac_code IS NOT NULL`. This is not a new rule invented here:
 *   `useJKKNInstitutions()` in use-body-dashboard.ts already treats exactly that
 *   filter as "the colleges", and the eight rows carrying a code (ALHD, ASAI,
 *   ASSF, DENT, EDUC, ENGG, NURS, PHAR) are precisely the eight colleges.
 *   Reusing the existing marker means a ninth college gets a row the day it is
 *   given a code, with no edit here.
 *
 *   Schools — named explicitly below, because NO column separates them. Both
 *   schools carry `iqac_code = null` and `institution_type = 'self'`, which is
 *   also true of the four non-teaching rows. Name matching is deliberate over a
 *   hardcoded UUID: identifiers differ between production and staging, names do
 *   not, so a UUID list would silently mis-group every environment but one.
 *
 *   Other JKKN entities — the fallback. Anything that is neither is placed here
 *   rather than discarded. That direction matters: a new school added before
 *   someone updates the list below appears in the wrong group, which is visible
 *   and fixable. The opposite default would make it vanish.
 *
 * Pure and standalone for the same reason as its two neighbours in this folder:
 * the page imports the Supabase client at module scope and will not load under
 * vitest.
 */

export interface GroupableInstitution {
  id: string;
  name: string;
  iqac_code: string | null;
}

export type InstitutionGroupId = 'colleges' | 'schools' | 'other';

export interface InstitutionGroup {
  id: InstitutionGroupId;
  /** Heading shown above the group's rows. */
  title: string;
  /** One line saying what the group is, so the split needs no explaining. */
  note: string;
  /** Collapsed on first render. Only the non-teaching group is. */
  collapsedByDefault: boolean;
  institutions: GroupableInstitution[];
}

/**
 * The two schools, by name.
 *
 * Compared case-insensitively and whitespace-trimmed, because these are typed
 * values in an editable table rather than constants.
 */
export const SCHOOL_NAMES: readonly string[] = [
  'JKKN Matric Higher Secondary School',
  'Nattraja Vidhyalya CBSE',
] as const;

const normalise = (name: string) => name.trim().toLowerCase();

const SCHOOL_KEYS = new Set(SCHOOL_NAMES.map(normalise));

export function isSchool(inst: GroupableInstitution): boolean {
  return SCHOOL_KEYS.has(normalise(inst.name));
}

export function isCollege(inst: GroupableInstitution): boolean {
  return Boolean(inst.iqac_code && inst.iqac_code.trim().length > 0);
}

/**
 * Group every institution handed in, losing none of them.
 *
 * Returns all three groups even when one is empty, so the page's headings do not
 * appear and disappear depending on what the viewer's RLS lets through.
 */
export function groupInstitutions(
  institutions: GroupableInstitution[],
): InstitutionGroup[] {
  const colleges: GroupableInstitution[] = [];
  const schools: GroupableInstitution[] = [];
  const other: GroupableInstitution[] = [];

  // A college is decided first: were a school ever given an iqac_code, the code
  // is the stronger signal and the explicit name list has become stale.
  for (const inst of institutions) {
    if (isCollege(inst)) colleges.push(inst);
    else if (isSchool(inst)) schools.push(inst);
    else other.push(inst);
  }

  const byName = (a: GroupableInstitution, b: GroupableInstitution) =>
    a.name.localeCompare(b.name);

  return [
    {
      id: 'colleges',
      title: 'Colleges',
      note: 'Institutions carrying an IQAC code.',
      collapsedByDefault: false,
      institutions: colleges.sort((a, b) =>
        (a.iqac_code ?? '').localeCompare(b.iqac_code ?? ''),
      ),
    },
    {
      id: 'schools',
      title: 'Schools',
      note: 'Shown apart from the colleges: several metrics below cannot apply to a school.',
      collapsedByDefault: false,
      institutions: schools.sort(byName),
    },
    {
      id: 'other',
      title: 'Other JKKN entities',
      note: 'Not teaching institutions — an office, an incubator, the software vendor and a test record. Listed so nothing is hidden, but academic metrics do not describe them.',
      collapsedByDefault: true,
      institutions: other.sort(byName),
    },
  ];
}

/** Label shape `[CODE] Name`, matching the council surfaces on this same page. */
export function groupedInstitutionLabel(inst: GroupableInstitution): string {
  return `${inst.iqac_code ? `[${inst.iqac_code}] ` : ''}${inst.name}`;
}
