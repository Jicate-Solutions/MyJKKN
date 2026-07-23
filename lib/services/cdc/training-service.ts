// lib/services/cdc/training-service.ts
// Service layer for CDC Training Programmes

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CdcTrainingProgramme,
  CdcTrainingType,
  CdcTrainingEnrollment,
  CreateTrainingProgrammeDto,
  UpdateTrainingProgrammeDto,
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
  TrainingProgrammeFilters,
  EnrollmentFilters,
  CdcTrainingSemesterSchedule,
  CreateSemesterScheduleDto,
  UpdateSemesterScheduleDto,
} from '@/types/cdc/training';

 
const db = (): any => createClientSupabaseClient();

// ---------------------------------------------------------------------------
// Cohort Core spine twin (Phase 4 · kind='cdc')
// ---------------------------------------------------------------------------
// cdc_training_enrollments stays the AUTHORITATIVE roster (its attendance,
// certificate, and semester-schedule extension all hang off it). public.cohorts
// (kind='cdc') is an ADDITIVE MIRROR for roster + lifecycle, minted FORWARD here
// on first enrol and mapped 1:1 via cohorts.config->>'cdc_training_programme_id'.
// EVERY spine write below is BEST-EFFORT (try/catch, log-and-continue): a lagging
// or RLS-denied mirror must NEVER fail the primary enrollment write nor drop a
// real member — the extension is the source of truth.

// L4: fold the authoritative CDC enrollment status into the membership status
// lifecycle ('invited'→'enrolled'→'active'→'graduated'|'removed'|'paused'), never
// hardcode 'enrolled'. A re-mirror of a terminal row must not resurrect it.
// enrollment status is 'enrolled' | 'in_progress' | 'completed' | 'dropped'.
function foldCdcMembershipStatus(enrollmentStatus: string | null | undefined): string {
  switch (enrollmentStatus) {
    case 'completed':
      return 'graduated';
    case 'dropped':
      return 'removed';
    case 'in_progress':
      return 'active';
    case 'enrolled':
    default:
      return 'enrolled';
  }
}

export class TrainingService {
  // ─── Cohort spine mirror (best-effort) ─────────────────────────────────
  /**
   * Lazy-mint (or fetch) the public.cohorts mirror row for a CDC programme.
   * Keyed on config->>'cdc_training_programme_id'; a partial unique index
   * (uq_cohorts_cdc_training_programme WHERE kind='cdc') makes the mint
   * race-safe. Returns the cohort id, or null when the mirror cannot be minted
   * (e.g. the programme carries no institution_id — cohorts.institution_id is
   * NOT NULL precisely so role_has_institution_access(NULL) can never leak, so a
   * NULL-institution programme must NOT be mirrored).
   *
   * L3 discipline: the initial lookup does NOT swallow errors (it re-selects on
   * error rather than falling through to a duplicate INSERT), and an INSERT
   * 23505 (unique-violation, i.e. a concurrent first-enrol won) re-SELECTs the
   * winner instead of surfacing.
   */
  private static async ensureCdcCohortMirror(programmeId: string): Promise<string | null> {
    const sb = db();

    const selectExisting = async (): Promise<string | null> => {
      const { data, error } = await sb
        .from('cohorts')
        .select('id')
        .eq('kind', 'cdc')
        .eq('config->>cdc_training_programme_id', programmeId)
        .maybeSingle();
      if (error) {
        // L3: do NOT swallow → re-select once; if it still errors, propagate to
        // the best-effort catch in the twin (mirror skipped, roster unaffected).
        const retry = await sb
          .from('cohorts')
          .select('id')
          .eq('kind', 'cdc')
          .eq('config->>cdc_training_programme_id', programmeId)
          .maybeSingle();
        if (retry.error) throw retry.error;
        return (retry.data?.id as string) ?? null;
      }
      return (data?.id as string) ?? null;
    };

    const existing = await selectExisting();
    if (existing) return existing;

    // Mint. Copy institution_id FROM THE CONTAINER so the tenant guard holds.
    const { data: programme, error: progErr } = await sb
      .from('cdc_training_programmes')
      .select('id, name, institution_id, academic_year_label, status, created_by')
      .eq('id', programmeId)
      .maybeSingle();
    if (progErr) throw progErr;
    if (!programme?.institution_id) {
      // Cannot mint a tenant-safe cohort with a NULL institution_id → skip the
      // mirror (best-effort). The extension roster is unaffected.
      console.warn('[cdc/training] cohort mirror skipped: programme has no institution_id', programmeId);
      return null;
    }

    const { data: inserted, error: insErr } = await sb
      .from('cohorts')
      .insert({
        kind: 'cdc',
        name: programme.name ?? 'CDC Training Programme',
        institution_id: programme.institution_id,
        owner_id: programme.created_by ?? null,
        academic_year: programme.academic_year_label ?? null,
        status: 'active',
        config: { cdc_training_programme_id: programmeId },
      })
      .select('id')
      .single();

    if (insErr) {
      // L3: a concurrent first-enrol won the unique index → re-select the winner.
      if ((insErr as { code?: string }).code === '23505') {
        return await selectExisting();
      }
      throw insErr;
    }
    return (inserted?.id as string) ?? null;
  }


  // ─── Training Types ────────────────────────────────────────────────────

  static async getTrainingTypes(): Promise<CdcTrainingType[]> {
    const { data, error } = await db()
      .from('cdc_training_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('[cdc/training] getTrainingTypes failed:', error);
      throw error;
    }
    return (data ?? []) as CdcTrainingType[];
  }

  // ─── Training Programmes ───────────────────────────────────────────────

  static async getProgrammes(filters?: TrainingProgrammeFilters): Promise<CdcTrainingProgramme[]> {
    let query = db()
      .from('cdc_training_programmes')
      .select(`
        *,
        training_type:cdc_training_types(id, config_key, display_name),
        institution:institutions(id, name),
        target_department:departments(id, department_name)
      `)
      .order('created_at', { ascending: false });

    if (filters?.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }
    if (filters?.training_type_id) {
      query = query.eq('training_type_id', filters.training_type_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.date_from) {
      query = query.gte('start_date', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('end_date', filters.date_to);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/training] getProgrammes failed:', error);
      throw error;
    }
    return (data ?? []) as CdcTrainingProgramme[];
  }

  static async getProgramme(id: string): Promise<CdcTrainingProgramme | null> {
    const { data, error } = await db()
      .from('cdc_training_programmes')
      .select(`
        *,
        training_type:cdc_training_types(id, config_key, display_name, description),
        institution:institutions(id, name),
        target_department:departments(id, department_name)
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('[cdc/training] getProgramme failed:', error);
      throw error;
    }
    return data as CdcTrainingProgramme | null;
  }

  static async createProgramme(dto: CreateTrainingProgrammeDto): Promise<CdcTrainingProgramme> {
    const { data, error } = await db()
      .from('cdc_training_programmes')
      .insert(dto)
      .select(`
        *,
        training_type:cdc_training_types(id, config_key, display_name),
        institution:institutions(id, name),
        target_department:departments(id, department_name)
      `)
      .single();
    if (error) {
      console.error('[cdc/training] createProgramme failed:', error);
      throw error;
    }
    return data as CdcTrainingProgramme;
  }

  static async updateProgramme(id: string, dto: UpdateTrainingProgrammeDto): Promise<CdcTrainingProgramme> {
    const { data, error } = await db()
      .from('cdc_training_programmes')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`
        *,
        training_type:cdc_training_types(id, config_key, display_name),
        institution:institutions(id, name),
        target_department:departments(id, department_name)
      `)
      .single();
    if (error) {
      console.error('[cdc/training] updateProgramme failed:', error);
      throw error;
    }
    return data as CdcTrainingProgramme;
  }

  // ─── Enrollments ───────────────────────────────────────────────────────

  static async getEnrollments(filters: EnrollmentFilters): Promise<CdcTrainingEnrollment[]> {
    let query = db()
      .from('cdc_training_enrollments')
      .select(`
        *,
        learner:learners_profiles(
          id,
          first_name,
          last_name,
          roll_number,
          institution:institutions(id, name)
        ),
        programme:cdc_training_programmes(id, name, status)
      `)
      .order('enrolled_at', { ascending: false });

    if (filters.programme_id) {
      query = query.eq('programme_id', filters.programme_id);
    }
    if (filters.learner_id) {
      query = query.eq('learner_id', filters.learner_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/training] getEnrollments failed:', error);
      throw error;
    }
    return (data ?? []) as CdcTrainingEnrollment[];
  }

  static async addEnrollment(dto: CreateEnrollmentDto): Promise<CdcTrainingEnrollment> {
    const { data, error } = await db()
      .from('cdc_training_enrollments')
      .insert(dto)
      .select('*')
      .single();
    if (error) {
      console.error('[cdc/training] addEnrollment failed:', error);
      throw error;
    }

    const enrollment = data as CdcTrainingEnrollment;

    // WRITE-SIDE TWIN (cohort spine) — mirror the new enrollment as a 'learner'
    // membership on the CDC cohort so cohort-scoped roster + lifecycle reads see
    // it, then back-link the enrollment. BEST-EFFORT + IDEMPOTENT: the enrollment
    // is already committed and AUTHORITATIVE, so any mirror failure (no cohort
    // mintable, RLS denial, lag) is logged and swallowed — never rolled back,
    // never a dropped member. The learner reappears on the cohort path on the
    // next enrol or a backfill re-run.
    try {
      // D9 identity guard: member_ref must resolve to a real MyJKKN identity.
      // learner_id is NOT NULL + FK-enforced to learners_profiles(id), so the
      // committed enrollment row is already profile-resolved; a missing/free-text
      // learner could never have been inserted above (the FK would have thrown).
      if (enrollment.learner_id) {
        const cohortId = await this.ensureCdcCohortMirror(enrollment.programme_id);
        if (cohortId) {
          const now = new Date().toISOString();
          const membershipStatus = foldCdcMembershipStatus(enrollment.status);
          const { data: membership, error: memErr } = await db()
            .from('cohort_memberships')
            .upsert(
              {
                cohort_id: cohortId,
                member_type: 'learner',
                member_ref: enrollment.learner_id,
                status: membershipStatus,
                role: 'trainee',
                joined_at: enrollment.enrolled_at ?? now,
                config: {
                  cdc_training_enrollment_id: enrollment.id,
                  cdc_training_programme_id: enrollment.programme_id,
                },
              },
              { onConflict: 'cohort_id,member_type,member_ref' }
            )
            .select('id')
            .single();

          if (memErr) {
            console.error('[cdc/training] addEnrollment cohort membership mirror failed:', memErr);
          } else if (membership?.id) {
            const { error: linkErr } = await db()
              .from('cdc_training_enrollments')
              .update({ cohort_membership_id: membership.id })
              .eq('id', enrollment.id);
            if (linkErr) {
              console.error('[cdc/training] addEnrollment cohort_membership_id back-link failed:', linkErr);
            } else {
              enrollment.cohort_membership_id = membership.id;
            }

            // Append an audit event (append-only lifecycle trail). Best-effort.
            const { error: evtErr } = await db()
              .from('cohort_status_events')
              .insert({
                cohort_id: cohortId,
                membership_id: membership.id,
                event_type: 'enrolled',
                from_status: null,
                to_status: membershipStatus,
                reason: 'CDC training enrollment mirrored to cohort spine.',
                metadata: {
                  source: 'cdc_training',
                  cdc_training_enrollment_id: enrollment.id,
                  cdc_training_programme_id: enrollment.programme_id,
                },
              });
            if (evtErr) {
              console.error('[cdc/training] addEnrollment cohort_status_events append failed:', evtErr);
            }
          }
        }
      }
    } catch (twinErr) {
      console.error('[cdc/training] addEnrollment cohort twin error:', twinErr);
    }

    return enrollment;
  }

  static async updateEnrollment(id: string, dto: UpdateEnrollmentDto): Promise<CdcTrainingEnrollment> {
    const { data, error } = await db()
      .from('cdc_training_enrollments')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      console.error('[cdc/training] updateEnrollment failed:', error);
      throw error;
    }
    const enrollment = data as CdcTrainingEnrollment;

    // WRITE-SIDE TWIN (cohort spine) — a status transition on the extension must
    // FOLD onto the mirrored membership (completed→graduated, dropped→removed). The
    // addEnrollment twin only ever mints 'enrolled'; the graduated/removed
    // transitions happen ONLY here (the "Mark completed / dropped" actions), so
    // without this the spine freezes every member at 'enrolled' for life and the
    // lifecycle half of the demote is dead. The upsert also self-heals a membership
    // that was never minted (e.g. an enrollment created straight via the REST
    // route). BEST-EFFORT: the extension row is authoritative + already committed,
    // so any mirror failure is logged, never rolled back.
    try {
      if (enrollment.learner_id) {
        const cohortId = await this.ensureCdcCohortMirror(enrollment.programme_id);
        if (cohortId) {
          const membershipStatus = foldCdcMembershipStatus(enrollment.status);
          const { data: existing } = await db()
            .from('cohort_memberships')
            .select('id, status')
            .eq('cohort_id', cohortId)
            .eq('member_type', 'learner')
            .eq('member_ref', enrollment.learner_id)
            .maybeSingle();
          if (!existing || existing.status !== membershipStatus) {
            const { data: membership, error: memErr } = await db()
              .from('cohort_memberships')
              .upsert(
                {
                  cohort_id: cohortId,
                  member_type: 'learner',
                  member_ref: enrollment.learner_id,
                  status: membershipStatus,
                  role: 'trainee',
                  joined_at: enrollment.enrolled_at ?? new Date().toISOString(),
                  config: {
                    cdc_training_enrollment_id: enrollment.id,
                    cdc_training_programme_id: enrollment.programme_id,
                  },
                },
                { onConflict: 'cohort_id,member_type,member_ref' }
              )
              .select('id')
              .single();
            if (memErr) {
              console.error('[cdc/training] updateEnrollment cohort membership fold failed:', memErr);
            } else if (membership?.id) {
              if (!enrollment.cohort_membership_id) {
                await db()
                  .from('cdc_training_enrollments')
                  .update({ cohort_membership_id: membership.id })
                  .eq('id', enrollment.id);
                enrollment.cohort_membership_id = membership.id;
              }
              const { error: evtErr } = await db()
                .from('cohort_status_events')
                .insert({
                  cohort_id: cohortId,
                  membership_id: membership.id,
                  event_type:
                    membershipStatus === 'graduated'
                      ? 'graduated'
                      : membershipStatus === 'removed'
                        ? 'removed'
                        : 'status_changed',
                  from_status: existing?.status ?? null,
                  to_status: membershipStatus,
                  reason: 'CDC training status change mirrored to cohort spine.',
                  metadata: {
                    source: 'cdc_training',
                    cdc_training_enrollment_id: enrollment.id,
                    cdc_training_programme_id: enrollment.programme_id,
                  },
                });
              if (evtErr) {
                console.error('[cdc/training] updateEnrollment cohort_status_events append failed:', evtErr);
              }
            }
          }
        }
      }
    } catch (twinErr) {
      console.error('[cdc/training] updateEnrollment cohort twin error:', twinErr);
    }

    return enrollment;
  }

  // ─── Semester Schedules (BUG-004200) ───────────────────────────────────

  static async getSemesterSchedules(programmeId: string): Promise<CdcTrainingSemesterSchedule[]> {
    const { data, error } = await db()
      .from('cdc_training_semester_schedules')
      .select('*')
      .eq('programme_id', programmeId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[cdc/training] getSemesterSchedules failed:', error);
      throw error;
    }
    return (data ?? []) as CdcTrainingSemesterSchedule[];
  }

  static async addSemesterSchedule(dto: CreateSemesterScheduleDto): Promise<CdcTrainingSemesterSchedule> {
    const { data, error } = await db()
      .from('cdc_training_semester_schedules')
      .insert(dto)
      .select('*')
      .single();
    if (error) {
      console.error('[cdc/training] addSemesterSchedule failed:', error);
      throw error;
    }
    return data as CdcTrainingSemesterSchedule;
  }

  static async updateSemesterSchedule(id: string, dto: UpdateSemesterScheduleDto): Promise<CdcTrainingSemesterSchedule> {
    const { data, error } = await db()
      .from('cdc_training_semester_schedules')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      console.error('[cdc/training] updateSemesterSchedule failed:', error);
      throw error;
    }
    return data as CdcTrainingSemesterSchedule;
  }

  static async deleteSemesterSchedule(id: string): Promise<void> {
    const { error } = await db()
      .from('cdc_training_semester_schedules')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('[cdc/training] deleteSemesterSchedule failed:', error);
      throw error;
    }
  }
}
