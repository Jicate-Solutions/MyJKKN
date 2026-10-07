/**
 * Salary register sign-off (migration 20271007161107).
 *
 * A thin wrapper over three SECURITY DEFINER functions. The database decides
 * who may sign; this file only calls it with the person's own session client
 * and carries the refusal message back unchanged, so the screen can say exactly
 * why (rule #27).
 *
 * Kept apart from salary-register-service.ts on purpose: signing adds proof
 * on top of a register and changes nothing about how one is computed.
 */

import {
  REGISTER_SIGNOFF_REQUIRED_POLICY,
  type RegisterSignoffResult,
  type RegisterSignoffRevokeResult,
  type RegisterSignoffStage,
  type RegisterSignoffStatus,
} from '@/types/hr-register-signoff';

type Db = any;

/** A refusal from the database, with the HTTP status that fits it. */
export class RegisterSignoffError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RegisterSignoffError';
    this.status = status;
  }
}

/** SQLSTATEs the three functions raise, mapped to what the route answers. */
const STATUS_BY_CODE: Record<string, number> = {
  '42501': 403, // not allowed (permission, generator, same person)
  P0002: 404, // run or signature not found
  '55000': 409, // replaced run, college check missing, already withdrawn
  '23505': 409, // step already signed
  '22023': 400, // bad stage or short reason
};

function toError(error: { message?: string; code?: string } | null | undefined): RegisterSignoffError {
  const message = error?.message || 'The sign-off request failed.';
  return new RegisterSignoffError(message, STATUS_BY_CODE[error?.code ?? ''] ?? 500);
}

export const RegisterSignoffService = {
  async getStatus(supabase: Db, runId: string): Promise<RegisterSignoffStatus> {
    const { data, error } = await supabase.rpc('fn_hr_register_signoff_status', { p_run_id: runId });
    if (error) throw toError(error);
    return data as RegisterSignoffStatus;
  },

  async sign(
    supabase: Db,
    runId: string,
    stage: RegisterSignoffStage,
    note: string | null,
  ): Promise<RegisterSignoffResult> {
    const { data, error } = await supabase.rpc('fn_hr_register_signoff', {
      p_run_id: runId,
      p_stage: stage,
      p_note: note,
    });
    if (error) throw toError(error);
    return data as RegisterSignoffResult;
  },

  async revoke(supabase: Db, signoffId: string, reason: string): Promise<RegisterSignoffRevokeResult> {
    const { data, error } = await supabase.rpc('fn_hr_register_signoff_revoke', {
      p_signoff_id: signoffId,
      p_reason: reason,
    });
    if (error) throw toError(error);
    return data as RegisterSignoffRevokeResult;
  },

  /**
   * Is the export block switched on? Only a literal JSON `true` on an active
   * global row counts. A missing row, `"true"` as a string, `1`, an inactive
   * row or a failed read all mean NOT enforced — the switch ships off and is
   * the Director's to flip.
   */
  async isSignoffRequired(serviceClient: Db): Promise<boolean> {
    try {
      const { data, error } = await serviceClient
        .from('platform_policies')
        .select('value, is_active')
        .eq('policy_key', REGISTER_SIGNOFF_REQUIRED_POLICY)
        .eq('scope_type', 'global')
        .is('scope_id', null)
        .maybeSingle();
      if (error || !data) return false;
      const row = data as { value?: unknown; is_active?: boolean | null };
      return row.value === true && row.is_active !== false;
    } catch {
      return false;
    }
  },

  /**
   * Does the run carry an active accounts sign-off? An accounts sign-off can
   * only exist on top of an active college check, so this one row proves both
   * steps. A failed read answers false: when the block is on, an unreadable
   * signature is treated as no signature.
   */
  async hasActiveAccountsSign(supabase: Db, runId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('hr_salary_register_signoffs')
        .select('id')
        .eq('run_id', runId)
        .eq('stage', 'accounts_sign')
        .is('revoked_at', null)
        .limit(1);
      if (error || !Array.isArray(data)) return false;
      return data.length > 0;
    } catch {
      return false;
    }
  },
};
