/**
 * HR staff harness — proof of done (2): a file or a second-person check on the
 * duties that move money or end a job.
 *
 * Database: supabase/migrations/20271007161123_hr_duty_proofs.sql
 *   hr_duty_proof_rules   which duty needs which proof (config table)
 *   hr_duty_proofs        one row per proof: who, when, what
 *
 * Proof is SHOWN, never enforced: nothing in any HR flow waits on it.
 */

/** The duties seeded with a proof rule. Codes match hr_duty_definitions.config_key. */
export type DutyProofCode = 'L4' | 'G5' | 'G6';

export type DutyProofKind = 'file' | 'second_check';

export type DutyProofCheckResult = 'confirmed' | 'corrected';

/** Which kind of proof each seeded duty takes (mirrors the seeded rule rows). */
export const DUTY_PROOF_KIND: Record<DutyProofCode, DutyProofKind> = {
  L4: 'second_check',
  G5: 'file',
  G6: 'second_check',
};

export const DUTY_PROOF_LABEL: Record<DutyProofCode, string> = {
  L4: 'Leave encashment',
  G5: 'Termination order',
  G6: 'Termination final settlement',
};

/** The private bucket proof files live in. */
export const DUTY_PROOF_BUCKET = 'hr-duty-proofs';

/** A 'corrected' check needs a note at least this long (the table CHECK agrees). */
export const DUTY_PROOF_NOTE_MIN = 10;

export const DUTY_PROOF_CODES: readonly DutyProofCode[] = ['L4', 'G5', 'G6'];

export function isDutyProofCode(v: unknown): v is DutyProofCode {
  return typeof v === 'string' && (DUTY_PROOF_CODES as readonly string[]).includes(v);
}

/** One active proof on an item, with the name of whoever recorded it. */
export interface DutyProof {
  id: string;
  duty_code: DutyProofCode;
  item_id: string;
  kind: DutyProofKind;
  storage_path: string | null;
  file_name: string | null;
  recorded_by: string;
  recorded_by_name: string | null;
  recorded_at: string;
  check_result: DutyProofCheckResult | null;
  corrected_amount: number | null;
  check_note: string | null;
  /** Set when a newer check replaced this one; a revoked row is history, never shown as the proof. */
  revoked_at?: string | null;
}

/** A done item that still has no proof (fn_hr_duty_proof_gaps). */
export interface DutyProofGap {
  item_id: string;
  done_at: string;
  institution_id: string | null;
  amount: number | null;
  /** The caller decided this item or is paid by it, so cannot check it. */
  caller_is_doer: boolean;
}

export interface DutyProofsResponse {
  gaps: DutyProofGap[];
  proofs: DutyProof[];
}

export interface DutyProofSecondCheckInput {
  duty: DutyProofCode;
  itemId: string;
  result: DutyProofCheckResult;
  correctedAmount?: number | null;
  note?: string | null;
}

export interface DutyProofAttachFileInput {
  duty: DutyProofCode;
  itemId: string;
  storagePath: string;
  fileName: string;
}

/**
 * Validate a second check before it is sent. Returns an error message, or null
 * when it may be sent. The database refuses the same cases.
 */
export function validateSecondCheck(input: {
  result: DutyProofCheckResult | '';
  correctedAmount?: number | string | null;
  note?: string | null;
}): string | null {
  if (input.result !== 'confirmed' && input.result !== 'corrected') {
    return 'Choose whether the amount is right or needs correcting';
  }
  if (input.result === 'confirmed') return null;
  const amount = typeof input.correctedAmount === 'string'
    ? (input.correctedAmount.trim() === '' ? NaN : Number(input.correctedAmount))
    : input.correctedAmount ?? NaN;
  if (!Number.isFinite(amount) || amount < 0) {
    return 'Enter the right amount';
  }
  if ((input.note ?? '').trim().length < DUTY_PROOF_NOTE_MIN) {
    return `Say what is wrong in at least ${DUTY_PROOF_NOTE_MIN} characters`;
  }
  return null;
}

/** <duty>/<item_id>/<uuid>-<name>: the shape the bucket policy accepts. */
export function buildDutyProofPath(duty: DutyProofCode, itemId: string, fileName: string, uuid: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'file';
  return `${duty}/${itemId}/${uuid}-${safe}`;
}
