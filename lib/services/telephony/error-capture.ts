/**
 * Telephony pipeline error capture — server-only helper.
 *
 * SERVER-ONLY: this module instantiates a Supabase service-role client which
 * uses SUPABASE_SERVICE_ROLE_KEY (never exposed to client bundles). It MUST
 * NOT be imported from any client component / "use client" file. If a
 * client surface ever needs to log telemetry, route it through an API endpoint
 * that calls this helper server-side.
 *
 * Memory rule: feedback_shared_lib_must_ship_server_and_client_variants.md —
 * shared libs that need cross-context use ship -server / -client variants. This
 * one is INTENTIONALLY server-only; the entire calling surface (webhook
 * handlers, pipeline service, cron) is server-side. No client variant exists
 * or should be created.
 *
 * What it does (dual-write, fire-and-forget):
 *   1. Sentry.captureException — for alert routing + dashboards
 *   2. INSERT into pipeline_errors — for durable timeline + Director triage UI
 *
 * Both writes are non-blocking: errors inside this helper are themselves
 * caught and console.error'd. Pipeline return paths must remain unchanged.
 *
 * Background — see .claude/research/probe-pipeline-2026-05-03.md: 27-day
 * silent-failure history (every analyzeCall returning HTTP 400, every
 * intel row pinned at 'submitted', zero transcripts ever delivered) was
 * invisible because the only signal was console.error → Vercel 24h log
 * retention. After this lands, the same failure would surface on day 1
 * via Sentry alert + a queryable pipeline_errors row.
 */

import * as Sentry from '@sentry/nextjs';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type PipelineErrorSurface =
  | 'webhook'
  | 'pipeline'
  | 'cron'
  | 'intelligence_callback'
  | 'heartbeat';

export interface PipelineErrorContext {
  callSid?: string | null;
  callLogId?: string | null;
  institutionId?: string | null;
  /** Free-form structured context — request_id, exotel_code, payload snippet, etc. */
  extra?: Record<string, unknown>;
}

/**
 * Capture a pipeline error to Sentry + pipeline_errors table.
 *
 * Fire-and-forget: callers should NOT `await` this in hot paths if they
 * care about throughput. Both writes are best-effort; failures are logged
 * but never thrown.
 *
 * @param surface  Which pipeline phase produced the error (whitelisted).
 * @param error    The thrown value (may be Error, string, or unknown).
 * @param context  Optional correlation IDs + structured extras.
 */
export async function capturePipelineError(
  surface: PipelineErrorSurface,
  error: unknown,
  context: PipelineErrorContext = {},
): Promise<void> {
  const errorMessage = errorToMessage(error);
  const errorClass = errorToClass(error);

  // (a) Sentry — non-blocking, swallows internal failures.
  try {
    const sentryError = error instanceof Error
      ? error
      : new Error(errorMessage);
    Sentry.captureException(sentryError, {
      tags: {
        surface,
        // Prefer call_sid as the primary correlation tag — matches the
        // Exotel-side identifier humans grep for.
        ...(context.callSid ? { call_sid: context.callSid } : {}),
      },
      extra: {
        call_log_id: context.callLogId ?? null,
        institution_id: context.institutionId ?? null,
        error_class: errorClass,
        ...(context.extra ?? {}),
      },
    });
  } catch (sentryErr) {
    console.error('[error-capture] Sentry write failed:', sentryErr);
  }

  // (b) pipeline_errors INSERT — non-blocking, swallows internal failures.
  try {
    const supabase = createServiceRoleClient();
    const { error: insertErr } = await supabase
      .from('pipeline_errors')
      .insert({
        surface,
        call_sid: context.callSid ?? null,
        call_log_id: context.callLogId ?? null,
        institution_id: context.institutionId ?? null,
        error_class: errorClass,
        error_message: errorMessage.substring(0, 4000), // safety cap
        context: context.extra ?? null,
      });
    if (insertErr) {
      console.error('[error-capture] pipeline_errors insert failed:', insertErr);
    }
  } catch (dbErr) {
    console.error('[error-capture] pipeline_errors fatal write error:', dbErr);
  }
}

/**
 * Synchronous fire-and-forget wrapper for hot paths that can't afford the
 * await. Returns immediately; the dual-write runs in background. Callers
 * must NOT await the returned Promise (it never throws by design).
 */
export function capturePipelineErrorAsync(
  surface: PipelineErrorSurface,
  error: unknown,
  context: PipelineErrorContext = {},
): void {
  void capturePipelineError(surface, error, context).catch(() => {
    /* swallowed — capturePipelineError already logs internally */
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function errorToClass(error: unknown): string {
  if (error instanceof Error) return error.constructor.name || 'Error';
  if (typeof error === 'string') return 'string';
  return typeof error;
}
