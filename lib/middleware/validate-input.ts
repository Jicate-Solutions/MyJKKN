// lib/middleware/validate-input.ts
// API Route Validation Middleware
// CRITICAL: Validates ALL incoming requests before processing

import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { InputValidator } from '@/lib/utils/input-validator';

/**
 * Validation error response structure
 */
interface ValidationErrorResponse {
  error: string;
  details?: Array<{
    path: string[];
    message: string;
  }>;
  timestamp: string;
}

/**
 * Higher-order function that wraps API route handlers with validation
 *
 * Usage:
 * ```typescript
 * export const POST = withValidation(
 *   mySchema,
 *   async (req, validated) => {
 *     // validated is already type-safe and sanitized!
 *     return NextResponse.json({ success: true });
 *   }
 * );
 * ```
 *
 * @param schema - Zod schema for validation
 * @param handler - API route handler that receives validated data
 * @returns Wrapped handler with validation
 */
export function withValidation<T>(
  schema: ZodSchema<T>,
  handler: (req: NextRequest, validated: T) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // Parse request body
      let body: unknown;
      try {
        body = await req.json();
      } catch (error) {
        return createErrorResponse('Invalid JSON in request body', 400);
      }

      // Validate payload size to prevent DoS
      const bodySize = JSON.stringify(body).length;
      if (bodySize > 1000000) { // 1 MB limit
        return createErrorResponse('Request payload too large', 413);
      }

      // Validate with Zod schema
      const validated = schema.parse(body);

      // Execute handler with validated data
      return await handler(req, validated);

    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const details = error.errors.map(err => ({
          path: err.path.map(String),
          message: err.message,
        }));

        return NextResponse.json<ValidationErrorResponse>(
          {
            error: 'Validation failed',
            details,
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }

      // Handle custom validation errors
      if (error instanceof Error) {
        return createErrorResponse(error.message, 400);
      }

      // Unknown error
      console.error('[middleware/validate-input] Unexpected error:', error);
      return createErrorResponse('Internal server error', 500);
    }
  };
}

/**
 * Validation middleware for query parameters
 *
 * @param schema - Zod schema for query params
 * @param handler - API route handler
 * @returns Wrapped handler
 */
export function withQueryValidation<T>(
  schema: ZodSchema<T>,
  handler: (req: NextRequest, validated: T) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // Parse query parameters
      const { searchParams } = new URL(req.url);
      const query: Record<string, unknown> = {};

      searchParams.forEach((value, key) => {
        // Convert numeric strings to numbers
        if (!isNaN(Number(value)) && value !== '') {
          query[key] = Number(value);
        } else if (value === 'true' || value === 'false') {
          // Convert boolean strings to booleans
          query[key] = value === 'true';
        } else {
          query[key] = value;
        }
      });

      // Validate with Zod schema
      const validated = schema.parse(query);

      // Execute handler with validated data
      return await handler(req, validated);

    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(err => ({
          path: err.path.map(String),
          message: err.message,
        }));

        return NextResponse.json<ValidationErrorResponse>(
          {
            error: 'Query parameter validation failed',
            details,
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }

      if (error instanceof Error) {
        return createErrorResponse(error.message, 400);
      }

      console.error('[middleware/validate-input] Unexpected error:', error);
      return createErrorResponse('Internal server error', 500);
    }
  };
}

/**
 * Middleware to validate request body size before processing
 * Prevents DoS attacks via oversized payloads
 *
 * @param maxSize - Maximum body size in bytes
 * @param handler - API route handler
 * @returns Wrapped handler
 */
export function withBodySizeLimit(
  maxSize: number = 1000000, // 1 MB default
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const contentLength = req.headers.get('content-length');

      if (contentLength && parseInt(contentLength) > maxSize) {
        return createErrorResponse(
          `Request body too large (max ${Math.floor(maxSize / 1024)} KB)`,
          413
        );
      }

      return await handler(req);

    } catch (error) {
      console.error('[middleware/validate-input] Body size check error:', error);
      return createErrorResponse('Internal server error', 500);
    }
  };
}

/**
 * Middleware to validate file uploads
 *
 * @param options - File validation options
 * @param handler - API route handler
 * @returns Wrapped handler
 */
export function withFileValidation(
  options: {
    maxSize?: number;
    allowedTypes?: string[];
    allowedExtensions?: string[];
  },
  handler: (req: NextRequest, formData: FormData) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const formData = await req.formData();

      // Validate all files in the form data
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          try {
            InputValidator.fileUpload(
              {
                name: value.name,
                size: value.size,
                type: value.type,
              },
              options
            );
          } catch (error) {
            if (error instanceof Error) {
              return createErrorResponse(
                `File validation failed for ${key}: ${error.message}`,
                400
              );
            }
            throw error;
          }
        }
      }

      return await handler(req, formData);

    } catch (error) {
      if (error instanceof Error) {
        return createErrorResponse(error.message, 400);
      }

      console.error('[middleware/validate-input] File validation error:', error);
      return createErrorResponse('Internal server error', 500);
    }
  };
}

/**
 * Combine multiple validation middlewares
 *
 * @param middlewares - Array of middleware functions
 * @returns Combined middleware
 */
export function composeValidation(
  ...middlewares: Array<
    (handler: (req: NextRequest) => Promise<NextResponse>) =>
    (req: NextRequest) => Promise<NextResponse>
  >
) {
  return (handler: (req: NextRequest) => Promise<NextResponse>) => {
    return middlewares.reduceRight(
      (acc, middleware) => middleware(acc),
      handler
    );
  };
}

/**
 * Helper to create consistent error responses
 */
function createErrorResponse(message: string, status: number): NextResponse {
  return NextResponse.json<ValidationErrorResponse>(
    {
      error: message,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

/**
 * Rate limiting middleware (basic implementation)
 * For production, use a proper rate limiting service
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function withRateLimit(
  maxRequests: number = 100,
  windowMs: number = 60000, // 1 minute
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Get client identifier (IP or user ID from auth)
    const clientId = req.headers.get('x-forwarded-for') ||
                     req.headers.get('x-real-ip') ||
                     'unknown';

    const now = Date.now();
    const record = requestCounts.get(clientId);

    if (record) {
      if (now < record.resetTime) {
        // Within the same window
        if (record.count >= maxRequests) {
          return NextResponse.json(
            {
              error: 'Too many requests',
              retryAfter: Math.ceil((record.resetTime - now) / 1000),
              timestamp: new Date().toISOString(),
            },
            { status: 429 }
          );
        }
        record.count++;
      } else {
        // Window expired, reset
        record.count = 1;
        record.resetTime = now + windowMs;
      }
    } else {
      // First request from this client
      requestCounts.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
      });
    }

    // Clean up old entries every 1000 requests
    if (requestCounts.size > 1000) {
      for (const [key, value] of requestCounts.entries()) {
        if (now > value.resetTime + windowMs) {
          requestCounts.delete(key);
        }
      }
    }

    return await handler(req);
  };
}
