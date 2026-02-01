/**
 * API Error Handler Utility
 *
 * Standardized error handling for Next.js API routes
 */

import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors/app-errors';
import { ErrorLogger, ErrorContext } from '@/lib/utils/error-logger';

/**
 * Handle errors in API routes with proper logging and response formatting
 */
export function handleApiError(
  error: unknown,
  context?: ErrorContext
): NextResponse {
  const err = error as Error;

  // Log the error with context
  ErrorLogger.log(err, context);

  // Sanitize error for client
  const clientError = ErrorLogger.sanitizeForClient(err);

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  return NextResponse.json(
    {
      success: false,
      error: clientError.message,
      code: clientError.code,
      ...(clientError.details && { details: clientError.details }),
    },
    { status: statusCode }
  );
}

/**
 * Standardized success response
 */
export function successResponse<T>(
  data: T,
  message?: string,
  statusCode: number = 200
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(message && { message }),
    },
    { status: statusCode }
  );
}

/**
 * Wrap API route handler with error handling
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T,
  context?: Partial<ErrorContext>
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, {
        ...context,
        arguments: args,
      });
    }
  }) as T;
}
