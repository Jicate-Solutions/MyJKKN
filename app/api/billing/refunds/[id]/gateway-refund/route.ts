export const dynamic = 'force-dynamic';

// Trigger a Razorpay refund for an existing billing_refunds row (Task 35).
// HDFC SmartGateway refunds remain manual — this route is only meaningful
// when the parent payment_transactions row has provider='razorpay'.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { toPaise } from '@/lib/services/payments/amount';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: refundId } = await params;

  try {
    const supabase = await createClient();

    // Load refund + parent transaction via receipt FK chain
    const { data: refund, error: refundErr } = await (supabase as any)
      .from('billing_refunds')
      .select('id, status, refund_amount, receipt:billing_receipts(id, transaction:payment_transactions(id, provider, razorpay_payment_id, transaction_ref))')
      .eq('id', refundId)
      .single();

    if (refundErr || !refund) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (refund.status !== 'pending') {
      return NextResponse.json({ error: 'invalid_status', message: `Refund is in status '${refund.status}', expected 'pending'` }, { status: 400 });
    }

    const txn = refund.receipt?.transaction;
    if (!txn) {
      return NextResponse.json({ error: 'orphan_refund', message: 'Refund has no parent transaction' }, { status: 400 });
    }

    if (txn.provider !== 'razorpay') {
      return NextResponse.json(
        { error: 'manual_refund_required', message: 'Non-Razorpay transactions are refunded manually.' },
        { status: 400 },
      );
    }

    if (!txn.razorpay_payment_id) {
      return NextResponse.json(
        { error: 'no_payment_id', message: 'Transaction has no Razorpay payment id — payment may not have been captured.' },
        { status: 400 },
      );
    }

    const provider = getPaymentProvider('billing');
    const result = await provider.createRefund({
      gatewayPaymentId: txn.razorpay_payment_id,
      amountPaise: toPaise(Number(refund.refund_amount)),
      refundReference: refundId,
      notes: {
        internal_refund_id: refundId,
        transaction_ref: txn.transaction_ref ?? '',
      },
    });

    await (supabase as any)
      .from('billing_refunds')
      .update({
        status: result.status === 'processed' ? 'processed' : 'processing',
        gateway_refund_id: result.gatewayRefundId,
        gateway_response: result.raw,
      })
      .eq('id', refundId);

    logger.info('billing/refund-gateway', 'Razorpay refund initiated', {
      refundId,
      gatewayRefundId: result.gatewayRefundId,
      status: result.status,
    });

    return NextResponse.json({
      success: true,
      refundId: result.gatewayRefundId,
      status: result.status,
    });
  } catch (err) {
    logger.error('billing/refund-gateway', 'Refund failed', err);
    return NextResponse.json(
      { error: 'internal_error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
