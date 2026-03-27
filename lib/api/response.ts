// lib/api/response.ts
// Standardized API response helpers for admission module API routes
// Provides consistent response envelopes across all endpoints

import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';

// ============================================================================
// SUCCESS RESPONSES
// ============================================================================

/**
 * Return a successful JSON response with data envelope.
 * Pattern: { success: true, data: T }
 */
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(
    { success: true, data },
    { status, headers: corsHeaders }
  );
}

/**
 * Return a 201 Created response with data envelope.
 */
export function createdResponse<T>(data: T) {
  return successResponse(data, 201);
}

/**
 * Return a paginated response with metadata.
 * Pattern: { success: true, data: T[], metadata: { page, limit, total, totalPages } }
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return NextResponse.json(
    {
      success: true,
      data,
      metadata: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
    { status: 200, headers: corsHeaders }
  );
}

// ============================================================================
// ERROR RESPONSES
// ============================================================================

/**
 * Return an error response with consistent format.
 * Pattern: { success: false, error: string, message: string }
 */
export function errorResponse(
  message: string,
  status = 500,
  errorCode?: string
) {
  return NextResponse.json(
    {
      success: false,
      error: errorCode || httpStatusToCode(status),
      message,
    },
    { status, headers: corsHeaders }
  );
}

/** 401 Unauthorized */
export function unauthorizedResponse(message = 'Authentication required') {
  return errorResponse(message, 401, 'UNAUTHORIZED');
}

/** 403 Forbidden */
export function forbiddenResponse(message = 'Insufficient permissions') {
  return errorResponse(message, 403, 'FORBIDDEN');
}

/** 404 Not Found */
export function notFoundResponse(resource = 'Resource') {
  return errorResponse(`${resource} not found`, 404, 'NOT_FOUND');
}

/** 409 Conflict (duplicate, constraint violation) */
export function conflictResponse(message: string) {
  return errorResponse(message, 409, 'CONFLICT');
}

/** 422 Validation Error */
export function validationErrorResponse(message: string) {
  return errorResponse(message, 422, 'VALIDATION_ERROR');
}

// ============================================================================
// CORS PREFLIGHT
// ============================================================================

/** Handle OPTIONS preflight requests */
export function optionsResponse() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ============================================================================
// POSTGRES ERROR MAPPING
// ============================================================================

/**
 * Map Supabase/Postgres error codes to HTTP responses.
 * Common codes: 23505 = unique violation, 23503 = FK violation, 42501 = RLS denied
 */
export function handleSupabaseError(error: { code?: string; message?: string }) {
  const code = error.code || '';
  const message = error.message || 'Database error';

  switch (code) {
    case '23505':
      return conflictResponse('A record with this data already exists');
    case '23503':
      return errorResponse('Referenced record does not exist', 400, 'FK_VIOLATION');
    case '42501':
      return forbiddenResponse('Row-level security policy denied access');
    case 'PGRST116':
      return notFoundResponse('Record');
    default:
      return errorResponse(message, 500, 'DATABASE_ERROR');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function httpStatusToCode(status: number): string {
  const codes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
  };
  return codes[status] || 'INTERNAL_ERROR';
}

// ============================================================================
// PAGINATION HELPERS
// ============================================================================

/** Extract pagination params from URL search params with defaults */
export function getPaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/** Extract a string param, returning undefined if not present */
export function getStringParam(searchParams: URLSearchParams, key: string): string | undefined {
  const val = searchParams.get(key);
  return val && val.trim() ? val.trim() : undefined;
}

/** Extract a boolean param */
export function getBoolParam(searchParams: URLSearchParams, key: string): boolean | undefined {
  const val = searchParams.get(key);
  if (val === 'true') return true;
  if (val === 'false') return false;
  return undefined;
}
