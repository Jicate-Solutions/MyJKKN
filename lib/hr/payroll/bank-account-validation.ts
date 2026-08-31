/**
 * Bank-account field rules, shared by the form and the (future) importer.
 * Created: 2026-08-21.
 *
 * Pure and synchronous — no database, no clock — so the same verdict backs the
 * dialog, any bulk upload, and a test.
 *
 * THESE RULES ARE DELIBERATELY A DUPLICATE of the CHECK constraints on
 * hr_staff_bank_accounts and of the guards inside fn_hr_set_staff_bank_account.
 * That is not an oversight: the database is the enforcement point and must
 * refuse a bad value no matter who writes it, while this layer exists to say
 * WHICH FIELD is wrong before a round trip. A raw 23514 names a constraint, not
 * a field.
 *
 * WHY VALIDATION MATTERS MORE HERE THAN ALMOST ANYWHERE ELSE: a malformed
 * account number or IFSC does not bounce loudly. The transfer fails silently,
 * or worse, succeeds into somebody else's account.
 */

/** 4 letters, a literal zero, then 6 letters or digits. RBI's format. */
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Indian account numbers run roughly 9–18 digits; 6–20 is a tolerant band. */
const ACCOUNT_RE = /^[0-9]{6,20}$/;

export interface BankAccountInput {
  accountHolderName: string;
  accountNumber: string;
  /** Second entry of the same number. Optional — only checked when provided. */
  confirmAccountNumber?: string;
  ifscCode: string;
  bankName: string;
  branchName?: string;
  accountType?: string;
}

export type BankFieldError = {
  field: keyof BankAccountInput;
  message: string;
};

/**
 * IFSC is upper-cased and trimmed; the account number has spaces and hyphens
 * stripped, because passbooks print them in groups and people paste them that
 * way. Nothing else is "corrected" — silently rewriting an account number is
 * how you pay the wrong person politely.
 */
export function normaliseIfsc(v: string): string {
  return (v ?? '').trim().toUpperCase();
}

export function normaliseAccountNumber(v: string): string {
  return (v ?? '').replace(/[\s-]/g, '');
}

/** Last four digits only, for lists: 123456789012 -> ••••9012. */
export function maskAccountNumber(v: string | null): string {
  if (!v) return '—';
  const digits = normaliseAccountNumber(v);
  if (digits.length <= 4) return digits;
  return `••••${digits.slice(-4)}`;
}

export function validateBankAccount(input: BankAccountInput): BankFieldError[] {
  const errors: BankFieldError[] = [];

  if (!input.accountHolderName?.trim()) {
    errors.push({
      field: 'accountHolderName',
      message: 'Enter the name exactly as the bank holds it.',
    });
  }

  const acct = normaliseAccountNumber(input.accountNumber);
  if (!acct) {
    errors.push({ field: 'accountNumber', message: 'Account number is required.' });
  } else if (!ACCOUNT_RE.test(acct)) {
    errors.push({
      field: 'accountNumber',
      message: 'Account number must be 6 to 20 digits, with no letters.',
    });
  }

  // Only checked when a confirmation was asked for. Two independent entries is
  // the one control that catches a transposed digit — a format check cannot,
  // because a transposed account number is still a valid account number.
  if (input.confirmAccountNumber !== undefined) {
    const confirm = normaliseAccountNumber(input.confirmAccountNumber);
    if (acct && confirm !== acct) {
      errors.push({
        field: 'confirmAccountNumber',
        message: 'The two account numbers do not match.',
      });
    }
  }

  const ifsc = normaliseIfsc(input.ifscCode);
  if (!ifsc) {
    errors.push({ field: 'ifscCode', message: 'IFSC is required.' });
  } else if (!IFSC_RE.test(ifsc)) {
    errors.push({
      field: 'ifscCode',
      message: 'IFSC must be 4 letters, then 0, then 6 letters or digits (e.g. SBIN0001234).',
    });
  }

  if (!input.bankName?.trim()) {
    errors.push({ field: 'bankName', message: 'Bank name is required.' });
  }

  if (input.accountType && !['savings', 'current'].includes(input.accountType)) {
    errors.push({ field: 'accountType', message: 'Account type must be savings or current.' });
  }

  return errors;
}

/** Convenience for a form: field -> first message. */
export function errorsByField(
  errors: BankFieldError[]
): Partial<Record<keyof BankAccountInput, string>> {
  const map: Partial<Record<keyof BankAccountInput, string>> = {};
  for (const e of errors) {
    if (!map[e.field]) map[e.field] = e.message;
  }
  return map;
}
