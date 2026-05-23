export const dynamic = 'force-dynamic';

// Late authorization sweep (Task 42-43)
// Razorpay sometimes captures payments asynchronously (e.g., bank-side delays
// for NetBanking/UPI). If the user closed the modal without seeing the
// success page, or our webhook delivery dropped, the payment_transactions row
// will be stuck in 'initiated' / 'processing'. This cron catches those.
//
// Schedule: every 15 minutes (vercel.json).
// Query window: created > 15 minutes ago AND < 5 days ago. Beyond 5 days,
// Razorpay auto-refunds uncaptured authorizations.
//
// Auth: ?secret=${CRON_SECRET} (matches the project's existing cron pattern).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { logger } from '@/lib/utils/enhanced-logger';

const TABLES = ['payment_transactions', 'event_payment_transactions'] as const;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const provider = getPaymentProvider('billing'); // same Razorpay keys for both modules

  const now = Date.now();
  const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000).toISOString();
  const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();

  const results: Record<string, { scanned: number; captured: number; failed: number; expired: number }> = {};

  for (const table of TABLES) {
    const stat = { scanned: 0, captured: 0, failed: 0, expired: 0 };

    const { data: rows, error } = await (supabase as any)
      .from(table)
      .select('id, razorpay_order_id, status, amount_paise, registration_id, created_at')
      .eq('provider', 'razorpay')
      .in('status', ['initiated', 'processing'])
      .lte('created_at', fifteenMinutesAgo)
      .gte('created_at', fiveDaysAgo)
      .limit(100);

    if (error) {
      logger.error('cron/razorpay-late-auth', `Query failed for ${table}`, error);
      results[table] = stat;
      continue;
    }

    for (const row of rows ?? []) {
      if (!row.razorpay_order_id) continue;
      stat.scanned++;

      try {
        const status = await provider.getOrderStatus(row.razorpay_order_id);

        if (status.status === 'captured') {
          await (supabase as any)
            .from(table)
            .update({
              status: 'success',
              captured_at: status.capturedAt?.toISOString() ?? new Date().toISOString(),
              payment_date: status.capturedAt?.toISOString() ?? new Date().toISOString(),
              completed_at: new Date().toISOString(),
              gateway_response: status.raw,
            })
            .eq('id', row.id);

          // For events, also flip registration to paid
          if (table === 'event_payment_transactions' && row.registration_id) {
            await (supabase as any)
              .from('events_registrations')
              .update({ payment_status: 'paid' })
              .eq('id', row.registration_id);
          }

          stat.captured++;
        } else if (status.status === 'failed') {
          await (supabase as any)
            .from(table)
            .update({ status: 'failed', gateway_response: status.raw, completed_at: new Date().toISOString() })
            .eq('id', row.id);
          stat.failed++;
        }
        // 'created' / 'authorized' / 'refunded' — leave as-is for next sweep
      } catch (err) {
        logger.warn('cron/razorpay-late-auth', 'getOrderStatus failed for row', {
          table,
          id: row.id,
          razorpayOrderId: row.razorpay_order_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Mark rows older than 5 days as expired (Razorpay auto-refunds those)
    const { data: stale } = await (supabase as any)
      .from(table)
      .select('id')
      .eq('provider', 'razorpay')
      .in('status', ['initiated', 'processing'])
      .lt('created_at', fiveDaysAgo);

    if (stale && stale.length > 0) {
      await (supabase as any)
        .from(table)
        .update({ status: 'expired', completed_at: new Date().toISOString() })
        .in('id', stale.map((r: any) => r.id));
      stat.expired = stale.length;
    }

    results[table] = stat;
  }

  logger.info('cron/razorpay-late-auth', 'Sweep complete', results);
  return NextResponse.json({ success: true, results });
}
