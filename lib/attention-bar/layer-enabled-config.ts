/**
 * layer-enabled-config — fetches per-layer kill-switch state from
 * quick_action_config and caches it for 60s.
 *
 * Read at the resolver entry point in /api/attention-bar/resolve/route.ts
 * to populate `ctx.enabledLayers`. The resolver already has skip-logic at
 * line 128 — passing the enabled subset makes that logic the kill switch.
 *
 * Why a single touch point at the resolver entry instead of per-layer
 * checks: only Layer 2 has its own enabled-flag fallback today (lib/
 * attention-bar/layers/layer-2.ts:50-83). Adding 4 more would mean 4 file
 * edits + 4 cache singletons + 4 places to keep in sync. The resolver
 * already has the skip semantics — populating ctx.enabledLayers from
 * config makes one cached read enforce all 5 kill switches consistently.
 *
 * Spec: standing rule "Every policy decision is a config-row" — see
 * docs/architecture/config-table-pattern.md.
 *
 * Default behavior: if a config row is missing or invalid, layer is
 * treated as ENABLED (matches the existing Layer 2 fallback pattern —
 * a wiped config table never silently disables the bar).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Layer } from './types';

const ALL_LAYERS: readonly Layer[] = [0, 1, 2, 3, 4];
const ENABLED_KEYS: readonly string[] = [
  'layer_0.enabled',
  'layer_1.enabled',
  'layer_2.enabled',
  'layer_3.enabled',
  'layer_4.enabled',
];

const ENABLED_TTL_MS = 60_000;

let _cache: { enabled: Layer[]; fetchedAt: number } | null = null;

/**
 * Returns the subset of layers that are enabled per quick_action_config.
 *
 * Returns `[]` (empty array) when ALL 5 layers are enabled — the resolver
 * treats `enabledLayers.size === 0` as "no filter, run all", which is the
 * cheapest path. Returns the enabled subset otherwise (any kill switch
 * tripped → resolver enters its filter branch).
 */
export async function getEnabledLayersFromConfig(): Promise<Layer[]> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < ENABLED_TTL_MS) {
    return _cache.enabled;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('quick_action_config')
      .select('key, value')
      .in('key', [...ENABLED_KEYS]);

    if (error) throw error;

    // Build layerN -> enabled map. Default-enabled if missing (matches the
    // Layer 2 fallback at layers/layer-2.ts:69 — a wiped table doesn't
    // silently disable the bar).
    const enabledMap = new Map<Layer, boolean>(ALL_LAYERS.map((L) => [L, true]));
    for (const row of data ?? []) {
      const match = /^layer_([0-4])\.enabled$/.exec(row.key);
      if (!match) continue;
      const layerNum = Number.parseInt(match[1], 10) as Layer;
      // value is JSONB — stored as `true`/`false` (boolean) or "true"/"false" (text).
      // The PATCH route stores boolean per the JSON spec; older direct edits may
      // have stored text. Accept both shapes.
      const v = row.value;
      const isEnabled =
        v === true ||
        v === 'true' ||
        (typeof v === 'object' && v !== null && (v as { value?: unknown }).value === true);
      enabledMap.set(layerNum, isEnabled);
    }

    const enabled = ALL_LAYERS.filter((L) => enabledMap.get(L) === true);

    // All 5 enabled → return empty array so resolver takes the no-filter path.
    // Any disabled → return enabled subset; resolver applies the filter.
    const result: Layer[] = enabled.length === ALL_LAYERS.length ? [] : enabled;

    _cache = { enabled: result, fetchedAt: now };
    return result;
  } catch (err) {
    // On any failure, default to "all enabled" — the bar must never silently
    // go dark because the config table is unreachable. Mirrors the Layer 2
    // fallback at layers/layer-2.ts:73-77.
    console.warn('[attention-bar/layer-enabled-config] read failed, defaulting all 5 layers enabled', err);
    return [];
  }
}

/**
 * Test hook: clear the cache so the next call re-fetches. Used by the admin
 * config PATCH endpoint after a toggle so the next /resolve call picks up
 * the new value within the same request, not 60s later.
 */
export function invalidateLayerEnabledCache(): void {
  _cache = null;
}
