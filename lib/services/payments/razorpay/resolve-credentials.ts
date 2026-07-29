// lib/services/payments/razorpay/resolve-credentials.ts
//
// Resolves the Razorpay credentials to use for a payment, matched by institution.
//
// Resolution order:
//   1. Pinned account (accountId) — used at verify/status/refund/late-auth time so a
//      transaction is always queried with the SAME account that created its order
//      (rotation-safe).
//   2. Institution's active account (institutionId).
//   3. Common env account (RAZORPAY_KEY_ID / _KEY_SECRET / _WEBHOOK_SECRET) — the
//      legacy single account, used until an institution gets its own.
//
// Throws only when NONE of the three is configured.

import 'server-only';

import { RazorpayAccountVault } from './account-vault';
import type { RazorpayCredentials } from './credentials';

export interface ResolveContext {
  /** Pinned razorpay_accounts.id from the transaction row (preferred when present). */
  accountId?: string | null;
  /** Institution to match an active account for. */
  institutionId?: string | null;
  /**
   * Fee head (billing_categories.kind) of the payment, used only at order
   * creation. Resolves the institution's account for this head, falling back to
   * the institution default (fee_head NULL). Ignored once an account is pinned
   * (verify/refund/webhook resolve by accountId). Null/omit = institution default.
   */
  feeHead?: string | null;
  /**
   * Set to 'create-order' when resolving credentials to CREATE a new payment
   * order. In production this rejects test-mode keys (fail closed): Razorpay's
   * sandbox checkout SIMULATES success (UPI QR auto-"pays" in ~15s without any
   * money), so a real bill routed to a test account gets marked paid and
   * receipted with zero capture. Verify/refund/webhook/cron resolution must NOT
   * set this so historical test transactions stay serviceable.
   */
  purpose?: 'create-order';
}

function envCredentials(): RazorpayCredentials | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!keyId || !keySecret || !webhookSecret) return null;
  return {
    keyId,
    keySecret,
    webhookSecret,
    mode: keyId.startsWith('rzp_test_') ? 'test' : 'live',
    source: 'env',
  };
}

/** True when the key is a Razorpay sandbox key (prefix wins over the stored mode label). */
export function isTestModeKey(keyId: string | null | undefined, mode?: string | null): boolean {
  return !!keyId?.startsWith('rzp_test_') || mode === 'test';
}

/**
 * Whether sandbox (test-mode) payments may be CREATED in this runtime.
 * Non-production always may (local/preview rehearsals); production only with
 * the explicit RAZORPAY_ALLOW_TEST_PAYMENTS=true escape hatch.
 */
export function sandboxPaymentsAllowed(): boolean {
  const isProduction = (process.env.VERCEL_ENV ?? process.env.NODE_ENV) === 'production';
  return !isProduction || process.env.RAZORPAY_ALLOW_TEST_PAYMENTS === 'true';
}

/**
 * Fail closed at order creation: never open a REAL payment on a test-mode key
 * in production. Judged by the key prefix (rzp_test_), not the stored `mode`
 * label, so a mislabeled vault row can't slip through. Escape hatch for a
 * deliberate sandbox rehearsal: RAZORPAY_ALLOW_TEST_PAYMENTS=true.
 */
function assertUsableForNewOrder(creds: RazorpayCredentials, ctx: ResolveContext): RazorpayCredentials {
  if (ctx.purpose !== 'create-order') return creds;
  if (!isTestModeKey(creds.keyId, creds.mode)) return creds;
  if (sandboxPaymentsAllowed()) return creds;
  throw new Error(
    'Online payment is not configured for this fee type yet. ' +
      `No live Razorpay account matches institution=${ctx.institutionId ?? 'none'} feeHead=${ctx.feeHead ?? 'default'} ` +
      `(resolution fell back to a TEST-mode ${creds.source} key, where checkout fakes success without capturing money). ` +
      'Add a live account for this institution/fee head in Payment Accounts.',
  );
}

export async function resolveRazorpayCredentials(ctx: ResolveContext): Promise<RazorpayCredentials> {
  if (ctx.accountId) {
    const pinned = await RazorpayAccountVault.getById(ctx.accountId);
    if (pinned) return assertUsableForNewOrder(pinned, ctx);
    // Pinned account vanished (deleted) — fall through to institution/env.
  }

  // Per-institution lookup only when the vault is configured. Without the master
  // secret no per-institution account can exist, so fall through to the common
  // env account rather than letting the vault throw (documented common-account
  // behavior). A pinned accountId above still requires the secret — a per-inst
  // transaction can't be served by the env account.
  if (ctx.institutionId && RazorpayAccountVault.isConfigured()) {
    const active = await RazorpayAccountVault.getForInstitution(ctx.institutionId, ctx.feeHead ?? null);
    if (active) return assertUsableForNewOrder(active, ctx);
  }

  const env = envCredentials();
  if (env) return assertUsableForNewOrder(env, ctx);

  throw new Error(
    '[resolve-razorpay-credentials] No Razorpay account configured for ' +
      `institution=${ctx.institutionId ?? 'none'} account=${ctx.accountId ?? 'none'} ` +
      'and no common env fallback (RAZORPAY_KEY_ID/_KEY_SECRET/_WEBHOOK_SECRET) is set.',
  );
}
