/**
 * Bank-account field rules.
 *
 * These rules exist because a malformed account number or IFSC does NOT bounce
 * loudly -- the transfer fails quietly or lands in the wrong account -- so the
 * cases below are the ones that would otherwise reach a payout run.
 *
 * Run: npx tsx scripts/bank-account-validation.test.ts
 */

import {
  validateBankAccount, errorsByField, maskAccountNumber,
  normaliseIfsc, normaliseAccountNumber,
} from '../lib/hr/payroll/bank-account-validation';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${extra}`); }
}

const good = {
  accountHolderName: 'GUNASEKARAN S',
  accountNumber: '123456789012',
  ifscCode: 'SBIN0001234',
  bankName: 'State Bank of India',
};

check('a well-formed account passes', validateBankAccount(good).length === 0,
  JSON.stringify(validateBankAccount(good)));

// --- IFSC -----------------------------------------------------------------
check('lowercase IFSC is accepted (normalised)',
  validateBankAccount({ ...good, ifscCode: 'sbin0001234' }).length === 0);
check('IFSC without the 5th-character zero is rejected',
  errorsByField(validateBankAccount({ ...good, ifscCode: 'SBIN1001234' })).ifscCode !== undefined);
check('too-short IFSC is rejected',
  errorsByField(validateBankAccount({ ...good, ifscCode: 'SBIN000123' })).ifscCode !== undefined);
check('IFSC with a digit in the bank prefix is rejected',
  errorsByField(validateBankAccount({ ...good, ifscCode: 'SB1N0001234' })).ifscCode !== undefined);
check('empty IFSC is rejected',
  errorsByField(validateBankAccount({ ...good, ifscCode: '' })).ifscCode !== undefined);
check('normaliseIfsc upper-cases and trims', normaliseIfsc('  hdfc0000123 ') === 'HDFC0000123');

// --- account number -------------------------------------------------------
check('spaces and hyphens from a passbook are stripped',
  validateBankAccount({ ...good, accountNumber: '1234 5678-9012' }).length === 0);
check('letters in the account number are rejected',
  errorsByField(validateBankAccount({ ...good, accountNumber: '12345678901X' })).accountNumber !== undefined);
check('a 5-digit account number is rejected',
  errorsByField(validateBankAccount({ ...good, accountNumber: '12345' })).accountNumber !== undefined);
check('a 21-digit account number is rejected',
  errorsByField(validateBankAccount({ ...good, accountNumber: '1'.repeat(21) })).accountNumber !== undefined);
check('leading zeros survive normalisation', normaliseAccountNumber('000123456') === '000123456');

// --- confirmation ---------------------------------------------------------
check('a matching confirmation passes',
  validateBankAccount({ ...good, confirmAccountNumber: '123456789012' }).length === 0);
check('a TRANSPOSED digit is caught only by the confirmation',
  errorsByField(validateBankAccount({ ...good, confirmAccountNumber: '123456789021' }))
    .confirmAccountNumber !== undefined);
check('confirmation is skipped when not supplied',
  validateBankAccount(good).every((e) => e.field !== 'confirmAccountNumber'));
check('confirmation tolerates different spacing',
  validateBankAccount({ ...good, confirmAccountNumber: '1234-5678-9012' }).length === 0);

// --- other fields ---------------------------------------------------------
check('missing holder name is rejected',
  errorsByField(validateBankAccount({ ...good, accountHolderName: '   ' })).accountHolderName !== undefined);
check('missing bank name is rejected',
  errorsByField(validateBankAccount({ ...good, bankName: '' })).bankName !== undefined);
check('an unknown account type is rejected',
  errorsByField(validateBankAccount({ ...good, accountType: 'fixed' })).accountType !== undefined);

// --- masking --------------------------------------------------------------
check('masking keeps only the last four', maskAccountNumber('123456789012') === '••••9012',
  maskAccountNumber('123456789012'));
check('a short number is not padded into a fake mask', maskAccountNumber('1234') === '1234');
check('null masks to an em dash', maskAccountNumber(null) === '—');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
