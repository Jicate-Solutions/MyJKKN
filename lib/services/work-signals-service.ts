// =====================================================================
// Work-signals spine — client service (Phase 1)
// =====================================================================
// Single entry point every surface uses to read a person's canonical
// work-signals from fn_work_signals_for(from, to). Mirrors the PDEService /
// SessionFeedbackService pattern (static methods over the browser client).
//
// Self-scoped: the engine reads auth.uid(); this service never passes a subject
// id, so a caller only ever sees their OWN signals. Cross-person / leadership
// aggregation is a separate, permission-gated service (later phase).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { WorkSignalsResult } from '@/types/work-signals';

const getSupabase = (): any => createClientSupabaseClient();

export class WorkSignalsService {
  /**
   * The caller's own work-signals over an optional date range. Omit the range
   * to use the engine default (last 30 days, IST). Decorative surface: any
   * failure returns null and the card simply doesn't render.
   *
   * @param from ISO date 'YYYY-MM-DD' (inclusive). Optional.
   * @param to   ISO date 'YYYY-MM-DD' (inclusive). Optional.
   */
  static async getWorkSignals(
    from?: string,
    to?: string,
  ): Promise<WorkSignalsResult | null> {
    try {
      const supabase = getSupabase();
      // Guard against a hung RPC: a decorative widget must never spin its
      // skeleton forever. Race the call against a 10s timeout that resolves to
      // a null result, so the card degrades to "not rendered" instead.
      const rpc = supabase.rpc('fn_work_signals_for', {
        p_from: from ?? null,
        p_to: to ?? null,
      });
      const timeout = new Promise<{ data: null; error: { message: string } }>(
        (resolve) =>
          setTimeout(
            () => resolve({ data: null, error: { message: 'work-signals rpc timeout' } }),
            10000,
          ),
      );
      const { data, error } = (await Promise.race([rpc, timeout])) as {
        data: unknown;
        error: unknown;
      };
      if (error) {
        logger.warn('work-signals', 'work-signals load failed', error);
        return null;
      }
      return (data ?? null) as WorkSignalsResult | null;
    } catch (err) {
      logger.warn('work-signals', 'work-signals load failed', err);
      return null;
    }
  }
}
