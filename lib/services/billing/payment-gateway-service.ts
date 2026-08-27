// PaymentGatewayService - HDFC SmartGateway Integration
// MID: SG3726
// Created: 2025-01-20
// Purpose: Handle online payment processing via HDFC SmartGateway

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
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
import { getActiveProviderName, getPaymentProvider } from '@/lib/services/payments/factory';
import { toPaise } from '@/lib/services/payments/amount';
import { RazorpayProvider } from '@/lib/services/payments/razorpay/razorpay-provider';

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
    sessionData: CreatePaymentSessionDto,
    // Optional injected client. Staff/student callers omit it (cookie session).
    // The Parent Portal passes a service-role client because parents authenticate
    // with a custom JWT and have no Supabase session for RLS to key off.
    injectedClient?: SupabaseClient
  ): Promise<InitiatePaymentResult> {
    try {
      logger.info('billing/payment-gateway', 'Creating payment session', {
        student_id: sessionData.student_id,
        bill_count: sessionData.bill_ids.length,
      });

      const supabase = injectedClient ?? (await createClient());

      // Step 1: Validate bills and calculate total amount
      const { data: bills, error: billsError } = await supabase
        .from('billing_student_bills')
        .select('id, bill_description, total_amount, final_amount, balance_amount, status, institution_id, item_category_id')
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
      let totalAmount = 0;
      const transactionItemsData: { bill_id: string; amount: number }[] = [];

      for (const bill of bills) {
        const balance = bill.balance_amount ?? bill.final_amount ?? bill.total_amount ?? 0;
        let amountForThisBill = Number(balance);

        // If custom amounts provided, use them. Tested for PRESENCE, not truth:
        // a truthy test skips an explicit 0 and silently falls through to the
        // full balance — charging more than was asked for, and making the
        // "must be positive" check below dead code for exactly that value.
        if (sessionData.bill_amounts?.[bill.id] !== undefined) {
          amountForThisBill = Number(sessionData.bill_amounts[bill.id]);

          // VALIDATION: Custom amount must not exceed balance
          if (amountForThisBill > balance) {
            logger.warn('billing/payment-gateway', 'Custom amount exceeds balance', {
              bill_id: bill.id,
              custom_amount: amountForThisBill,
              balance,
            });
            return {
              success: false,
              error: {
                error: 'INVALID_AMOUNT',
                message: `Amount for bill ${bill.id} (₹${amountForThisBill}) exceeds balance (₹${balance})`,
              },
            };
          }

          // VALIDATION: Custom amount must be a positive number. The NaN test
          // is load-bearing: a non-numeric amount fails BOTH comparisons above
          // and below (every NaN comparison is false), so without it a NaN
          // flows into totalAmount and reaches the gateway as the order value.
          if (!Number.isFinite(amountForThisBill) || amountForThisBill <= 0) {
            logger.warn('billing/payment-gateway', 'Custom amount must be positive', {
              bill_id: bill.id,
              custom_amount: amountForThisBill,
            });
            return {
              success: false,
              error: {
                error: 'INVALID_AMOUNT',
                message: `Amount for bill ${bill.id} must be greater than 0`,
              },
            };
          }
        }

        totalAmount += amountForThisBill;
        transactionItemsData.push({
          bill_id: bill.id,
          amount: amountForThisBill,
        });
      }

      // VALIDATION: Total amount must be positive
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
        .from('learners_profiles')
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

      // ----------------------------------------------------------------------
      // Provider branch (Task 14): If BILLING_PAYMENT_PROVIDER=razorpay, create
      // a Razorpay order via the PaymentProvider abstraction and return early.
      // Otherwise, fall through to the existing HDFC SmartGateway flow below.
      // ----------------------------------------------------------------------
      if (getActiveProviderName('billing') === 'razorpay') {
        // Determine the order's fee head for account routing. Route to a
        // head-specific MID ONLY when every bill in the order shares one
        // billing_categories.kind (and every category resolves); a mixed-head or
        // uncategorised bundle falls back to the institution's default account
        // (fee_head NULL). Verify/refund later resolve by the pinned account, so
        // only order creation needs to be fee-head-aware.
        let feeHead: string | null = null;
        const categoryIds = [
          ...new Set(bills.map((b) => b.item_category_id).filter(Boolean)),
        ] as string[];
        const allBillsCategorised = bills.every((b) => b.item_category_id);
        if (allBillsCategorised && categoryIds.length > 0) {
          const { data: cats, error: catsError } = await supabase
            .from('billing_categories')
            .select('id, kind')
            .in('id', categoryIds);
          if (catsError) {
            logger.error('billing/payment-gateway', 'Failed to fetch bill categories for fee-head routing', catsError);
            throw catsError;
          }
          const kinds = [...new Set((cats ?? []).map((c) => c.kind))];
          if (kinds.length === 1 && (cats?.length ?? 0) === categoryIds.length) {
            feeHead = kinds[0];
          }
        }

        // Resolve the institution + fee-head Razorpay account (falls back to the
        // institution default, then the common env account when unconfigured).
        // purpose: 'create-order' fails closed in production if resolution lands
        // on a test-mode key — sandbox checkout fakes success (UPI QR auto-pays)
        // and would receipt a bill with no money captured.
        const provider = await getPaymentProvider('billing', {
          institutionId,
          feeHead,
          purpose: 'create-order',
        });
        const rzpAccountId = (provider as RazorpayProvider).accountId ?? null;
        const amountPaise = toPaise(totalAmount);

        const customerEmail = student.student_email || student.college_email || 'noreply@jkkn.ai';
        const customerName = [student.first_name, student.last_name].filter(Boolean).join(' ').trim() || 'Student';
        const customerPhone = student.student_mobile || '';

        // Human-readable order notes for the Razorpay dashboard — names + bill
        // detail instead of opaque UUIDs. Safe to drop the raw ids: the webhook
        // routes only on notes.module, and reconciliation keys off transaction_ref
        // / razorpay_order_id (payment_transactions holds the canonical
        // student_id / institution_id).
        const { data: inst } = await supabase
          .from('institutions')
          .select('name')
          .eq('id', institutionId)
          .single();
        const institutionName = inst?.name ?? institutionId;

        const noteCategoryIds = [
          ...new Set(bills.map((b) => b.item_category_id).filter(Boolean)),
        ] as string[];
        let categoryNames: string[] = [];
        if (noteCategoryIds.length > 0) {
          const { data: noteCats } = await supabase
            .from('billing_categories')
            .select('id, category_name')
            .in('id', noteCategoryIds);
          categoryNames = [
            ...new Set((noteCats ?? []).map((c) => c.category_name).filter(Boolean)),
          ] as string[];
        }
        const billDescriptions = [
          ...new Set(bills.map((b) => b.bill_description).filter(Boolean)),
        ] as string[];

        // Razorpay caps each note value at 256 chars.
        const clampNote = (s: string) => (s.length > 240 ? `${s.slice(0, 239)}…` : s);

        const order = await provider.createOrder({
          transactionRef,
          amountPaise,
          currency: 'INR',
          module: 'billing',
          notes: {
            student_name: customerName,
            institution_name: institutionName,
            bill_category: clampNote(categoryNames.join(', ')) || '—',
            bill_description: clampNote(billDescriptions.join('; ')) || '—',
            transaction_ref: transactionRef,
          },
          description: `Payment for ${bills.length} bill(s)`,
          customer: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
          },
        });

        // Insert payment transaction row (Razorpay variant)
        // Note: 'as any' cast matches the HDFC path below — payment_transactions
        // types haven't been regenerated yet for the new columns.
        const { data: transaction, error: transactionError } = await (supabase as any)
          .from('payment_transactions')
          .insert({
            transaction_ref: transactionRef,
            session_id: order.gatewayOrderId, // Use gateway order id for non-null backward-compat
            student_id: sessionData.student_id,
            institution_id: institutionId,
            bill_ids: sessionData.bill_ids,
            total_amount: totalAmount,
            amount_paise: amountPaise,
            currency: 'INR',
            status: 'initiated',
            provider: 'razorpay',
            razorpay_order_id: order.gatewayOrderId,
            razorpay_account_id: rzpAccountId,
            gateway_response: order.raw,
          })
          .select()
          .single();

        if (transactionError || !transaction) {
          logger.error('billing/payment-gateway', 'Failed to create Razorpay transaction', transactionError);
          throw transactionError;
        }

        // Insert transaction items (identical shape to HDFC path)
        const transactionItems = transactionItemsData.map((item) => ({
          transaction_id: transaction.id,
          bill_id: item.bill_id,
          amount: item.amount,
        }));

        const { error: itemsError } = await supabase
          .from('payment_transaction_items')
          .insert(transactionItems);

        if (itemsError) {
          logger.error('billing/payment-gateway', 'Failed to create Razorpay transaction items', itemsError);
          throw itemsError;
        }

        logger.info('billing/payment-gateway', 'Razorpay payment session created successfully', {
          transaction_id: transaction.id,
          gateway_order_id: order.gatewayOrderId,
        });

        const razorpayResponse: PaymentSessionResponse = {
          transaction_id: transaction.id,
          // Backward-compat: existing UI reads these fields. Set non-null values so
          // pre-Task-18 UI doesn't crash. Task 18 will branch on `provider`.
          session_id: order.gatewayOrderId,
          payment_url: '',
          amount: totalAmount,
          expires_at: '',
          provider: 'razorpay',
          transaction_ref: transactionRef,
          razorpay_order_id: order.gatewayOrderId,
          razorpay_key_id: order.clientKeyId,
          amount_paise: amountPaise,
          customer: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
          },
        };

        return {
          success: true,
          data: razorpayResponse,
        };
      }

      // Generate a temporary session ID (will be updated with HDFC session ID later)
      const tempSessionId = `temp_${transactionRef}`;

      // Step 4: Create payment transaction record
      // Note: Using 'as any' cast because payment_transactions table types need regeneration
      const { data: transaction, error: transactionError } = await (supabase as any)
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

      // Step 5: Create transaction items with calculated amounts
      const transactionItems = transactionItemsData.map((item) => ({
        transaction_id: transaction.id,
        bill_id: item.bill_id,
        amount: item.amount,
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
      const { error: updateError } = await (supabase as any)
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
        provider: 'hdfc_smartgateway',
        transaction_ref: transactionRef,
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

      // Step 2: Find transaction by transaction_ref (order_id).
      // Service-role: a webhook carries no user session, so a cookie-scoped
      // client would see nothing through RLS.
      const supabase = createServiceRoleClient();
      const { data: transaction, error: transactionError } = await (supabase as any)
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
      const { error: updateError } = await (supabase as any)
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
        receiptCreated = await this.processSuccessfulPayment(transaction, supabase);
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
  // Public: the Razorpay webhook handler and the razorpay-late-auth cron both
  // finalize payments through this. Keeping it public means a typo at those
  // call sites is a compile error rather than a silently skipped receipt.
  static async processSuccessfulPayment(
    transaction: PaymentTransaction,
    injectedClient?: SupabaseClient
  ): Promise<boolean> {
    try {
      logger.info('billing/payment-gateway', 'Processing successful payment', {
        transaction_id: transaction.id,
      });

      // The callers of this method — the Razorpay webhook and the
      // razorpay-late-auth cron — have NO user session. The cookie-scoped
      // client returns zero rows through RLS for every lookup below, so this
      // used to bail at the items check: the transaction flipped to 'success'
      // while the bill stayed unpaid and no receipt was ever issued. Default to
      // the service-role client; a caller holding a real session may inject its
      // own.
      const supabase: any = injectedClient ?? createServiceRoleClient();

      // The payment reference that identifies this payment on the receipt.
      // Razorpay rows have no session_id (see payment_transactions_provider_
      // identifiers_chk), so fall back through the razorpay ids.
      const paymentReference =
        transaction.gateway_transaction_id ||
        transaction.razorpay_payment_id ||
        transaction.session_id ||
        transaction.transaction_ref;

      // Idempotency: the browser callback, the Razorpay webhook and the
      // late-auth cron can each finalize the same transaction. Exactly one
      // receipt must exist, or the learner is credited twice.
      //
      // .limit(1), NOT .maybeSingle(): maybeSingle() ERRORS when more than one
      // row matches, and discarding that error read as "no receipt exists" —
      // which is how pay_TUh0Qpmo3jktV8 got a THIRD receipt on 2026-08-27.
      // And fail CLOSED on a guard failure: creating a receipt without having
      // proven none exists is the bug; another finalizer will retry.
      const { data: existingReceipts, error: existingReceiptError } = await supabase
        .from('billing_receipts')
        .select('id, receipt_number')
        .eq('payment_reference_number', paymentReference)
        .limit(1);

      if (existingReceiptError) {
        logger.error('billing/payment-gateway', 'Existing-receipt check failed — skipping receipt creation', {
          transaction_id: transaction.id,
          payment_reference: paymentReference,
          error: existingReceiptError,
        });
        return false;
      }

      const existingReceipt = existingReceipts?.[0];
      if (existingReceipt) {
        logger.info('billing/payment-gateway', 'Receipt already exists for payment — skipping', {
          transaction_id: transaction.id,
          receipt_number: existingReceipt.receipt_number,
          payment_reference: paymentReference,
        });
        return true;
      }

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
        .from('learners_profiles')
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
        payment_reference_number: paymentReference,
        payment_remarks: `Online payment via ${
          transaction.provider === 'razorpay' ? 'Razorpay' : 'HDFC SmartGateway'
        } - ${transaction.payment_method || 'card'}`,
        receipt_items: items.map((item: { bill_id: string; amount: number }) => ({
          bill_id: item.bill_id,
          amount_paid: item.amount,
        })),
      };

      // Pass server-side client for proper authentication in server context
      let receipt;
      try {
        receipt = await BillingReceiptService.createBillingReceipt(receiptData, supabase);
      } catch (err: any) {
        // Unique violation on uq_billing_receipts_gateway_payment_ref: a
        // concurrent finalizer inserted the receipt between our guard check
        // and this insert. That is the constraint doing its job — the payment
        // IS receipted, so this path's work is done.
        if (err?.code === '23505') {
          logger.info('billing/payment-gateway', 'Receipt already created by a concurrent finalizer — skipping', {
            transaction_id: transaction.id,
            payment_reference: paymentReference,
          });
          return true;
        }
        throw err;
      }

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
      const { data: transaction, error: transactionError } = await (supabase as any)
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

      // ------------------------------------------------------------------
      // Provider branch (Task 16): Razorpay status check.
      // Calls provider.getOrderStatus() and maps Razorpay status → our enum.
      // ------------------------------------------------------------------
      if (transaction.provider === 'razorpay') {
        const provider = await getPaymentProvider('billing', {
          accountId: transaction.razorpay_account_id,
          institutionId: transaction.institution_id,
        });
        const rzpStatus = await provider.getOrderStatus(transaction.razorpay_order_id);

        let newStatus: PaymentStatus = transaction.status;
        if (rzpStatus.status === 'captured') newStatus = 'success';
        else if (rzpStatus.status === 'failed') newStatus = 'failed';
        else if (rzpStatus.status === 'refunded') newStatus = 'refunded';

        if (newStatus !== transaction.status) {
          const { error: updateError } = await (supabase as any)
            .from('payment_transactions')
            .update({
              status: newStatus,
              gateway_response: rzpStatus.raw,
              captured_at: rzpStatus.capturedAt?.toISOString() ?? null,
              completed_at: new Date().toISOString(),
              payment_date: rzpStatus.capturedAt?.toISOString() ?? null,
            })
            .eq('id', transaction.id);
          if (updateError) {
            logger.error('billing/payment-gateway', 'Failed to update Razorpay transaction status', updateError);
          }

          if (newStatus === 'success') {
            await this.processSuccessfulPayment({ ...transaction, status: newStatus });
          }
        }

        const response: PaymentStatusCheckResponse = {
          transaction_id: transaction.id,
          student_id: transaction.student_id,
          status: newStatus,
          amount: transaction.total_amount,
          payment_date: rzpStatus.capturedAt?.toISOString() ?? transaction.payment_date,
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
        `/orders/${transaction.transaction_ref}`,
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
        const { error: updateError } = await (supabase as any)
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
    transactionId: string,
    razorpayCallback?: { paymentId: string; signature: string }
  ): Promise<PaymentVerificationResult> {
    try {
      logger.info('billing/payment-gateway', 'Starting server-side payment verification', {
        transactionId,
      });

      // Use service role client for server-side verification (no user session in callbacks)
      const supabase = createServiceRoleClient();

      // Step 1: Fetch our transaction record
      const { data: transaction, error: transactionError } = await (supabase as any)
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

      // ----------------------------------------------------------------------
      // Provider branch (Task 15): Razorpay verification path.
      // Required when transaction.provider === 'razorpay'. Performs
      // 1) HMAC signature check on the callback args (anti-tampering)
      // 2) Dual-inquiry GET /orders + GET /payments (anti-replay, anti-spoof)
      // 3) Amount-in-paise match check
      // ----------------------------------------------------------------------
      if (transaction.provider === 'razorpay') {
        if (!razorpayCallback) {
          logger.error('billing/payment-gateway', 'Razorpay transaction verified without callback args', {
            transactionId,
          });
          return {
            verified: false,
            status: 'failed',
            amount: Number(transaction.total_amount ?? 0),
            error: 'Missing Razorpay callback parameters',
          };
        }

        const provider = await getPaymentProvider('billing', {
          accountId: transaction.razorpay_account_id,
          institutionId: transaction.institution_id,
        });
        const signatureValid = provider.verifySignature({
          gatewayOrderId: transaction.razorpay_order_id,
          gatewayPaymentId: razorpayCallback.paymentId,
          signature: razorpayCallback.signature,
        });

        if (!signatureValid) {
          await PaymentAuditService.logManipulationDetected(
            transactionId,
            transaction.student_id,
            transaction.institution_id,
            'razorpay_callback',
            'signature_invalid',
            undefined,
            undefined,
            { reason: 'razorpay_signature_invalid' }
          );
          return {
            verified: false,
            status: 'failed',
            amount: Number(transaction.total_amount ?? 0),
            error: 'Razorpay signature verification failed',
          };
        }

        // Dual inquiry: server-side fetch from BOTH /orders and /payments.
        // This is mandatory per the Razorpay security audit checklist.
        const status = await (provider as RazorpayProvider).dualInquiry(
          transaction.razorpay_order_id,
          razorpayCallback.paymentId,
        );

        // Amount mismatch check (compare paise, not rupees, for exactness)
        const expectedPaise = Number(transaction.amount_paise ?? 0);
        if (status.amountPaise !== expectedPaise) {
          await PaymentAuditService.logAmountMismatch(
            transactionId,
            transaction.student_id,
            transaction.institution_id,
            expectedPaise,
            status.amountPaise,
            undefined,
            { source: 'razorpay_dual_inquiry' }
          );
          return {
            verified: false,
            status: 'failed',
            amount: status.amountPaise / 100,
            error: 'Amount mismatch - potential manipulation detected',
            rawResponse: status.raw as any,
          };
        }

        const mappedStatus: PaymentStatus =
          status.status === 'captured' ? 'success' :
          status.status === 'failed' ? 'failed' :
          status.status === 'refunded' ? 'refunded' :
          'processing';

        const result: PaymentVerificationResult = {
          verified: mappedStatus === 'success',
          status: mappedStatus,
          amount: status.amountPaise / 100,
          gatewayOrderId: transaction.razorpay_order_id,
          gatewayTransactionId: razorpayCallback.paymentId,
          paymentTime: status.capturedAt?.toISOString(),
          rawResponse: status.raw as any,
        };

        logger.info('billing/payment-gateway', 'Razorpay payment verification completed', {
          transactionId,
          verified: result.verified,
          status: result.status,
        });

        return result;
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
      // Note: Both our amounts and HDFC amounts are in rupees (not paisa)
      // HDFC Order Status API returns amount as Double type in rupees
      const expectedAmount = Number(transaction.total_amount);
      const actualAmount = Number(hdfcAmount);

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

      // Use service role client for server-side processing (no user session in callbacks)
      const supabase = createServiceRoleClient();

      // Step 1: Fetch transaction
      const { data: transaction, error: txnError } = await (supabase as any)
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
          await (supabase as any)
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

      const { error: updateError } = await (supabase as any)
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

        const paymentReference = verification.gatewayTransactionId || transaction.transaction_ref;

        // Idempotency: the Razorpay webhook or the razorpay-late-auth cron may
        // already have finalized this payment. One payment, one receipt — a
        // second receipt would credit the learner twice.
        //
        // .limit(1), NOT .maybeSingle(): maybeSingle() ERRORS when more than
        // one row matches, and discarding that error read as "no receipt
        // exists" — which is how pay_TUh0Qpmo3jktV8 got a THIRD receipt on
        // 2026-08-27. Fail CLOSED on a guard failure: skip receipt creation
        // rather than risk a duplicate; the webhook path finalizes receipts
        // independently.
        const { data: existingReceipts, error: existingReceiptError } = await (supabase as any)
          .from('billing_receipts')
          .select('id, receipt_number')
          .eq('payment_reference_number', paymentReference)
          .limit(1);

        if (existingReceiptError) {
          logger.error('billing/payment-gateway', 'Existing-receipt check failed — skipping receipt creation', {
            transactionId,
            payment_reference: paymentReference,
            error: existingReceiptError,
          });
          return {
            success: true, // Transaction updated; receipt deferred to the webhook path
            error: 'Payment verified but receipt existence could not be confirmed',
          };
        }

        const existingReceipt = existingReceipts?.[0];
        if (existingReceipt) {
          logger.info('billing/payment-gateway', 'Receipt already exists for payment — skipping', {
            transactionId,
            receiptNumber: existingReceipt.receipt_number,
          });
          return {
            success: true,
            receiptId: existingReceipt.id,
            receiptNumber: existingReceipt.receipt_number,
          };
        }

        // Fetch transaction items
        const { data: items } = await (supabase as any)
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
        const { data: student } = await (supabase as any)
          .from('learners_profiles')
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
          payment_reference_number: paymentReference,
          payment_remarks: `Online payment via ${
            transaction.provider === 'razorpay' ? 'Razorpay' : 'HDFC SmartGateway'
          } - ${verification.paymentMethod || 'CARD'} (Verified)`,
          receipt_items: items.map((item: { bill_id: string; amount: number }) => ({
            bill_id: item.bill_id,
            amount_paid: item.amount,
          })),
        };

        // Pass service role client for server-side execution (API routes don't have user session)
        let receipt;
        try {
          receipt = await BillingReceiptService.createBillingReceipt(receiptData, supabase);
        } catch (err: any) {
          // Unique violation on uq_billing_receipts_gateway_payment_ref: a
          // concurrent finalizer (webhook) inserted the receipt between our
          // guard check and this insert. The payment IS receipted — done.
          if (err?.code === '23505') {
            logger.info('billing/payment-gateway', 'Receipt already created by a concurrent finalizer — skipping', {
              transactionId,
              payment_reference: paymentReference,
            });
            return { success: true };
          }
          throw err;
        }

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
      const { data, error } = await (supabase as any)
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
      const { data, error } = await (supabase as any)
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
