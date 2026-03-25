// ============================================
// USAGE TRACKING MIDDLEWARE
// ============================================
// Created: 2026-02-06
// Updated: 2026-02-06 - Use Supabase cookie-based auth; support both Request and NextRequest
// Purpose: Higher-order function that wraps API route handlers
//          to track usage events in a fire-and-forget manner
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { mapUrlToModule } from './url-module-mapper';
import { UsageTrackingService } from '@/lib/services/analytics/usage-tracking-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Flexible handler types to support both Request and NextRequest route signatures
type NextRouteHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse | Response> | NextResponse | Response;

type RequestRouteHandler = (
  request: Request,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse | Response> | NextResponse | Response;

/**
 * Wraps an API route handler with usage tracking.
 * The tracking insert is fire-and-forget (non-blocking).
 * User identity is extracted from Supabase session cookies.
 *
 * @example
 * // In an API route using NextRequest:
 * import { withUsageTracking } from '@/lib/middleware/usage-tracking-middleware';
 *
 * async function handler(request: NextRequest) {
 *   return NextResponse.json({ data });
 * }
 * export const GET = withUsageTracking(handler);
 *
 * @example
 * // In an API route using Request:
 * async function handler(request: Request) {
 *   return NextResponse.json({ data });
 * }
 * export const POST = withUsageTracking(handler);
 */
export function withUsageTracking(handler: NextRouteHandler | RequestRouteHandler): NextRouteHandler {
  return async (request: NextRequest, context?) => {
    // Execute the original handler first - tracking must NOT affect the response
    const response = await (handler as NextRouteHandler)(request, context);

    // Fire-and-forget: track the event asynchronously
    try {
      const url = request.nextUrl.pathname;
      const method = request.method;
      const mapping = mapUrlToModule(url, method);

      if (mapping) {
        // Extract user from Supabase session cookies (same pattern as API routes)
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          // Fetch profile for institution/department/role context
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, institution_id, department_id')
            .eq('id', user.id)
            .single();

          // Non-blocking insert
          UsageTrackingService.trackFromMiddleware({
            url,
            method,
            userId: user.id,
            institutionId: profile?.institution_id || undefined,
            departmentId: profile?.department_id || undefined,
            role: profile?.role || undefined,
          }).catch(() => {
            // Silently ignore tracking errors - must never affect API response
          });
        }
      }
    } catch {
      // Silently ignore any tracking errors
    }

    return response as NextResponse;
  };
}
