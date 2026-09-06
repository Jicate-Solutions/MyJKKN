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
 *
 * IFSC AND BANK NAME ARE OPTIONAL (2026-09-02). Data arrives in pieces -- a
 * salary register carries an account number and nothing else -- and refusing
 * the row left the number in a spreadsheet, which is worse for audit than an
 * incomplete record. Note what did NOT change: a PRESENT IFSC is still format
 * checked. Absent means "we do not know yet"; wrong means "we are confident and
 * mistaken", and only the second one silently pays the wrong branch.
 *
 * The rule moved rather than vanished -- see isPayable() at the bottom.
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
  /** Optional. Format-checked when present; absence blocks payout, not saving. */
  ifscCode?: string;
  /** Optional. No format to get wrong, so no rule. */
  bankName?: string;
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
// Both accept nullish because IFSC and bank name are optional fields now, and
// the bodies always guarded for it — only the signatures did not say so.
export function normaliseIfsc(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase();
}

export function normaliseAccountNumber(v: string | null | undefined): string {
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

  // Optional, but never wrong. An empty IFSC is a record we can complete later;
  // a malformed one is a payout into the wrong branch.
  const ifsc = normaliseIfsc(input.ifscCode);
  if (ifsc && !IFSC_RE.test(ifsc)) {
    errors.push({
      field: 'ifscCode',
      message: 'IFSC must be 4 letters, then 0, then 6 letters or digits (e.g. SBIN0001234).',
    });
  }

  // Bank name is optional and has no format to get wrong, so it has no rule.

  if (input.accountType && !['savings', 'current'].includes(input.accountType)) {
    errors.push({ field: 'accountType', message: 'Account type must be savings or current.' });
  }

  return errors;
}

/**
 * Can money actually be sent to this account?
 *
 * THIS IS WHERE THE OLD NOT NULL WENT. Making IFSC optional did not decide that
 * an IFSC is unnecessary — it decided that "recorded" and "payable" are two
 * different states. NEFT and IMPS both route on the IFSC, so an account without
 * one is a note-to-self, not a destination.
 *
 * Any payout run, bank-file export, or "ready to pay" count must ask this rather
 * than testing whether a row exists.
 */
export function isPayable(account: {
  account_number: string | null;
  ifsc_code: string | null;
}): boolean {
  return (
    ACCOUNT_RE.test(normaliseAccountNumber(account.account_number ?? '')) &&
    IFSC_RE.test(normaliseIfsc(account.ifsc_code ?? ''))
  );
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
