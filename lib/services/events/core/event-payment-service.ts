// Event Payment Service
// Handles payment flow for event registrations using HDFC SmartGateway
// Created: 2026-04-07
// Purpose: Separate payment service for events (does NOT modify billing payment service)

import { createServiceRoleClient } from '@/lib/supabase/server';
import { HDFCEventClient } from './hdfc-event-client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { EventPaymentTransaction } from '@/types/events';
import { getActiveProviderName, getPaymentProvider } from '@/lib/services/payments/factory';
import { toPaise } from '@/lib/services/payments/amount';
import { RazorpayProvider } from '@/lib/services/payments/razorpay/razorpay-provider';

export interface EventInitiatePaymentResult {
  payment_url: string;
  transaction_id: string;
  // --- Razorpay migration additions (Task 23) ---
  provider?: 'hdfc_smartgateway' | 'razorpay';
  transaction_ref?: string;
  razorpay_order_id?: string;
  razorpay_key_id?: string;
  amount_paise?: number;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

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
    /**
     * Optional server callback URL the gateway redirects to after payment.
     * When omitted, defaults to the marathon callback (backward compatible).
     * Other event types (e.g. tournaments) pass their own callback route here;
     * `transaction_ref` is appended automatically.
     */
    callbackUrl?: string;
    /**
     * Overrides registration.institution_id for BOTH Razorpay account
     * resolution and the institution_id recorded on the transaction row.
     * Tournaments pass their host event's institution_id here so entry fees
     * settle into the HOST institution's account regardless of the
     * registrant's own institution (or lack of one, for guests). Omit to
     * keep today's behavior (marathon does not pass this).
     */
    institutionIdOverride?: string | null;
    /**
     * Fee head (billing_categories.kind) for Razorpay account resolution at
     * order-creation. Omit to resolve the institution's default account
     * (marathon does not pass this).
     */
    feeHead?: string | null;
  }): Promise<EventInitiatePaymentResult> {
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
    const transactionRef = this.generateTransactionRef();

    const resolvedInstitutionId =
      params.institutionIdOverride !== undefined
        ? params.institutionIdOverride
        : registration.institution_id;

    // ----------------------------------------------------------------------
    // getActiveProviderName('events') is always 'razorpay' or throws (HDFC
    // SmartGateway decommissioned) — this branch always runs. The old HDFC
    // session-creation code that used to follow it (Steps 3-5) has been
    // removed as dead code. handleCallback() below is UNCHANGED and still
    // HDFC-only — it is out of scope here (see Global Constraints).
    // ----------------------------------------------------------------------
    if (getActiveProviderName('events') !== 'razorpay') {
      throw new Error('No payment provider configured for events');
    }

    const provider = await getPaymentProvider('events', {
      institutionId: resolvedInstitutionId ?? undefined,
      feeHead: params.feeHead ?? null,
      purpose: 'create-order',
    });
    const rzpAccountId = (provider as { accountId?: string }).accountId ?? null;
    const amountPaise = toPaise(params.amount);

    const order = await provider.createOrder({
      transactionRef,
      amountPaise,
      currency: 'INR',
      module: 'events',
      notes: {
        registration_id: params.registrationId,
        event_id: params.eventId,
        transaction_ref: transactionRef,
        institution_id: resolvedInstitutionId ?? '',
      },
      description: `Event Registration - ${registration.participant_name || 'Participant'}`,
      customer: {
        name: params.payerName,
        email: params.payerEmail,
        phone: params.payerPhone,
      },
    });

    const { data: txn, error: txnError } = await (supabase as any)
      .from('event_payment_transactions')
      .insert({
        event_id: params.eventId,
        registration_id: params.registrationId,
        transaction_ref: transactionRef,
        amount: params.amount,
        amount_paise: amountPaise,
        currency: 'INR',
        status: 'initiated',
        payer_name: params.payerName,
        payer_email: params.payerEmail,
        payer_phone: params.payerPhone,
        discount_code: params.discountCode || null,
        discount_amount: 0,
        institution_id: resolvedInstitutionId,
        provider: 'razorpay',
        razorpay_order_id: order.gatewayOrderId,
        razorpay_account_id: rzpAccountId,
        gateway_session_id: order.gatewayOrderId,
        gateway_response: order.raw,
        return_url: params.returnUrl,
      })
      .select('id')
      .single();

    if (txnError || !txn) {
      logger.error('events/payment', 'Failed to create Razorpay event transaction', txnError);
      throw new Error('Failed to create payment transaction');
    }

    logger.info('events/payment', 'Razorpay event payment initiated', {
      transactionId: txn.id,
      transactionRef,
      razorpayOrderId: order.gatewayOrderId,
    });

    return {
      payment_url: '',
      transaction_id: txn.id,
      provider: 'razorpay',
      transaction_ref: transactionRef,
      razorpay_order_id: order.gatewayOrderId,
      razorpay_key_id: order.clientKeyId,
      amount_paise: amountPaise,
      customer: {
        name: params.payerName,
        email: params.payerEmail,
        phone: params.payerPhone,
      },
    };
  }

  // ==========================================================================
  // 2b. Verify + Settle a Razorpay Hosted-Checkout Callback
  // ==========================================================================

  /**
   * Verifies a Razorpay hosted-checkout POST-back (signature + dual inquiry)
   * and settles the transaction + registration on success. Idempotent: if
   * the async webhook already settled this transaction first, this is a
   * no-op that still returns success so the payer sees a correct
   * confirmation page.
   *
   * Razorpay-only — this does not touch HDFC. Marathon's callback route is
   * unchanged and continues to call handleCallback() below.
   */
  static async verifyAndSettleRazorpayPayment(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<{
    success: boolean;
    registrationId: string | null;
    transactionId: string | null;
    returnUrl: string | null;
  }> {
    const supabase = createServiceRoleClient();

    const { data: transaction, error: txnError } = await (supabase as any)
      .from('event_payment_transactions')
      .select('id, registration_id, status, razorpay_account_id, return_url')
      .eq('razorpay_order_id', params.razorpayOrderId)
      .single();

    if (txnError || !transaction) {
      logger.warn('events/payment', 'Razorpay callback for unknown order', {
        razorpayOrderId: params.razorpayOrderId,
      });
      return { success: false, registrationId: null, transactionId: null, returnUrl: null };
    }

    // Idempotency: the webhook may have already settled this transaction.
    if (transaction.status === 'success') {
      return {
        success: true,
        registrationId: transaction.registration_id,
        transactionId: transaction.id,
        returnUrl: transaction.return_url,
      };
    }

    const provider = (await getPaymentProvider('events', {
      accountId: transaction.razorpay_account_id ?? undefined,
    })) as RazorpayProvider;

    const signatureValid = provider.verifySignature({
      gatewayOrderId: params.razorpayOrderId,
      gatewayPaymentId: params.razorpayPaymentId,
      signature: params.razorpaySignature,
    });

    if (!signatureValid) {
      logger.error('events/payment', 'SECURITY: Razorpay signature verification failed', {
        transactionId: transaction.id,
        razorpayOrderId: params.razorpayOrderId,
      });
      const { error: markFailedError } = await supabase
        .from('event_payment_transactions')
        .update({ status: 'failed' })
        .eq('id', transaction.id);
      if (markFailedError) {
        logger.error(
          'events/payment',
          'Failed to mark transaction failed after signature mismatch',
          markFailedError
        );
      }
      return {
        success: false,
        registrationId: transaction.registration_id,
        transactionId: transaction.id,
        returnUrl: transaction.return_url,
      };
    }

    // Dual inquiry (GET /orders + GET /payments) — mandatory per the Razorpay
    // security audit; never settle off the signature alone.
    const status = await provider.dualInquiry(params.razorpayOrderId, params.razorpayPaymentId);

    if (status.status !== 'captured' && status.status !== 'authorized') {
      const { error: markFailedError } = await supabase
        .from('event_payment_transactions')
        .update({ status: 'failed', gateway_response: status.raw })
        .eq('id', transaction.id);
      if (markFailedError) {
        logger.error(
          'events/payment',
          'Failed to mark transaction failed after unsettled dual inquiry status',
          markFailedError
        );
      }
      return {
        success: false,
        registrationId: transaction.registration_id,
        transactionId: transaction.id,
        returnUrl: transaction.return_url,
      };
    }

    const now = new Date().toISOString();
    const { error: settleError } = await supabase
      .from('event_payment_transactions')
      .update({
        status: 'success',
        razorpay_payment_id: params.razorpayPaymentId,
        gateway_response: status.raw,
        paid_at: now,
      })
      .eq('id', transaction.id);

    if (settleError) {
      logger.error('events/payment', 'CRITICAL: failed to settle transaction after verified Razorpay payment', {
        transactionId: transaction.id,
        error: settleError,
      });
      return {
        success: false,
        registrationId: transaction.registration_id,
        transactionId: transaction.id,
        returnUrl: transaction.return_url,
      };
    }

    if (transaction.registration_id) {
      const { error: regError } = await supabase
        .from('events_registrations')
        .update({
          payment_status: 'paid',
          payment_method: 'razorpay',
          payment_reference: params.razorpayPaymentId,
        })
        .eq('id', transaction.registration_id);

      if (regError) {
        logger.error('events/payment', 'CRITICAL: transaction settled but registration payment_status update failed', {
          transactionId: transaction.id,
          registrationId: transaction.registration_id,
          error: regError,
        });
        return {
          success: false,
          registrationId: transaction.registration_id,
          transactionId: transaction.id,
          returnUrl: transaction.return_url,
        };
      }
    }

    logger.info('events/payment', 'Razorpay callback verified and settled', {
      transactionId: transaction.id,
      registrationId: transaction.registration_id,
    });

    return {
      success: true,
      registrationId: transaction.registration_id,
      transactionId: transaction.id,
      returnUrl: transaction.return_url,
    };
  }

  /**
   * Marks a Razorpay order's transaction as failed from a hosted-checkout
   * error callback. Never overwrites an already-terminal status (success or
   * a prior failed) so a late/duplicate error POST can't clobber real data.
   */
  static async markRazorpayOrderFailed(
    razorpayOrderId: string,
    error: { code: string | null; description: string | null }
  ): Promise<void> {
    const supabase = createServiceRoleClient();
    const { data: transaction } = await (supabase as any)
      .from('event_payment_transactions')
      .select('id, status')
      .eq('razorpay_order_id', razorpayOrderId)
      .single();
    if (!transaction || ['success', 'failed'].includes(transaction.status)) return;
    const { error: updateError } = await supabase
      .from('event_payment_transactions')
      .update({ status: 'failed', gateway_response: error })
      .eq('id', transaction.id);
    if (updateError) {
      logger.warn('events/payment', 'Failed to mark Razorpay order as failed', {
        razorpayOrderId,
        error: updateError,
      });
    }
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
