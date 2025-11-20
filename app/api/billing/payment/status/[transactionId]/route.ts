// Payment Status Check API Endpoint
// GET /api/billing/payment/status/[transactionId]
// Purpose: Check payment status from HDFC and database

import { NextRequest, NextResponse } from 'next/server';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params;

    logger.info('billing/payment-api', 'Checking payment status', { transactionId });

    // Step 1: Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('billing/payment-api', 'Unauthorized status check attempt');
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to check payment status' },
        { status: 401 }
      );
    }

    // Step 2: Fetch transaction to verify access
    const transaction = await PaymentGatewayService.getTransaction(transactionId);

    if (!transaction) {
      logger.warn('billing/payment-api', 'Transaction not found', { transactionId });
      return NextResponse.json(
        { error: 'TRANSACTION_NOT_FOUND', message: 'Payment transaction not found' },
        { status: 404 }
      );
    }

    // Step 3: Verify user has access to this transaction
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logger.error('billing/payment-api', 'Failed to fetch user profile', profileError);
      return NextResponse.json(
        { error: 'PROFILE_NOT_FOUND', message: 'User profile not found' },
        { status: 404 }
      );
    }

    // For students, they can only check their own transactions
    if (profile.role === 'student' && profile.id !== transaction.student_id) {
      logger.warn('billing/payment-api', 'Student attempting to check another student\'s transaction', {
        user_id: user.id,
        transaction_student_id: transaction.student_id,
      });
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'You can only check your own payment transactions' },
        { status: 403 }
      );
    }

    // Step 4: Check payment status from HDFC
    const result = await PaymentGatewayService.checkPaymentStatus(transactionId);

    if (!result.success) {
      logger.error('billing/payment-api', 'Payment status check failed', result.error);
      return NextResponse.json(
        {
          error: result.error?.error || 'STATUS_CHECK_FAILED',
          message: result.error?.message || 'Failed to check payment status',
          details: result.error?.details,
        },
        { status: 500 }
      );
    }

    logger.info('billing/payment-api', 'Payment status retrieved successfully', {
      transaction_id: transactionId,
      status: result.data?.status,
    });

    // Step 5: Return payment status
    return NextResponse.json(
      {
        success: true,
        data: result.data,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('billing/payment-api', 'Payment status endpoint error', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
