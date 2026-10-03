/**
 * Hand-off to the HR chase ladder (draft PR #4152). SERVER ONLY.
 * Created 2026-10-01.
 *
 * When the ladder is switched on AND its duty is enabled, the ladder chases
 * that duty itself, so this lane's own notices for the same items stand down
 * instead of doubling up:
 *   L1 — leave applications pending at a step   → leave_escalation notices
 *   L2 — comp-off claims nearing expiry         → comp_off_expiry_7d / _2d nudges
 *
 * The keys are string literals on purpose: this file must not import from
 * #4152, which may land later or never. Every failure answers "not covered",
 * so a broken read means this lane keeps sending, never that nobody is told.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The ladder's master switch (platform_policies, global scope). */
export const LADDER_SWITCH_POLICY_KEY = 'hr.harness.chase.enabled';

export type LadderDutyCode = 'L1' | 'L2';

/**
 * True only when the ladder's master switch is the literal boolean `true` and
 * the duty's live row in hr_duty_definitions has `enabled === true`. The duty
 * register is never read while the switch is off.
 */
export async function ladderCoversDuty(db: SupabaseClient, code: LadderDutyCode): Promise<boolean> {
  try {
    const { data: policy, error: policyErr } = await db
      .from('platform_policies')
      .select('value')
      .eq('policy_key', LADDER_SWITCH_POLICY_KEY)
      .eq('scope_type', 'global')
      .eq('is_active', true)
      .maybeSingle();
    if (policyErr) throw policyErr;
    if ((policy as { value?: unknown } | null)?.value !== true) return false;

    const { data: duty, error: dutyErr } = await db
      .from('hr_duty_definitions')
      .select('enabled')
      .eq('config_key', code)
      .eq('is_active', true)
      .maybeSingle();
    if (dutyErr) throw dutyErr;
    return (duty as { enabled?: unknown } | null)?.enabled === true;
  } catch (err) {
    console.warn('[hr/leave-ladder-handoff] could not read the chase ladder switch; sending as usual', {
      duty: code,
      error: String((err as { message?: unknown } | null)?.message ?? err),
    });
    return false;
  }
}
