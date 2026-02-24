// lib/api/response.ts
// Standardized response helpers for Solutions Hub API routes.
// Uses { data, metadata } envelope (NOT the api-management { data, pagination } shape).

import { NextResponse } from 'next/server'
import { corsHeaders } from '@/lib/api-keys/cors'

/**
 * Paginated list response with metadata envelope.
 */
export function paginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return NextResponse.json({
    data: data ?? [],
    metadata: {
      page,
      limit,
      total,
      totalPages: total ? Math.ceil(total / limit) : 0,
    },
  }, { headers: corsHeaders })
}

/**
 * Single item or mutation success response.
 */
export function successApiResponse<T>(data: T, status: number = 200) {
  return NextResponse.json({ data }, { status, headers: corsHeaders })
}

/**
 * Created (201) response.
 */
export function createdResponse<T>(data: T) {
  return successApiResponse(data, 201)
}

/**
 * Error response with message.
 */
export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status, headers: corsHeaders })
}

/**
 * No content (204) response for successful deletes.
 */
export function noContentResponse() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
