'use client';

// ============================================================================
// Model + spend chip — cross-link from /admin/ai-routines to /admin/ai-models.
// For a routine with a featureKey, shows which model its config row currently
// selects and the month-to-date spend, linking to the AI Models page.
//
// Degrades gracefully by design: if GET /api/admin/ai-models fails (network,
// 403, 500) or the routine's featureKey has no row, NOTHING extra renders —
// no crash, no toast. The page must never get noisier because the config
// API is unreachable.
// ============================================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type ModelConfigEntry = {
  modelId: string;
  mtdCostInr: number;
};

/**
 * Loads the AI model config list once and returns Map<feature_key, entry>.
 * Any failure (non-2xx, network, bad JSON) resolves to an empty map — silent.
 */
export function useModelConfigMap(): Map<string, ModelConfigEntry> {
  const [map, setMap] = useState<Map<string, ModelConfigEntry>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/admin/ai-models', { cache: 'no-store' });
        if (!resp.ok) return; // 403/500 → chips simply don't render
        const json = await resp.json();
        const rows = Array.isArray(json?.data) ? json.data : [];
        const m = new Map<string, ModelConfigEntry>();
        for (const row of rows) {
          if (typeof row?.feature_key === 'string' && typeof row?.model_id === 'string') {
            m.set(row.feature_key, {
              modelId: row.model_id,
              mtdCostInr:
                typeof row.month_to_date_cost_inr === 'number' && Number.isFinite(row.month_to_date_cost_inr)
                  ? row.month_to_date_cost_inr
                  : 0,
            });
          }
        }
        if (!cancelled) setMap(m);
      } catch {
        // silent — no chips, no error UI
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}

function fmtInr(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * The chip itself. Renders nothing when the routine has no featureKey or the
 * config API didn't return a row for it.
 */
export function ModelChip({
  featureKey,
  configMap,
}: {
  // null = explicitly unlinked (AIRoutine.featureKeyNote says why); the
  // falsy check below renders nothing for both null and undefined.
  featureKey?: string | null;
  configMap: Map<string, ModelConfigEntry>;
}) {
  if (!featureKey) return null;
  const entry = configMap.get(featureKey);
  if (!entry) return null;

  return (
    <Link
      href="/admin/ai-models"
      title={`Model config row '${featureKey}' — change it on the AI Models page`}
      className="inline-flex"
    >
      <Badge
        variant="outline"
        className="gap-1 font-mono text-[11px] font-normal text-muted-foreground hover:border-[#0b6d41] hover:text-[#0b6d41]"
      >
        <Cpu className="h-3 w-3" />
        {entry.modelId} · {fmtInr(entry.mtdCostInr)} MTD
      </Badge>
    </Link>
  );
}
