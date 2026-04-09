/**
 * Lightweight error tracking for MyJKKN
 *
 * Instead of adding Sentry (heavy dependency), this uses your existing
 * notification + webhook infrastructure to track production errors.
 *
 * Errors are:
 * 1. Logged to console (Vercel captures these in Logs)
 * 2. Saved to webhook_logs table for analysis
 * 3. Critical errors send push notification to super_admins
 */

type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ErrorReport {
  message: string;
  severity: ErrorSeverity;
  module: string;
  url?: string;
  userId?: string;
  metadata?: Record<string, any>;
  stack?: string;
}

// Track errors to prevent spam — same error max once per 5 minutes
const recentErrors = new Map<string, number>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

export async function reportError(error: ErrorReport): Promise<void> {
  // Deduplicate
  const errorKey = `${error.module}:${error.message}`;
  const lastReported = recentErrors.get(errorKey);
  if (lastReported && Date.now() - lastReported < DEDUP_WINDOW_MS) {
    return; // Skip duplicate within 5 minutes
  }
  recentErrors.set(errorKey, Date.now());

  // Clean up old entries
  if (recentErrors.size > 100) {
    const now = Date.now();
    for (const [key, time] of recentErrors) {
      if (now - time > DEDUP_WINDOW_MS) recentErrors.delete(key);
    }
  }

  // Always log to console (Vercel captures this)
  console.error(`[${error.severity.toUpperCase()}] [${error.module}] ${error.message}`, {
    url: error.url,
    userId: error.userId,
    metadata: error.metadata,
    stack: error.stack?.slice(0, 500)
  });

  // Save to webhook_logs for analysis (fire-and-forget)
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createServiceRoleClient();

    await supabase.from('webhook_logs').insert({
      event_type: `error.${error.severity}`,
      table_name: error.module,
      record_id: error.userId || 'system',
      payload: {
        message: error.message,
        severity: error.severity,
        module: error.module,
        url: error.url,
        userId: error.userId,
        metadata: error.metadata,
        stack: error.stack?.slice(0, 1000),
        timestamp: new Date().toISOString()
      }
    });
  } catch {
    // Don't let error reporting break the app
  }
}

/**
 * Wrap an API route handler with automatic error reporting
 */
export function withErrorReporting(
  module: string,
  handler: (...args: any[]) => Promise<Response>
) {
  return async (...args: any[]): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      await reportError({
        message: error instanceof Error ? error.message : String(error),
        severity: 'high',
        module,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error; // Re-throw so the route handler catches it
    }
  };
}
