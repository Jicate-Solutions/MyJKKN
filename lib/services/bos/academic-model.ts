// lib/services/bos/academic-model.ts
//
// Single source of truth for "which academic model does this BoS course /
// syllabus follow." Generalises the old `PART_LEVEL_EXEMPT_CODES` CET check.
//
// The BoS module now carries FIVE institution shapes across four models:
//   anna_univ  — engineering (CET) + arts-science (CAS): semester, CO-PO-PSO, Bloom/Fink
//   mgr_ahs    — Allied Health Sciences (Dr. MGR Medical Univ): year/paper + exam-scheme + internship
//   mgr_pharmd — Pharm.D (Dr. MGR Medical Univ): reuses the mgr_ahs shape
//   pci_pharm  — B.Pharm (PCI CBCS): semester + credits + coded Unit I–V, NO CO-PO
//
// COP (College of Pharmacy) is special: it hosts BOTH B.Pharm and Pharm.D under
// ONE institution_code ('COP'). They are separate BoS boards, so the model is
// resolved from the selected BOARD, not the institution code.
import type { AcademicModel } from '@/types/bos';

export type { AcademicModel };

/**
 * Exact COE board_ids per pharmacy model. Preferred over name matching once the
 * real board UUIDs are known — seed these from COE's board list for COP.
 * Until then the name/code regexes below do the disambiguation.
 */
const PHARMD_BOARD_IDS = new Set<string>([
  // e.g. 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'  // Pharm.D board
]);
const BPHARM_BOARD_IDS = new Set<string>([
  // e.g. 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'  // B.Pharm board
]);

// Board name / code patterns. Pharm.D checked first (its name never contains a
// leading "B"); B.Pharm requires a leading "B".
const PHARMD_NAME_RE = /pharm\s*[.\-]?\s*d\b|doctor\s+of\s+pharmacy/i;
const BPHARM_NAME_RE = /\bb\.?\s*pharm|bachelor\s+of\s+pharmacy/i;

/** AHS institution code(s) — Allied Health Sciences (Dr. MGR). Confirm real code(s). */
const MGR_AHS_CODES = new Set(['AHS']);

/** Nursing institution code(s) — College of Nursing (INC reg / TNMGRMU exam).
 *  Confirm the real CNR institution_code / counselling_code. */
const INC_NURSING_CODES = new Set(['CNR']);

/** Nursing board name pattern (B.Sc / M.Sc / Post-B.Sc Nursing). */
const NURSING_NAME_RE = /\bnursing\b|\bb\.?\s*sc\.?\s*\(?\s*n(ursing)?\s*\)?/i;

/** Dental (BDS — DCI / Dr. MGR). Known BoS board UUID(s) win; the name regex and
 *  DCH institution_code are fallbacks. Seed additional BDS board ids here. */
const BDS_BOARD_IDS = new Set<string>([
  'dcddfa03-d654-4f8e-a1e5-10a0e8072ca6', // JKKN Dental College & Hospital — BDS
]);
/** Dental institution code(s) — confirm the real DCH institution_code. */
const MGR_BDS_CODES = new Set(['DCH']);
/** Dental board name pattern (BDS / Bachelor of Dental Surgery). */
const BDS_NAME_RE = /\bb\.?\s*d\.?\s*s\b|bachelor\s+of\s+dental|dental\s+surgery/i;

export interface ResolveModelInput {
  institutionCode?: string | null;
  boardId?: string | null;
  boardName?: string | null;
  boardCode?: string | null;
}

/**
 * Resolve the academic model. Board identity wins (COP hosts two models under
 * one institution_code); institution_code is only the fallback for the
 * one-institution-one-model cases (AHS, and the anna_univ default).
 */
export function resolveAcademicModel(input: ResolveModelInput): AcademicModel {
  const boardId = (input.boardId ?? '').trim();
  if (boardId && PHARMD_BOARD_IDS.has(boardId)) return 'mgr_pharmd';
  if (boardId && BPHARM_BOARD_IDS.has(boardId)) return 'pci_pharm';
  if (boardId && BDS_BOARD_IDS.has(boardId)) return 'mgr_bds';

  const hay = `${input.boardName ?? ''} ${input.boardCode ?? ''}`.trim();
  if (hay) {
    if (PHARMD_NAME_RE.test(hay)) return 'mgr_pharmd';
    if (BPHARM_NAME_RE.test(hay)) return 'pci_pharm';
    if (NURSING_NAME_RE.test(hay)) return 'inc_nursing';
    if (BDS_NAME_RE.test(hay)) return 'mgr_bds';
  }

  const code = (input.institutionCode ?? '').trim().toUpperCase();
  if (MGR_AHS_CODES.has(code)) return 'mgr_ahs';
  if (INC_NURSING_CODES.has(code)) return 'inc_nursing';
  if (MGR_BDS_CODES.has(code)) return 'mgr_bds';
  return 'anna_univ';
}

// ── Model predicates (what each layer branches on) ────────────────────

/** Pharmacy models (B.Pharm or Pharm.D). */
export const isPharmacyModel = (m?: AcademicModel | null): boolean =>
  m === 'pci_pharm' || m === 'mgr_pharmd';

/** Year-based models (no semesters) — Pharm.D + AHS. */
export const isYearBasedModel = (m?: AcademicModel | null): boolean =>
  m === 'mgr_ahs' || m === 'mgr_pharmd';

/** Nursing model (B.Sc / M.Sc / Post-B.Sc Nursing — INC reg / TNMGRMU exam). */
export const isNursingModel = (m?: AcademicModel | null): boolean =>
  m === 'inc_nursing';

/** Dental model (BDS — DCI / Dr. MGR): year-based, MUST/DESIRABLE/NICE grid. */
export const isBdsModel = (m?: AcademicModel | null): boolean =>
  m === 'mgr_bds';

/** Models whose content tree is the BDS competency body (bds_content column). */
export const modelUsesBdsContent = (m?: AcademicModel | null): boolean =>
  m === 'mgr_bds';

/** Semester-based models — B.Pharm + Nursing + Anna. */
export const isSemesterModel = (m?: AcademicModel | null): boolean =>
  m === 'pci_pharm' || m === 'inc_nursing' || (m ?? 'anna_univ') === 'anna_univ';

/** Models that carry CO / PO / PSO / Bloom's / Fink's. Only anna_univ does.
 *  Nursing maps outcomes to the 10 INC core competencies (see
 *  modelUsesCompetencyMapping), NOT to PO/PSO — so it is excluded here. */
export const modelHasOutcomes = (m?: AcademicModel | null): boolean =>
  (m ?? 'anna_univ') === 'anna_univ';

/** Models that map course outcomes to the 10 INC core competencies instead of
 *  PO/PSO. Only nursing. Drives hiding the PO Mappings tab + showing Competency
 *  Mapping for inc_nursing. */
export const modelUsesCompetencyMapping = (m?: AcademicModel | null): boolean =>
  m === 'inc_nursing';

/** Models that carry a parallel clinical outline + Theory/Lab/Clinical workload
 *  split. Only nursing. */
export const modelUsesClinicalOutline = (m?: AcademicModel | null): boolean =>
  m === 'inc_nursing';

/** Models that don't use TN arts-college Part I–V / Roman Level tiers. */
export const modelSkipsPartLevel = (m?: AcademicModel | null): boolean =>
  (m ?? 'anna_univ') !== 'anna_univ';

/** Models whose content tree is the AHS-shaped year→subject→topics tree. */
export const modelUsesAhsContent = (m?: AcademicModel | null): boolean =>
  m === 'mgr_ahs' || m === 'mgr_pharmd';

/** University / regulator header string for exports (PDF/XLSX). */
export function modelUniversityHeader(m?: AcademicModel | null): string {
  switch (m) {
    case 'pci_pharm':  return 'Pharmacy Council of India (CBCS)';
    case 'mgr_pharmd': return 'The Tamil Nadu Dr. M.G.R. Medical University, Chennai';
    case 'mgr_ahs':    return 'The Tamil Nadu Dr. M.G.R. Medical University, Chennai';
    case 'inc_nursing': return 'The Tamil Nadu Dr. M.G.R. Medical University, Chennai';
    case 'mgr_bds':    return 'The Tamil Nadu Dr. M.G.R. Medical University, Chennai';
    default:           return 'Anna University';
  }
}

// ── Temporary course codes (Pharm.D subjects carry no code in source) ──

/**
 * Deterministic placeholder course code for a code-less Pharm.D subject.
 * Alnum-only so it satisfies the course_code regex `^[A-Z0-9]+$`; the `TMP`
 * prefix flags it as a placeholder to be replaced once official codes issue.
 * Example: year 1, subject 1 → "TMPPD101". Syllabi anchor on the stable
 * `course_id` COE bridge (not course_code), so replacing the code later only
 * rewrites the mutable snapshot — no relinking.
 */
export function makePharmdTempCode(year: number, seq: number): string {
  return `TMPPD${year}${String(seq).padStart(2, '0')}`;
}

/** True when a course code is a generated placeholder awaiting the official code. */
export const isTempCourseCode = (code?: string | null): boolean =>
  /^TMP/i.test((code ?? '').trim());
