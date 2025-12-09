// PaymentGatewayService - HDFC SmartGateway Integration
// MID: SG3726
// Created: 2025-01-20
// Purpose: Handle online payment processing via HDFC SmartGateway

import { createClient } from '@/lib/supabase/server';
import { BillingReceiptService } from './receipts/billing-receipt-service';
import type {
  PaymentTransaction,
  PaymentTransactionItem,
  CreatePaymentSessionDto,
  PaymentSessionResponse,
  HDFCSessionRequest,
  HDFCSessionResponse,
  HDFCWebhookPayload,
  HDFCOrderStatusResponse,
  PaymentStatusCheckResponse,
  PaymentStatus,
  InitiatePaymentResult,
  WebhookProcessingResult,
  PaymentStatusResult,
  PaymentErrorResponse,
  PaymentVerificationResult,
  ProcessVerifiedPaymentResult,
} from '@/types/payment-gateway';
import { PaymentAuditService } from './security/payment-audit-service';
import crypto from 'crypto';
import { logger } from '@/lib/utils/enhanced-logger';

// ============================================================================
// Configuration
// ============================================================================

interface HDFCConfig {
  merchantId: string;
  paymentPageClientId: string;
  apiKey: string;
  apiSecret: string;
  responseKey: string;
  cardEncodingKey: string;
  baseUrl: string;
  testMode: boolean;
  enableLogging: boolean;
}

function getHDFCConfig(): HDFCConfig {
  const config: HDFCConfig = {
    merchantId: process.env.HDFC_MERCHANT_ID || '',
    paymentPageClientId: process.env.HDFC_PAYMENT_PAGE_CLIENT_ID || process.env.HDFC_MERCHANT_ID || '',
    apiKey: process.env.HDFC_API_KEY || '',
    apiSecret: process.env.HDFC_API_SECRET || '',
    responseKey: process.env.HDFC_RESPONSE_KEY || '',
    cardEncodingKey: process.env.HDFC_CARD_ENCODING_KEY || '',
    baseUrl: process.env.HDFC_BASE_URL || 'https://smartgateway.hdfcuat.bank.in',
    testMode: process.env.HDFC_TEST_MODE === 'true',
    enableLogging: process.env.HDFC_ENABLE_LOGGING === 'true',
  };

  // Validate required configuration
  const missingKeys: string[] = [];
  if (!config.merchantId) missingKeys.push('HDFC_MERCHANT_ID');
  if (!config.apiKey) missingKeys.push('HDFC_API_KEY');
  if (!config.apiSecret) missingKeys.push('HDFC_API_SECRET');
  if (!config.responseKey) missingKeys.push('HDFC_RESPONSE_KEY');

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing HDFC configuration: ${missingKeys.join(', ')}. Please check your .env file.`
    );
  }

  return config;
}

// ============================================================================
// PaymentGatewayService - Main Service Class
// ============================================================================

export class PaymentGatewayService {
  // ==========================================================================
  // 1. CREATE PAYMENT SESSION
  // ==========================================================================

  /**
   * Initiates a new payment session with HDFC SmartGateway
   *
   * @param sessionData - Payment session details
   * @returns Payment session response with payment URL
   */
  static async createPaymentSession(
    sessionData: CreatePaymentSessionDto
  ): Promise<InitiatePaymentResult> {
    try {
      logger.info('billing/payment-gateway', 'Creating payment session', {
        student_id: sessionData.student_id,
        bill_count: sessionData.bill_ids.length,
      });

      const supabase = await createClient();

      // Step 1: Validate bills and calculate total amount
      const { data: bills, error: billsError } = await supabase
        .from('billing_student_bills')
        .select('id, bill_description, total_amount, final_amount, balance_amount, status, institution_id')
        .in('id', sessionData.bill_ids);

      if (billsError) {
        logger.error('billing/payment-gateway', 'Failed to fetch bills', billsError);
        throw billsError;
      }

      if (!bills || bills.length === 0) {
        return {
          success: false,
          error: {
            error: 'NO_BILLS_FOUND',
            message: 'No bills found for the provided IDs',
          },
        };
      }

      // Validate all bills belong to the same institution
      const institutionIds = [...new Set(bills.map((b) => b.institution_id))];
      if (institutionIds.length > 1) {
        return {
          success: false,
          error: {
            error: 'MULTIPLE_INSTITUTIONS',
            message: 'Bills from multiple institutions cannot be paid together',
          },
        };
      }

      const institutionId = institutionIds[0];

      // Calculate total amount to pay
      const totalAmount = bills.reduce((sum, bill) => {
        const balance = bill.balance_amount ?? bill.final_amount ?? bill.total_amount ?? 0;
        return sum + Number(balance);
      }, 0);

      if (totalAmount <= 0) {
        return {
          success: false,
          error: {
            error: 'INVALID_AMOUNT',
            message: 'Total payment amount must be greater than zero',
          },
        };
      }

      // Step 2: Fetch student details for payment session
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id, first_name, last_name, student_email, college_email, student_mobile')
        .eq('id', sessionData.student_id)
        .single();

      if (studentError || !student) {
        logger.error('billing/payment-gateway', 'Student not found', studentError);
        return {
          success: false,
          error: {
            error: 'STUDENT_NOT_FOUND',
            message: 'Student not found',
          },
        };
      }

      // Step 3: Generate unique transaction reference
      const transactionRef = this.generateTransactionReference();

      // Generate a temporary session ID (will be updated with HDFC session ID later)
      const tempSessionId = `temp_${transactionRef}`;

      // Step 4: Create payment transaction record
      const { data: transaction, error: transactionError } = await supabase
        .from('payment_transactions')
        .insert({
          transaction_ref: transactionRef,
          session_id: tempSessionId, // Temporary unique session ID
          student_id: sessionData.student_id,
          institution_id: institutionId,
          bill_ids: sessionData.bill_ids,
          total_amount: totalAmount,
          currency: 'INR',
          status: 'initiated',
        })
        .select()
        .single();

      if (transactionError || !transaction) {
        logger.error('billing/payment-gateway', 'Failed to create transaction', transactionError);
        throw transactionError;
      }

      // Step 5: Create transaction items
      const transactionItems = bills.map((bill) => ({
        transaction_id: transaction.id,
        bill_id: bill.id,
        amount: Number(bill.balance_amount ?? bill.final_amount ?? bill.total_amount ?? 0),
      }));

      const { error: itemsError } = await supabase
        .from('payment_transaction_items')
        .insert(transactionItems);

      if (itemsError) {
        logger.error('billing/payment-gateway', 'Failed to create transaction items', itemsError);
        throw itemsError;
      }

      // Step 6: Create HDFC payment session
      const config = getHDFCConfig();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      const hdfcRequest: any = {
        order_id: transactionRef,
        amount: totalAmount.toFixed(2), // Amount as string with 2 decimals
        customer_id: sessionData.student_id,
        customer_email: student.student_email || student.college_email || 'noreply@jkkn.ai',
        customer_phone: student.student_mobile || '',
        payment_page_client_id: config.paymentPageClientId,
        action: 'paymentPage',
        currency: 'INR',
        return_url: sessionData.return_url || `${appUrl}/api/billing/payment/callback?transaction_id=${transaction.id}`,
        description: `Payment for ${bills.length} bill(s)`,
        first_name: student.first_name || 'Student',
        last_name: student.last_name || '',
      };

      const hdfcResponse = await this.callHDFCApi<HDFCSessionResponse>(
        '/session',
        'POST',
        hdfcRequest
      );

      // Log the actual HDFC response to understand its structure
      logger.info('billing/payment-gateway', 'HDFC API Response', {
        response: JSON.stringify(hdfcResponse, null, 2)
      });

      // Extract session ID and payment URL from HDFC response
      // HDFC returns: { id, order_id, payment_links: { web }, sdk_payload, order_expiry }
      const hdfcSessionId = (hdfcResponse as any).id;
      const paymentUrl = (hdfcResponse as any).payment_links?.web;
      const expiresAt = (hdfcResponse as any).order_expiry || (hdfcResponse as any).sdk_payload?.expiry;

      if (!hdfcSessionId || !paymentUrl) {
        logger.error('billing/payment-gateway', 'Invalid HDFC response structure', { hdfcResponse });
        throw new Error('Invalid HDFC response: missing session ID or payment URL');
      }

      // Step 7: Update transaction with HDFC session ID
      const { error: updateError } = await supabase
        .from('payment_transactions')
        .update({
          session_id: hdfcSessionId,
          gateway_response: hdfcResponse,
          status: 'processing',
        })
        .eq('id', transaction.id);

      if (updateError) {
        logger.error('billing/payment-gateway', 'Failed to update transaction with session ID', updateError);
        throw updateError;
      }

      logger.info('billing/payment-gateway', 'Payment session created successfully', {
        transaction_id: transaction.id,
        session_id: hdfcSessionId,
        payment_url: paymentUrl,
      });

      // Step 8: Return payment session response
      const response: PaymentSessionResponse = {
        transaction_id: transaction.id,
        session_id: hdfcSessionId,
        payment_url: paymentUrl,
        amount: totalAmount,
        expires_at: expiresAt,
      };

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      logger.error('billing/payment-gateway', 'Create payment session failed', error);
      return {
        success: false,
        error: {
          error: 'SESSION_CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create payment session',
          details: error,
        },
      };
    }
  }

  // ==========================================================================
  // 2. WEBHOOK HANDLER
  // ==========================================================================

  /**
   * Processes HDFC webhook notifications
   *
   * @param payload - Webhook payload from HDFC
   * @param signature - Webhook signature for verification
   * @returns Processing result
   */
  static async handleWebhook(
    payload: HDFCWebhookPayload,
    signature: string
  ): Promise<WebhookProcessingResult> {
    try {
      logger.info('billing/payment-gateway', 'Processing webhook', {
        event_type: payload.event_type,
        order_id: payload.data.order.order_id,
      });

      // Step 1: Verify webhook signature
      const isValid = this.verifyWebhookSignature(payload, signature);
      if (!isValid) {
        logger.error('billing/payment-gateway', 'Invalid webhook signature');
        return {
          success: false,
          error: 'Invalid webhook signature',
        };
      }

      // Step 2: Find transaction by transaction_ref (order_id)
      const supabase = await createClient();
      const { data: transaction, error: transactionError } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('transaction_ref', payload.data.order.order_id)
        .single();

      if (transactionError || !transaction) {
        logger.error('billing/payment-gateway', 'Transaction not found', {
          transaction_ref: payload.data.order.order_id,
        });
        return {
          success: false,
          error: 'Transaction not found',
        };
      }

      // Step 3: Process based on event type
      let newStatus: PaymentStatus;

      switch (payload.event_type) {
        case 'PAYMENT_SUCCESS':
        case 'PAYMENT_COMPLETED':
          newStatus = 'success';
          break;
        case 'PAYMENT_FAILED':
          newStatus = 'failed';
          break;
        case 'PAYMENT_CANCELLED':
          newStatus = 'cancelled';
          break;
        default:
          logger.warn('billing/payment-gateway', 'Unknown webhook event type', {
            event_type: payload.event_type,
          });
          return {
            success: true, // Acknowledge webhook but don't process
          };
      }

      // Step 4: Update transaction status
      const { error: updateError } = await supabase
        .from('payment_transactions')
        .update({
          status: newStatus,
          gateway_transaction_id: payload.data.payment.payment_id,
          payment_method: payload.data.payment.payment_method,
          payment_date: payload.data.payment.payment_time || new Date().toISOString(),
          gateway_response: payload,
          completed_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);

      if (updateError) {
        logger.error('billing/payment-gateway', 'Failed to update transaction', updateError);
        throw updateError;
      }

      // Step 5: If payment successful, create receipt
      let receiptCreated = false;
      if (newStatus === 'success') {
        receiptCreated = await this.processSuccessfulPayment(transaction);
      }

      logger.info('billing/payment-gateway', 'Webhook processed successfully', {
        transaction_id: transaction.id,
        status: newStatus,
        receipt_created: receiptCreated,
      });

      return {
        success: true,
        transaction_id: transaction.id,
        receipt_created: receiptCreated,
      };
    } catch (error) {
      logger.error('billing/payment-gateway', 'Webhook processing failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Webhook processing failed',
      };
    }
  }

  // ==========================================================================
  // 3. PROCESS SUCCESSFUL PAYMENT
  // ==========================================================================

  /**
   * Creates billing receipt after successful payment
   * Uses existing BillingReceiptService for automatic workflows
   *
   * @param transaction - Payment transaction
   * @returns True if receipt created successfully
   */
  private static async processSuccessfulPayment(
    transaction: PaymentTransaction
  ): Promise<boolean> {
    try {
      logger.info('billing/payment-gateway', 'Processing successful payment', {
        transaction_id: transaction.id,
      });

      const supabase = await createClient();

      // Step 1: Fetch transaction items
      const { data: items, error: itemsError } = await supabase
        .from('payment_transaction_items')
        .select('bill_id, amount')
        .eq('transaction_id', transaction.id);

      if (itemsError || !items || items.length === 0) {
        logger.error('billing/payment-gateway', 'No transaction items found', itemsError);
        return false;
      }

      // Step 2: Create receipt using existing BillingReceiptService
      // This automatically handles:
      // - Receipt number generation
      // - Bill status updates
      // - Invoice generation when bill is fully paid

      // Fetch student details for payer name
      const { data: student } = await supabase
        .from('students')
        .select('first_name, last_name')
        .eq('id', transaction.student_id)
        .single();

      const payerName = student
        ? `${student.first_name} ${student.last_name}`.trim()
        : 'Online Payment';

      const receiptData = {
        student_id: transaction.student_id,
        institution_id: transaction.institution_id,
        payment_mode: 'online' as const,
        payment_amount: transaction.total_amount,
        payment_paid_date: transaction.payment_date || new Date().toISOString(),
        payer_name: payerName,
        payment_reference_number: transaction.gateway_transaction_id || transaction.session_id,
        payment_remarks: `Online payment via HDFC SmartGateway - ${transaction.payment_method || 'card'}`,
        receipt_items: items.map((item) => ({
          bill_id: item.bill_id,
          amount_paid: item.amount,
        })),
      };

      const receipt = await BillingReceiptService.createBillingReceipt(receiptData);

      if (!receipt) {
        logger.error('billing/payment-gateway', 'Failed to create receipt');
        return false;
      }

      logger.info('billing/payment-gateway', 'Receipt created successfully', {
        receipt_id: receipt.id,
        receipt_number: receipt.receipt_number,
      });

      return true;
    } catch (error) {
      logger.error('billing/payment-gateway', 'Failed to process successful payment', error);
      return false;
    }
  }

  // ==========================================================================
  // 4. CHECK PAYMENT STATUS
  // ==========================================================================

  /**
   * Checks payment status from HDFC
   *
   * @param transactionId - Internal transaction ID
   * @returns Payment status check response
   */
  static async checkPaymentStatus(
    transactionId: string
  ): Promise<PaymentStatusResult> {
    try {
      logger.info('billing/payment-gateway', 'Checking payment status', { transactionId });

      const supabase = await createClient();

      // Step 1: Fetch transaction
      const { data: transaction, error: transactionError } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (transactionError || !transaction) {
        logger.error('billing/payment-gateway', 'Transaction not found');
        return {
          success: false,
          error: {
            error: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
          },
        };
      }

      // Step 2: If already completed, return current status
      if (['success', 'failed', 'cancelled', 'refunded'].includes(transaction.status)) {
        const response: PaymentStatusCheckResponse = {
          transaction_id: transaction.id,
          student_id: transaction.student_id,
          status: transaction.status,
          amount: transaction.total_amount,
          payment_date: transaction.payment_date,
          payment_method: transaction.payment_method,
          bills_paid: transaction.bill_ids.length,
        };

        return {
          success: true,
          data: response,
        };
      }

      // Step 3: Query HDFC for latest status
      const hdfcStatus = await this.callHDFCApi<HDFCOrderStatusResponse>(
        `/v1/orders/${transaction.transaction_ref}`,
        'GET'
      );

      // Step 4: Update transaction with latest status
      let newStatus: PaymentStatus = transaction.status;

      if (hdfcStatus.order_status === 'PAID') {
        newStatus = 'success';
      } else if (hdfcStatus.order_status === 'FAILED') {
        newStatus = 'failed';
      } else if (hdfcStatus.order_status === 'EXPIRED') {
        newStatus = 'expired';
      }

      if (newStatus !== transaction.status) {
        const { error: updateError } = await supabase
          .from('payment_transactions')
          .update({
            status: newStatus,
            gateway_transaction_id: hdfcStatus.payment?.payment_id,
            payment_method: hdfcStatus.payment?.payment_method,
            payment_date: hdfcStatus.payment?.payment_time,
            gateway_response: hdfcStatus,
            completed_at: new Date().toISOString(),
          })
          .eq('id', transaction.id);

        if (updateError) {
          logger.error('billing/payment-gateway', 'Failed to update transaction status', updateError);
        }

        // If payment successful, create receipt
        if (newStatus === 'success') {
          await this.processSuccessfulPayment({ ...transaction, status: newStatus });
        }
      }

      const response: PaymentStatusCheckResponse = {
        transaction_id: transaction.id,
        student_id: transaction.student_id,
        status: newStatus,
        amount: transaction.total_amount,
        payment_date: hdfcStatus.payment?.payment_time,
        payment_method: hdfcStatus.payment?.payment_method,
        bills_paid: transaction.bill_ids.length,
      };

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      logger.error('billing/payment-gateway', 'Payment status check failed', error);
      return {
        success: false,
        error: {
          error: 'STATUS_CHECK_FAILED',
          message: error instanceof Error ? error.message : 'Failed to check payment status',
          details: error,
        },
      };
    }
  }

  // ==========================================================================
  // 5. SERVER-SIDE PAYMENT VERIFICATION (SECURITY ENHANCEMENT)
  // ==========================================================================

  /**
   * Verifies payment directly with HDFC Gateway API
   * This is the CRITICAL security method that prevents parameter manipulation attacks
   *
   * @param transactionId - Internal transaction ID
   * @returns PaymentVerificationResult with verified status from HDFC
   */
  static async verifyPaymentWithGateway(
    transactionId: string
  ): Promise<PaymentVerificationResult> {
    try {
      logger.info('billing/payment-gateway', 'Starting server-side payment verification', {
        transactionId,
      });

      const supabase = await createClient();

      // Step 1: Fetch our transaction record
      const { data: transaction, error: transactionError } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (transactionError || !transaction) {
        logger.error('billing/payment-gateway', 'Transaction not found for verification', {
          transactionId,
        });
        return {
          verified: false,
          status: 'failed',
          amount: 0,
          error: 'Transaction not found',
        };
      }

      // Step 2: Check if already processed (anti-replay protection)
      if (transaction.processed_at) {
        logger.warn('billing/payment-gateway', 'Transaction already processed - potential replay attack', {
          transactionId,
          processedAt: transaction.processed_at,
        });

        // Log potential replay attempt
        await PaymentAuditService.logReplayBlocked(
          transactionId,
          transaction.student_id,
          transaction.institution_id
        );

        return {
          verified: true, // Already verified previously
          status: transaction.status as PaymentStatus,
          amount: transaction.total_amount,
          gatewayTransactionId: transaction.gateway_transaction_id,
          error: 'Transaction already processed',
        };
      }

      // Step 3: Call HDFC Order Status API to get REAL status
      // Per HDFC documentation: GET /orders/{order_id}
      // The order_id is OUR transaction_ref that we sent when creating the payment session
      // Example from docs: GET /orders/JP1636474794
      let hdfcResponse: HDFCOrderStatusResponse;

      // Use our transaction_ref (the order_id we sent to HDFC)
      const orderIdForLookup = transaction.transaction_ref;
      const sessionIdForFallback = transaction.session_id;

      logger.info('billing/payment-gateway', 'Calling HDFC Order Status API', {
        transactionId,
        orderIdForLookup,
        sessionId: sessionIdForFallback,
      });

      try {
        // Primary endpoint: /orders/{transaction_ref} - per HDFC documentation
        // This is the order_id we sent when creating the payment session
        hdfcResponse = await this.callHDFCApi<HDFCOrderStatusResponse>(
          `/orders/${orderIdForLookup}`,
          'GET'
        );
      } catch (primaryError) {
        logger.warn('billing/payment-gateway', 'Primary endpoint with transaction_ref failed', {
          error: primaryError,
          transactionRef: orderIdForLookup,
        });

        try {
          // Fallback: Try with session_id (ordeh_xxx)
          // In case HDFC uses their internal ID instead
          hdfcResponse = await this.callHDFCApi<HDFCOrderStatusResponse>(
            `/orders/${sessionIdForFallback}`,
            'GET'
          );
        } catch (secondError) {
          logger.error('billing/payment-gateway', 'All HDFC API endpoints failed', {
            primaryError,
            secondError,
            transactionRef: orderIdForLookup,
            sessionId: sessionIdForFallback,
          });

          // Re-throw the original error for better debugging
          throw primaryError;
        }
      }

      // Get status and amount from response (handle both new and legacy field names)
      const hdfcStatus = hdfcResponse.status || hdfcResponse.order_status || '';
      const hdfcAmount = hdfcResponse.amount || hdfcResponse.order_amount || 0;

      logger.info('billing/payment-gateway', 'HDFC verification response received', {
        transactionId,
        hdfcOrderId: hdfcResponse.order_id,
        hdfcInternalId: hdfcResponse.id,
        hdfcStatus,
        hdfcStatusId: hdfcResponse.status_id,
        hdfcAmount,
      });

      // Step 4: Map HDFC status to our PaymentStatus
      const verifiedStatus = this.mapHDFCStatusToPaymentStatus(hdfcStatus);

      // Step 5: Verify amount matches (prevent amount manipulation)
      // Note: HDFC amounts are in paisa (multiply by 100), our amounts are in rupees
      const expectedAmount = Number(transaction.total_amount);
      // Convert HDFC amount from paisa to rupees for comparison
      const actualAmount = Number(hdfcAmount) / 100;

      if (Math.abs(expectedAmount - actualAmount) > 0.01) {
        logger.error('billing/payment-gateway', '⚠️ SECURITY ALERT: Amount mismatch detected', {
          transactionId,
          expectedAmount,
          actualAmount,
          difference: Math.abs(expectedAmount - actualAmount),
        });

        // Log amount manipulation attempt
        await PaymentAuditService.logAmountMismatch(
          transactionId,
          transaction.student_id,
          transaction.institution_id,
          expectedAmount,
          actualAmount
        );

        return {
          verified: false,
          status: 'failed',
          amount: actualAmount,
          error: 'Amount mismatch - potential manipulation detected',
          rawResponse: hdfcResponse,
        };
      }

      // Step 6: Generate verification hash for audit trail
      const verificationHash = this.generateVerificationHash(hdfcResponse);

      // Step 7: Build verification result
      // Extract transaction ID and payment method from new response structure
      const gatewayTxnId = hdfcResponse.txn_id ||
                          hdfcResponse.txn_detail?.txn_id ||
                          hdfcResponse.payment_gateway_response?.epg_txn_id ||
                          hdfcResponse.payment?.payment_id;
      const paymentMethod = hdfcResponse.payment_method ||
                           hdfcResponse.payment_method_type ||
                           hdfcResponse.payment?.payment_method;
      const paymentTime = hdfcResponse.date_created ||
                         hdfcResponse.txn_detail?.created ||
                         hdfcResponse.payment?.payment_time;

      const result: PaymentVerificationResult = {
        verified: verifiedStatus === 'success',
        status: verifiedStatus,
        amount: actualAmount,
        gatewayOrderId: hdfcResponse.id || hdfcResponse.order_id,
        gatewayTransactionId: gatewayTxnId,
        paymentMethod: paymentMethod,
        paymentTime: paymentTime,
        verificationHash,
        rawResponse: hdfcResponse,
      };

      logger.info('billing/payment-gateway', 'Payment verification completed', {
        transactionId,
        verified: result.verified,
        status: result.status,
      });

      return result;
    } catch (error) {
      logger.error('billing/payment-gateway', 'Payment verification failed', error);
      return {
        verified: false,
        status: 'failed',
        amount: 0,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Processes a payment ONLY after server-side verification
   * This method should be called after verifyPaymentWithGateway confirms success
   *
   * @param transactionId - Internal transaction ID
   * @param verification - Verified payment result from HDFC
   * @param clientStatus - Status claimed by client (for audit comparison)
   * @param ipAddress - Client IP address for audit
   * @param userAgent - Client user agent for audit
   * @returns ProcessVerifiedPaymentResult
   */
  static async processVerifiedPayment(
    transactionId: string,
    verification: PaymentVerificationResult,
    clientStatus?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ProcessVerifiedPaymentResult> {
    try {
      logger.info('billing/payment-gateway', 'Processing verified payment', {
        transactionId,
        verifiedStatus: verification.status,
        clientStatus,
      });

      const supabase = await createClient();

      // Step 1: Fetch transaction
      const { data: transaction, error: txnError } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (txnError || !transaction) {
        return {
          success: false,
          error: 'Transaction not found',
        };
      }

      // Step 2: Check for manipulation - client status vs server status
      if (clientStatus) {
        const clientClaimsSuccess = ['CHARGED', 'SUCCESS', 'COMPLETED', 'PAID'].includes(
          clientStatus.toUpperCase()
        );
        const serverConfirmsSuccess = verification.verified && verification.status === 'success';

        if (clientClaimsSuccess && !serverConfirmsSuccess) {
          // MANIPULATION DETECTED - Client claims success but HDFC says otherwise
          logger.error('billing/payment-gateway', '⚠️ CRITICAL: Payment manipulation detected', {
            transactionId,
            clientStatus,
            serverStatus: verification.status,
          });

          await PaymentAuditService.logManipulationDetected(
            transactionId,
            transaction.student_id,
            transaction.institution_id,
            clientStatus,
            verification.status,
            ipAddress,
            userAgent
          );

          // Update transaction to mark as failed
          await supabase
            .from('payment_transactions')
            .update({
              status: 'failed',
              processed_at: new Date().toISOString(),
              verification_hash: verification.verificationHash,
              verification_response: verification.rawResponse,
            })
            .eq('id', transactionId);

          return {
            success: false,
            error: 'Payment verification failed - status mismatch',
          };
        }
      }

      // Step 3: Update transaction with verified status
      const updateData: Record<string, unknown> = {
        status: verification.status,
        gateway_transaction_id: verification.gatewayTransactionId,
        payment_method: verification.paymentMethod,
        payment_date: verification.paymentTime || new Date().toISOString(),
        verified_amount: verification.amount,
        verification_hash: verification.verificationHash,
        verification_response: verification.rawResponse,
        processed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('payment_transactions')
        .update(updateData)
        .eq('id', transactionId);

      if (updateError) {
        logger.error('billing/payment-gateway', 'Failed to update transaction', updateError);
        return {
          success: false,
          error: 'Failed to update transaction',
        };
      }

      // Step 4: If payment is verified as successful, create receipt
      if (verification.verified && verification.status === 'success') {
        // Log verification success
        await PaymentAuditService.logVerificationSuccess(
          transactionId,
          transaction.student_id,
          transaction.institution_id,
          verification.amount
        );

        // Fetch transaction items
        const { data: items } = await supabase
          .from('payment_transaction_items')
          .select('bill_id, amount')
          .eq('transaction_id', transactionId);

        if (!items || items.length === 0) {
          return {
            success: false,
            error: 'No transaction items found',
          };
        }

        // Create receipt
        const { data: student } = await supabase
          .from('students')
          .select('first_name, last_name, student_mobile')
          .eq('id', transaction.student_id)
          .single();

        const payerName = student
          ? `${student.first_name} ${student.last_name}`.trim()
          : 'Online Payment';

        const receiptData = {
          student_id: transaction.student_id,
          institution_id: transaction.institution_id,
          payment_mode: 'online' as const,
          payment_amount: verification.amount,
          payment_paid_date: verification.paymentTime || new Date().toISOString(),
          payer_name: payerName,
          payer_contact: student?.student_mobile || '',
          payment_reference_number: verification.gatewayTransactionId || transaction.transaction_ref,
          payment_remarks: `Online payment via HDFC SmartGateway - ${verification.paymentMethod || 'CARD'} (Verified)`,
          receipt_items: items.map((item) => ({
            bill_id: item.bill_id,
            amount_paid: item.amount,
          })),
        };

        const receipt = await BillingReceiptService.createBillingReceipt(receiptData);

        if (!receipt) {
          logger.error('billing/payment-gateway', 'Failed to create receipt for verified payment');
          return {
            success: true, // Transaction updated, but receipt failed
            error: 'Payment verified but receipt creation failed',
          };
        }

        // Log receipt creation
        await PaymentAuditService.logReceiptCreated(
          transactionId,
          transaction.student_id,
          transaction.institution_id,
          receipt.id,
          receipt.receipt_number,
          verification.amount
        );

        logger.info('billing/payment-gateway', 'Verified payment processed successfully', {
          transactionId,
          receiptId: receipt.id,
          receiptNumber: receipt.receipt_number,
        });

        return {
          success: true,
          receiptId: receipt.id,
          receiptNumber: receipt.receipt_number,
        };
      } else {
        // Payment not successful - log verification failure
        await PaymentAuditService.logVerificationFailed(
          transactionId,
          transaction.student_id,
          transaction.institution_id,
          verification.status,
          { hdfcResponse: verification.rawResponse }
        );

        return {
          success: true, // Process completed, but payment was not successful
          error: `Payment status: ${verification.status}`,
        };
      }
    } catch (error) {
      logger.error('billing/payment-gateway', 'Process verified payment failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
      };
    }
  }

  /**
   * Maps HDFC order status to our internal PaymentStatus
   */
  private static mapHDFCStatusToPaymentStatus(hdfcStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'PAID': 'success',
      'CHARGED': 'success',
      'SUCCESS': 'success',
      'COMPLETED': 'success',
      'FAILED': 'failed',
      'DECLINED': 'failed',
      'CANCELLED': 'cancelled',
      'CANCELED': 'cancelled',
      'USER_DROPPED': 'cancelled',
      'EXPIRED': 'expired',
      'PENDING': 'processing',
      'PENDING_VBV': 'processing',
      'NEW': 'initiated',
      'INITIATED': 'initiated',
    };

    const normalizedStatus = hdfcStatus?.toUpperCase() || '';
    return statusMap[normalizedStatus] || 'failed';
  }

  /**
   * Generates a SHA-256 hash of the HDFC response for anti-replay protection
   */
  private static generateVerificationHash(response: HDFCOrderStatusResponse): string {
    const dataToHash = JSON.stringify({
      order_id: response.order_id,
      order_status: response.order_status,
      order_amount: response.order_amount,
      payment_id: response.payment?.payment_id,
      payment_time: response.payment?.payment_time,
    });

    return crypto.createHash('sha256').update(dataToHash).digest('hex');
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Generates unique transaction reference for HDFC SmartGateway
   *
   * HDFC Bank Requirements:
   * 1. Should be less than 21 characters length
   * 2. Should not contain any Special Characters
   * 3. Can be Alphanumeric
   * 4. Should be Non-Sequential
   *
   * Format: PYYYYMMDDHHMMSSXXXXX (20 chars max)
   * - P = prefix (1 char)
   * - YYYYMMDDHHMMSS = timestamp (14 chars)
   * - XXXXX = random alphanumeric (5 chars)
   * Total: 20 characters, alphanumeric only
   */
  private static generateTransactionReference(): string {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `P${timestamp}${random}`;
  }

  /**
   * Verifies HDFC webhook signature using HMAC-SHA256
   *
   * @param payload - Webhook payload
   * @param signature - Signature from HDFC
   * @returns True if signature is valid
   */
  private static verifyWebhookSignature(
    payload: HDFCWebhookPayload,
    signature: string
  ): boolean {
    try {
      const config = getHDFCConfig();
      const payloadString = JSON.stringify(payload);

      const computedSignature = crypto
        .createHmac('sha256', config.responseKey)
        .update(payloadString)
        .digest('hex');

      return computedSignature === signature;
    } catch (error) {
      logger.error('billing/payment-gateway', 'Signature verification failed', error);
      return false;
    }
  }

  /**
   * Makes authenticated API call to HDFC SmartGateway
   *
   * @param endpoint - API endpoint
   * @param method - HTTP method
   * @param body - Request body (optional)
   * @returns API response
   */
  private static async callHDFCApi<T>(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: any,
    customerId?: string
  ): Promise<T> {
    const config = getHDFCConfig();
    const url = `${config.baseUrl}${endpoint}`;

    // Create authentication header (Basic Auth with API Key only - per HDFC docs)
    // The API key should be Base64 encoded directly
    const authToken = Buffer.from(config.apiKey).toString('base64');

    // Headers as per HDFC Order Status API documentation:
    // https://smartgateway.hdfcbank.com/docs/smartgateway-api-ref-basicauth/docs/apis/order-status-api
    const headers: Record<string, string> = {
      'Content-Type': method === 'GET' ? 'application/x-www-form-urlencoded' : 'application/json',
      'Authorization': `Basic ${authToken}`,
      'x-merchantid': config.merchantId,
      'x-customerid': customerId || body?.customer_id || 'default_customer',
      'x-resellerid': 'hdfc_reseller',
      'version': '2023-06-30', // API version header - required per HDFC docs
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const enableLogging = config.enableLogging;

    if (enableLogging) {
      logger.dev('billing/payment-gateway', 'Calling HDFC API', {
        endpoint,
        method,
        url,
        hasBody: !!body
      });
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('billing/payment-gateway', 'HDFC API error', {
        endpoint,
        method,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`HDFC API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (enableLogging) {
      logger.dev('billing/payment-gateway', 'HDFC API response received', {
        endpoint,
        hasData: !!data
      });
    }

    return data as T;
  }

  /**
   * Gets payment transaction by ID
   *
   * @param transactionId - Transaction ID
   * @returns Payment transaction or null
   */
  static async getTransaction(transactionId: string): Promise<PaymentTransaction | null> {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (error) {
        logger.error('billing/payment-gateway', 'Failed to fetch transaction', error);
        return null;
      }

      return data;
    } catch (error) {
      logger.error('billing/payment-gateway', 'Get transaction failed', error);
      return null;
    }
  }

  /**
   * Gets payment transactions for a student
   *
   * @param studentId - Student ID
   * @returns List of payment transactions
   */
  static async getStudentTransactions(studentId: string): Promise<PaymentTransaction[]> {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('billing/payment-gateway', 'Failed to fetch student transactions', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('billing/payment-gateway', 'Get student transactions failed', error);
      return [];
    }
  }
}
