// lib/services/admin/internship-policy-service.ts
// Created: 2026-05-08 — Phase 1C (Agent C scaffold)
//
// Purpose: Typed service for reading + writing internship policy rows in platform_policies.
//          Pattern mirrors counselor-routing-config-service.ts (Spec #537).
//
// TODO(Agent B): Wire to fn_internship_evaluate_policy() reader function once
//               myjkkn-internship-module-spec.md §4 migration is applied.
//
// Current state: STUB — reads/writes platform_policies table directly.
//                cascade-preview hook is stubbed (returns empty consequences).
//                Replace with real RPC once Agent B lands.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CascadePreviewData, ProposedChange } from '@/components/shared/cascade-preview/types';

// ────────────────────────────────────────────────────────────
// Known policy keys (from spec §11 Round 6-7 + §3)
// ────────────────────────────────────────────────────────────
export const INTERNSHIP_POLICY_KEYS = {
  // Eligibility
  FEE_COMPLIANCE_THRESHOLD: 'internship.policy.fee_compliance_threshold_pct',
  REGISTRATION_CUTOFF_DAYS: 'internship.policy.registration_cutoff_days',

  // Logbook
  LOGBOOK_SUBMIT_WITHIN_HOURS: 'internship.logbook.submit_within_hours',
  LOGBOOK_LATE_PENALTY_PCT: 'internship.logbook.late_penalty_pct',
  LOGBOOK_EDIT_WINDOW_HOURS: 'internship.logbook.edit_window_hours',

  // Attendance
  ATTENDANCE_FLAG_BELOW_PCT: 'internship.attendance.flag_below_pct',
  GPS_STRICT_MODE: 'internship.gps.strict_mode',

  // Roster
  ROSTER_REMINDER_D_MINUS: 'internship.roster.reminder_d_minus',

  // Vehicle
  VEHICLE_LEAD_TIME_DAYS: 'internship.vehicle.lead_time_days',

  // Approval
  APPROVAL_ESCALATE_AFTER_HOURS: 'internship.approval.escalate_after_hours',

  // Notifications
  NOTIFY_ROSTER_REMINDER_D_MINUS: 'internship.notify.roster_reminder_d_minus',
  NOTIFY_FACULTY_SCHEDULE_D_MINUS: 'internship.notify.faculty_schedule_d_minus',
  NOTIFY_LOGBOOK_REMINDER_AFTER_HOURS: 'internship.notify.logbook_reminder_after_hours',
  NOTIFY_EVALUATION_REMINDER_AFTER_HOURS: 'internship.notify.evaluation_reminder_after_hours',

  // Incident escalation
  INCIDENT_MINOR_NOTIFY_WITHIN_HOURS: 'internship.incident.minor.notify_within_hours',
  INCIDENT_MAJOR_NOTIFY_WITHIN_HOURS: 'internship.incident.major.notify_within_hours',
  INCIDENT_CRITICAL_NOTIFY_WITHIN_HOURS: 'internship.incident.critical.notify_within_hours',
} as const;

export type InternshipPolicyKey = (typeof INTERNSHIP_POLICY_KEYS)[keyof typeof INTERNSHIP_POLICY_KEYS];

export interface PolicyRow {
  policy_key: string;
  value: unknown;
  description?: string;
  updated_at?: string;
  updated_by?: string | null;
}

// Default values used for display when row doesn't exist yet in DB
export const INTERNSHIP_POLICY_DEFAULTS: Record<string, unknown> = {
  [INTERNSHIP_POLICY_KEYS.FEE_COMPLIANCE_THRESHOLD]: 70,
  [INTERNSHIP_POLICY_KEYS.REGISTRATION_CUTOFF_DAYS]: 7,
  [INTERNSHIP_POLICY_KEYS.LOGBOOK_SUBMIT_WITHIN_HOURS]: 24,
  [INTERNSHIP_POLICY_KEYS.LOGBOOK_LATE_PENALTY_PCT]: 10,
  [INTERNSHIP_POLICY_KEYS.LOGBOOK_EDIT_WINDOW_HOURS]: 24,
  [INTERNSHIP_POLICY_KEYS.ATTENDANCE_FLAG_BELOW_PCT]: 75,
  [INTERNSHIP_POLICY_KEYS.GPS_STRICT_MODE]: true,
  [INTERNSHIP_POLICY_KEYS.ROSTER_REMINDER_D_MINUS]: 3,
  [INTERNSHIP_POLICY_KEYS.VEHICLE_LEAD_TIME_DAYS]: 5,
  [INTERNSHIP_POLICY_KEYS.APPROVAL_ESCALATE_AFTER_HOURS]: 72,
  [INTERNSHIP_POLICY_KEYS.NOTIFY_ROSTER_REMINDER_D_MINUS]: 3,
  [INTERNSHIP_POLICY_KEYS.NOTIFY_FACULTY_SCHEDULE_D_MINUS]: 2,
  [INTERNSHIP_POLICY_KEYS.NOTIFY_LOGBOOK_REMINDER_AFTER_HOURS]: 18,
  [INTERNSHIP_POLICY_KEYS.NOTIFY_EVALUATION_REMINDER_AFTER_HOURS]: 48,
  [INTERNSHIP_POLICY_KEYS.INCIDENT_MINOR_NOTIFY_WITHIN_HOURS]: 24,
  [INTERNSHIP_POLICY_KEYS.INCIDENT_MAJOR_NOTIFY_WITHIN_HOURS]: 4,
  [INTERNSHIP_POLICY_KEYS.INCIDENT_CRITICAL_NOTIFY_WITHIN_HOURS]: 1,
};

export class InternshipPolicyService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** Fetch one policy row. Falls back to default when row doesn't exist yet. */
  static async get(policyKey: string): Promise<PolicyRow | null> {
    const { data, error } = await (this.supabase as any)
      .from('platform_policies')
      .select('policy_key, value, description, updated_at, updated_by')
      .eq('policy_key', policyKey)
      .maybeSingle();

    if (error) {
      console.error('[admin/internship-policy] get failed:', error);
      return null;
    }
    if (!data && policyKey in INTERNSHIP_POLICY_DEFAULTS) {
      return {
        policy_key: policyKey,
        value: INTERNSHIP_POLICY_DEFAULTS[policyKey],
        description: undefined,
        updated_at: undefined,
        updated_by: null,
      };
    }
    return (data as PolicyRow) || null;
  }

  /** Fetch multiple policy rows in one query. */
  static async getMany(policyKeys: string[]): Promise<Record<string, PolicyRow>> {
    const { data, error } = await (this.supabase as any)
      .from('platform_policies')
      .select('policy_key, value, description, updated_at, updated_by')
      .in('policy_key', policyKeys);

    if (error) {
      console.error('[admin/internship-policy] getMany failed:', error);
    }

    const result: Record<string, PolicyRow> = {};
    // Seed defaults for keys not found in DB
    for (const key of policyKeys) {
      if (key in INTERNSHIP_POLICY_DEFAULTS) {
        result[key] = {
          policy_key: key,
          value: INTERNSHIP_POLICY_DEFAULTS[key],
          description: undefined,
          updated_at: undefined,
          updated_by: null,
        };
      }
    }
    // Overlay actual DB values
    for (const row of (data || []) as PolicyRow[]) {
      result[row.policy_key] = row;
    }
    return result;
  }

  /**
   * Upsert a policy row.
   * Writes to platform_policies; RLS limits writes to super_admin.
   */
  static async upsert(
    policyKey: string,
    value: unknown
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: userData, error: userErr } = await this.supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return { ok: false, error: 'Not authenticated' };
    }

    const { error } = await (this.supabase as any)
      .from('platform_policies')
      .upsert(
        {
          policy_key: policyKey,
          value,
          updated_by: userData.user.id,
        },
        { onConflict: 'policy_key' }
      );

    if (error) {
      console.error('[admin/internship-policy] upsert failed:', error);
      return { ok: false, error: error.message || 'Save failed' };
    }
    return { ok: true };
  }

  /**
   * Compute cascade preview for a proposed change.
   *
   * TODO(Agent B): Replace with RPC call to fn_internship_evaluate_policy() once migration lands.
   * Currently returns a stub that shows a placeholder consequence so the UI is exercisable.
   */
  static async computeCascadePreview(
    proposedChanges: ProposedChange[]
  ): Promise<CascadePreviewData> {
    // STUB: In production this calls fn_internship_evaluate_policy() via supabase.rpc()
    // For now, return a placeholder consequence so the cascade-preview component renders.
    await new Promise((resolve) => setTimeout(resolve, 400)); // simulate network

    const consequences = proposedChanges
      .filter((c) => c.currentValue !== c.proposedValue)
      .map((change) => ({
        summary: `Changing ${change.label} from ${String(change.currentValue)}${change.unit ?? ''} to ${String(change.proposedValue)}${change.unit ?? ''} will affect in-flight cycles across all active colleges. Run fn_internship_evaluate_policy() for precise impact numbers once Agent B migration is applied.`,
        affectedCycles: [],
        notificationAudience: { hods: 0, coordinators: 0, learners: 0, faculties: 0 },
        severity: 'info' as const,
      }));

    return {
      consequences,
      computedAt: new Date().toISOString(),
      isLoading: false,
    };
  }
}
