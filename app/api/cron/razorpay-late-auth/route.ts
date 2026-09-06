export const dynamic = 'force-dynamic';

// Razorpay late-authorization / reconciliation sweep.
//
// Razorpay's hosted checkout hands control back to us with a browser-driven
// form POST to /api/billing/payment/callback. If the learner closes the tab,
// loses signal, or never returns from their UPI app, that POST never happens —
// the money is captured at Razorpay and we never hear about it. The webhook is
// meant to cover that, but a webhook can be unconfigured or undelivered too.
// This sweep is the backstop of last resort: it asks Razorpay directly.
//
// Schedule: every 15 minutes (vercel.json).
// Auth: `Authorization: Bearer <CRON_SECRET>` (what Vercel actually sends) OR
// ?secret=<CRON_SECRET> for a manual operator run. BOTH are required — see the
// 2026-07-29 incident note below.
//
// Query params (all optional, for operators):
//   ?dryRun=1              report what would change, write nothing
//   ?transactionId=<uuid>  reconcile a single row, ignoring the age window
//   ?limit=<n>             cap rows scanned per table (default 100)
//
// ---------------------------------------------------------------------------
// PRODUCTION INCIDENT, 2026-07-27 — why this file was rewritten:
//
//  1. The row query selected `registration_id` for BOTH tables, but that column
//     exists only on event_payment_transactions. PostgREST answered 42703 for
//     payment_transactions, the handler logged it and `continue`d — skipping
//     both the capture sweep AND the expiry sweep. The billing half of this
//     cron had therefore never done anything since it was written. 34 real
//     transactions sat at 'initiated' for six weeks.
//
//  2. On capture it only flipped payment_transactions.status to 'success'. It
//     never created a receipt or marked the bill paid, so even a working sweep
//     would have produced exactly the reported symptom: "payment successful but
//     the bill is still unpaid".
//
//  3. It expired anything older than 5 days WITHOUT asking Razorpay first, so a
//     genuinely captured payment that this sweep had missed would be quietly
//     buried as 'expired' — money taken, bill unpaid, no trace.
//
// PRODUCTION INCIDENT, 2026-07-29 — the sweep from #2516 still never ran:
//
//  4. Auth accepted ONLY ?secret=. vercel.json registers the path as
//     `/api/cron/razorpay-late-auth?secret=${CRON_SECRET}`, but Vercel does NOT
//     interpolate env vars into a cron path — it sends that `${CRON_SECRET}`
//     literally and passes the real secret in an `Authorization: Bearer` header.
//     So every scheduled tick 401'd silently while the two manual operator runs
//     (which substitute the secret by hand) worked, making the cron look alive.
//     Every other cron in this repo accepts EITHER form; this one didn't. 12
//     captured transport payments sat at 'initiated' — past the 5-day expiry
//     window, so even the expiry half had never fired. Do not "simplify" this
//     back to a single check.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveRazorpayCredentials } from '@/lib/services/payments/razorpay/resolve-credentials';
import { RazorpayProvider } from '@/lib/services/payments/razorpay/razorpay-provider';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';
import { PaymentAuditService } from '@/lib/services/billing/security/payment-audit-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MIN_AGE_MINUTES = 15;
const EXPIRE_AFTER_DAYS = 5; // Razorpay auto-refunds uncaptured auths past this.
const DEFAULT_LIMIT = 100;

/**
 * The two transaction tables do NOT share a column set — `registration_id`
 * exists only on the events table, `student_id`/`total_amount` only on billing.
 * Select per table; a shared column list is what silently disabled this sweep.
 */
const TABLE_CONFIG = [
  {
    table: 'payment_transactions',
    module: 'billing',
    columns:
      'id, razorpay_order_id, status, amount_paise, total_amount, student_id, institution_id, razorpay_account_id, created_at',
  },
  {
    table: 'event_payment_transactions',
    module: 'events',
    columns:
      'id, razorpay_order_id, status, amount_paise, registration_id, institution_id, razorpay_account_id, created_at',
  },
] as const;

type SweepStat = {
  scanned: number;
  captured: number;
  receipted: number;
  failed: number;
  expired: number;
  amountMismatch: number;
  skipped: number;
  actions: Array<Record<string, unknown>>;
};

function emptyStat(): SweepStat {
  return {
    scanned: 0,
    captured: 0,
    receipted: 0,
    failed: 0,
    expired: 0,
    amountMismatch: 0,
    skipped: 0,
    actions: [],
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    // Vercel's scheduler sends the secret as a Bearer header; the query param is
    // for manual operator runs. Accept either — see incident 4 above.
    const authHeader = request.headers.get('authorization');
    const querySecret = url.searchParams.get('secret');
    if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const dryRun = url.searchParams.get('dryRun') === '1';
  const targetTransactionId = url.searchParams.get('transactionId');
  const limit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;

  const supabase = createServiceRoleClient();

  // Resolve a Razorpay provider per pinned account / institution, cached so a
  // sweep touching many institutions resolves each key set at most once. We
  // build RazorpayProvider directly (not via the env-flag factory) because this
  // cron only ever processes provider='razorpay' rows.
  const providerCache = new Map<string, RazorpayProvider | null>();
  async function providerFor(row: any): Promise<RazorpayProvider | null> {
    const cacheKey = row.razorpay_account_id ?? row.institution_id ?? 'env';
    if (providerCache.has(cacheKey)) return providerCache.get(cacheKey) ?? null;
    try {
      const creds = await resolveRazorpayCredentials({
        accountId: row.razorpay_account_id,
        institutionId: row.institution_id,
      });
      const p = new RazorpayProvider(creds);
      providerCache.set(cacheKey, p);
      return p;
    } catch (err) {
      logger.warn('cron/razorpay-late-auth', 'Could not resolve Razorpay credentials for row', {
        id: row.id,
        institutionId: row.institution_id,
        accountId: row.razorpay_account_id,
        error: err instanceof Error ? err.message : String(err),
      });
      providerCache.set(cacheKey, null);
      return null;
    }
  }

  const now = Date.now();
  const minAgeCutoff = new Date(now - MIN_AGE_MINUTES * 60 * 1000).toISOString();
  const expiryCutoff = new Date(now - EXPIRE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const results: Record<string, SweepStat> = {};

  for (const cfg of TABLE_CONFIG) {
    const stat = emptyStat();

    let query = (supabase as any)
      .from(cfg.table)
      .select(cfg.columns)
      .eq('provider', 'razorpay')
      .in('status', ['initiated', 'processing']);

    // An explicit transactionId is an operator asking us to reconcile one row
    // now; the age window would only get in the way.
    if (targetTransactionId) {
      query = query.eq('id', targetTransactionId);
    } else {
      query = query.lte('created_at', minAgeCutoff);
    }

    const { data: rows, error } = await query
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error('cron/razorpay-late-auth', `Query failed for ${cfg.table}`, error);
      results[cfg.table] = stat;
      continue;
    }

    for (const row of (rows ?? []) as any[]) {
      if (!row.razorpay_order_id) continue;
      stat.scanned++;

      const provider = await providerFor(row);
      if (!provider) {
        stat.skipped++;
        stat.actions.push({ id: row.id, action: 'skipped', reason: 'no_credentials' });
        continue;
      }

      try {
        const orderStatus = await provider.getOrderStatus(row.razorpay_order_id);

        // ------------------------------------------------------------------
        // Not paid at Razorpay.
        // ------------------------------------------------------------------
        if (orderStatus.status !== 'captured') {
          if (row.created_at < expiryCutoff) {
            // Expire only after Razorpay itself has just confirmed the order is
            // not paid — never on age alone, which is what buried real captures
            // before. Both remaining states are safe: 'created' means no payment
            // was ever attempted, 'failed'/'attempted' means none succeeded.
            stat.expired++;
            stat.actions.push({
              id: row.id,
              action: 'expire',
              orderStatus: orderStatus.status,
              createdAt: row.created_at,
            });
            if (!dryRun) {
              await (supabase as any)
                .from(cfg.table)
                .update({ status: 'expired', completed_at: new Date().toISOString() })
                .eq('id', row.id);
            }
          } else {
            stat.skipped++;
            stat.actions.push({
              id: row.id,
              action: 'skipped',
              reason: `order_${orderStatus.status}`,
            });
          }
          continue;
        }

        // ------------------------------------------------------------------
        // Captured at Razorpay but never finalized here. Recover the real
        // pay_… id — GET /orders/{id} does not carry it, and the receipt's
        // payment_reference_number must be the actual payment.
        // ------------------------------------------------------------------
        const payments = await provider.getOrderPayments(row.razorpay_order_id);
        const capturedPayment =
          payments.find((p) => p.status === 'captured') ??
          payments.find((p) => p.status === 'authorized') ??
          null;

        // Amount check before crediting anything. A mismatch means the order
        // was not paid for what we billed; flag it and leave the row alone for
        // a human rather than issuing a wrong receipt.
        const expectedPaise = Number(row.amount_paise ?? 0);
        const actualPaise = Number(capturedPayment?.amount ?? orderStatus.amountPaise ?? 0);
        if (expectedPaise > 0 && actualPaise !== expectedPaise) {
          stat.amountMismatch++;
          stat.actions.push({
            id: row.id,
            action: 'amount_mismatch',
            expectedPaise,
            actualPaise,
          });
          if (!dryRun) {
            await PaymentAuditService.logAmountMismatch(
              row.id,
              row.student_id ?? 'unknown',
              row.institution_id ?? 'unknown',
              expectedPaise,
              actualPaise,
              undefined,
              { source: 'razorpay_late_auth_cron', razorpayOrderId: row.razorpay_order_id },
            );
          }
          continue;
        }

        const capturedAt =
          orderStatus.capturedAt?.toISOString() ??
          (capturedPayment ? new Date(capturedPayment.created_at * 1000).toISOString() : new Date().toISOString());

        stat.captured++;
        stat.actions.push({
          id: row.id,
          action: 'capture',
          razorpayOrderId: row.razorpay_order_id,
          razorpayPaymentId: capturedPayment?.id ?? null,
          amount: actualPaise / 100,
          capturedAt,
        });

        if (dryRun) continue;

        const update: Record<string, unknown> = {
          status: 'success',
          captured_at: capturedAt,
          payment_date: capturedAt,
          completed_at: new Date().toISOString(),
          gateway_response: orderStatus.raw,
        };
        if (capturedPayment) {
          update.razorpay_payment_id = capturedPayment.id;
          // gateway_transaction_id is what the callback path writes and what
          // the receipt reference is built from — keep both in step so receipt
          // creation stays idempotent whichever path lands first.
          update.gateway_transaction_id = capturedPayment.id;
          update.payment_method = capturedPayment.method ?? null;
        }
        if (cfg.module === 'billing') {
          update.processed_at = new Date().toISOString();
          update.verified_amount = actualPaise / 100;
          update.verification_response = capturedPayment ?? orderStatus.raw;
        }

        const { error: updateError } = await (supabase as any)
          .from(cfg.table)
          .update(update)
          .eq('id', row.id);

        if (updateError) {
          logger.error('cron/razorpay-late-auth', 'Failed to update transaction row', {
            table: cfg.table,
            id: row.id,
            error: updateError,
          });
          continue;
        }

        // ------------------------------------------------------------------
        // Downstream side-effects. Flipping the transaction to 'success' is
        // NOT the job: the learner's bill has to be marked paid and a receipt
        // issued, otherwise the payment stays invisible in billing.
        // ------------------------------------------------------------------
        if (cfg.module === 'billing') {
          const { data: txn } = await (supabase as any)
            .from('payment_transactions')
            .select('*')
            .eq('id', row.id)
            .single();

          if (txn) {
            const receipted = await PaymentGatewayService.processSuccessfulPayment(
              txn,
              supabase as any,
            );
            if (receipted) {
              stat.receipted++;
            } else {
              logger.error('cron/razorpay-late-auth', 'Captured but receipt creation FAILED', {
                id: row.id,
                razorpayOrderId: row.razorpay_order_id,
              });
              await PaymentAuditService.logVerificationFailed(
                row.id,
                row.student_id ?? 'unknown',
                row.institution_id ?? 'unknown',
                'receipt_creation_failed',
                { source: 'razorpay_late_auth_cron', razorpayOrderId: row.razorpay_order_id },
              );
            }
          }

          await PaymentAuditService.logVerificationSuccess(
            row.id,
            row.student_id ?? 'unknown',
            row.institution_id ?? 'unknown',
            actualPaise / 100,
            {
              source: 'razorpay_late_auth_cron',
              razorpayOrderId: row.razorpay_order_id,
              razorpayPaymentId: capturedPayment?.id ?? null,
            },
          );
        } else if (row.registration_id) {
          await (supabase as any)
            .from('events_registrations')
            .update({ payment_status: 'paid' })
            .eq('id', row.registration_id);
        }
      } catch (err) {
        logger.warn('cron/razorpay-late-auth', 'Reconciliation failed for row', {
          table: cfg.table,
          id: row.id,
          razorpayOrderId: row.razorpay_order_id,
          error: err instanceof Error ? err.message : String(err),
        });
        stat.skipped++;
        stat.actions.push({
          id: row.id,
          action: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    results[cfg.table] = stat;
  }

  logger.info('cron/razorpay-late-auth', 'Sweep complete', {
    dryRun,
    payment_transactions: { ...results.payment_transactions, actions: undefined },
    event_payment_transactions: { ...results.event_payment_transactions, actions: undefined },
  });

  return NextResponse.json({ success: true, dryRun, results });
}
