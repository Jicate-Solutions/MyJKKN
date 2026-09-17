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
import type { CdcDrive, CdcDriveInstitutionSemesters } from '@/types/cdc';

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
    const ordersRaw = (entry as { semester_orders?: unknown }).semester_orders;
    const orders = Array.isArray(ordersRaw)
      ? Array.from(
          new Set(
            ordersRaw
              .map((n) => (typeof n === 'string' ? parseInt(n, 10) : Number(n)))
              .filter((n) => Number.isInteger(n) && n >= 1 && n <= 20)
          )
        ).sort((a, b) => a - b)
      : [];
    const programsRaw = (entry as { program_ids?: unknown }).program_ids;
    const programs = Array.isArray(programsRaw)
      ? Array.from(new Set(programsRaw.filter((p): p is string => typeof p === 'string' && UUID_RE.test(p))))
      : [];
    seen.add(inst);
    out.push({ institution_id: inst, semester_orders: orders, program_ids: programs });
  }
  return out;
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
  if (entry.program_ids && entry.program_ids.length > 0) {
    if (!learner.program_id || !entry.program_ids.includes(learner.program_id)) return false;
  }
  if (!entry.semester_orders || entry.semester_orders.length === 0) return true; // whole institution
  return learner.semester_order != null && entry.semester_orders.includes(learner.semester_order);
}

/** Which part of the targeting rejected the learner (for learner-facing copy + diagnosis). */
export function learnerTargetingMiss(
  drive: Pick<CdcDrive, 'institutions' | 'institution_semesters'>,
  learner: LearnerTargetingInput
): 'institution' | 'program' | 'semester' | null {
  if (!learner.institution_id || !drive.institutions.includes(learner.institution_id)) return 'institution';
  const entry = (drive.institution_semesters ?? []).find((e) => e.institution_id === learner.institution_id);
  if (!entry) return 'institution';
  if (entry.program_ids && entry.program_ids.length > 0 && (!learner.program_id || !entry.program_ids.includes(learner.program_id))) {
    return 'program';
  }
  if (entry.semester_orders.length > 0 && (learner.semester_order == null || !entry.semester_orders.includes(learner.semester_order))) {
    return 'semester';
  }
  return null;
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
  for (const entry of targeting) {
    if (!entry.semester_orders || entry.semester_orders.length === 0) {
      semesterIdsByInst.set(entry.institution_id, 'ALL');
      continue;
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
  }

  // 2. Learners per institution (optionally restricted to the entry's programs).
  const programIdsByInst = new Map<string, string[]>();
  for (const entry of targeting) {
    if (entry.program_ids && entry.program_ids.length > 0) programIdsByInst.set(entry.institution_id, entry.program_ids);
  }
  const learners: Array<{ id: string; institution_id: string; semester_id: string | null }> = [];
  for (const [institutionId, semesterIds] of semesterIdsByInst) {
    if (semesterIds !== 'ALL' && semesterIds.length === 0) continue;
    const groups = semesterIds === 'ALL' ? [null] : chunk(semesterIds, IN_CHUNK);
    const programIds = programIdsByInst.get(institutionId) ?? null;
    for (const group of groups) {
      let q = service
        .from('learners_profiles')
        .select('id, institution_id, semester_id')
        .eq('institution_id', institutionId)
        .in('lifecycle_status', TARGET_LIFECYCLE)
        .limit(20000);
      if (group) q = q.in('semester_id', group);
      if (programIds) q = q.in('program_id', programIds);
      const { data, error } = await q;
      if (error) throw error;
      for (const row of data ?? []) {
        learners.push({
          id: row.id as string,
          institution_id: row.institution_id as string,
          semester_id: (row.semester_id as string | null) ?? null,
        });
      }
    }
  }
  if (learners.length === 0) return empty;

  // 3. learners_profiles.id → profiles.id (the notifiable auth user).
  const userByLearner = new Map<string, string>();
  for (const ids of chunk(learners.map((l) => l.id), IN_CHUNK)) {
    const { data, error } = await service
      .from('profiles')
      .select('id, learner_id')
      .in('learner_id', ids)
      .eq('is_active', true);
    if (error) throw error;
    for (const p of data ?? []) {
      if (p.learner_id && p.id) userByLearner.set(p.learner_id as string, p.id as string);
    }
  }

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
