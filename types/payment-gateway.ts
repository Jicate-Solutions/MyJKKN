// Payment Gateway Types for HDFC SmartGateway Integration
// MID: SG3726
// Created: 2025-01-20

// ============================================================================
// Payment Status Types
// ============================================================================

export type PaymentStatus =
  | 'initiated'      // Payment session created, awaiting gateway redirect
  | 'processing'     // Payment being processed by gateway
  | 'success'        // Payment completed successfully
  | 'failed'         // Payment failed
  | 'cancelled'      // Payment cancelled by user
  | 'expired'        // Payment session expired
  | 'refunded';      // Payment refunded

// ============================================================================
// Database Table Types
// ============================================================================

export interface PaymentTransaction {
  id: string;
  transaction_ref: string;
  session_id: string;
  student_id: string;
  institution_id: string;
  bill_ids: string[];
  total_amount: number;
  currency: string;
  status: PaymentStatus;
  gateway_response?: any;
  payment_method?: string;
  gateway_transaction_id?: string;
  payment_date?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface PaymentTransactionItem {
  id: string;
  transaction_id: string;
  bill_id: string;
  amount: number;
  created_at: string;
}

// ============================================================================
// Payment Session DTOs
// ============================================================================

export interface CreatePaymentSessionDto {
  student_id: string;
  bill_ids: string[];
  return_url?: string;
  cancel_url?: string;
}

export interface PaymentSessionResponse {
  transaction_id: string;
  session_id: string;
  payment_url: string;
  amount: number;
  expires_at: string;
}

// ============================================================================
// HDFC SmartGateway API Types
// ============================================================================

export interface HDFCSessionRequest {
  order: {
    amount: number;           // Amount in paisa (multiply by 100)
    currency: string;          // 'INR'
    id: string;               // transaction_ref
  };
  payment_page_client_id: string;  // Merchant ID (SG3726)
  customer: {
    email: string;
    phone: string;
  };
  success_url: string;
  failure_url: string;
}

export interface HDFCSessionResponse {
  id: string;                      // HDFC order session ID (e.g., "ordeh_93b8fa6fd1244754b94b14fde6b80f64")
  status: string;                  // Order status (e.g., "NEW")
  order_id: string;                // Your transaction reference
  payment_links: {
    web: string;                   // Payment page URL
    expiry: string;                // Link expiry timestamp
  };
  order_expiry: string;            // Order expiry timestamp
  sdk_payload: {
    expiry: string;
    payload: {
      action: string;
      amount: string;
      orderId: string;
      service: string;
      clientId: string;
      currency: string;
      lastName: string;
      firstName: string;
      returnUrl: string;
      customerId: string;
      merchantId: string;
      description: string;
      environment: string;
      customerEmail: string;
      customerPhone: string;
      collectAvsInfo: boolean;
      clientAuthToken: string;
      displayBusinessAs: string;
      clientAuthTokenExpiry: string;
    };
    service: string;
    currTime: string;
    requestId: string;
  };
}

export interface HDFCWebhookPayload {
  event_type: string;          // 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', etc.
  event_id: string;
  event_time: string;
  data: {
    order: {
      order_id: string;        // Our transaction_ref
      amount: number;
      currency: string;
      status: string;
    };
    payment: {
      payment_id: string;      // Gateway transaction ID
      payment_method: string;  // 'card', 'upi', 'netbanking', etc.
      payment_status: string;  // 'COMPLETED', 'FAILED', etc.
      payment_time?: string;
    };
    customer?: {
      email: string;
      phone: string;
    };
  };
}

export interface HDFCOrderStatusResponse {
  // Core order fields
  id: string;                      // HDFC's internal order ID (ordeh_xxx)
  order_id: string;                // Our transaction_ref
  status: string;                  // Order status: CHARGED, PENDING, FAILED, etc.
  status_id: number;               // Numeric status ID (21 = CHARGED)
  amount: number;                  // Amount in paisa
  currency: string;                // Currency code (INR)
  date_created: string;            // Order creation timestamp
  merchant_id: string;             // Merchant ID

  // Legacy field names for backward compatibility
  order_status?: string;           // Alias for status
  order_amount?: number;           // Alias for amount
  payment_session_id?: string;     // Session ID

  // Customer info
  customer_id?: string;
  customer_email?: string;
  customer_phone?: string;

  // Transaction details
  txn_id?: string;                 // Transaction ID
  txn_uuid?: string;               // Transaction UUID
  payment_method_type?: string;    // CARD, UPI, NETBANKING, WALLET
  payment_method?: string;         // Specific method (VISA, MASTERCARD, etc.)
  auth_type?: string;              // Authentication type (THREE_DS, etc.)

  // For detailed transaction info
  txn_detail?: {
    txn_id: string;
    order_id: string;
    status: string;
    error_code: string | null;
    net_amount: number;
    txn_amount: number;
    currency: string;
    gateway: string;
    gateway_id: number;
    created: string;
    error_message: string;
  };

  // Gateway response
  payment_gateway_response?: {
    resp_code: string;
    resp_message: string;
    rrn: string;
    epg_txn_id: string;
    auth_id_code: string;
    txn_id: string;
    created: string;
  };

  // Legacy payment object for backward compatibility
  payment?: {
    payment_id: string;
    payment_status: string;
    payment_method: string;
    payment_time: string;
    payment_amount: number;
  };
}

// ============================================================================
// Payment Status Check Types
// ============================================================================

export interface PaymentStatusCheckResponse {
  transaction_id: string;
  student_id: string;
  status: PaymentStatus;
  amount: number;
  payment_date?: string;
  payment_method?: string;
  receipt_id?: string;
  bills_paid: number;
}

// ============================================================================
// Error Response Types
// ============================================================================

export interface PaymentErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: any;
}

// ============================================================================
// Webhook Verification Types
// ============================================================================

export interface WebhookSignatureVerification {
  isValid: boolean;
  payload: HDFCWebhookPayload;
  signature: string;
}

// ============================================================================
// Payment Transaction with Relations
// ============================================================================

export interface PaymentTransactionWithRelations extends PaymentTransaction {
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    student_email?: string;
    college_email?: string;
    student_mobile?: string;
  };
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  items?: PaymentTransactionItem[];
  receipt?: {
    id: string;
    receipt_number: string;
    payment_amount: number;
  };
}

// ============================================================================
// Payment Analytics Types
// ============================================================================

export interface PaymentAnalytics {
  total_transactions: number;
  successful_payments: number;
  failed_payments: number;
  total_amount_collected: number;
  average_transaction_amount: number;
  payment_methods: {
    method: string;
    count: number;
    total_amount: number;
  }[];
  daily_stats: {
    date: string;
    transactions: number;
    amount: number;
  }[];
}

// ============================================================================
// HDFC Configuration Types
// ============================================================================

export interface HDFCConfig {
  merchantId: string;           // SG3726
  apiKey: string;
  apiSecret: string;
  responseKey: string;           // For webhook verification
  cardEncodingKey: string;       // For client-side encryption
  baseUrl: string;
  testMode: boolean;
}

// ============================================================================
// Payment Gateway Service Response Types
// ============================================================================

export interface InitiatePaymentResult {
  success: boolean;
  data?: PaymentSessionResponse;
  error?: PaymentErrorResponse;
}

export interface WebhookProcessingResult {
  success: boolean;
  transaction_id?: string;
  receipt_created?: boolean;
  error?: string;
}

export interface PaymentStatusResult {
  success: boolean;
  data?: PaymentStatusCheckResponse;
  error?: PaymentErrorResponse;
}

// ============================================================================
// Payment Verification Types (Security Enhancement)
// ============================================================================

export interface PaymentVerificationResult {
  verified: boolean;
  status: PaymentStatus;
  amount: number;
  gatewayOrderId?: string;
  gatewayTransactionId?: string;
  paymentMethod?: string;
  paymentTime?: string;
  verificationHash?: string;
  error?: string;
  rawResponse?: HDFCOrderStatusResponse;
}

export type PaymentAuditEventType =
  | 'PAYMENT_VERIFICATION_SUCCESS'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'PAYMENT_MANIPULATION_DETECTED'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'PAYMENT_REPLAY_BLOCKED'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'PAYMENT_CALLBACK_RECEIVED'
  | 'PAYMENT_RECEIPT_CREATED';

export interface PaymentAuditLog {
  eventType: PaymentAuditEventType;
  transactionId: string;
  studentId?: string;
  institutionId?: string;
  expectedAmount?: number;
  actualAmount?: number;
  clientStatus?: string;
  serverStatus?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessVerifiedPaymentResult {
  success: boolean;
  receiptId?: string;
  receiptNumber?: string;
  error?: string;
}
