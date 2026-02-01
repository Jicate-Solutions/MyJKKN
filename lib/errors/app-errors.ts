/**
 * Custom Application Error Classes
 *
 * Provides a hierarchy of error types for proper error handling
 * and user-friendly error messages.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', 400);
    if (details) {
      (this as any).details = details;
    }
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 'RATE_LIMIT', 429);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed', originalError?: any) {
    super(message, 'DB_ERROR', 500, false); // Not operational
    if (originalError) {
      (this as any).originalError = originalError;
    }
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string = 'External service error') {
    super(`${service}: ${message}`, 'EXTERNAL_SERVICE_ERROR', 503, false);
  }
}

export class FileProcessingError extends AppError {
  constructor(message: string) {
    super(message, 'FILE_PROCESSING_ERROR', 422);
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string) {
    super(message, 'BUSINESS_LOGIC_ERROR', 422);
  }
}

/**
 * Utility function to check if an error is operational
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Utility function to create error from Supabase error
 */
export function fromSupabaseError(error: any, context?: string): AppError {
  // Handle specific Supabase error codes
  if (error.code === 'PGRST116') {
    return new NotFoundError(context || 'Resource');
  }

  if (error.code === '23505') {
    return new ConflictError(
      context
        ? `${context} already exists`
        : 'A record with this identifier already exists'
    );
  }

  if (error.code === '23503') {
    return new ValidationError(
      context
        ? `${context} references non-existent data`
        : 'This operation references data that does not exist'
    );
  }

  if (error.code === '42501') {
    return new AuthorizationError(
      'You do not have permission to perform this operation'
    );
  }

  // Generic database error
  return new DatabaseError(
    context
      ? `Database operation failed: ${context}`
      : 'Database operation failed',
    error
  );
}
