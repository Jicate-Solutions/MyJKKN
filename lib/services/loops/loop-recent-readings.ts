// ============================================================================
// LOOP BARS — the last few recorded readings of a loop, per loop
// ============================================================================
// The bar cards on /admin/loops/charters ask the Director to type a number.
// This is the scale that number lives on: the loop's last N FINAL headline
// readings from loop_measurements, newest first.
//
// ONE READ PER LOOP, deliberately. A single ordered query with a shared
// `limit(keys × N)` lets a daily loop eat the whole budget and a weekly loop
// get nothing — and the card would then say "no readings recorded yet" about
// a loop that has run ten times (reviewer B, round 2 on #3883). N loops here
// is ≤ the registry size (43 today); N small queries are cheaper than a wrong
// empty state.
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';

type Admin = ReturnType<typeof createServiceRoleClient>;

export const RECENT_READINGS_PER_LOOP = 4;

/**
 * Last `perLoop` FINAL readings per loop key, newest first. A loop with no
 * rows maps to an empty list; on any error (pre-migration: the table does not
 * exist yet) every loop maps to an empty list — the caller renders the honest
 * "no final readings recorded for this loop yet" line, never a fake number.
 */
export async function readRecentReadings(
  admin: Admin,
  loopKeys: string[],
  perLoop: number = RECENT_READINGS_PER_LOOP
): Promise<Map<string, (number | null)[]>> {
  const out = new Map<string, (number | null)[]>();
  const keys = Array.from(new Set(loopKeys));
  if (keys.length === 0) return out;

  await Promise.all(
    keys.map(async (key) => {
      try {
        const { data, error } = await admin
          .from('loop_measurements')
          .select('value,measured_at')
          .eq('loop_key', key)
          .eq('status', 'final')
          .order('measured_at', { ascending: false })
          .limit(perLoop);
        if (error || !data) {
          out.set(key, []);
          return;
        }
        out.set(
          key,
          (data as { value: number | string | null }[]).map((row) => {
            if (row.value === null || row.value === undefined) return null;
            const n = Number(row.value);
            return Number.isFinite(n) ? n : null;
          })
        );
      } catch {
        out.set(key, []);
      }
    })
  );
  return out;
}
