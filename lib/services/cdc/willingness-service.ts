/**
 * T1.1 — Learner-facing CDC Willingness Service.
 *
 * Powers /cdc/drives/[id]/willingness. The notification trigger from A1 (PR #988)
 * drops `notifications` rows pointing at /cdc/drives/[id]; this service handles
 * the actual declaration the learner makes there.
 *
 * Auth model: caller is an authenticated learner. We resolve auth.uid() ->
 * profiles.learner_id and never trust a client-supplied learner_id. RLS on
 * cdc_drive_willingness (PR #987 / 20260519T1140Z fix) enforces is_cdc_staff()
 * OR (profiles.id = auth.uid() AND profiles.learner_id = row.learner_id).
 *
 * Eligibility check uses the drive's program_ids[] array vs the learner's
 * program_id. Soft check on this layer; RLS does NOT enforce eligibility.
 *
 * Willingness status enum (DB): 'willing' | 'confirmed' | 'withdrawn' | 'no_show'.
 * UI intents map: 'willing' -> status='willing'; 'decline' -> status='withdrawn'
 * with withdrawn_at + withdrawn_reason set. "Undo" = switch status back to 'willing'
 * and null out withdrawn_*. All transitions append to the willingness_audit jsonb.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcDrive,
  CdcDriveEligibility,
  CdcDriveType,
  CdcDriveWillingness,
  CdcRecruiter,
} from '@/types/cdc';
import { CdcDriveService } from './drive-service';

export interface LearnerWillingnessSnapshot {
  drive: CdcDrive;
  eligibility: CdcDriveEligibility | null;
  recruiter: CdcRecruiter | null;
  drive_type: CdcDriveType | null;
  learner: {
    id: string; // learners_profiles.id
    program_id: string | null;
  };
  willingness: CdcDriveWillingness | null;
  is_eligible: boolean;
  is_window_open: boolean;
}

export class CdcWillingnessService {
  /**
   * Resolve auth.uid() -> learners_profiles row. Returns null if the caller is
   * not a learner (e.g. coordinator hitting a learner-only endpoint).
   */
  static async resolveLearner(
    supabase: SupabaseClient,
    userId: string
  ): Promise<{ id: string; program_id: string | null } | null> {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('learner_id')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile?.learner_id) return null;

    const { data: learner, error: learnerErr } = await supabase
      .from('learners_profiles')
      .select('id, program_id')
      .eq('id', profile.learner_id)
      .maybeSingle();
    if (learnerErr) throw learnerErr;
    if (!learner) return null;

    return {
      id: learner.id as string,
      program_id: (learner.program_id as string | null) ?? null,
    };
  }

  /**
   * Single round-trip fetch for the learner-facing page: drive + eligibility +
   * recruiter + drive_type + this learner's existing willingness row (if any).
   * Computes is_eligible and is_window_open booleans for the UI.
   */
  static async getLearnerWillingnessSnapshot(
    supabase: SupabaseClient,
    driveId: string,
    learner: { id: string; program_id: string | null }
  ): Promise<LearnerWillingnessSnapshot | null> {
    const drive = await CdcDriveService.getDrive(supabase, driveId);
    if (!drive) return null;

    const [eligibilityRes, recruiterRes, driveTypeRes, willingnessRes] = await Promise.all([
      supabase
        .from('cdc_drive_eligibility')
        .select('*')
        .eq('drive_id', driveId)
        .maybeSingle(),
      supabase
        .from('cdc_recruiters')
        .select('*')
        .eq('id', drive.recruiter_id)
        .maybeSingle(),
      supabase
        .from('cdc_drive_types')
        .select('*')
        .eq('id', drive.drive_type_id)
        .maybeSingle(),
      supabase
        .from('cdc_drive_willingness')
        .select('*')
        .eq('drive_id', driveId)
        .eq('learner_id', learner.id)
        .maybeSingle(),
    ]);

    if (eligibilityRes.error) throw eligibilityRes.error;
    if (recruiterRes.error) throw recruiterRes.error;
    if (driveTypeRes.error) throw driveTypeRes.error;
    if (willingnessRes.error) throw willingnessRes.error;

    const eligibility = (eligibilityRes.data ?? null) as CdcDriveEligibility | null;
    const is_eligible = computeIsEligible(eligibility, learner.program_id);
    const is_window_open = drive.status === 'willingness_open';

    return {
      drive,
      eligibility,
      recruiter: (recruiterRes.data ?? null) as CdcRecruiter | null,
      drive_type: (driveTypeRes.data ?? null) as CdcDriveType | null,
      learner,
      willingness: (willingnessRes.data ?? null) as CdcDriveWillingness | null,
      is_eligible,
      is_window_open,
    };
  }

  /**
   * Declare or update a learner's willingness for a drive.
   *
   * Behavior:
   * - intent='willing':  INSERT or UPDATE → status='willing', clear withdrawn_*
   * - intent='decline':  INSERT or UPDATE → status='withdrawn', set withdrawn_at + reason
   *
   * Guards (caller is the learner whose auth.uid() resolved to learner.id):
   * - drive.status must be 'willingness_open'
   * - learner.program_id must be in eligibility.program_ids[]
   * - eligibility row must exist (otherwise we can't snapshot)
   *
   * Idempotent: re-asserting the same intent succeeds and returns the row.
   * Switching intent is a single UPDATE that appends to willingness_audit.
   */
  static async declareWillingness(
    supabase: SupabaseClient,
    driveId: string,
    learner: { id: string; program_id: string | null },
    userId: string,
    intent: 'willing' | 'decline'
  ): Promise<CdcDriveWillingness> {
    const snapshot = await this.getLearnerWillingnessSnapshot(supabase, driveId, learner);
    if (!snapshot) throw new Error('Drive not found');
    if (!snapshot.is_window_open) {
      throw new Error(
        `Willingness window is not open for this drive (status: ${snapshot.drive.status})`
      );
    }
    if (!snapshot.eligibility) {
      throw new Error('This drive has no eligibility criteria configured yet — cannot declare');
    }
    if (!snapshot.is_eligible) {
      throw new Error("Your program is not in this drive's eligibility list");
    }

    const now = new Date().toISOString();
    const newStatus = intent === 'willing' ? 'willing' : 'withdrawn';

    // Build eligibility_snapshot — captures the criteria AT the moment the learner declared
    const eligibility_snapshot = {
      eligibility_id: snapshot.eligibility.id,
      program_ids: snapshot.eligibility.program_ids,
      min_cgpa: snapshot.eligibility.min_cgpa,
      min_semester: snapshot.eligibility.min_semester,
      max_arrears: snapshot.eligibility.max_arrears,
      allowed_genders: snapshot.eligibility.allowed_genders,
      program_year: snapshot.eligibility.program_year,
      passed_out_allowed: snapshot.eligibility.passed_out_allowed,
      snapshot_at: now,
      learner_program_id: learner.program_id,
    };

    if (snapshot.willingness) {
      // UPDATE existing row — append audit entry
      const previousAudit = Array.isArray(snapshot.willingness.willingness_audit)
        ? (snapshot.willingness.willingness_audit as unknown[])
        : [];
      const auditEntry = {
        at: now,
        actor: userId,
        from_status: snapshot.willingness.status,
        to_status: newStatus,
        via: 'learner-ui',
      };

      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        declared_at: now,
        declared_by_user_id: userId,
        updated_at: now,
        willingness_audit: [...previousAudit, auditEntry],
      };
      if (newStatus === 'withdrawn') {
        updatePayload.withdrawn_at = now;
        updatePayload.withdrawn_reason = 'Declined during willingness window';
      } else {
        updatePayload.withdrawn_at = null;
        updatePayload.withdrawn_reason = null;
      }

      const { data, error } = await supabase
        .from('cdc_drive_willingness')
        .update(updatePayload)
        .eq('id', snapshot.willingness.id)
        .select()
        .single();
      if (error) throw error;
      return data as CdcDriveWillingness;
    }

    // INSERT new row
    const insertPayload: Record<string, unknown> = {
      drive_id: driveId,
      learner_id: learner.id,
      status: newStatus,
      eligibility_snapshot,
      declared_by_user_id: userId,
      declared_at: now,
      willingness_audit: [
        {
          at: now,
          actor: userId,
          from_status: null,
          to_status: newStatus,
          via: 'learner-ui',
        },
      ],
    };
    if (newStatus === 'withdrawn') {
      insertPayload.withdrawn_at = now;
      insertPayload.withdrawn_reason = 'Declined during willingness window';
    }

    const { data, error } = await supabase
      .from('cdc_drive_willingness')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as CdcDriveWillingness;
  }
}

/**
 * Helper — exported for unit tests / API route reuse.
 *
 * Eligibility check: learner's program_id must appear in eligibility.program_ids[].
 * Returns false if either is null/missing or program_id is not in the list.
 */
export function computeIsEligible(
  eligibility: CdcDriveEligibility | null,
  learnerProgramId: string | null
): boolean {
  if (!eligibility) return false;
  if (!learnerProgramId) return false;
  if (!Array.isArray(eligibility.program_ids)) return false;
  return eligibility.program_ids.includes(learnerProgramId);
}
