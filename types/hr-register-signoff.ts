/**
 * Salary register sign-off (migration 20271007161107).
 *
 * Two named steps on one frozen register run: the college check first, then
 * the accounts sign-off. Shapes mirror fn_hr_register_signoff_status.
 */

export type RegisterSignoffStage = 'college_check' | 'accounts_sign';

export const REGISTER_SIGNOFF_STAGES: readonly RegisterSignoffStage[] = [
  'college_check',
  'accounts_sign',
] as const;

/** Permission key each step needs (granted in Role Management). */
export const REGISTER_SIGNOFF_STAGE_KEY: Record<RegisterSignoffStage, string> = {
  college_check: 'hr.payroll.register.check',
  accounts_sign: 'hr.payroll.register.sign',
};

export const REGISTER_SIGNOFF_STAGE_LABEL: Record<RegisterSignoffStage, string> = {
  college_check: 'College check',
  accounts_sign: 'Accounts sign-off',
};

/** One step as fn_hr_register_signoff_status returns it. */
export interface RegisterSignoffStep {
  stage: RegisterSignoffStage;
  signed: boolean;
  signoff_id: string | null;
  signed_by: string | null;
  signer_name: string | null;
  signed_at: string | null;
  note: string | null;
  /** True when the signed-in person made this signature. */
  is_mine: boolean;
  last_revoked_at: string | null;
  last_revoke_reason: string | null;
}

export interface RegisterSignoffStatus {
  run_id: string;
  superseded: boolean;
  stages: Record<RegisterSignoffStage, RegisterSignoffStep>;
}

/** fn_hr_register_signoff's answer. */
export interface RegisterSignoffResult {
  id: string;
  stage: RegisterSignoffStage;
  signed_by: string;
  signed_at: string;
}

/** fn_hr_register_signoff_revoke's answer. */
export interface RegisterSignoffRevokeResult {
  id: string;
  stage: RegisterSignoffStage;
  revoked: boolean;
  also_withdrew_sign: boolean;
}

/** platform_policies key: when literally true, an unsigned run cannot be exported. */
export const REGISTER_SIGNOFF_REQUIRED_POLICY = 'hr.harness.proof.register_signoff_required';

export const REGISTER_UNSIGNED_EXPORT_ERROR =
  'This register is not signed yet. The college check and the accounts sign-off are needed before export.';
