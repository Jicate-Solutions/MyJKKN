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

export async function resolveRazorpayCredentials(ctx: ResolveContext): Promise<RazorpayCredentials> {
  if (ctx.accountId) {
    const pinned = await RazorpayAccountVault.getById(ctx.accountId);
    if (pinned) return pinned;
    // Pinned account vanished (deleted) — fall through to institution/env.
  }

  // Per-institution lookup only when the vault is configured. Without the master
  // secret no per-institution account can exist, so fall through to the common
  // env account rather than letting the vault throw (documented common-account
  // behavior). A pinned accountId above still requires the secret — a per-inst
  // transaction can't be served by the env account.
  if (ctx.institutionId && RazorpayAccountVault.isConfigured()) {
    const active = await RazorpayAccountVault.getForInstitution(ctx.institutionId, ctx.feeHead ?? null);
    if (active) return active;
  }

  const env = envCredentials();
  if (env) return env;

  throw new Error(
    '[resolve-razorpay-credentials] No Razorpay account configured for ' +
      `institution=${ctx.institutionId ?? 'none'} account=${ctx.accountId ?? 'none'} ` +
      'and no common env fallback (RAZORPAY_KEY_ID/_KEY_SECRET/_WEBHOOK_SECRET) is set.',
  );
}
