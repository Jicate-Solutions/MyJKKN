// Payment Initiation API Endpoint
// POST /api/billing/payment/initiate
// Purpose: Create HDFC payment session for student bills

import { NextRequest, NextResponse } from 'next/server';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import type { CreatePaymentSessionDto } from '@/types/payment-gateway';

export async function POST(request: NextRequest) {
  try {
    // Step 1: Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('billing/payment-api', 'Unauthorized payment initiation attempt');
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to initiate a payment' },
        { status: 401 }
      );
    }

    // Step 2: Parse request body
    const body = await request.json();
    const { student_id, bill_ids, bill_amounts, return_url, cancel_url } = body;

    // Step 3: Validate request data
    if (!student_id || !bill_ids || !Array.isArray(bill_ids) || bill_ids.length === 0) {
      logger.warn('billing/payment-api', 'Invalid payment initiation request', { body });
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'student_id and bill_ids (array) are required',
        },
        { status: 400 }
      );
    }

    // Step 4: Verify user has access to the student
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single() as { data: { id: string; role: string } | null; error: unknown };

    if (profileError || !profile) {
      logger.error('billing/payment-api', 'Failed to fetch user profile', profileError);
      return NextResponse.json(
        { error: 'PROFILE_NOT_FOUND', message: 'User profile not found' },
        { status: 404 }
      );
    }

    // For students, they can only pay their own bills
    if (profile.role === 'student' && profile.id !== student_id) {
      logger.warn('billing/payment-api', 'Student attempting to pay for another student', {
        user_id: user.id,
        student_id,
      });
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'You can only pay for your own bills' },
        { status: 403 }
      );
    }

    // For parents, verify they have access to the student (future enhancement)
    // For admins/staff, they can initiate payments for any student

    logger.info('billing/payment-api', 'Initiating payment session', {
      user_id: user.id,
      student_id,
      bill_count: bill_ids.length,
    });

    // Step 5: Create payment session
    const sessionData: CreatePaymentSessionDto = {
      student_id,
      bill_ids,
      bill_amounts,
      return_url,
      cancel_url,
    };

    const result = await PaymentGatewayService.createPaymentSession(sessionData);

    if (!result.success) {
      logger.error('billing/payment-api', 'Payment session creation failed', result.error);
      return NextResponse.json(
        {
          error: result.error?.error || 'SESSION_CREATION_FAILED',
          message: result.error?.message || 'Failed to create payment session',
          details: result.error?.details,
        },
        { status: 500 }
      );
    }

    logger.info('billing/payment-api', 'Payment session created successfully', {
      transaction_id: result.data?.transaction_id,
      session_id: result.data?.session_id,
    });

    // Step 6: Return payment session details
    return NextResponse.json(
      {
        success: true,
        data: result.data,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('billing/payment-api', 'Payment initiation endpoint error', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
