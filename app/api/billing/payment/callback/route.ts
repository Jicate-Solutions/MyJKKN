// HDFC Payment Callback Handler - SECURE VERSION
// Purpose: Handle POST callback from HDFC SmartGateway after payment
// Security: Uses server-side verification - NEVER trusts client-provided status
// Created: 2025-01-20 (Security Enhancement)

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';
import { PaymentAuditService } from '@/lib/services/billing/security/payment-audit-service';
import { logger } from '@/lib/utils/enhanced-logger';


/**
 * SECURE Payment Callback Handler
 *
 * SECURITY FLOW:
 * 1. Extract transaction_id ONLY from redirect params
 * 2. Log callback received for audit trail
 * 3. Call HDFC Order Status API to get REAL payment status
 * 4. Compare client-claimed status with server-verified status (detect manipulation)
 * 5. Only create receipt if server verification confirms success
 * 6. Redirect to appropriate page based on VERIFIED status
 *
 * This prevents parameter manipulation attacks where attackers change
 * failed payment responses to successful ones.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    logger.info('billing/payment-callback', 'Received HDFC POST callback');

    // Extract client IP and user agent for audit logging
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Extract data from request
    const searchParams = request.nextUrl.searchParams;
    let formData: FormData | null = null;

    try {
      formData = await request.formData();
    } catch (e) {
      logger.dev('billing/payment-callback', 'No form data in POST request');
    }

    // Extract our transaction_id from URL params (set when creating payment session)
    let ourTransactionId = searchParams.get('transaction_id');

    // Extract HDFC's claimed status (we will VERIFY this, NOT trust it)
    const hdfcOrderId =
      formData?.get('order_id')?.toString() || searchParams.get('order_id') || '';
    const clientClaimedStatus =
      formData?.get('status')?.toString() ||
      formData?.get('order_status')?.toString() ||
      searchParams.get('order_status') ||
      '';

    logger.info('billing/payment-callback', 'Callback data received', {
      ourTransactionId,
      hdfcOrderId,
      clientClaimedStatus,
      ipAddress: ipAddress.substring(0, 20), // Truncate for logging
    });

    // If we don't have our transaction_id, look it up using HDFC's order_id
    if (!ourTransactionId && hdfcOrderId) {
      logger.info('billing/payment-callback', 'Looking up transaction by order_id', { hdfcOrderId });

      const supabase = createServiceRoleClient();
      const { data: transaction, error: lookupError } = await (supabase as any)
        .from('payment_transactions')
        .select('id, student_id, institution_id')
        .eq('transaction_ref', hdfcOrderId)
        .single();

      if (lookupError) {
        logger.error('billing/payment-callback', 'Transaction lookup failed', lookupError);
      }

      if (transaction) {
        ourTransactionId = transaction.id;
        logger.info('billing/payment-callback', 'Found transaction', { ourTransactionId });
      }
    }

    // If no transaction found, redirect to billing page
    if (!ourTransactionId) {
      logger.warn('billing/payment-callback', 'No transaction_id found in callback');
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(new URL('/billing/schedule/students', baseUrl), 303);
    }

    // Fetch transaction details for audit logging
    const supabase = createServiceRoleClient();
    const { data: txnDetails } = await (supabase as any)
      .from('payment_transactions')
      .select('student_id, institution_id, total_amount, processed_at')
      .eq('id', ourTransactionId)
      .single();

    // Log callback received for audit trail
    if (txnDetails) {
      await PaymentAuditService.logCallbackReceived(
        ourTransactionId,
        txnDetails.student_id,
        txnDetails.institution_id,
        clientClaimedStatus,
        ipAddress,
        userAgent
      );
    }

    // ============================================================================
    // CRITICAL SECURITY: Server-Side Verification
    // ============================================================================
    // DO NOT trust clientClaimedStatus - verify with HDFC API directly

    logger.info('billing/payment-callback', 'Starting server-side verification', {
      transactionId: ourTransactionId,
      clientClaimedStatus,
    });

    // Step 1: Verify payment status with HDFC API
    const verification = await PaymentGatewayService.verifyPaymentWithGateway(ourTransactionId);

    logger.info('billing/payment-callback', 'Verification result', {
      transactionId: ourTransactionId,
      verified: verification.verified,
      verifiedStatus: verification.status,
      clientClaimedStatus,
    });

    // Step 2: Process verified payment (handles manipulation detection, receipt creation)
    const processResult = await PaymentGatewayService.processVerifiedPayment(
      ourTransactionId,
      verification,
      clientClaimedStatus,
      ipAddress,
      userAgent
    );

    // Step 3: Build redirect URL based on VERIFIED status (not client-claimed)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectPage =
      verification.verified && verification.status === 'success'
        ? '/billing/payment/success'
        : '/billing/payment/failed';

    const redirectUrl = new URL(redirectPage, baseUrl);
    redirectUrl.searchParams.set('transaction_id', ourTransactionId);

    // Add receipt ID if available
    if (processResult.receiptId) {
      redirectUrl.searchParams.set('receipt_id', processResult.receiptId);
    }

    // Add HDFC reference data
    if (hdfcOrderId) {
      redirectUrl.searchParams.set('hdfc_order_id', hdfcOrderId);
    }
    if (verification.gatewayTransactionId) {
      redirectUrl.searchParams.set('hdfc_transaction_id', verification.gatewayTransactionId);
    }

    // Add verified amount for display
    if (verification.amount) {
      redirectUrl.searchParams.set('amount', verification.amount.toString());
    }

    // Add verification status (so success page knows it's verified)
    redirectUrl.searchParams.set('verified', verification.verified.toString());
    redirectUrl.searchParams.set('verified_status', verification.status);

    const processingTime = Date.now() - startTime;
    logger.info('billing/payment-callback', 'Callback processed successfully', {
      transactionId: ourTransactionId,
      verifiedStatus: verification.status,
      receiptCreated: !!processResult.receiptId,
      processingTimeMs: processingTime,
      redirectPage,
    });

    // Use 303 See Other to convert POST to GET
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    logger.error('billing/payment-callback', 'Error processing callback', error);

    // Redirect to billing page on error
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(new URL('/billing/schedule/students', baseUrl), 303);
  }
}

/**
 * GET Handler - For direct URL access or testing
 * Also uses server-side verification for security
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const transactionId = searchParams.get('transaction_id');
  const clientClaimedStatus =
    searchParams.get('order_status') || searchParams.get('hdfc_status') || '';

  logger.info('billing/payment-callback', 'GET request received', {
    transactionId,
    clientClaimedStatus,
  });

  if (!transactionId) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(new URL('/billing/schedule/students', baseUrl), 303);
  }

  // Extract client info for audit
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    // ============================================================================
    // CRITICAL SECURITY: Server-Side Verification (same as POST)
    // ============================================================================

    logger.info('billing/payment-callback', 'Starting GET verification', {
      transactionId,
    });

    // Verify with HDFC API
    const verification = await PaymentGatewayService.verifyPaymentWithGateway(transactionId);

    // Process verified payment
    const processResult = await PaymentGatewayService.processVerifiedPayment(
      transactionId,
      verification,
      clientClaimedStatus,
      ipAddress,
      userAgent
    );

    // Build redirect URL based on VERIFIED status
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectPage =
      verification.verified && verification.status === 'success'
        ? '/billing/payment/success'
        : '/billing/payment/failed';

    const redirectUrl = new URL(redirectPage, baseUrl);
    redirectUrl.searchParams.set('transaction_id', transactionId);

    if (processResult.receiptId) {
      redirectUrl.searchParams.set('receipt_id', processResult.receiptId);
    }

    // Copy verification data
    if (verification.amount) {
      redirectUrl.searchParams.set('amount', verification.amount.toString());
    }
    redirectUrl.searchParams.set('verified', verification.verified.toString());
    redirectUrl.searchParams.set('verified_status', verification.status);

    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    logger.error('billing/payment-callback', 'GET verification failed', error);

    // On error, redirect to failed page with transaction ID
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUrl = new URL('/billing/payment/failed', baseUrl);
    redirectUrl.searchParams.set('transaction_id', transactionId);
    redirectUrl.searchParams.set('error', 'verification_failed');

    return NextResponse.redirect(redirectUrl, 303);
  }
}
