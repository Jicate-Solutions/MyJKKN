// Event Payment Service
// Handles payment flow for event registrations using HDFC SmartGateway
// Created: 2026-04-07
// Purpose: Separate payment service for events (does NOT modify billing payment service)

import { createServiceRoleClient } from '@/lib/supabase/server';
import { HDFCEventClient } from './hdfc-event-client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { EventPaymentTransaction } from '@/types/events';

// ============================================================================
// EventPaymentService
// ============================================================================

export class EventPaymentService {
  // ==========================================================================
  // 1. Initiate Payment
  // ==========================================================================

  /**
   * Initiates a payment for an event registration.
   *
   * Flow:
   * 1. Validate registration exists and is unpaid
   * 2. Generate unique transaction ref
   * 3. Insert event_payment_transactions row (status: 'initiated')
   * 4. Call HDFCEventClient.createSession()
   * 5. Update transaction with gateway_session_id
   * 6. Return payment_url + transaction_id
   */
  static async initiatePayment(params: {
    registrationId: string;
    eventId: string;
    amount: number;
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    discountCode?: string;
    returnUrl: string;
  }): Promise<{ payment_url: string; transaction_id: string }> {
    const supabase = createServiceRoleClient();

    logger.info('events/payment', 'Initiating event payment', {
      registrationId: params.registrationId,
      eventId: params.eventId,
      amount: params.amount,
    });

    // Step 1: Validate registration exists and is unpaid
    const { data: registration, error: regError } = await supabase
      .from('events_registrations')
      .select('id, event_id, payment_status, payment_amount, participant_name, institution_id')
      .eq('id', params.registrationId)
      .eq('event_id', params.eventId)
      .single();

    if (regError || !registration) {
      logger.error('events/payment', 'Registration not found', {
        registrationId: params.registrationId,
        error: regError,
      });
      throw new Error('Registration not found');
    }

    if (registration.payment_status === 'paid') {
      throw new Error('Registration is already paid');
    }

    // Step 2: Generate unique transaction reference
    // Format: E{YYYYMMDDHHMMSS}{XXXXX} — 20 chars, alphanumeric, non-sequential
    const transactionRef = this.generateTransactionRef();

    // Step 3: Create event_payment_transactions row
    const { data: transaction, error: txnError } = await supabase
      .from('event_payment_transactions')
      .insert({
        event_id: params.eventId,
        registration_id: params.registrationId,
        transaction_ref: transactionRef,
        amount: params.amount,
        currency: 'INR',
        status: 'initiated',
        payer_name: params.payerName,
        payer_email: params.payerEmail,
        payer_phone: params.payerPhone,
        discount_code: params.discountCode || null,
        discount_amount: 0,
        institution_id: registration.institution_id,
      })
      .select('id')
      .single();

    if (txnError || !transaction) {
      logger.error('events/payment', 'Failed to create payment transaction', txnError);
      throw new Error('Failed to create payment transaction');
    }

    // Step 4: Call HDFC to create session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const callbackUrl = `${appUrl}/api/events/marathon/${params.eventId}/payment/callback?transaction_ref=${transactionRef}`;

    let hdfcResult: { payment_url: string; session_id: string };
    try {
      hdfcResult = await HDFCEventClient.createSession({
        transactionRef,
        amount: params.amount,
        customerName: params.payerName,
        customerEmail: params.payerEmail,
        customerPhone: params.payerPhone,
        returnUrl: callbackUrl,
        description: `Event Registration - ${registration.participant_name || 'Participant'}`,
      });
    } catch (hdfcError) {
      // Mark transaction as failed if HDFC session creation fails
      await supabase
        .from('event_payment_transactions')
        .update({ status: 'failed', gateway_response: { error: String(hdfcError) } })
        .eq('id', transaction.id);

      logger.error('events/payment', 'HDFC session creation failed', hdfcError);
      throw new Error('Failed to create payment session with gateway');
    }

    // Step 5: Update transaction with gateway_session_id
    await supabase
      .from('event_payment_transactions')
      .update({
        gateway_session_id: hdfcResult.session_id,
        status: 'processing',
      })
      .eq('id', transaction.id);

    logger.info('events/payment', 'Payment initiated successfully', {
      transactionId: transaction.id,
      transactionRef,
    });

    return {
      payment_url: hdfcResult.payment_url,
      transaction_id: transaction.id,
    };
  }

  // ==========================================================================
  // 2. Handle HDFC Callback
  // ==========================================================================

  /**
   * Handles the HDFC redirect callback after payment.
   * CRITICAL: Always verifies payment status server-to-server with HDFC.
   *
   * @param transactionRef - Our transaction_ref from the callback URL
   * @param clientStatus - Status claimed by client (for manipulation detection)
   * @returns Result with success flag and registration ID
   */
  static async handleCallback(
    transactionRef: string,
    clientStatus?: string
  ): Promise<{
    success: boolean;
    registrationId: string;
    transactionId: string;
  }> {
    const supabase = createServiceRoleClient();

    logger.info('events/payment', 'Handling payment callback', {
      transactionRef,
      clientStatus,
    });

    // Step 1: Find transaction by transaction_ref
    const { data: transaction, error: txnError } = await supabase
      .from('event_payment_transactions')
      .select('*')
      .eq('transaction_ref', transactionRef)
      .single();

    if (txnError || !transaction) {
      logger.error('events/payment', 'Transaction not found for callback', {
        transactionRef,
      });
      throw new Error('Transaction not found');
    }

    // Idempotency: if already processed as success, return early
    if (transaction.status === 'success') {
      logger.warn('events/payment', 'Transaction already processed', {
        transactionId: transaction.id,
      });
      return {
        success: true,
        registrationId: transaction.registration_id || '',
        transactionId: transaction.id,
      };
    }

    // Step 2: Verify with HDFC server-to-server (NEVER trust client status)
    const verification = await HDFCEventClient.verifyPaymentStatus(
      transaction.transaction_ref,
      transaction.gateway_session_id
    );

    // Step 3: Detect manipulation — log if client claims success but HDFC disagrees
    if (clientStatus) {
      const clientClaimsSuccess = ['CHARGED', 'SUCCESS', 'COMPLETED', 'PAID'].includes(
        clientStatus.toUpperCase()
      );
      if (clientClaimsSuccess && !verification.verified) {
        logger.error(
          'events/payment',
          'SECURITY: Payment manipulation detected — client claims success but HDFC disagrees',
          {
            transactionId: transaction.id,
            transactionRef,
            clientStatus,
            serverStatus: verification.status,
          }
        );
      }
    }

    // Step 4: Update transaction based on verified status
    const now = new Date().toISOString();

    if (verification.verified) {
      // IMPORTANT: Snapshot pre-registration data BEFORE overwriting gateway_response.
      // The pre-register endpoint stashes registration_data in
      // gateway_response.pending_registration_data; the verification update below
      // overwrites that column with HDFC's raw response, so we must read it first.
      const pendingRegData = transaction.gateway_response?.pending_registration_data;

      // SUCCESS — Update transaction
      await supabase
        .from('event_payment_transactions')
        .update({
          status: 'success',
          gateway_transaction_id: verification.gatewayTransactionId || null,
          payment_method: verification.paymentMethod || null,
          gateway_response: verification.rawResponse || null,
          paid_at: now,
        })
        .eq('id', transaction.id);

      let registrationId = transaction.registration_id || '';

      // Check if this is a pre-registration payment (registration not yet created)
      if (!transaction.registration_id && pendingRegData) {
        // Create registration now that payment succeeded
        try {
          const regData = pendingRegData as Record<string, unknown>;

          // Generate BIB number
          const { count: existingCount } = await supabase
            .from('events_registrations')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', transaction.event_id)
            .eq('category_id', regData.category_id as string);

          const seq = (existingCount ?? 0) + 1;
          const catCode = (regData.category_code as string) || 'RUN';
          const eventYear = (regData.event_year as number) || new Date().getFullYear();
          const eventCode = (regData.event_code as string) || 'KBM';
          const bibNumber = `${eventCode}-${eventYear}-${catCode}-${String(seq).padStart(4, '0')}`;

          const { data: newReg, error: regError } = await supabase
            .from('events_registrations')
            .insert({
              event_id: transaction.event_id,
              category_id: regData.category_id,
              participant_type: regData.participant_type || 'internal',
              participant_name: regData.participant_name,
              participant_phone: regData.participant_phone || null,
              participant_email: regData.participant_email || null,
              participant_age: regData.participant_age || null,
              participant_gender: regData.participant_gender || null,
              institution_id: regData.institution_id || null,
              institution_name: regData.institution_name || null,
              department: regData.department || null,
              profile_id: regData.profile_id || null,
              learner_id: regData.learner_id || null,
              bib_number: bibNumber,
              status: 'registered',
              payment_status: 'paid',
              payment_amount: transaction.amount,
              payment_method: verification.paymentMethod || 'online',
              payment_reference: transaction.transaction_ref,
              custom_data: regData.custom_data || {},
              source: (regData.source as string) || 'admin',
            })
            .select('id')
            .single();

          if (regError) {
            logger.error('events/payment', 'Failed to create registration after payment', regError);
          } else {
            registrationId = newReg.id;
            // Link the transaction to the new registration
            await supabase
              .from('event_payment_transactions')
              .update({ registration_id: newReg.id })
              .eq('id', transaction.id);
            logger.info('events/payment', 'Registration created after successful payment', {
              registrationId: newReg.id,
              bibNumber,
            });
          }
        } catch (regCreateError) {
          logger.error('events/payment', 'Error creating registration after payment', regCreateError);
        }
      } else if (transaction.registration_id) {
        // Existing registration — just update payment status
        await supabase
          .from('events_registrations')
          .update({
            payment_status: 'paid',
            payment_method: verification.paymentMethod || 'online',
            payment_reference: transaction.transaction_ref,
          })
          .eq('id', transaction.registration_id);
      }

      logger.info('events/payment', 'Payment verified and registration updated', {
        transactionId: transaction.id,
        registrationId,
      });

      return {
        success: true,
        registrationId,
        transactionId: transaction.id,
      };
    } else {
      // FAILED or still PENDING at HDFC — Update transaction.
      // IMPORTANT: when status='pending' we keep the row in 'processing' so
      // a later webhook / retry can finalize it. In that case we MUST NOT
      // touch gateway_response, otherwise we wipe pending_registration_data
      // and the eventual retry has nothing to rebuild the registration from.
      const failedStatus = verification.status === 'pending' ? 'processing' : 'failed';

      const updatePayload: Record<string, unknown> = { status: failedStatus };
      // Only persist rawResponse on a terminal failure — never on 'pending',
      // so pre-registration payload survives for the retry path.
      if (failedStatus === 'failed' && verification.rawResponse) {
        updatePayload.gateway_response = verification.rawResponse;
      }

      await supabase
        .from('event_payment_transactions')
        .update(updatePayload)
        .eq('id', transaction.id);

      logger.warn('events/payment', 'Payment verification failed', {
        transactionId: transaction.id,
        status: verification.status,
      });

      return {
        success: false,
        registrationId: transaction.registration_id || '',
        transactionId: transaction.id,
      };
    }
  }

  // ==========================================================================
  // 3. Handle HDFC Webhook
  // ==========================================================================

  /**
   * Handles HDFC server-to-server webhook notification.
   * Catches payments where the user closed their browser before callback.
   *
   * @param payload - Webhook payload from HDFC
   */
  static async handleWebhook(payload: {
    event_type: string;
    data: {
      order: { order_id: string; amount: number; status: string };
      payment: {
        payment_id: string;
        payment_method: string;
        payment_status: string;
        payment_time?: string;
      };
    };
  }): Promise<void> {
    const supabase = createServiceRoleClient();
    const orderRef = payload.data.order.order_id;

    logger.info('events/payment', 'Processing webhook', {
      eventType: payload.event_type,
      orderRef,
    });

    // Find transaction
    const { data: transaction, error: txnError } = await supabase
      .from('event_payment_transactions')
      .select('*')
      .eq('transaction_ref', orderRef)
      .single();

    if (txnError || !transaction) {
      logger.warn('events/payment', 'Webhook: transaction not found (may be a billing txn)', {
        orderRef,
      });
      return;
    }

    // Idempotency: skip if already success
    if (transaction.status === 'success') {
      logger.info('events/payment', 'Webhook: transaction already processed', {
        transactionId: transaction.id,
      });
      return;
    }

    // Map event type to status
    const eventType = payload.event_type.toUpperCase();
    let newStatus: 'success' | 'failed' | 'cancelled';

    if (['PAYMENT_SUCCESS', 'PAYMENT_COMPLETED'].includes(eventType)) {
      newStatus = 'success';
    } else if (['PAYMENT_FAILED'].includes(eventType)) {
      newStatus = 'failed';
    } else if (['PAYMENT_CANCELLED'].includes(eventType)) {
      newStatus = 'cancelled';
    } else {
      logger.warn('events/payment', 'Webhook: unknown event type', {
        eventType: payload.event_type,
      });
      return;
    }

    const now = new Date().toISOString();

    // Update transaction
    await supabase
      .from('event_payment_transactions')
      .update({
        status: newStatus,
        gateway_transaction_id: payload.data.payment.payment_id,
        payment_method: payload.data.payment.payment_method,
        gateway_response: payload,
        paid_at: newStatus === 'success' ? now : null,
      })
      .eq('id', transaction.id);

    // If success, update registration
    if (newStatus === 'success' && transaction.registration_id) {
      await supabase
        .from('events_registrations')
        .update({
          payment_status: 'paid',
          payment_method: payload.data.payment.payment_method || 'online',
          payment_reference: transaction.transaction_ref,
        })
        .eq('id', transaction.registration_id);

      logger.info('events/payment', 'Webhook: registration marked as paid', {
        registrationId: transaction.registration_id,
      });
    }

    logger.info('events/payment', 'Webhook processed', {
      transactionId: transaction.id,
      status: newStatus,
    });
  }

  // ==========================================================================
  // 4. Check Payment Status
  // ==========================================================================

  /**
   * Returns the current payment transaction record.
   *
   * @param transactionId - Internal transaction ID
   * @returns The transaction record or null
   */
  static async checkPaymentStatus(
    transactionId: string
  ): Promise<EventPaymentTransaction | null> {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('event_payment_transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (error || !data) {
      logger.warn('events/payment', 'Transaction not found', { transactionId });
      return null;
    }

    return data as EventPaymentTransaction;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Generates unique transaction reference for HDFC SmartGateway.
   *
   * HDFC Requirements:
   * - Less than 21 characters
   * - No special characters
   * - Alphanumeric
   * - Non-sequential
   *
   * Format: E{YYYYMMDDHHMMSS}{XXXXX} (20 chars)
   */
  private static generateTransactionRef(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.]/g, '')
      .slice(0, 14);
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `E${timestamp}${random}`;
  }
}
