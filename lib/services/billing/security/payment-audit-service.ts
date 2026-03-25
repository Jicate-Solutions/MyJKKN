// Payment Audit Service - Security Event Logging
// Purpose: Log all payment-related security events for audit trail
// Created: 2025-01-20 (Security Enhancement)

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import type { PaymentAuditEventType, PaymentAuditLog } from '@/types/payment-gateway';

export class PaymentAuditService {
  // System user ID for payment audit events (when no student ID available)
  // This should be a dedicated system account in the users table
  private static readonly SYSTEM_AUDIT_USER_ID = '00000000-0000-0000-0000-000000000000';

  /**
   * Logs a payment security event to the user_activity_logs table
   * This is used for tracking all security-related payment events
   */
  static async logSecurityEvent(auditLog: PaymentAuditLog): Promise<void> {
    try {
      const supabase = createServiceRoleClient();

      // Map audit event to activity log format
      // Note: user_activity_logs requires user_id to be NOT NULL
      // We use the student_id if available, otherwise a system audit user
      const activityData = {
        user_id: auditLog.studentId || this.SYSTEM_AUDIT_USER_ID,
        action_type: auditLog.eventType,
        resource_type: 'payment_transaction',
        resource_id: null, // Transaction ID is not a UUID, store in metadata instead
        resource_name: `Payment Transaction: ${auditLog.transactionId}`,
        description: this.getEventDescription(auditLog),
        ip_address: auditLog.ipAddress || null,
        user_agent: auditLog.userAgent || null,
        institution_id: auditLog.institutionId || null,
        metadata: {
          eventType: auditLog.eventType,
          transactionId: auditLog.transactionId,
          expectedAmount: auditLog.expectedAmount,
          actualAmount: auditLog.actualAmount,
          clientStatus: auditLog.clientStatus,
          serverStatus: auditLog.serverStatus,
          ...auditLog.metadata,
        },
      };

      // Use raw insert to bypass TypeScript strict typing
      const { error } = await (supabase as any).from('user_activity_logs').insert(activityData);

      if (error) {
        logger.error('billing/payment-audit', 'Failed to log security event', {
          eventType: auditLog.eventType,
          error,
        });
      } else {
        logger.info('billing/payment-audit', 'Security event logged', {
          eventType: auditLog.eventType,
          transactionId: auditLog.transactionId,
        });
      }
    } catch (error) {
      // Never throw from audit logging - don't break the main flow
      logger.error('billing/payment-audit', 'Audit logging failed', error);
    }
  }

  /**
   * Log successful payment verification
   */
  static async logVerificationSuccess(
    transactionId: string,
    studentId: string,
    institutionId: string,
    amount: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: 'PAYMENT_VERIFICATION_SUCCESS',
      transactionId,
      studentId,
      institutionId,
      expectedAmount: amount,
      actualAmount: amount,
      serverStatus: 'PAID',
      metadata,
    });
  }

  /**
   * Log failed payment verification
   */
  static async logVerificationFailed(
    transactionId: string,
    studentId: string,
    institutionId: string,
    serverStatus: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: 'PAYMENT_VERIFICATION_FAILED',
      transactionId,
      studentId,
      institutionId,
      serverStatus,
      metadata,
    });
  }

  /**
   * Log potential manipulation attempt - CRITICAL SECURITY EVENT
   * This occurs when client-provided status doesn't match server verification
   */
  static async logManipulationDetected(
    transactionId: string,
    studentId: string,
    institutionId: string,
    clientStatus: string,
    serverStatus: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    logger.error('billing/payment-audit', '⚠️ SECURITY ALERT: Payment manipulation detected', {
      transactionId,
      clientStatus,
      serverStatus,
    });

    await this.logSecurityEvent({
      eventType: 'PAYMENT_MANIPULATION_DETECTED',
      transactionId,
      studentId,
      institutionId,
      clientStatus,
      serverStatus,
      ipAddress,
      userAgent,
      metadata: {
        ...metadata,
        severity: 'CRITICAL',
        alertType: 'FRAUD_ATTEMPT',
      },
    });
  }

  /**
   * Log amount mismatch - potential manipulation
   */
  static async logAmountMismatch(
    transactionId: string,
    studentId: string,
    institutionId: string,
    expectedAmount: number,
    actualAmount: number,
    ipAddress?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    logger.error('billing/payment-audit', '⚠️ SECURITY ALERT: Amount mismatch detected', {
      transactionId,
      expectedAmount,
      actualAmount,
      difference: Math.abs(expectedAmount - actualAmount),
    });

    await this.logSecurityEvent({
      eventType: 'PAYMENT_AMOUNT_MISMATCH',
      transactionId,
      studentId,
      institutionId,
      expectedAmount,
      actualAmount,
      ipAddress,
      metadata: {
        ...metadata,
        severity: 'HIGH',
        amountDifference: Math.abs(expectedAmount - actualAmount),
      },
    });
  }

  /**
   * Log replay attack blocked
   */
  static async logReplayBlocked(
    transactionId: string,
    studentId: string,
    institutionId: string,
    ipAddress?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    logger.warn('billing/payment-audit', 'Replay attack blocked', {
      transactionId,
    });

    await this.logSecurityEvent({
      eventType: 'PAYMENT_REPLAY_BLOCKED',
      transactionId,
      studentId,
      institutionId,
      ipAddress,
      metadata: {
        ...metadata,
        severity: 'MEDIUM',
        alertType: 'REPLAY_ATTEMPT',
      },
    });
  }

  /**
   * Log invalid webhook signature
   */
  static async logInvalidWebhookSignature(
    transactionId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    logger.error('billing/payment-audit', '⚠️ SECURITY ALERT: Invalid webhook signature', {
      transactionId,
    });

    await this.logSecurityEvent({
      eventType: 'WEBHOOK_SIGNATURE_INVALID',
      transactionId,
      metadata: {
        ...metadata,
        severity: 'HIGH',
        alertType: 'SIGNATURE_VALIDATION_FAILED',
      },
    });
  }

  /**
   * Log callback received (for audit trail)
   */
  static async logCallbackReceived(
    transactionId: string,
    studentId: string,
    institutionId: string,
    clientStatus: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: 'PAYMENT_CALLBACK_RECEIVED',
      transactionId,
      studentId,
      institutionId,
      clientStatus,
      ipAddress,
      userAgent,
      metadata,
    });
  }

  /**
   * Log receipt creation after verified payment
   */
  static async logReceiptCreated(
    transactionId: string,
    studentId: string,
    institutionId: string,
    receiptId: string,
    receiptNumber: string,
    amount: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: 'PAYMENT_RECEIPT_CREATED',
      transactionId,
      studentId,
      institutionId,
      actualAmount: amount,
      metadata: {
        ...metadata,
        receiptId,
        receiptNumber,
      },
    });
  }

  /**
   * Get human-readable description for audit event
   */
  private static getEventDescription(auditLog: PaymentAuditLog): string {
    switch (auditLog.eventType) {
      case 'PAYMENT_VERIFICATION_SUCCESS':
        return `Payment verified successfully with HDFC API for amount ${auditLog.actualAmount}`;

      case 'PAYMENT_VERIFICATION_FAILED':
        return `Payment verification failed - HDFC status: ${auditLog.serverStatus}`;

      case 'PAYMENT_MANIPULATION_DETECTED':
        return `⚠️ SECURITY: Payment manipulation detected - Client claimed ${auditLog.clientStatus} but HDFC returned ${auditLog.serverStatus}`;

      case 'PAYMENT_AMOUNT_MISMATCH':
        return `⚠️ SECURITY: Amount mismatch - Expected ${auditLog.expectedAmount}, HDFC returned ${auditLog.actualAmount}`;

      case 'PAYMENT_REPLAY_BLOCKED':
        return `Replay attack blocked - Transaction already processed`;

      case 'WEBHOOK_SIGNATURE_INVALID':
        return `⚠️ SECURITY: Invalid webhook signature detected - possible spoofing attempt`;

      case 'PAYMENT_CALLBACK_RECEIVED':
        return `Payment callback received from HDFC gateway with status: ${auditLog.clientStatus}`;

      case 'PAYMENT_RECEIPT_CREATED':
        return `Receipt created for verified payment - Amount: ${auditLog.actualAmount}`;

      default:
        return `Payment security event: ${auditLog.eventType}`;
    }
  }
}
