'use client';

/**
 * Mess plan options — the menu vocabulary, read LIVE from mess_categories
 * (Director decision 2026-06-12, interview Q2: the categories page drives the
 * menu system; adding a category surfaces it everywhere with no code change).
 *
 * Key = mess_categories.menu_tier_key (frozen at creation by trigger —
 * renames change the display label only, menu linkage never breaks).
 * Label = the current display name. Boys/girls rows of the same plan share
 * a key and dedupe to one option.
 *
 * Every consumer falls back to DEFAULT_MESS_PLAN_OPTIONS (today's known
 * pair) while loading or if the read fails — the menu surfaces never go
 * blank because of a config read.
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface MessPlanOption {
  /** Stable slug — matches mess_menus.tier_key. */
  key: string;
  /** Current display name from the categories page. */
  label: string;
}

/** Today's known pair — fallback while loading / on read failure. */
export const DEFAULT_MESS_PLAN_OPTIONS: MessPlanOption[] = [
  { key: 'classic', label: 'Classic' },
  { key: 'premium', label: 'Premium' },
];

export async function getMessPlanOptions(): Promise<MessPlanOption[]> {
  try {
    const supabase = createClientSupabaseClient();
    // menu_tier_key isn't in generated types yet — untyped-client cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('mess_categories')
      .select('name, menu_tier_key, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;

    const seen = new Map<string, MessPlanOption>();
    for (const row of (data ?? []) as {
      name: string;
      menu_tier_key: string | null;
      sort_order: number;
    }[]) {
      const key =
        row.menu_tier_key ?? row.name.trim().toLowerCase().replace(/\s+/g, '_');
      if (!seen.has(key)) seen.set(key, { key, label: row.name });
    }
    const options = Array.from(seen.values());
    return options.length > 0 ? options : DEFAULT_MESS_PLAN_OPTIONS;
  } catch (e) {
    logger.warn('campus-living/mess-plans', 'Plan options read failed — using defaults', e);
    return DEFAULT_MESS_PLAN_OPTIONS;
  }
}

/** Plan options with the default pair as placeholder (never undefined). */
export function useMessPlanOptions() {
  const query = useQuery({
    queryKey: ['mess', 'plan-options'],
    queryFn: getMessPlanOptions,
    staleTime: 5 * 60_000,
    placeholderData: DEFAULT_MESS_PLAN_OPTIONS,
  });
  return { ...query, options: query.data ?? DEFAULT_MESS_PLAN_OPTIONS };
}

/** Display label for a plan key (falls back to a capitalized key). */
export function planLabel(options: MessPlanOption[], key: string): string {
  return (
    options.find((o) => o.key === key)?.label ??
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
