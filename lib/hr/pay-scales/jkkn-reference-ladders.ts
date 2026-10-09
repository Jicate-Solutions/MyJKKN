/**
 * JKKN pay band — reference YEAR LADDERS, as read from the workbook.
 *
 * REFERENCE ONLY (Director ruling 2026-09-18): nobody's pay changes because of
 * these figures. Nothing here reads or writes any salary table; the ladders are
 * stored additively as `ladders` inside the per-college `hr.pay_scales` policy
 * row so a person's pay can be READ against the band. A college with no pay
 * matrix at all reads its advisory band from them (see types/hr-pay-ladders.ts).
 *
 * SERVER ONLY: `import 'server-only'` below fails any build in which a client
 * file reaches this module, directly, dynamically or through another file.
 *
 * The figures live in `jkkn-reference-ladders.data.json` beside this file — the
 * pay band's own designations, with the workbook's qualification wording tidied
 * (e.g. "M.E (Mech, EEE & ECE)" is stored as "M.E (Mech/EEE/ECE)").
 * Figures were read cell by cell from `JKKN Salary Band.xlsx` on 2026-09-28 and
 * rounded half-up to whole rupees. Do not "correct" a figure here — a
 * disagreement with the workbook is raised with the Director, not fixed in code.
 */

import 'server-only';

import type { PayLadder } from '@/types/hr-pay-ladders';
import data from './jkkn-reference-ladders.data.json';

export const ENGINEERING_INSTITUTION_ID = '5de4fba1-4564-41ed-8c73-5d948b74b843';
export const ARTS_SCIENCE_INSTITUTION_ID = 'b0b8a724-7c65-4f07-8047-2a38e8100ad5';

export const ENGINEERING_LADDERS: PayLadder[] = data.engineering as PayLadder[];
export const ENGINEERING_BAND_NOTES: string[] = data.engineeringNotes;
export const ARTS_SCIENCE_LADDERS: PayLadder[] = data.artsScience as PayLadder[];
export const ARTS_SCIENCE_BAND_NOTES: string[] = data.artsScienceNotes;
export const SUPPORT_STAFF_LADDERS: PayLadder[] = data.support as PayLadder[];

/**
 * The reference ladders for one college: Engineering or Arts & Science, each
 * followed by the support-staff ladders. Every other college gets []: Dental's
 * sheets and the three colleges with rival versions are not loaded here. Always
 * a fresh copy.
 */
export function referenceLaddersFor(institutionId: string): PayLadder[] {
  if (institutionId === ENGINEERING_INSTITUTION_ID) {
    return structuredClone([...ENGINEERING_LADDERS, ...SUPPORT_STAFF_LADDERS]);
  }
  if (institutionId === ARTS_SCIENCE_INSTITUTION_ID) {
    return structuredClone([...ARTS_SCIENCE_LADDERS, ...SUPPORT_STAFF_LADDERS]);
  }
  return [];
}

/** The band-level notes for one college; [] for any college without ladders. Always a fresh copy. */
export function referenceNotesFor(institutionId: string): string[] {
  if (institutionId === ENGINEERING_INSTITUTION_ID) return structuredClone(ENGINEERING_BAND_NOTES);
  if (institutionId === ARTS_SCIENCE_INSTITUTION_ID) return structuredClone(ARTS_SCIENCE_BAND_NOTES);
  return [];
}
