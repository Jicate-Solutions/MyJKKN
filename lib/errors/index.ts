/**
 * Error Handling System - Central Export
 *
 * Import everything you need for error handling from this file:
 *
 * import {
 *   ValidationError,
 *   NotFoundError,
 *   ErrorLogger,
 *   handleApiError,
 *   successResponse
 * } from '@/lib/errors';
 */

// Export all error classes
export {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  FileProcessingError,
  BusinessLogicError,
  isOperationalError,
  fromSupabaseError,
} from './app-errors';

// Export error logger
export { ErrorLogger, type ErrorContext } from '../utils/error-logger';

// Export API error handler
export {
  handleApiError,
  successResponse,
  withErrorHandler,
} from '../utils/api-error-handler';
