/**
 * lib/services/cdc/drive-targeting.ts
 *
 * Institution + semester targeting for CDC drives.
 *
 *   cdc_drives.institution_semesters = [{ institution_id, semester_orders: [5, 6] }]
 *
 * A learner is targeted when learners_profiles.institution_id is one of the
 * drive's institutions AND the learner's current semester
 * (learners_profiles.semester_id → semesters.semester_order) is in that
 * institution's list. An institution with an EMPTY semester list means "every
 * semester of that institution" (and legacy drives with no targeting at all
 * fall back to cdc_drive_eligibility.program_ids in the willingness service).
 *
 * Lifecycle filter mirrors the DB notification trigger (R5.B): only
 * active + graduated learners are ever targeted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CDC_DRIVE_GENDER_DB_VALUE,
  type CdcDrive,
  type CdcDriveDegreeSemesterTarget,
  type CdcDriveInstitutionSemesterTarget,
  type CdcDriveInstitutionSemesters,
  type CdcDriveTargetGender,
} from '@/types/cdc';

const TARGET_LIFECYCLE = ['active', 'graduated'];
const IN_CHUNK = 200;

// ------------------------------------------------------------------------
// Normalisation / validation of the jsonb payload
// ------------------------------------------------------------------------

export function normalizeInstitutionSemesters(
  raw: unknown,
  institutions: string[]
): CdcDriveInstitutionSemesters {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(institutions);
  const out: CdcDriveInstitutionSemesters = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const inst = (entry as { institution_id?: unknown }).institution_id;
    if (typeof inst !== 'string' || !allowed.has(inst) || seen.has(inst)) continue;
    const degreeGroups = normalizeDegreeGroups((entry as { degree_semesters?: unknown }).degree_semesters);
    const gender = normalizeGender((entry as { gender?: unknown }).gender);
    // Only written when restricted, so untouched drives keep their exact shape.
    const genderPart = gender === 'all' ? {} : { gender };
    seen.add(inst);
    if (degreeGroups.length > 0) {
      // Degree-wise entry: the flat lists are DERIVED (union) so the coarse
      // pre-filter and every summary stay correct.
      const anyAllSemesters = degreeGroups.some((g) => g.semester_orders.length === 0);
      const orders = anyAllSemesters
        ? []
        : Array.from(new Set(degreeGroups.flatMap((g) => g.semester_orders))).sort((a, b) => a - b);
      const programs = Array.from(new Set(degreeGroups.flatMap(effectiveGroupPrograms)));
      out.push({ institution_id: inst, semester_orders: orders, program_ids: programs, degree_semesters: degreeGroups, ...genderPart });
      continue;
    }
    out.push({
      institution_id: inst,
      semester_orders: normalizeOrders((entry as { semester_orders?: unknown }).semester_orders),
      program_ids: normalizeUuids((entry as { program_ids?: unknown }).program_ids),
      ...genderPart,
    });
  }
  return out;
}

function normalizeGender(raw: unknown): CdcDriveTargetGender {
  return raw === 'male' || raw === 'female' ? raw : 'all';
}

/** Gender an institution entry is restricted to ('all' when unrestricted). */
export function entryGender(entry: Pick<CdcDriveInstitutionSemesterTarget, 'gender'> | undefined | null): CdcDriveTargetGender {
  return normalizeGender(entry?.gender);
}

/** The drive's gender restriction, for summaries (entries all carry the same value). */
export function driveTargetGender(drive: Pick<CdcDrive, 'institution_semesters'>): CdcDriveTargetGender {
  const genders = new Set<CdcDriveTargetGender>();
  for (const e of drive.institution_semesters ?? []) entryGenders(e).forEach((g) => genders.add(g));
  if (genders.size !== 1) return 'all'; // nothing targeted, or it differs per block
  return Array.from(genders)[0];
}

/** Gender a degree block is open to: its own choice, else the entry's drive-level one. */
export function groupGender(
  entry: Pick<CdcDriveInstitutionSemesterTarget, 'gender'>,
  group: Pick<CdcDriveDegreeSemesterTarget, 'gender'>
): CdcDriveTargetGender {
  return group.gender === 'male' || group.gender === 'female' || group.gender === 'all' ? group.gender : entryGender(entry);
}

/** Gender one program of a block is open to: its own choice, else the block's. */
export function programGender(
  entry: Pick<CdcDriveInstitutionSemesterTarget, 'gender'>,
  group: Pick<CdcDriveDegreeSemesterTarget, 'gender' | 'program_genders'>,
  programId: string
): CdcDriveTargetGender {
  return group.program_genders?.[programId] ?? groupGender(entry, group);
}

/** Every distinct gender an entry targets (per program / per degree block, or the entry's own). */
export function entryGenders(entry: CdcDriveInstitutionSemesterTarget): CdcDriveTargetGender[] {
  const groups = entry.degree_semesters ?? [];
  if (groups.length === 0) return [entryGender(entry)];
  const out = new Set<CdcDriveTargetGender>();
  for (const g of groups) {
    for (const pid of effectiveGroupPrograms(g)) out.add(programGender(entry, g, pid));
  }
  return Array.from(out);
}

function genderValueMatches(target: CdcDriveTargetGender, learnerGender: string | null | undefined): boolean {
  if (target === 'all') return true;
  return (learnerGender ?? '').trim().toLowerCase() === CDC_DRIVE_GENDER_DB_VALUE[target].toLowerCase();
}

/** Does a learners_profiles.gender value satisfy the entry's gender restriction? */
export function genderMatches(entry: Pick<CdcDriveInstitutionSemesterTarget, 'gender'>, learnerGender: string | null | undefined): boolean {
  const g = entryGender(entry);
  if (g === 'all') return true;
  return (learnerGender ?? '').trim().toLowerCase() === CDC_DRIVE_GENDER_DB_VALUE[g].toLowerCase();
}

function normalizeOrders(raw: unknown): number[] {
  return Array.isArray(raw)
    ? Array.from(
        new Set(
          raw
            .map((n) => (typeof n === 'string' ? parseInt(n, 10) : Number(n)))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 20)
        )
      ).sort((a, b) => a - b)
    : [];
}

function normalizeUuids(raw: unknown): string[] {
  return Array.isArray(raw)
    ? Array.from(new Set(raw.filter((p): p is string => typeof p === 'string' && UUID_RE.test(p))))
    : [];
}

function normalizeDegreeGroups(raw: unknown): CdcDriveDegreeSemesterTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: CdcDriveDegreeSemesterTarget[] = [];
  const seen = new Set<string>();
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const rawKey = (g as { key?: unknown }).key;
    if (typeof rawKey !== 'string' || !rawKey.trim()) continue;
    const key = rawKey.trim().slice(0, 60);
    if (seen.has(key)) continue;
    const group: CdcDriveDegreeSemesterTarget = {
      key,
      program_ids: normalizeUuids((g as { program_ids?: unknown }).program_ids),
      all_program_ids: normalizeUuids((g as { all_program_ids?: unknown }).all_program_ids),
      semester_orders: normalizeOrders((g as { semester_orders?: unknown }).semester_orders),
    };
    const rawGender = (g as { gender?: unknown }).gender;
    if (rawGender === 'male' || rawGender === 'female' || rawGender === 'all') group.gender = rawGender;
    const rawProgramGenders = (g as { program_genders?: unknown }).program_genders;
    if (rawProgramGenders && typeof rawProgramGenders === 'object' && !Array.isArray(rawProgramGenders)) {
      const kept: Record<string, CdcDriveTargetGender> = {};
      const targeted = new Set(effectiveGroupPrograms(group));
      for (const [pid, val] of Object.entries(rawProgramGenders as Record<string, unknown>)) {
        if (!UUID_RE.test(pid) || !targeted.has(pid)) continue;
        if (val === 'male' || val === 'female' || val === 'all') kept[pid] = val;
      }
      if (Object.keys(kept).length > 0) group.program_genders = kept;
    }
    // A group that resolves to no programs can match nobody — drop it.
    if (effectiveGroupPrograms(group).length === 0) continue;
    seen.add(key);
    out.push(group);
  }
  return out;
}

/** Programs a degree group actually targets (ticked ones, else the whole group). */
export function effectiveGroupPrograms(g: CdcDriveDegreeSemesterTarget): string[] {
  return g.program_ids.length > 0 ? g.program_ids : g.all_program_ids;
}

/**
 * Does the learner (program + semester) fall inside this institution entry?
 * Returns the reason when not. Shared by every matcher so they cannot drift.
 */
export function entryMiss(
  entry: CdcDriveInstitutionSemesterTarget,
  programId: string | null | undefined,
  semesterOrder: number | null | undefined,
  /** learners_profiles.gender. `undefined` = caller did not load it → gender is NOT checked. */
  gender?: string | null
): 'program' | 'semester' | 'gender' | null {
  const groups = entry.degree_semesters ?? [];
  if (groups.length > 0) {
    const inProgram = programId ? groups.filter((g) => effectiveGroupPrograms(g).includes(programId)) : [];
    if (inProgram.length === 0) return 'program';
    // Gender is decided per program, then per block, then the drive-level choice.
    const mine =
      gender === undefined
        ? inProgram
        : inProgram.filter((g) => genderValueMatches(programGender(entry, g, programId as string), gender));
    if (mine.length === 0) return 'gender';
    const semOk = mine.some(
      (g) => g.semester_orders.length === 0 || (semesterOrder != null && g.semester_orders.includes(semesterOrder))
    );
    return semOk ? null : 'semester';
  }
  if (gender !== undefined && !genderMatches(entry, gender)) return 'gender';
  if (entry.program_ids && entry.program_ids.length > 0 && (!programId || !entry.program_ids.includes(programId))) {
    return 'program';
  }
  if (entry.semester_orders.length > 0 && (semesterOrder == null || !entry.semester_orders.includes(semesterOrder))) {
    return 'semester';
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Does this drive restrict any institution to specific programs? */
export function hasProgramTargeting(drive: Pick<CdcDrive, 'institution_semesters'>): boolean {
  const t = drive.institution_semesters;
  return Array.isArray(t) && t.some((e) => Array.isArray(e.program_ids) && e.program_ids.length > 0);
}

/** Does this drive carry any semester targeting at all? */
export function hasSemesterTargeting(drive: Pick<CdcDrive, 'institution_semesters'>): boolean {
  const t = drive.institution_semesters;
  return Array.isArray(t) && t.some((e) => Array.isArray(e.semester_orders) && e.semester_orders.length > 0);
}

/** Distinct semester orders across all institutions — for "Semesters: 5, 6" summaries. */
export function distinctSemesterOrders(drive: Pick<CdcDrive, 'institution_semesters'>): number[] {
  const set = new Set<number>();
  (drive.institution_semesters ?? []).forEach((e) => (e.semester_orders ?? []).forEach((n) => set.add(n)));
  return Array.from(set).sort((a, b) => a - b);
}

// ------------------------------------------------------------------------
// Per-learner check (willingness page)
// ------------------------------------------------------------------------

export interface LearnerTargetingInput {
  institution_id: string | null;
  semester_order: number | null;
  /** learners_profiles.program_id — only consulted when the institution entry lists program_ids. */
  program_id?: string | null;
  /** learners_profiles.gender — consulted when the drive is restricted to one gender. */
  gender?: string | null;
}

/**
 * true when the learner falls inside the drive's institution + semester
 * targeting. A drive with no targeting rows → false (caller decides fallback).
 */
export function isLearnerTargeted(
  drive: Pick<CdcDrive, 'institutions' | 'institution_semesters'>,
  learner: LearnerTargetingInput
): boolean {
  if (!learner.institution_id) return false;
  if (!drive.institutions.includes(learner.institution_id)) return false;
  const entry = (drive.institution_semesters ?? []).find(
    (e) => e.institution_id === learner.institution_id
  );
  if (!entry) return false;
  // A gender-restricted drive must never match a learner whose gender was not loaded.
  return entryMiss(entry, learner.program_id, learner.semester_order, learner.gender ?? null) === null;
}

/** Which part of the targeting rejected the learner (for learner-facing copy + diagnosis). */
export function learnerTargetingMiss(
  drive: Pick<CdcDrive, 'institutions' | 'institution_semesters'>,
  learner: LearnerTargetingInput
): 'institution' | 'program' | 'semester' | 'gender' | null {
  if (!learner.institution_id || !drive.institutions.includes(learner.institution_id)) return 'institution';
  const entry = (drive.institution_semesters ?? []).find((e) => e.institution_id === learner.institution_id);
  if (!entry) return 'institution';
  return entryMiss(entry, learner.program_id, learner.semester_order, learner.gender ?? null);
}

// ------------------------------------------------------------------------
// Resolve the full recipient set (notification fan-out)
// ------------------------------------------------------------------------

export interface TargetLearnerRow {
  learner_id: string;
  user_id: string; // profiles.id
  institution_id: string;
  semester_order: number | null;
}

export interface UnlinkedLearnerRow {
  learner_id: string;
  institution_id: string;
  semester_order: number | null;
}

export interface TargetResolution {
  learners: TargetLearnerRow[];
  /** profiles.id list, de-duplicated — what the notification is addressed to. */
  userIds: string[];
  /** Learners matched but with no active linked auth profile (cannot be notified). */
  unlinked: UnlinkedLearnerRow[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Service-role client required: learners_profiles + profiles are read across
 * institutions, which the caller's own RLS scope would silently narrow.
 */
export async function resolveTargetLearners(
  service: SupabaseClient,
  drive: Pick<CdcDrive, 'id' | 'institutions' | 'institution_semesters'>
): Promise<TargetResolution> {
  const empty: TargetResolution = { learners: [], userIds: [], unlinked: [] };
  const targeting = (drive.institution_semesters ?? []).filter((e) =>
    drive.institutions.includes(e.institution_id)
  );
  if (targeting.length === 0) return empty;

  // 1. Resolve semester ids per institution for the requested orders.
  const semesterIdsByInst = new Map<string, string[] | 'ALL'>();
  const orderBySemesterId = new Map<string, number>();
  // One semesters query per institution, all at once (they are independent).
  await Promise.all(
    targeting.map(async (entry) => {
      if (!entry.semester_orders || entry.semester_orders.length === 0) {
        semesterIdsByInst.set(entry.institution_id, 'ALL');
        return;
      }
      const { data, error } = await service
        .from('semesters')
        .select('id, semester_order')
        .eq('institution_id', entry.institution_id)
        .in('semester_order', entry.semester_orders)
        .limit(5000);
      if (error) throw error;
      const ids = (data ?? []).map((s) => {
        orderBySemesterId.set(s.id as string, s.semester_order as number);
        return s.id as string;
      });
      semesterIdsByInst.set(entry.institution_id, ids);
    })
  );

  // 2. Learners per institution (optionally restricted to the entry's programs).
  const programIdsByInst = new Map<string, string[]>();
  for (const entry of targeting) {
    if (entry.program_ids && entry.program_ids.length > 0) programIdsByInst.set(entry.institution_id, entry.program_ids);
  }
  type LearnerHit = { id: string; institution_id: string; semester_id: string | null; program_id: string | null; gender: string | null };
  const learners: LearnerHit[] = [];
  // Every (institution × semester-chunk) read is independent → one parallel wave.
  const learnerJobs: Array<Promise<LearnerHit[]>> = [];
  for (const [institutionId, semesterIds] of semesterIdsByInst) {
    if (semesterIds !== 'ALL' && semesterIds.length === 0) continue;
    const groups = semesterIds === 'ALL' ? [null] : chunk(semesterIds, IN_CHUNK);
    const programIds = programIdsByInst.get(institutionId) ?? null;
    // Gender is filtered IN THE QUERY, so a learner outside it is never even read.
    // When blocks of one institution differ (UG female, PG both) the query
    // cannot express it, so those are narrowed per learner just below — still
    // before anyone is notified.
    const instEntry = targeting.find((e) => e.institution_id === institutionId);
    const instGenders = instEntry ? entryGenders(instEntry) : (['all'] as CdcDriveTargetGender[]);
    const genderKey: CdcDriveTargetGender = instGenders.length === 1 ? instGenders[0] : 'all';
    const genderValue = genderKey === 'all' ? null : CDC_DRIVE_GENDER_DB_VALUE[genderKey];
    for (const group of groups) {
      learnerJobs.push(
        (async () => {
          let q = service
            .from('learners_profiles')
            .select('id, institution_id, semester_id, program_id, gender')
            .eq('institution_id', institutionId)
            .in('lifecycle_status', TARGET_LIFECYCLE)
            .limit(20000);
          if (group) q = q.in('semester_id', group);
          if (programIds) q = q.in('program_id', programIds);
          if (genderValue) q = q.eq('gender', genderValue);
          const { data, error } = await q;
          if (error) throw error;
          return (data ?? []).map((row) => ({
            id: row.id as string,
            institution_id: row.institution_id as string,
            semester_id: (row.semester_id as string | null) ?? null,
            program_id: (row.program_id as string | null) ?? null,
            gender: (row.gender as string | null) ?? null,
          }));
        })()
      );
    }
  }
  // The query above uses the UNION of programs/semesters; degree-wise entries
  // are then narrowed per learner (UG Sem 7 must not pull in PG Sem 7).
  const entryByInst = new Map(targeting.map((e) => [e.institution_id, e]));
  for (const batch of await Promise.all(learnerJobs)) {
    for (const l of batch) {
      const entry = entryByInst.get(l.institution_id);
      if (entry?.degree_semesters?.length) {
        const order = l.semester_id ? orderBySemesterId.get(l.semester_id) ?? null : null;
        if (entryMiss(entry, l.program_id, order, l.gender) !== null) continue;
      }
      learners.push(l);
    }
  }
  if (learners.length === 0) return empty;

  // 3. learners_profiles.id → profiles.id (the notifiable auth user).
  const userByLearner = new Map<string, string>();
  await Promise.all(
    chunk(learners.map((l) => l.id), IN_CHUNK).map(async (ids) => {
      const { data, error } = await service
        .from('profiles')
        .select('id, learner_id')
        .in('learner_id', ids)
        .eq('is_active', true);
      if (error) throw error;
      for (const p of data ?? []) {
        if (p.learner_id && p.id) userByLearner.set(p.learner_id as string, p.id as string);
      }
    })
  );

  const rows: TargetLearnerRow[] = [];
  const unlinked: UnlinkedLearnerRow[] = [];
  const seenLearner = new Set<string>();
  for (const l of learners) {
    if (seenLearner.has(l.id)) continue;
    seenLearner.add(l.id);
    const userId = userByLearner.get(l.id);
    if (!userId) {
      unlinked.push({
        learner_id: l.id,
        institution_id: l.institution_id,
        semester_order: l.semester_id ? orderBySemesterId.get(l.semester_id) ?? null : null,
      });
      continue;
    }
    rows.push({
      learner_id: l.id,
      user_id: userId,
      institution_id: l.institution_id,
      semester_order: l.semester_id ? orderBySemesterId.get(l.semester_id) ?? null : null,
    });
  }

  return {
    learners: rows,
    userIds: Array.from(new Set(rows.map((r) => r.user_id))),
    unlinked,
  };
}
