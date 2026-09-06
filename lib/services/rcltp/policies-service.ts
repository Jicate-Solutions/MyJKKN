/**
 * MyJKKN RCLTP — Policies service (read wrappers + admin editor backing)
 * ============================================================================
 *
 * EXTENDS the EXISTING platform_policies substrate — it does NOT reinvent it.
 *
 *   * Config rows  = EXISTING public.platform_policies, namespace `rcltp.*`,
 *                    seeded GLOBAL (scope_type='global', scope_id=NULL) by
 *                    supabase/migrations/20260614100000_rcltp_policies_seed.sql.
 *                    There is NO rcltp_* config/settings table.
 *   * Runtime reads = EXISTING resolver RPCs (no new reader functions written):
 *                    fn_get_policy_int(key, default, scope_id)  -> int
 *                    fn_get_policy_bool(key, default, scope_id) -> bool
 *                    fn_get_policy_text(key, default, scope_id) -> text
 *                    fn_get_policy_json(key, default, scope_id) -> jsonb
 *                    (see 20260429000002_platform_policies_substrate.sql)
 *   * Per-institution overrides happen through the SAME scope mechanism: pass an
 *     `institutionId` and the resolver applies user > institution > role > global
 *     priority. Today only global rows are seeded, so passing nothing returns the
 *     global default.
 *
 * Two surfaces in one file (matches the ai-pulse/clinical-reasoning precedent):
 *   1. Typed READ wrappers (RcltpPoliciesService.get*) — what Phase C runtime
 *      code calls. Each bakes the seeded default in as the RPC `p_default`, so a
 *      missing/inactive row fails soft to the documented default and a feature
 *      never breaks on a config lookup. NOTE: fn_get_policy resolves only
 *      is_active=true rows — the 3 MyJKKN-pending rows are seeded is_active=false,
 *      so these wrappers correctly return the baked default for them until an
 *      admin activates the row in the editor.
 *   2. LIST / UPDATE for the admin editor (RcltpPoliciesService.listAll /
 *      updateValue) + React Query hooks. The editor needs the full row
 *      (value + ui_widget + ui_options + ui_consequence + ui_cascade +
 *      ui_category + is_active), which the typed RPCs don't return, so the list
 *      reads the table directly and INCLUDES is_active=false rows (the Director
 *      must see + eventually activate the MyJKKN-pending placeholders).
 *
 * Convention: canonical rcltp service shape — class with `static` methods over a
 * singleton createClientSupabaseClient(), `(this.supabase as any)` at the seam
 * (generated Database types predate the rcltp.* rows + the ui_* columns), and
 * react-hot-toast for user-facing write feedback (see schedule-service.ts).
 *
 * ----------------------------------------------------------------------------
 * CONSUMPTION MAP — which Phase C code reads which key (and via which wrapper)
 * ----------------------------------------------------------------------------
 *   rcltp.schedule.cycles_per_year        getCyclesPerYear()
 *       → F6 scheduling: the `rcltp-due-reminders` cron + schedule-service
 *         (RcltpScheduleService) when proposing the N assessment windows/year.
 *   rcltp.schedule.reminder_lead_days     getReminderLeadDays()
 *       → F6: `rcltp-due-reminders` cron — how many days ahead to fire the
 *         "assessment due" notification (F10/§6).
 *   rcltp.assessment.official_attempts    getOfficialAttempts()
 *       → F8 assessment integrity: the assessment-start route / assessments-
 *         service gate that blocks a 2nd official attempt (re-takes = teacher
 *         override only).
 *   rcltp.practice.allocation_by_band     getPracticeAllocationByBand()
 *       → F7 adaptive practice: RcltpScheduleService.assignWeeklyPractice()
 *         (today a stub) reads the 5/3/1-by-band map to size the weekly set.
 *   rcltp.scoring.low_confidence_threshold getLowConfidenceThreshold()
 *       → C voice scoring: the Part-A scoring route — recordings below this
 *         engine-confidence get held in the teacher review queue (F8) instead
 *         of auto-publishing to the parent.
 *   rcltp.bands.mastery_threshold (MyJKKN-pending) getMasteryThreshold()
 *       → F5 band logic: the mastery-gate that promotes a learner to the next
 *         band. Returns the baked default until MyJKKN validates + admin activates.
 *   rcltp.scoring.weights (MyJKKN-pending)  getScoringWeights()
 *       → F5/F11 composite score: combines Part-A (reading) + Part-B
 *         (comprehension) into Overall on the report. Baked default until MyJKKN
 *         supplies the validated formula (the 67→85 example, PRD §11).
 *   rcltp.bands.nipun_wpm (MyJKKN-pending)  getNipunWpmTargets()
 *       → F5/F13 band logic: per-grade words-per-minute baselines flagging
 *         below/at/above grade. Baked default until NIPUN-validated figures land.
 *   rcltp.audio.retention_days            getAudioRetentionDays()
 *       → §9 retention: the `rcltp-audio-purge` cron computes purge_after and
 *         deletes child voice recordings older than this (DPDP).
 *   rcltp.voice.engine                    getVoiceEngine()
 *       → C voice: the Part-A scoring service picks the speech engine
 *         (speechace | azure_en_in) — also a data-residency decision.
 *   rcltp.consent.voice_required          getVoiceConsentRequired()
 *       → F9 consent: the assessment flow — no parent voice consent ⇒ skip
 *         Part A, run Part B text-only.
 *   rcltp.notifications.realtime          getRealtimeNotifications()
 *       → F10 notifications: the notification dispatcher — whether to push
 *         RCLTP alerts in real time vs. bell/WhatsApp/email only.
 *   rcltp.language.default                getDefaultLanguage()
 *       → §1 language: the assessment-bootstrap selects which language's
 *         passages/questions/VBB + speech engine to serve (v1 = 'en').
 * ----------------------------------------------------------------------------
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ----------------------------------------------------------------------------
// Policy keys — single source of truth for the rcltp.* namespace.
// Mirrors 20260614100000_rcltp_policies_seed.sql exactly.
// ----------------------------------------------------------------------------

export const RCLTP_POLICY_KEYS = {
  CYCLES_PER_YEAR: 'rcltp.schedule.cycles_per_year',
  REMINDER_LEAD_DAYS: 'rcltp.schedule.reminder_lead_days',
  OFFICIAL_ATTEMPTS: 'rcltp.assessment.official_attempts',
  PRACTICE_ALLOCATION_BY_BAND: 'rcltp.practice.allocation_by_band',
  LOW_CONFIDENCE_THRESHOLD: 'rcltp.scoring.low_confidence_threshold',
  MASTERY_THRESHOLD: 'rcltp.bands.mastery_threshold',
  SCORING_WEIGHTS: 'rcltp.scoring.weights',
  NIPUN_WPM: 'rcltp.bands.nipun_wpm',
  AUDIO_RETENTION_DAYS: 'rcltp.audio.retention_days',
  VOICE_ENGINE: 'rcltp.voice.engine',
  VOICE_CONSENT_REQUIRED: 'rcltp.consent.voice_required',
  NOTIFICATIONS_REALTIME: 'rcltp.notifications.realtime',
  LANGUAGE_DEFAULT: 'rcltp.language.default',
} as const;

export type RcltpPolicyKey =
  (typeof RCLTP_POLICY_KEYS)[keyof typeof RCLTP_POLICY_KEYS];

// Baked-in defaults — MUST equal the seed's `value` so a missing/inactive row
// fails soft to the same number the row would carry. MyJKKN-pending defaults are
// the documented built-in fallbacks (NOT authoritative MyJKKN numbers).
export const RCLTP_POLICY_DEFAULTS = {
  cyclesPerYear: 6,
  reminderLeadDays: 3,
  officialAttempts: 1,
  practiceAllocationByBand: {
    emergent: 5,
    transitional: 3,
    proficient: 1,
    super_proficient: 1,
  } as Record<string, number>,
  lowConfidenceThreshold: 0.6,
  // MyJKKN-pending — built-in fallback, replaced once MyJKKN validates + admin activates.
  masteryThreshold: 0.7,
  scoringWeights: { reading: 0.5, comprehension: 0.5 } as Record<string, number>,
  nipunWpm: {
    '1': null,
    '2': 45,
    '3': null,
    '4': null,
    '5': null,
    '6': null,
    '7': null,
    '8': null,
    '9': null,
    '10': null,
  } as Record<string, number | null>,
  audioRetentionDays: 365,
  voiceEngine: 'speechace',
  voiceConsentRequired: true,
  notificationsRealtime: false,
  defaultLanguage: 'en',
} as const;

// ----------------------------------------------------------------------------
// Row shape returned to the admin editor (reuses the typed-widget UI types
// from the clinical_reasoning hook so widgets render identically).
// ----------------------------------------------------------------------------

export interface RcltpUICascadeEntry {
  effect: string;
  severity: 'low' | 'medium' | 'high';
}

export interface RcltpUIDropdownOption {
  value: string;
  label: string;
}

export type RcltpUIWidgetKind =
  | 'number'
  | 'dropdown'
  | 'textarea'
  | 'toggle'
  | 'multi_select'
  | 'text'
  | 'json';

export interface RcltpPolicyRow {
  id: string;
  policy_key: string;
  value: unknown;
  description: string | null;
  data_type: string;
  ui_widget: RcltpUIWidgetKind | null;
  ui_options: RcltpUIDropdownOption[] | null;
  ui_consequence: string | null;
  ui_cascade: RcltpUICascadeEntry[] | null;
  ui_category: string | null;
  is_active: boolean;
}

const POLICY_NAMESPACE = 'rcltp.';

// ----------------------------------------------------------------------------
// Service
// ----------------------------------------------------------------------------

export class RcltpPoliciesService {
  private static supabase = createClientSupabaseClient();

  // =========================================================================
  // Typed READ wrappers over the EXISTING fn_get_policy_* RPCs.
  // Each bakes the seeded default; `institutionId` flows to the resolver's
  // scope_id for future per-institution overrides (global today).
  // =========================================================================

  private static async getInt(
    key: RcltpPolicyKey,
    fallback: number,
    institutionId?: string | null
  ): Promise<number> {
    const { data, error } = await (this.supabase as any).rpc('fn_get_policy_int', {
      p_key: key,
      p_default: fallback,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      console.warn(`[rcltp/policies] fn_get_policy_int failed for ${key}, using default`, error.message);
      return fallback;
    }
    return (data ?? fallback) as number;
  }

  private static async getBool(
    key: RcltpPolicyKey,
    fallback: boolean,
    institutionId?: string | null
  ): Promise<boolean> {
    const { data, error } = await (this.supabase as any).rpc('fn_get_policy_bool', {
      p_key: key,
      p_default: fallback,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      console.warn(`[rcltp/policies] fn_get_policy_bool failed for ${key}, using default`, error.message);
      return fallback;
    }
    return (data ?? fallback) as boolean;
  }

  private static async getText(
    key: RcltpPolicyKey,
    fallback: string,
    institutionId?: string | null
  ): Promise<string> {
    const { data, error } = await (this.supabase as any).rpc('fn_get_policy_text', {
      p_key: key,
      p_default: fallback,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      console.warn(`[rcltp/policies] fn_get_policy_text failed for ${key}, using default`, error.message);
      return fallback;
    }
    return (data ?? fallback) as string;
  }

  private static async getJson<T>(
    key: RcltpPolicyKey,
    fallback: T,
    institutionId?: string | null
  ): Promise<T> {
    const { data, error } = await (this.supabase as any).rpc('fn_get_policy_json', {
      p_key: key,
      p_default: fallback as unknown as object,
      p_scope_id: institutionId ?? null,
    });
    if (error) {
      console.warn(`[rcltp/policies] fn_get_policy_json failed for ${key}, using default`, error.message);
      return fallback;
    }
    return (data ?? fallback) as T;
  }

  // --- F6 scheduling -------------------------------------------------------

  /** Assessment cycles run per academic year (default 6). */
  static getCyclesPerYear(institutionId?: string | null): Promise<number> {
    return this.getInt(
      RCLTP_POLICY_KEYS.CYCLES_PER_YEAR,
      RCLTP_POLICY_DEFAULTS.cyclesPerYear,
      institutionId
    );
  }

  /** Days before a window opens that reminders are sent (default 3). */
  static getReminderLeadDays(institutionId?: string | null): Promise<number> {
    return this.getInt(
      RCLTP_POLICY_KEYS.REMINDER_LEAD_DAYS,
      RCLTP_POLICY_DEFAULTS.reminderLeadDays,
      institutionId
    );
  }

  // --- F8 assessment integrity --------------------------------------------

  /** Official scored attempts per assessment; re-takes via teacher override (default 1). */
  static getOfficialAttempts(institutionId?: string | null): Promise<number> {
    return this.getInt(
      RCLTP_POLICY_KEYS.OFFICIAL_ATTEMPTS,
      RCLTP_POLICY_DEFAULTS.officialAttempts,
      institutionId
    );
  }

  // --- F7 adaptive practice ------------------------------------------------

  /** Weekly practice volume per band — the 5/3/1 rule. */
  static getPracticeAllocationByBand(
    institutionId?: string | null
  ): Promise<Record<string, number>> {
    return this.getJson<Record<string, number>>(
      RCLTP_POLICY_KEYS.PRACTICE_ALLOCATION_BY_BAND,
      RCLTP_POLICY_DEFAULTS.practiceAllocationByBand,
      institutionId
    );
  }

  // --- C voice scoring -----------------------------------------------------

  /** Confidence floor (0–1) below which a recording is held for teacher review (default 0.6). */
  static async getLowConfidenceThreshold(
    institutionId?: string | null
  ): Promise<number> {
    // Stored as a JSONB number (0.6); fn_get_policy_int would truncate to 0,
    // so read it as JSON and coerce.
    const v = await this.getJson<number>(
      RCLTP_POLICY_KEYS.LOW_CONFIDENCE_THRESHOLD,
      RCLTP_POLICY_DEFAULTS.lowConfidenceThreshold,
      institutionId
    );
    return typeof v === 'number' ? v : RCLTP_POLICY_DEFAULTS.lowConfidenceThreshold;
  }

  // --- F5 bands / scoring (MyJKKN-pending until activated) -------------------

  /** Mastery fraction (0–1) required for band promotion. MyJKKN-pending — returns baked default until activated. */
  static async getMasteryThreshold(
    institutionId?: string | null
  ): Promise<number> {
    const v = await this.getJson<number>(
      RCLTP_POLICY_KEYS.MASTERY_THRESHOLD,
      RCLTP_POLICY_DEFAULTS.masteryThreshold,
      institutionId
    );
    return typeof v === 'number' ? v : RCLTP_POLICY_DEFAULTS.masteryThreshold;
  }

  /** Reading/comprehension weights for the composite Overall score. MyJKKN-pending. */
  static getScoringWeights(
    institutionId?: string | null
  ): Promise<Record<string, number>> {
    return this.getJson<Record<string, number>>(
      RCLTP_POLICY_KEYS.SCORING_WEIGHTS,
      RCLTP_POLICY_DEFAULTS.scoringWeights,
      institutionId
    );
  }

  /** Per-grade NIPUN words-per-minute baselines (grade 1–10). MyJKKN/NIPUN-pending. */
  static getNipunWpmTargets(
    institutionId?: string | null
  ): Promise<Record<string, number | null>> {
    return this.getJson<Record<string, number | null>>(
      RCLTP_POLICY_KEYS.NIPUN_WPM,
      RCLTP_POLICY_DEFAULTS.nipunWpm,
      institutionId
    );
  }

  // --- §9 retention / C voice / F9 consent / F10 notify / §1 language ------

  /** Days a voice recording is retained before auto-purge (default 365). */
  static getAudioRetentionDays(institutionId?: string | null): Promise<number> {
    return this.getInt(
      RCLTP_POLICY_KEYS.AUDIO_RETENTION_DAYS,
      RCLTP_POLICY_DEFAULTS.audioRetentionDays,
      institutionId
    );
  }

  /** Speech-scoring engine for Part A: 'speechace' | 'azure_en_in' (default 'speechace'). */
  static getVoiceEngine(institutionId?: string | null): Promise<string> {
    return this.getText(
      RCLTP_POLICY_KEYS.VOICE_ENGINE,
      RCLTP_POLICY_DEFAULTS.voiceEngine,
      institutionId
    );
  }

  /** Whether parent voice consent is required before recording Part A (default true). */
  static getVoiceConsentRequired(institutionId?: string | null): Promise<boolean> {
    return this.getBool(
      RCLTP_POLICY_KEYS.VOICE_CONSENT_REQUIRED,
      RCLTP_POLICY_DEFAULTS.voiceConsentRequired,
      institutionId
    );
  }

  /** Master toggle for real-time push of RCLTP notifications (default false). */
  static getRealtimeNotifications(institutionId?: string | null): Promise<boolean> {
    return this.getBool(
      RCLTP_POLICY_KEYS.NOTIFICATIONS_REALTIME,
      RCLTP_POLICY_DEFAULTS.notificationsRealtime,
      institutionId
    );
  }

  /** Default assessment language for a tenant: 'en' | 'ta' | 'te' | 'hi' (default 'en'). */
  static getDefaultLanguage(institutionId?: string | null): Promise<string> {
    return this.getText(
      RCLTP_POLICY_KEYS.LANGUAGE_DEFAULT,
      RCLTP_POLICY_DEFAULTS.defaultLanguage,
      institutionId
    );
  }

  // =========================================================================
  // Admin editor — LIST + UPDATE on the platform_policies table directly.
  // =========================================================================

  /**
   * List every global rcltp.* row for the Director editor — INCLUDING
   * is_active=false rows (the MyJKKN-pending placeholders the Director must see
   * and eventually activate). Ordered by ui_category then policy_key.
   */
  static async listAll(): Promise<RcltpPolicyRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('platform_policies')
      .select(
        'id, policy_key, value, description, data_type, ui_widget, ui_options, ui_consequence, ui_cascade, ui_category, is_active'
      )
      .like('policy_key', `${POLICY_NAMESPACE}%`)
      .eq('scope_type', 'global')
      .order('ui_category', { ascending: true })
      .order('policy_key', { ascending: true });

    if (error) {
      console.error('[rcltp/policies] listAll failed:', error);
      throw error;
    }
    return (data ?? []) as RcltpPolicyRow[];
  }

  /**
   * Update a single global rcltp.* row's `value`. Super-admin only — enforced by
   * the platform_policies UPDATE RLS (is_super_admin() OR is_admin()). Stamps
   * updated_by + updated_at for audit survival. Effective immediately
   * (fn_get_policy reads value live).
   */
  static async updateValue(policyKey: string, value: unknown): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    const { error } = await (this.supabase as any)
      .from('platform_policies')
      .update({
        value: value,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('policy_key', policyKey)
      .eq('scope_type', 'global');

    if (error) {
      console.error('[rcltp/policies] updateValue failed:', error);
      throw new Error(error.message);
    }
  }
}

// ----------------------------------------------------------------------------
// React Query hooks for the admin editor.
// ----------------------------------------------------------------------------

const RCLTP_POLICIES_QUERY_KEY = ['admin', 'rcltp-policies'] as const;

export function useRcltpPoliciesList() {
  return useQuery({
    queryKey: RCLTP_POLICIES_QUERY_KEY,
    queryFn: () => RcltpPoliciesService.listAll(),
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useUpdateRcltpPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ policyKey, value }: { policyKey: string; value: unknown }) =>
      RcltpPoliciesService.updateValue(policyKey, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RCLTP_POLICIES_QUERY_KEY });
    },
  });
}
