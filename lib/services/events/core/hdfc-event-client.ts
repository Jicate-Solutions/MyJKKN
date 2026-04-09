// HDFC SmartGateway Client for Event Payments
// Reuses the same HDFC configuration as billing but operates independently
// Created: 2026-04-07
// Purpose: Handle HDFC API communication for event registration payments

import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HDFCSessionResponse,
  HDFCOrderStatusResponse,
} from '@/types/payment-gateway';
import type { EventPaymentTransactionStatus } from '@/types/events';

// ============================================================================
// Configuration (same env vars as billing)
// ============================================================================

interface HDFCConfig {
  merchantId: string;
  paymentPageClientId: string;
  apiKey: string;
  apiSecret: string;
  responseKey: string;
  baseUrl: string;
  testMode: boolean;
}

function getHDFCConfig(): HDFCConfig {
  const config: HDFCConfig = {
    merchantId: process.env.HDFC_MERCHANT_ID || '',
    paymentPageClientId:
      process.env.HDFC_PAYMENT_PAGE_CLIENT_ID ||
      process.env.HDFC_MERCHANT_ID ||
      '',
    apiKey: process.env.HDFC_API_KEY || '',
    apiSecret: process.env.HDFC_API_SECRET || '',
    responseKey: process.env.HDFC_RESPONSE_KEY || '',
    baseUrl:
      process.env.HDFC_BASE_URL || 'https://smartgateway.hdfcuat.bank.in',
    testMode: process.env.HDFC_TEST_MODE === 'true',
  };

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
// HDFC Event Client
// ============================================================================

export class HDFCEventClient {
  // ==========================================================================
  // Create Payment Session
  // ==========================================================================

  /**
   * Creates a payment session with HDFC SmartGateway for an event registration.
   *
   * @param params - Session parameters
   * @returns Payment URL and session ID from HDFC
   */
  static async createSession(params: {
    transactionRef: string;
    amount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    returnUrl: string;
    description?: string;
  }): Promise<{ payment_url: string; session_id: string }> {
    const config = getHDFCConfig();

    // Split name into first/last for HDFC
    const nameParts = params.customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Participant';
    const lastName = nameParts.slice(1).join(' ') || '';

    const requestBody: Record<string, unknown> = {
      order_id: params.transactionRef,
      amount: params.amount.toFixed(2),
      customer_id: params.transactionRef,
      customer_email: params.customerEmail || 'noreply@jkkn.ai',
      customer_phone: params.customerPhone || '',
      payment_page_client_id: config.paymentPageClientId,
      action: 'paymentPage',
      currency: 'INR',
      return_url: params.returnUrl,
      description: params.description || 'Event Registration Payment',
      first_name: firstName,
      last_name: lastName,
    };

    logger.info('events/hdfc-client', 'Creating HDFC session for event payment', {
      transactionRef: params.transactionRef,
      amount: params.amount,
    });

    const response = await this.callHDFCApi<HDFCSessionResponse>(
      '/session',
      'POST',
      requestBody,
      params.transactionRef
    );

    const sessionId = (response as any).id;
    const paymentUrl = (response as any).payment_links?.web;

    if (!sessionId || !paymentUrl) {
      logger.error('events/hdfc-client', 'Invalid HDFC response structure', {
        response: JSON.stringify(response),
      });
      throw new Error('Invalid HDFC response: missing session ID or payment URL');
    }

    logger.info('events/hdfc-client', 'HDFC session created', {
      sessionId,
      paymentUrl: paymentUrl.substring(0, 50) + '...',
    });

    return { payment_url: paymentUrl, session_id: sessionId };
  }

  // ==========================================================================
  // Verify Payment Status (Server-to-Server)
  // ==========================================================================

  /**
   * Verifies payment status directly with HDFC Order Status API.
   * NEVER trust client-claimed status — always verify server-to-server.
   *
   * @param orderRef - The transaction_ref (order_id) sent to HDFC when creating session
   * @param sessionId - The HDFC session ID (ordeh_xxx) as fallback
   * @returns Verified payment status from HDFC
   */
  static async verifyPaymentStatus(
    orderRef: string,
    sessionId?: string | null
  ): Promise<{
    verified: boolean;
    status: 'success' | 'failed' | 'pending';
    amount?: number;
    gatewayTransactionId?: string;
    paymentMethod?: string;
    rawResponse?: HDFCOrderStatusResponse;
  }> {
    logger.info('events/hdfc-client', 'Verifying payment status with HDFC', {
      orderRef,
      sessionId,
    });

    let hdfcResponse: HDFCOrderStatusResponse;

    try {
      // Primary: lookup by our transaction_ref (the order_id we sent to HDFC)
      hdfcResponse = await this.callHDFCApi<HDFCOrderStatusResponse>(
        `/orders/${orderRef}`,
        'GET',
        undefined,
        orderRef
      );
    } catch (primaryError) {
      logger.warn('events/hdfc-client', 'Primary lookup failed, trying session ID', {
        orderRef,
        error: primaryError,
      });

      if (sessionId) {
        try {
          hdfcResponse = await this.callHDFCApi<HDFCOrderStatusResponse>(
            `/orders/${sessionId}`,
            'GET',
            undefined,
            orderRef
          );
        } catch (secondError) {
          logger.error('events/hdfc-client', 'All HDFC status lookups failed', {
            primaryError,
            secondError,
          });
          throw primaryError;
        }
      } else {
        throw primaryError;
      }
    }

    // Map HDFC status to simplified status
    const hdfcStatus = (
      hdfcResponse.status ||
      hdfcResponse.order_status ||
      ''
    ).toUpperCase();

    const hdfcAmount = hdfcResponse.amount || hdfcResponse.order_amount || 0;

    const gatewayTxnId =
      hdfcResponse.txn_id ||
      hdfcResponse.txn_detail?.txn_id ||
      hdfcResponse.payment_gateway_response?.epg_txn_id ||
      hdfcResponse.payment?.payment_id;

    const paymentMethod =
      hdfcResponse.payment_method ||
      hdfcResponse.payment_method_type ||
      hdfcResponse.payment?.payment_method;

    let status: 'success' | 'failed' | 'pending';

    if (['PAID', 'CHARGED', 'SUCCESS', 'COMPLETED'].includes(hdfcStatus)) {
      status = 'success';
    } else if (['PENDING', 'PENDING_VBV', 'NEW', 'INITIATED'].includes(hdfcStatus)) {
      status = 'pending';
    } else {
      status = 'failed';
    }

    logger.info('events/hdfc-client', 'Payment verification result', {
      orderRef,
      hdfcStatus,
      mappedStatus: status,
      amount: hdfcAmount,
    });

    return {
      verified: status === 'success',
      status,
      amount: Number(hdfcAmount),
      gatewayTransactionId: gatewayTxnId,
      paymentMethod,
      rawResponse: hdfcResponse,
    };
  }

  // ==========================================================================
  // Webhook Auth Verification
  // ==========================================================================

  /**
   * Verifies HDFC webhook Basic Auth credentials.
   *
   * @param username - Username from Authorization header
   * @param password - Password from Authorization header
   * @returns True if credentials match
   */
  static verifyWebhookAuth(username: string, password: string): boolean {
    const expectedUser = process.env.HDFC_WEBHOOK_USERNAME || '';
    const expectedPass = process.env.HDFC_WEBHOOK_PASSWORD || '';

    if (!expectedUser || !expectedPass) {
      logger.error('events/hdfc-client', 'Webhook credentials not configured');
      return false;
    }

    return username === expectedUser && password === expectedPass;
  }

  // ==========================================================================
  // Map HDFC status to EventPaymentTransactionStatus
  // ==========================================================================

  static mapToEventStatus(hdfcStatus: string): EventPaymentTransactionStatus {
    const statusMap: Record<string, EventPaymentTransactionStatus> = {
      PAID: 'success',
      CHARGED: 'success',
      SUCCESS: 'success',
      COMPLETED: 'success',
      FAILED: 'failed',
      DECLINED: 'failed',
      CANCELLED: 'cancelled',
      CANCELED: 'cancelled',
      USER_DROPPED: 'cancelled',
      EXPIRED: 'expired',
      PENDING: 'processing',
      PENDING_VBV: 'processing',
      NEW: 'initiated',
      INITIATED: 'initiated',
    };

    return statusMap[hdfcStatus?.toUpperCase() || ''] || 'failed';
  }

  // ==========================================================================
  // Private: HDFC API Call
  // ==========================================================================

  private static async callHDFCApi<T>(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
    customerId?: string
  ): Promise<T> {
    const config = getHDFCConfig();
    const url = `${config.baseUrl}${endpoint}`;

    // Basic Auth with API key only (per HDFC docs)
    const authToken = Buffer.from(config.apiKey).toString('base64');

    const headers: Record<string, string> = {
      'Content-Type':
        method === 'GET' ? 'application/x-www-form-urlencoded' : 'application/json',
      Authorization: `Basic ${authToken}`,
      'x-merchantid': config.merchantId,
      'x-customerid': customerId || 'default_customer',
      'x-resellerid': 'hdfc_reseller',
      version: '2023-06-30',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    logger.dev('events/hdfc-client', 'Calling HDFC API', {
      endpoint,
      method,
      url,
    });

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('events/hdfc-client', 'HDFC API error', {
        endpoint,
        status: response.status,
        error: errorText,
      });
      throw new Error(`HDFC API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data as T;
  }
}
