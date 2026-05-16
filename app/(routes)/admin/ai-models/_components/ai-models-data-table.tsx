'use client';

// ============================================================================
// AI Models Data Table — Director-facing AI feature config + usage view.
// Created: 2026-05-09. Plain-English UX (Director bar: PR #748).
//
// Shows every AI feature row with:
//   - Display name + description (plain English)
//   - Current provider + model
//   - Month-to-date cost (INR) + invocation count + success rate
//   - Last 24h cost
//   - Spend cap (INR/month) — null = no cap
//   - Edit button → AiModelEditDialog
//
// Grouped by category (admission, ai_pulse, etc).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { Pencil, RefreshCw, AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getModelLabel } from '@/lib/services/platform/ai-providers';

import { AiModelEditDialog } from './ai-model-edit-dialog';

interface FeatureRow {
  feature_key: string;
  display_name: string;
  description: string | null;
  category: string | null;
  provider: string;
  model_id: string;
  fallback_provider: string | null;
  fallback_model_id: string | null;
  monthly_spend_cap_inr: number | null;
  is_active: boolean;
  config_json: Record<string, unknown> | null;
  updated_at: string;
  updated_by: string | null;
  month_to_date_cost_inr: number;
  month_to_date_invocations: number;
  month_to_date_success_rate: number;
  last_24h_cost_inr: number;
  last_24h_invocations: number;
}

function formatInr(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function AiModelsDataTable() {
  const [features, setFeatures] = useState<FeatureRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFeature, setEditingFeature] = useState<FeatureRow | null>(null);

  const loadFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-models', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setFeatures(json.data ?? []);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Couldn't reach the AI model config server. Try refreshing.";
      toast.error(msg);
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // Group by category for the table sectioning
  const grouped = useMemo(() => {
    if (!features) return [];
    const map = new Map<string, FeatureRow[]>();
    for (const f of features) {
      const cat = f.category ?? 'uncategorized';
      const list = map.get(cat) ?? [];
      list.push(f);
      map.set(cat, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [features]);

  const totalMtdCost = useMemo(() => {
    if (!features) return 0;
    return features.reduce((sum, f) => sum + f.month_to_date_cost_inr, 0);
  }, [features]);

  const totalMtdCalls = useMemo(() => {
    if (!features) return 0;
    return features.reduce((sum, f) => sum + f.month_to_date_invocations, 0);
  }, [features]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            One row per AI-powered MyJKKN feature. Pick which provider and model run it,
            set a monthly spend cap, and watch the cost. Every change is audited.
          </p>
          <p className="text-xs text-muted-foreground">
            Month-to-date across all features:{' '}
            <span className="font-medium text-foreground">{formatInr(totalMtdCost)}</span>{' '}
            from <span className="font-medium text-foreground">{totalMtdCalls.toLocaleString('en-IN')}</span> invocations
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadFeatures}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && !features ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !features || features.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No AI features configured yet. The seed migration should populate 5 default rows
          on first apply.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, rows]) => (
            <section key={category}>
              <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {category}
              </h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Feature</TableHead>
                      <TableHead>Current Model</TableHead>
                      <TableHead className="text-right">This month</TableHead>
                      <TableHead className="text-right">Last 24h</TableHead>
                      <TableHead className="text-right">Cap (INR/mo)</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((f) => {
                      const overCap =
                        f.monthly_spend_cap_inr !== null &&
                        f.month_to_date_cost_inr > f.monthly_spend_cap_inr;
                      const lowSuccess = f.month_to_date_invocations > 0 && f.month_to_date_success_rate < 0.9;
                      return (
                        <TableRow key={f.feature_key} className={overCap ? 'bg-destructive/5' : undefined}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <div className="font-medium">{f.display_name}</div>
                              {f.description && (
                                <div className="text-xs text-muted-foreground">{f.description}</div>
                              )}
                              <div className="text-xs text-muted-foreground/70 font-mono">
                                {f.feature_key}
                              </div>
                              {!f.is_active && (
                                <Badge variant="outline" className="mt-1">Inactive</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <div className="text-sm">
                                {getModelLabel(f.provider, f.model_id)}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {f.provider} · {f.model_id}
                              </div>
                              {f.fallback_provider && f.fallback_model_id && (
                                <div className="text-xs text-muted-foreground">
                                  Fallback: {f.fallback_provider} · {f.fallback_model_id}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-0.5">
                              <div className="font-medium">{formatInr(f.month_to_date_cost_inr)}</div>
                              <div className="text-xs text-muted-foreground">
                                {f.month_to_date_invocations.toLocaleString('en-IN')} calls
                              </div>
                              {f.month_to_date_invocations > 0 && (
                                <div className={`text-xs ${lowSuccess ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                  {formatPercent(f.month_to_date_success_rate)} success
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-0.5">
                              <div className="text-sm">{formatInr(f.last_24h_cost_inr)}</div>
                              <div className="text-xs text-muted-foreground">
                                {f.last_24h_invocations.toLocaleString('en-IN')} calls
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {f.monthly_spend_cap_inr === null ? (
                              <span className="text-sm text-muted-foreground">No cap</span>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="text-sm">{formatInr(f.monthly_spend_cap_inr)}</div>
                                {overCap && (
                                  <div className="flex items-center justify-end gap-1 text-xs text-destructive">
                                    <AlertTriangle className="h-3 w-3" />
                                    Over cap
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingFeature(f)}
                              aria-label={`Edit ${f.display_name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      <AiModelEditDialog
        open={!!editingFeature}
        onOpenChange={(open) => {
          if (!open) setEditingFeature(null);
        }}
        feature={editingFeature}
        onSaved={() => {
          setEditingFeature(null);
          loadFeatures();
        }}
      />
    </div>
  );
}
