'use client';

import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe, AlertTriangle, BarChart3, Users, BookOpen, GraduationCap } from 'lucide-react';

// The 6 canonical QS indicators — 2 seeded (AR, CIT), 4 Phase 2+ placeholders
const QS_INDICATORS = [
  { code: 'AR',  label: 'Academic Reputation',    icon: BarChart3,     category: 'Reputation', weight: 40 },
  { code: 'ER',  label: 'Employer Reputation',    icon: Users,         category: 'Reputation', weight: 10 },
  { code: 'FSR', label: 'Faculty/Student Ratio',  icon: GraduationCap, category: 'Research',   weight: 20 },
  { code: 'CIT', label: 'Citations per Faculty',  icon: BookOpen,      category: 'Research',   weight: 20 },
  { code: 'ISF', label: 'International Faculty',  icon: Globe,         category: 'International', weight: 5 },
  { code: 'ISS', label: 'International Students', icon: Globe,         category: 'International', weight: 5 },
];

interface MetricRow {
  metric_code: string;
  metric_name: string;
  category: string;
  max_score: number;
  calculation_method: string;
  notes: string;
}

function useQSMetrics() {
  return useQuery<MetricRow[]>({
    queryKey: ['accreditation', 'qs', 'metrics'],
    queryFn: async () => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client');
      const sb = createClientSupabaseClient() as ReturnType<typeof createClientSupabaseClient> & {
        from: (table: string) => {
          select: (cols: string) => { eq: (col: string, val: string) => Promise<{ data: MetricRow[] | null; error: { message: string } | null }> };
        };
      };
      const { data, error } = await sb
        .from('sh_accreditation_metrics')
        .select('metric_code, metric_name, category, max_score, calculation_method, notes')
        .eq('metric_type', 'QS');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function QSPlaceholderPage() {
  const { data: metrics = [], isLoading } = useQSMetrics();

  const seededMap = new Map(metrics.map((m) => [m.metric_code, m]));

  return (
    <ContentLayout title="QS World Ranking Compliance">
      <PageBreadcrumb
        items={[
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'QS World Ranking' },
        ]}
      />

      <div className="space-y-6 p-4">
        {/* Phase banner */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold">Scaffolding placeholder.</span>{' '}
            Deep QS ranking integration lands in Phase 2 of the One JKKN One Data grand program,
            after Jan 2027.
          </p>
        </div>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">QS World Ranking Compliance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aspirational — Phase 2+ implementation post-Jan 2027
          </p>
        </div>

        {/* Indicator cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QS_INDICATORS.map(({ code, label, icon: Icon, category, weight }) => {
            const seeded = seededMap.get(code);
            const isLive = !!seeded;

            return (
              <Card key={code} className={isLive ? '' : 'opacity-60'}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={isLive ? 'default' : 'secondary'} className="text-xs">
                      {isLive ? 'Seeded' : 'Coming Phase 2+'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{category}</span>
                  </div>

                  {isLive ? (
                    <>
                      <p className="text-xs text-muted-foreground">{seeded!.calculation_method}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">—</span>
                        <span className="text-xs text-muted-foreground">/ {seeded!.max_score} pts</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Weight: {weight}% of total QS score
                      </p>
                      <p className="text-xs italic text-muted-foreground">
                        Full integration in Phase 2 (post-Jan 2027)
                      </p>
                    </>
                  )}

                  {isLoading && (
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground">
          QS indicators shown are read-only scaffolding. No write operations are performed here.
          Seeded rows originate from Compliance Unification PR-A2 (2026-04-17).
        </p>
      </div>
    </ContentLayout>
  );
}
