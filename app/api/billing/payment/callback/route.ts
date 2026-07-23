export const dynamic = 'force-dynamic';

// HDFC Payment Callback Handler - SECURE VERSION
// Purpose: Handle POST callback from HDFC SmartGateway after payment
// Security: Uses server-side verification - NEVER trusts client-provided status
// Created: 2025-01-20 (Security Enhancement)

import { NextRequest, NextResponse, connection } from 'next/server';
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
  await connection();
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

    // ------------------------------------------------------------------
    // Razorpay callback branch (hosted checkout).
    // Razorpay's hosted checkout POSTs razorpay_order_id, razorpay_payment_id,
    // razorpay_signature to this callback_url. Detect that and route through
    // the signature-verification + dual-inquiry path.
    // ------------------------------------------------------------------
    if (formData) {
      const razorpayOrderId = formData.get('razorpay_order_id')?.toString();
      const razorpayPaymentId = formData.get('razorpay_payment_id')?.toString();
      const razorpaySignature = formData.get('razorpay_signature')?.toString();

      if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const supabase = createServiceRoleClient();

        const { data: txn } = await (supabase as any)
          .from('payment_transactions')
          .select('id, student_id, institution_id, total_amount')
          .eq('razorpay_order_id', razorpayOrderId)
          .single();

        if (!txn) {
          logger.warn('billing/payment-callback', 'Razorpay callback for unknown order', { razorpayOrderId });
          return NextResponse.redirect(new URL('/billing/schedule/students', baseUrl), 303);
        }

        // Log callback received for audit trail (mirrors HDFC path)
        await PaymentAuditService.logCallbackReceived(
          txn.id,
          txn.student_id,
          txn.institution_id,
          'razorpay_hosted',
          ipAddress,
          userAgent
        );

        const verification = await PaymentGatewayService.verifyPaymentWithGateway(txn.id, {
          paymentId: razorpayPaymentId,
          signature: razorpaySignature,
        });

        const processResult = await PaymentGatewayService.processVerifiedPayment(
          txn.id,
          verification,
          'razorpay',
          ipAddress,
          userAgent
        );

        const redirectPage =
          verification.verified && verification.status === 'success'
            ? '/billing/payment/success'
            : '/billing/payment/failed';

        const redirectUrl = new URL(redirectPage, baseUrl);
        redirectUrl.searchParams.set('transaction_id', txn.id);
        if (processResult.receiptId) {
          redirectUrl.searchParams.set('receipt_id', processResult.receiptId);
        }
        redirectUrl.searchParams.set('razorpay_order_id', razorpayOrderId);
        redirectUrl.searchParams.set('razorpay_payment_id', razorpayPaymentId);
        if (verification.amount) {
          redirectUrl.searchParams.set('amount', verification.amount.toString());
        }
        redirectUrl.searchParams.set('verified', verification.verified.toString());
        redirectUrl.searchParams.set('verified_status', verification.status);
        redirectUrl.searchParams.set('provider', 'razorpay');

        const processingTime = Date.now() - startTime;
        logger.info('billing/payment-callback', 'Razorpay callback processed', {
          transactionId: txn.id,
          verifiedStatus: verification.status,
          receiptCreated: !!processResult.receiptId,
          processingTimeMs: processingTime,
        });

        return NextResponse.redirect(redirectUrl, 303);
      }

      // ----------------------------------------------------------------
      // Razorpay hosted checkout FAILURE callback.
      // On a failed payment Razorpay does NOT post the signed success trio;
      // it posts error[code]/error[description]/error[source]/error[step]/
      // error[reason] and error[metadata] (a JSON string with order_id /
      // payment_id). Without this branch the request falls through to the
      // legacy lookup, finds nothing, and wrongly lands on the bills list.
      // ----------------------------------------------------------------
      const errorCode = formData.get('error[code]')?.toString();
      const errorMetadataRaw = formData.get('error[metadata]')?.toString();
      if (errorCode || errorMetadataRaw || razorpayOrderId) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const supabase = createServiceRoleClient();

        let failedOrderId = razorpayOrderId;
        let failedPaymentId = razorpayPaymentId;
        if (errorMetadataRaw) {
          try {
            const meta = JSON.parse(errorMetadataRaw);
            failedOrderId = failedOrderId || meta?.order_id;
            failedPaymentId = failedPaymentId || meta?.payment_id;
          } catch {
            // metadata wasn't JSON; fall back to bracketed keys below.
          }
        }
        failedOrderId =
          failedOrderId || formData.get('error[metadata][order_id]')?.toString();
        failedPaymentId =
          failedPaymentId || formData.get('error[metadata][payment_id]')?.toString();

        const failedRedirect = new URL('/billing/payment/failed', baseUrl);
        failedRedirect.searchParams.set('provider', 'razorpay');
        if (errorCode) failedRedirect.searchParams.set('reason', errorCode);

        if (failedOrderId) {
          const { data: txn } = await (supabase as any)
            .from('payment_transactions')
            .select('id, student_id, institution_id, status')
            .eq('razorpay_order_id', failedOrderId)
            .single();

          if (txn) {
            failedRedirect.searchParams.set('transaction_id', txn.id);

            // Persist the failure (audit: failed responses must be stored),
            // but never overwrite an already-final status.
            if (!['success', 'refunded'].includes(txn.status)) {
              await (supabase as any)
                .from('payment_transactions')
                .update({
                  status: 'failed',
                  razorpay_payment_id: failedPaymentId ?? null,
                  gateway_response: {
                    error_code: errorCode ?? null,
                    error_description: formData.get('error[description]')?.toString() ?? null,
                    error_source: formData.get('error[source]')?.toString() ?? null,
                    error_step: formData.get('error[step]')?.toString() ?? null,
                    error_reason: formData.get('error[reason]')?.toString() ?? null,
                  },
                  updated_at: new Date().toISOString(),
                })
                .eq('id', txn.id);

              await PaymentAuditService.logCallbackReceived(
                txn.id,
                txn.student_id,
                txn.institution_id,
                'razorpay_hosted_failed',
                ipAddress,
                userAgent,
              );
            }
          } else {
            logger.warn('billing/payment-callback', 'Razorpay failure callback for unknown order', {
              failedOrderId,
            });
          }
        }

        logger.info('billing/payment-callback', 'Razorpay failure callback processed', {
          failedOrderId,
          errorCode,
        });

        return NextResponse.redirect(failedRedirect, 303);
      }
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
  await connection();
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
