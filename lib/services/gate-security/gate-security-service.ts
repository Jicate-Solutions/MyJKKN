/**
 * Gate Security — client wrappers over the SECURITY DEFINER RPCs in
 * supabase/migrations/20260915100000_gate_pass_service_request_and_gate_security.sql.
 *
 * Every RPC authorises itself (gate_can_scan / gate_can_record /
 * gate_security.reports.view), so these wrappers do no permission logic;
 * they only shape the answers for the screens.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { GatePassService } from '@/lib/services/campus-living/gate-pass-service';
import {
  resolveScannedLearner,
  type ScannedLearner,
} from '@/lib/services/campus-living/gate-scan-service';
import {
  classifyCardCode,
  decideScan,
  type GateDecision,
  type ScannedPass,
} from '@/lib/services/campus-living/gate-scan-resolve';

export type GatePersonType = 'learner' | 'staff';

export interface LearnerSnapshot {
  person_type: 'learner';
  profile_id: string;
  learner_profile_id: string | null;
  full_name: string | null;
  roll_number: string | null;
  register_number: string | null;
  jkkn_id: string | null;
  email: string | null;
  mobile: string | null;
  photo_url: string | null;
  institution_id: string | null;
  lifecycle_status: string | null;
}

export interface StaffSnapshot {
  person_type: 'staff';
  staff_id: string;
  profile_id: string | null;
  full_name: string | null;
  staff_code: string | null;
  email: string | null;
  mobile: string | null;
  photo_url: string | null;
  department: string | null;
  designation: string | null;
  institution_id: string | null;
  is_active: boolean | null;
  /** Direction of the last movement recorded TODAY, or null. */
  last_direction: 'in' | 'out' | null;
  last_movement_at: string | null;
  /** Latest live staff pass (reason entered by the team member), or null. */
  open_pass: StaffPass | null;
}

export interface StaffPass {
  id: string;
  pass_number: string;
  qr_code?: string;
  reason: string;
  status: 'open' | 'out' | 'completed' | 'cancelled';
  created_at: string;
  out_time: string | null;
  in_time?: string | null;
  service_request_id?: string | null;
}

export interface SearchHit {
  person_type: GatePersonType;
  profile_id: string | null;
  learner_profile_id: string | null;
  staff_id: string | null;
  full_name: string | null;
  code: string | null;
  email: string | null;
  photo_url: string | null;
  subtitle: string | null;
}

export interface TodayActivity {
  out: number;
  in: number;
  outside: number;
}

export interface ReportRow {
  person_type: GatePersonType;
  person_name: string | null;
  code: string | null;
  department: string | null;
  designation: string | null;
  institution_id: string | null;
  gate_pass_id: string | null;
  pass_number: string | null;
  pass_status: string | null;
  reason: string | null;
  approved_by: string | null;
  out_time: string | null;
  in_time: string | null;
  movement_date: string;
  current_status: string | null;
  movement_id: string | null;
  reason_updated_at: string | null;
}

export interface ReportFilters {
  from: string;
  to: string;
  personType?: GatePersonType | null;
  institutionId?: string | null;
  departmentId?: string | null;
  state?: 'outside' | 'completed' | null;
}

/** What one scan / search pick resolves to, ready for the verdict panel. */
export type GateSubject =
  | {
      kind: 'learner';
      learner: ScannedLearner;
      snapshot: LearnerSnapshot | null;
      decision: GateDecision;
      approvedBy: string | null;
    }
  | { kind: 'staff'; snapshot: StaffSnapshot; staffPassId: string | null };

export const STAFF_REASONS = ['Official Duty', 'Late Arrival', 'Personal Work', 'Emergency', 'Other'] as const;

// Untyped on purpose: the gate RPCs / gate_staff_passes are newer than
// types/supabase.ts (regenerate to tighten). Every result is cast explicitly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = (): any => createClientSupabaseClient();

function rpcError(error: { message?: string } | null, fallback: string): never {
  const msg = (error?.message || fallback).replace(/^gate:\s*/i, '');
  throw new Error(msg);
}

export const GateSecurityService = {
  async todayActivity(): Promise<TodayActivity> {
    const { data, error } = await sb().rpc('gate_today_activity');
    if (error) rpcError(error, 'Could not load today’s activity');
    const d = (data ?? {}) as Partial<TodayActivity>;
    return { out: Number(d.out ?? 0), in: Number(d.in ?? 0), outside: Number(d.outside ?? 0) };
  },

  async search(query: string): Promise<SearchHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const { data, error } = await sb().rpc('gate_search_people', { p_query: q, p_limit: 12 });
    if (error) rpcError(error, 'Search failed');
    return (data ?? []) as SearchHit[];
  },

  async learnerSnapshot(profileId: string): Promise<LearnerSnapshot | null> {
    const { data, error } = await sb().rpc('gate_person_snapshot', { p_profile_id: profileId });
    if (error) rpcError(error, 'Could not read the learner');
    return (data as LearnerSnapshot | null) ?? null;
  },

  async staffSnapshot(staffId: string): Promise<StaffSnapshot | null> {
    const { data, error } = await sb().rpc('gate_person_snapshot', { p_staff_id: staffId });
    if (error) rpcError(error, 'Could not read the team member');
    return (data as StaffSnapshot | null) ?? null;
  },

  /**
   * Turn any scanned code into a subject: a pass QR ('QR-…'), a pass number
   * ('GP-…'), a staff QR ('GS:<uuid>'), or the ID-card codes the hostel
   * scanner already accepts (learners_profiles UUID / JKKN id).
   */
  async resolveCode(rawCode: string): Promise<GateSubject | null> {
    const code = (rawCode ?? '').trim();
    if (!code) return null;

    if (/^(GS:|QR-|GP-|SP-)/i.test(code)) {
      const { data, error } = await sb().rpc('gate_resolve_token', { p_token: code });
      if (error) rpcError(error, 'Could not read that code');
      const t = data as { kind: 'staff' | 'pass'; staff_id?: string; profile_id?: string; staff_pass_id?: string } | null;
      if (!t) return null;
      if (t.kind === 'staff' && t.staff_id) return this.resolveStaff(t.staff_id, t.staff_pass_id ?? null);
      if (t.kind === 'pass' && t.profile_id) return this.resolveLearner(t.profile_id);
      return null;
    }

    // ID-card shapes: reuse the hostel scanner's resolver (handles UUID and
    // JKKN id, and classifies leavers).
    if (classifyCardCode(code) !== 'unknown') {
      const learner = await resolveScannedLearner(code);
      if (!learner) return null;
      if (learner.subject.kind === 'team_member') {
        // A staff ID card: find their staff row through the profile email.
        const hit = await this.staffByProfile(learner.profileId);
        if (hit) return this.resolveStaff(hit);
      }
      return this.buildLearnerSubject(learner);
    }
    return null;
  },

  async resolveLearner(profileId: string): Promise<GateSubject | null> {
    const learner = await resolveScannedLearner(profileId);
    if (!learner) return null;
    return this.buildLearnerSubject(learner);
  },

  async resolveStaff(staffId: string, staffPassId: string | null = null): Promise<GateSubject | null> {
    const snapshot = await this.staffSnapshot(staffId);
    if (!snapshot) return null;
    return { kind: 'staff', snapshot, staffPassId: staffPassId ?? snapshot.open_pass?.id ?? null };
  },

  async staffByProfile(profileId: string): Promise<string | null> {
    const { data: p } = await sb().from('profiles').select('email').eq('id', profileId).maybeSingle();
    const email = (p as { email: string | null } | null)?.email?.trim();
    const byProfile = await sb().from('staff').select('id').eq('profile_id', profileId).limit(1);
    const first = (byProfile.data as Array<{ id: string }> | null)?.[0]?.id;
    if (first) return first;
    if (!email) return null;
    for (const column of ['institution_email', 'email'] as const) {
      const { data } = await sb().from('staff').select('id').eq(column, email).limit(1);
      const id = (data as Array<{ id: string }> | null)?.[0]?.id;
      if (id) return id;
    }
    return null;
  },

  async buildLearnerSubject(learner: ScannedLearner): Promise<GateSubject> {
    const [snapshot, passes] = await Promise.all([
      this.learnerSnapshot(learner.profileId).catch(() => null),
      GatePassService.getScannablePassesForLearner(learner.profileId) as Promise<ScannedPass[]>,
    ]);
    const decision = decideScan(learner.subject, passes, new Date());
    let approvedBy: string | null = null;
    if (decision.pass) {
      const full = passes.find((p) => p.id === decision.pass?.id) as
        | (ScannedPass & { approved_by?: string | null })
        | undefined;
      if (full?.approved_by) {
        const { data } = await sb().from('profiles').select('full_name').eq('id', full.approved_by).maybeSingle();
        approvedBy = (data as { full_name: string | null } | null)?.full_name ?? null;
      }
    }
    return { kind: 'learner', learner, snapshot, decision, approvedBy };
  },

  async recordLearnerMovement(passId: string, direction: 'in' | 'out', gateLocation?: string) {
    const { data, error } = await sb().rpc('gate_record_movement', {
      p_direction: direction,
      p_gate_pass_id: passId,
      p_staff_id: null,
      p_gate_location: gateLocation ?? null,
      p_reason: null,
    });
    if (error) rpcError(error, 'Could not record the movement');
    return data as { movement_id: string; recorded_at: string; pass_status: string };
  },

  async recordStaffMovement(
    staffId: string,
    direction: 'in' | 'out',
    reason?: string | null,
    gateLocation?: string,
    staffPassId?: string | null
  ) {
    const { data, error } = await sb().rpc('gate_record_movement', {
      p_direction: direction,
      p_gate_pass_id: null,
      p_staff_id: staffId,
      p_gate_location: gateLocation ?? null,
      p_reason: reason ?? null,
      p_staff_pass_id: staffPassId ?? null,
    });
    if (error) rpcError(error, 'Could not record the movement');
    return data as { movement_id: string; recorded_at: string };
  },

  async updateReason(movementId: string, reason: string) {
    const { error } = await sb().rpc('gate_update_movement_reason', {
      p_movement_id: movementId,
      p_reason: reason,
    });
    if (error) rpcError(error, 'Could not update the reason');
  },

  async report(filters: ReportFilters): Promise<ReportRow[]> {
    const { data, error } = await sb().rpc('gate_in_out_report', {
      p_from: filters.from,
      p_to: filters.to,
      p_person_type: filters.personType ?? null,
      p_institution_id: filters.institutionId ?? null,
      p_department_id: filters.departmentId ?? null,
      p_state: filters.state ?? null,
    });
    if (error) rpcError(error, 'Could not load the report');
    return (data ?? []) as ReportRow[];
  },

  /** Team member self-service: reason in, QR out. No approval. */
  async createStaffPass(reason: string): Promise<StaffPass> {
    const { data, error } = await sb().rpc('gate_create_staff_pass', { p_reason: reason });
    if (error) rpcError(error, 'Could not create the gate pass');
    return data as StaffPass;
  },

  async myStaffPasses(limit = 10): Promise<StaffPass[]> {
    const { data, error } = await sb()
      .from('gate_staff_passes')
      .select('id, pass_number, qr_code, reason, status, created_at, out_time, in_time, service_request_id')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) rpcError(error, 'Could not load your gate passes');
    return (data ?? []) as StaffPass[];
  },

  /** Today's movements for the requester (staff self-view / reason edit). */
  async myMovements(limit = 20) {
    const { data, error } = await sb()
      .from('gate_movements')
      .select('id, direction, recorded_at, movement_date, reason, reason_updated_at, gate_location')
      .eq('person_type', 'staff')
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (error) rpcError(error, 'Could not load your movements');
    return (data ?? []) as Array<{
      id: string;
      direction: 'in' | 'out';
      recorded_at: string;
      movement_date: string;
      reason: string | null;
      reason_updated_at: string | null;
      gate_location: string | null;
    }>;
  },
};
