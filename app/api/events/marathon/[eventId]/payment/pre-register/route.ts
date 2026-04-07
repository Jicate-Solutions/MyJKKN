export const dynamic = 'force-dynamic';

// POST /api/events/marathon/[eventId]/payment/pre-register
// Creates a payment session BEFORE registration.
// Stores registration form data in the payment transaction metadata.
// On successful payment callback, the registration is created automatically.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { HDFCEventClient } from '@/lib/services/events/core/hdfc-event-client';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createServiceRoleClient();

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      amount,
      payer_name,
      payer_email,
      payer_phone,
      registration_data, // Full registration form data to save after payment
    } = body as {
      amount?: number;
      payer_name?: string;
      payer_email?: string;
      payer_phone?: string;
      registration_data?: Record<string, unknown>;
    };

    // Validate required fields
    if (!amount || !payer_name || !payer_email || !payer_phone || !registration_data) {
      return NextResponse.json(
        { error: 'amount, payer_name, payer_email, payer_phone, and registration_data are required' },
        { status: 400 }
      );
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    // Validate event exists
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name, year, status')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Generate unique transaction reference
    const now = new Date();
    const ts = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    const transactionRef = `E${ts}${rand}`;

    // Create payment transaction (no registration_id yet — will be set after payment)
    const { data: transaction, error: txnError } = await supabase
      .from('event_payment_transactions')
      .insert({
        event_id: eventId,
        registration_id: null, // No registration yet — payment first
        transaction_ref: transactionRef,
        amount,
        currency: 'INR',
        status: 'initiated',
        payer_name,
        payer_email,
        payer_phone,
        // Store the full registration form data as metadata in gateway_response
        // This will be used to create the registration after payment succeeds
        gateway_response: { pending_registration_data: registration_data },
        institution_id: (registration_data as any).institution_id || null,
      })
      .select('id')
      .single();

    if (txnError || !transaction) {
      logger.error('events/payment', 'Failed to create pre-registration payment', txnError);
      return NextResponse.json(
        { error: 'Failed to create payment transaction' },
        { status: 500 }
      );
    }

    // Call HDFC to create payment session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const callbackUrl = `${appUrl}/api/events/marathon/${eventId}/payment/callback?transaction_ref=${transactionRef}`;

    let hdfcResult: { payment_url: string; session_id: string };
    try {
      hdfcResult = await HDFCEventClient.createSession({
        transactionRef,
        amount,
        customerName: payer_name,
        customerEmail: payer_email,
        customerPhone: payer_phone,
        returnUrl: callbackUrl,
        description: `Marathon Registration - ${event.name}`,
      });
    } catch (hdfcError) {
      // Mark transaction as failed
      await supabase
        .from('event_payment_transactions')
        .update({ status: 'failed' })
        .eq('id', transaction.id);

      logger.error('events/payment', 'HDFC session creation failed for pre-register', hdfcError);
      return NextResponse.json(
        { error: 'Payment gateway unavailable. Please try again.' },
        { status: 502 }
      );
    }

    // Update transaction with session ID
    await supabase
      .from('event_payment_transactions')
      .update({
        gateway_session_id: hdfcResult.session_id,
        status: 'processing',
      })
      .eq('id', transaction.id);

    logger.info('events/payment', 'Pre-registration payment initiated', {
      transactionId: transaction.id,
      transactionRef,
      amount,
    });

    return NextResponse.json({
      success: true,
      data: {
        payment_url: hdfcResult.payment_url,
        transaction_id: transaction.id,
        transaction_ref: transactionRef,
      },
    });
  } catch (error) {
    logger.error('events/payment', 'Pre-register payment failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
