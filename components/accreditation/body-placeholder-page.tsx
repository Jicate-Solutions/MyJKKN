// components/accreditation/body-placeholder-page.tsx
// ============================================================================
// Shared placeholder layout for body dashboards that haven't shipped yet.
// Each body route loads this with its own description + target PR. Replaced
// by the real dashboard in each body's PR (PR-A9/A10/A12/A13/A14/A15).
// ============================================================================

'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Award, BarChart3, Construction } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import type { AccreditationBodyCode } from '@/lib/services/solutions/types';

interface MetricRow {
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
}

function useBodyMetrics(bodyCode: AccreditationBodyCode) {
  return useQuery({
    queryKey: ['accreditation', 'metrics-by-body', bodyCode],
    queryFn: async (): Promise<MetricRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score')
        .eq('metric_type', bodyCode)
        .eq('is_active', true)
        .order('metric_code');
      if (error) throw error;
      return (data ?? []) as MetricRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useBodyEvidenceCount(bodyCode: AccreditationBodyCode) {
  return useQuery({
    queryKey: ['accreditation', 'evidence-by-body', bodyCode],
    queryFn: async (): Promise<number> => {
      const sb = createClientSupabaseClient() as any;
      const { count, error } = await sb
        .from('quality_evidence_mappings')
        .select('*', { count: 'exact', head: true })
        .eq('body_code', bodyCode);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function BodyPlaceholderPage({
  bodyCode,
  upcomingPR,
  description,
}: {
  bodyCode: AccreditationBodyCode;
  upcomingPR: string;
  description: string;
}) {
  const meta = ACCREDITATION_BODIES.find((b) => b.code === bodyCode);
  const { data: metrics, isLoading: mLoading } = useBodyMetrics(bodyCode);
  const { data: evidence, isLoading: eLoading } = useBodyEvidenceCount(bodyCode);

  const title = meta?.name ?? bodyCode;

  return (
    <ContentLayout title={`${bodyCode} Dashboard`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: bodyCode, href: `/accreditation/${bodyCode.toLowerCase()}` },
        ]}
      />

      <div className="space-y-6">
        <Card className={`border-2 ${meta?.accentClass ?? ''}`}>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Award className="h-6 w-6" />
                  {title}
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                  {description}
                </p>
              </div>
              <Badge variant="outline" className="gap-1 self-start">
                <Construction className="h-3.5 w-3.5" />
                Dashboard in {upcomingPR}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Metrics seeded</div>
                <div className="text-2xl font-bold">
                  {mLoading ? '—' : metrics?.length ?? 0}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Evidence rows</div>
                <div className="text-2xl font-bold">
                  {eLoading ? '—' : evidence ?? 0}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Cycle</div>
                <div className="text-sm font-semibold">{meta?.cycleLabel ?? '—'}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/accreditation">
                <Button size="sm" variant="outline">
                  Back to Hub
                </Button>
              </Link>
              <Link href="/accreditation/coverage">
                <Button size="sm" variant="outline">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Coverage matrix
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Seeded metrics peek */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seeded metrics (substrate)</CardTitle>
          </CardHeader>
          <CardContent>
            {mLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (metrics ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No {bodyCode} metrics seeded yet. Full rubric lands in {upcomingPR}.
              </div>
            ) : (
              <ul className="divide-y">
                {(metrics ?? []).map((m) => (
                  <li
                    key={m.metric_code}
                    className="flex items-start justify-between gap-3 py-2 text-sm"
                  >
                    <div className="flex-1">
                      <span className="font-mono text-xs text-muted-foreground">
                        {m.metric_code}
                      </span>{' '}
                      <span>{m.metric_name}</span>
                      {m.category && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          {m.category}
                        </Badge>
                      )}
                    </div>
                    {m.max_score !== null && (
                      <span className="text-xs text-muted-foreground">
                        {m.max_score} pts
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
