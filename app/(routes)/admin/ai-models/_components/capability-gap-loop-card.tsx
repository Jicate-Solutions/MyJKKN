'use client';

// ============================================================================
// Capability-Gap Loop card — the "Capability-Gap Loop" tab body on
// /admin/ai-models. Added 2026-07-14.
//
// Governance surface: shows the AI assistant's capability-gap loop as a
// first-class, VERIFIED self-improving loop on the AI config page, and links
// out to where it's operated (the Capability Gaps tab) and governed (the Loop
// Control Tower). This is a READ-ONLY summary — it never triages, sets status,
// or dispatches a fix; those live on /ai-query/admin.
//
// Live counts are fetched client-side via fn_capgap_list (SECDEF, super-gated).
// The page already wraps this in <SuperAdminOnly>, so only a super-admin ever
// mounts it. If the RPC is unavailable the card degrades to a static summary +
// links rather than blocking — the explainer and proof are true regardless.
//
// Fns are not in generated types → the (supabase as any).rpc(...) cast is the
// repo's standard pattern for SECDEF RPCs (mirrors capability-gaps-tab.tsx).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sparkles,
  Loader2,
  TrendingDown,
  ArrowRight,
  ArrowUpRight,
  ShieldQuestion,
  CheckCircle2,
  Repeat,
} from 'lucide-react';

interface CapGapStats {
  open: number;
  resolved: number;
  total: number;
  refusals_week: number;
}

// The five stages of the loop, rendered as a pipeline strip.
const LOOP_STAGES = [
  'Detect refusals',
  'Cluster by demand',
  'Triage gap-class',
  'Human-gated fix',
  'Measure the drop',
] as const;

export function CapabilityGapLoopCard() {
  const [stats, setStats] = useState<CapGapStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveOk, setLiveOk] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('fn_capgap_list', {
        p_status: null,
        p_limit: 100,
      });
      if (error || !data || data.success === false) {
        setLiveOk(false);
        setStats(null);
      } else {
        setLiveOk(true);
        setStats((data.data?.stats ?? null) as CapGapStats | null);
      }
    } catch {
      // Non-blocking: the explainer + proof + links stand on their own.
      setLiveOk(false);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="rounded-md border bg-muted/40 p-2">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                AI Assistant — Capability-Gap Loop
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-100 text-[10px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-300"
                >
                  verified self-improving loop
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Mines the assistant&rsquo;s chat log for questions it
                couldn&rsquo;t answer for learners, clusters them, and measurably
                closes the gaps — a verified self-improving loop, not a dashboard.
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Loop pipeline strip */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {LOOP_STAGES.map((stage, i) => (
              <span key={stage} className="flex items-center gap-1.5">
                <span className="rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium">
                  {stage}
                </span>
                {i < LOOP_STAGES.length - 1 && (
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                )}
              </span>
            ))}
          </div>

          {/* Proof line — the moat that was actually verified on prod */}
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm text-emerald-900 dark:text-emerald-100">
              <span className="font-medium">Proven moat (2026-07-14):</span> the{' '}
              <code className="rounded border bg-background/70 px-1 py-0.5 font-mono text-xs">
                billing.fee_defaulters
              </code>{' '}
              gap went from <span className="font-semibold">100% refused</span> to{' '}
              <span className="font-semibold">0% refused</span> after its fix — the
              loop auto-measured the drop and closed the gap on the next cycle.
            </p>
          </div>

          {/* Live counts (graceful degrade) */}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading live counts…
            </div>
          ) : liveOk && stats ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Open gaps</span>
                  <ShieldQuestion className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="mt-1 text-2xl font-bold">{stats.open}</div>
                <p className="text-xs text-muted-foreground">Unresolved clusters</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Resolved</span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="mt-1 text-2xl font-bold">{stats.resolved}</div>
                <p className="text-xs text-muted-foreground">Closed by a fix</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Refusals this week
                  </span>
                  <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="mt-1 text-2xl font-bold">{stats.refusals_week}</div>
                <p className="text-xs text-muted-foreground">Last 7 days</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Live counts are unavailable right now. Open the Capability Gaps tab
              for the current clusters.
            </p>
          )}

          <Separator />

          {/* Links out — operate it, and see it governed */}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href="/ai-query/admin">
                Open Capability Gaps
                <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/loops">
                View in Loop Tower
                <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
