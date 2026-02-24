/**
 * API Response Helpers for api-management routes.
 *
 * Standardizes the response envelope used by all api-management endpoints:
 * - Paginated: { data, count, pagination: { page, limit, total, totalPages } }
 * - Success:   { data }
 * - Error:     { error }
 *
 * All responses include CORS headers.
 */

import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';

/**
 * Paginated list response.
 * Matches the envelope pattern used by existing api-management routes.
 */
export function paginatedResponse<T>(
  data: T[],
  count: number,
  page: number,
  limit: number
): NextResponse {
  return NextResponse.json(
    {
      data: data ?? [],
      count: count ?? 0,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    },
    { headers: corsHeaders }
  );
}

/**
 * Single item or non-paginated success response.
 */
export function successApiResponse<T>(
  data: T,
  status: number = 200
): NextResponse {
  return NextResponse.json(
    { data },
    { status, headers: corsHeaders }
  );
}

/**
 * Error response with CORS headers.
 */
export function errorResponse(
  message: string,
  status: number = 400
): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: corsHeaders }
  );
}

/**
 * Created response (201) for POST operations.
 */
export function createdResponse<T>(data: T): NextResponse {
  return successApiResponse(data, 201);
}

/**
 * No content response (204) for DELETE operations.
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
