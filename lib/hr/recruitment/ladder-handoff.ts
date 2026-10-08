// =====================================================================================
// Recruitment harness — hand approval chasing to the HR chase ladder when it is on
// =====================================================================================
// The HR chase ladder (a separate change) chases overdue HR duties, including R5:
// "approve a candidate at your step". When the ladder is switched on AND its R5 duty
// is enabled, this harness's own approval reminders and escalations would double up
// with it, so the harness drops those two kinds and leaves every other nudge alone.
//
// The ladder ships OFF. Its master switch is the global platform_policies row
// 'hr.harness.chase.enabled', ON only when the stored value is the literal boolean
// true. While it is off, hr_duty_definitions is never read (that table only exists
// once the ladder's migration is applied).
//
// Any read error fails toward this harness still sending its own reminders — never
// toward silence.
//
// SERVER-SIDE ONLY. Never import from a client component.
// =====================================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Nudge, NudgeKind } from './harness-selection';

type Db = SupabaseClient<any, any, any>;

const LADDER_SWITCH_KEY = 'hr.harness.chase.enabled';

/** The ladder duty that covers recruitment approvals per chain step. */
export const RECRUITMENT_APPROVAL_DUTY = 'R5';

/** The nudge kinds the ladder owns once it covers R5. */
export const LADDER_OWNED_KINDS: readonly NudgeKind[] = ['approval_reminder', 'approval_escalation'];

/**
 * True only when the chase ladder is switched on (value === true) and the given
 * duty's active definition row is enabled. Any read error returns false.
 */
export async function ladderCoversDuty(db: Db, dutyCode: string): Promise<boolean> {
  try {
    const { data: policy, error: policyErr } = await db
      .from('platform_policies')
      .select('value')
      .eq('policy_key', LADDER_SWITCH_KEY)
      .eq('scope_type', 'global')
      .eq('is_active', true)
      .maybeSingle();
    if (policyErr) {
      console.warn('[hr/recruitment-harness] reading the chase ladder switch failed', policyErr);
      return false;
    }
    if ((policy as { value?: unknown } | null)?.value !== true) return false;

    const { data: duty, error: dutyErr } = await db
      .from('hr_duty_definitions')
      .select('enabled')
      .eq('config_key', dutyCode)
      .eq('is_active', true)
      .maybeSingle();
    if (dutyErr) {
      console.warn('[hr/recruitment-harness] reading the chase ladder duty failed', { dutyCode, error: dutyErr });
      return false;
    }
    return (duty as { enabled?: unknown } | null)?.enabled === true;
  } catch (err) {
    console.warn('[hr/recruitment-harness] chase ladder check threw', { dutyCode, err });
    return false;
  }
}

/**
 * Drop the approval reminder and escalation nudges when the ladder covers R5.
 * Returns the nudges to send and how many were handed to the ladder.
 */
export async function applyLadderHandoff(
  db: Db,
  nudges: Nudge[],
): Promise<{ nudges: Nudge[]; handedToLadder: number }> {
  if (!nudges.some((n) => LADDER_OWNED_KINDS.includes(n.kind))) {
    return { nudges, handedToLadder: 0 };
  }
  if (!(await ladderCoversDuty(db, RECRUITMENT_APPROVAL_DUTY))) {
    return { nudges, handedToLadder: 0 };
  }
  const kept = nudges.filter((n) => !LADDER_OWNED_KINDS.includes(n.kind));
  return { nudges: kept, handedToLadder: nudges.length - kept.length };
}
