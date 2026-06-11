// app/(routes)/ai-pulse/my-pulse/_components/pde-progress-card.tsx
// Created: 2026-06-11 — AI Pulse → PDE bridge (Lane C, learner read path)
//
// Learner-facing card on /ai-pulse/my-pulse: shows the learner's OWN
// pde_demonstrations rows bridged from AI Pulse signals (evidence.source =
// 'ai_pulse', written by the Lane-A bridge service). Renders category counts
// with plain-English labels plus the most recent demonstrations.
//
// RLS: pde_demonstrations_learner_own (migration 20260518_pde_demonstrations_table.sql)
// — learner_id = auth.uid() — so the browser client reads only the user's rows.
//
// Pattern reference: ./pulse-impact-card.tsx (card shape + React Query).
// Service logic is intentionally INLINE (Lane A owns lib/services this run).

'use client';

import { useQuery } from '@tanstack/react-query';
import { Award, GraduationCap } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'ai-pulse/pde-bridge';

// ============================================================================
// Types
// ============================================================================

export interface PdeDemonstrationRow {
  id: string;
  category_key: string;
  skill_name: string | null;
  status: string;
  raw_score: number | null;
  weighted_score: number | null;
  passed: boolean | null;
  created_at: string;
}

// Plain-English labels for the bridge's four AI Pulse categories.
// Other PDE categories shouldn't appear from the bridge but degrade gracefully.
const CATEGORY_LABELS: Record<string, string> = {
  embodied: 'Tool Practice',
  problem_finding: 'Domain Application',
  social_leadership: 'Peer Training',
  cultural_civic: 'Public Work',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  validated: 'Validated',
  scored: 'Scored',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, ' ');
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'validated':
    case 'scored':
      return 'gap-1 border-green-600 text-green-600';
    case 'rejected':
    case 'withdrawn':
      return 'gap-1 border-destructive text-destructive';
    default:
      return 'gap-1';
  }
}

/** Display score: weighted wins over raw; null when neither present. */
function displayScore(row: PdeDemonstrationRow): number | null {
  return row.weighted_score ?? row.raw_score ?? null;
}

// ============================================================================
// Inline data hook (no new lib/services file — Lane A owns that namespace)
// ============================================================================

async function fetchMyPdeProgress(): Promise<PdeDemonstrationRow[]> {
  // pde_demonstrations + auth user are not in generated types → untyped cast.
  const supabase = createClientSupabaseClient() as any;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    logger.error(MODULE, 'auth.getUser failed for PDE progress card', userError);
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('pde_demonstrations')
    .select(
      'id, category_key, skill_name, status, raw_score, weighted_score, passed, created_at'
    )
    .eq('learner_id', userData.user.id)
    .eq('evidence->>source', 'ai_pulse')
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) {
    logger.error(MODULE, 'pde_demonstrations read failed', error);
    throw new Error(error.message ?? 'Failed to load PDE progress');
  }

  return (data ?? []) as PdeDemonstrationRow[];
}

export function useMyPdeProgress() {
  return useQuery<PdeDemonstrationRow[], Error>({
    queryKey: ['ai-pulse', 'pde-progress'],
    queryFn: fetchMyPdeProgress,
    staleTime: 60_000,
  });
}

// ============================================================================
// Card
// ============================================================================

export function PdeProgressCard() {
  const { data, isLoading, error } = useMyPdeProgress();

  const rows = data ?? [];

  // Counts by category across the fetched (most recent) rows.
  const categoryCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category_key] = (acc[row.category_key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">PDE Progress</CardTitle>
        </div>
        <CardDescription>
          AI Pulse work credited toward your PDE capability profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading PDE progress…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            Couldn’t load your PDE progress. Please try again later.
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Your AI Pulse achievements will appear on your PDE profile once the
            bridge is enabled.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(categoryCounts).map(([key, count]) => (
                <Badge key={key} variant="secondary" className="gap-1">
                  {categoryLabel(key)}
                  <span className="font-semibold">{count}</span>
                </Badge>
              ))}
            </div>
            <div className="space-y-2">
              {rows.map((row) => {
                const score = displayScore(row);
                return (
                  <div
                    key={row.id}
                    className="flex items-start justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.skill_name ?? categoryLabel(row.category_key)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {categoryLabel(row.category_key)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {score !== null && (
                        <Badge variant="outline" className="gap-1">
                          <Award className="h-3 w-3" />
                          {score.toLocaleString('en-IN')}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(row.status)}
                      >
                        {statusLabel(row.status)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
