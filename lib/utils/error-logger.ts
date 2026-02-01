/**
 * Error Logger Utility
 *
 * Centralized error logging with sanitization for client-facing messages
 */

import { AppError, isOperationalError } from '@/lib/errors/app-errors';

export interface ErrorContext {
  method?: string;
  route?: string;
  userId?: string;
  institutionId?: string;
  params?: Record<string, any>;
  [key: string]: any;
}

export class ErrorLogger {
  /**
   * Log error with context
   */
  static log(error: Error, context?: ErrorContext): void {
    const errorData = {
      timestamp: new Date().toISOString(),
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      context,
      ...(error instanceof AppError && {
        code: error.code,
        statusCode: error.statusCode,
        isOperational: error.isOperational,
      }),
    };

    // In production, send to error tracking service (Sentry, etc.)
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to Sentry or similar
      console.error('[PRODUCTION ERROR]', JSON.stringify(errorData));

      // Only log non-operational errors with full stack trace
      if (!isOperationalError(error)) {
        console.error('[CRITICAL ERROR - Stack Trace]', error.stack);
      }
    } else {
      // Development - log everything
      console.error('[ERROR]', errorData);
    }
  }

  /**
   * Sanitize error for client response
   */
  static sanitizeForClient(error: Error): {
    message: string;
    code?: string;
    details?: any;
  } {
    if (error instanceof AppError && error.isOperational) {
      // Safe to send to client
      return {
        message: error.message,
        code: error.code,
        ...(((error as any).details) && { details: (error as any).details }),
      };
    }

    // Don't expose internal errors
    return {
      message: 'An unexpected error occurred. Please try again.',
      code: 'INTERNAL_ERROR',
    };
  }

  /**
   * Get user-friendly error message
   */
  static getUserFriendlyMessage(error: Error): string {
    if (error instanceof AppError) {
      return USER_FRIENDLY_ERRORS[error.code] || error.message;
    }

    return USER_FRIENDLY_ERRORS.INTERNAL_ERROR;
  }

  /**
   * Log warning (non-error issues)
   */
  static warn(message: string, context?: ErrorContext): void {
    const logData = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message,
      context,
    };

    if (process.env.NODE_ENV === 'production') {
      console.warn('[WARNING]', JSON.stringify(logData));
    } else {
      console.warn('[WARNING]', logData);
    }
  }

  /**
   * Log info (important non-error events)
   */
  static info(message: string, context?: ErrorContext): void {
    const logData = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      context,
    };

    if (process.env.NODE_ENV === 'production') {
      console.info('[INFO]', JSON.stringify(logData));
    } else {
      console.info('[INFO]', logData);
    }
  }
}

/**
 * User-friendly error messages
 */
const USER_FRIENDLY_ERRORS: Record<string, string> = {
  VALIDATION_ERROR: 'Please check your input and try again.',
  AUTH_ERROR: 'Please sign in to continue.',
  FORBIDDEN: "You don't have permission to access this resource.",
  NOT_FOUND: 'The requested item could not be found.',
  CONFLICT: 'This operation conflicts with existing data.',
  RATE_LIMIT: 'Too many requests. Please wait and try again.',
  DB_ERROR: 'Database connection issue. Please try again later.',
  EXTERNAL_SERVICE_ERROR: 'External service is temporarily unavailable.',
  FILE_PROCESSING_ERROR: 'Unable to process the file. Please check the format and try again.',
  BUSINESS_LOGIC_ERROR: 'This operation cannot be completed due to business rules.',
  INTERNAL_ERROR: 'An unexpected error occurred. Our team has been notified.',
};

/**
 * Utility function to wrap async functions with error logging
 */
export function withErrorLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: Partial<ErrorContext>
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      ErrorLogger.log(error as Error, {
        ...context,
        arguments: args,
      });
      throw error;
    }
  }) as T;
}
