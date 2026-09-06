'use client';

/**
 * /campus-living/wellness — Student Wellness warden dashboard.
 *
 * Wired 2026-05-21 (Agent o). Replaces ComingSoon. Reads
 * hostel_pulse_responses (joined with hostel_pulse_configs) and renders:
 *   - KPI tiles (active surveys, response count, critical count)
 *   - Mood × period heatmap (client-side aggregation)
 *   - Critical-flag inbox (mood <= threshold)
 *   - Recent responses list
 *
 * Per-institution scope via useAuth().profile.institution_id; super-admin
 * without an institution_id sees an empty-state prompt.
 *
 * Anonymity: when the config's anonymous_mode is on, the warden UI hides
 * learner identifiers in favor of an anon token (see CriticalFlagRow).
 * DB rows still carry learner_id — this is UI-level anonymity for v1.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  HeartPulse,
  Info,
  Loader2,
  Settings2,
  TrendingDown,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import {
  usePulseConfigs,
  usePulseResponses,
} from '@/hooks/campus-living/use-wellness';
import { WellnessService } from '@/lib/services/campus-living/wellness-service';
import { PULSE_FREQUENCY_LABELS } from '@/types/campus-living/wellness';
import { ResponseHeatmap } from './_components/response-heatmap';
import { CriticalFlagRow } from './_components/critical-flag-row';

export const navMeta = {
  invokedFrom: '/campus-living',
} as const;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function CampusLivingWellnessPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? undefined;

  const {
    data: configs = [],
    isLoading: configsLoading,
  } = usePulseConfigs(institutionId);

  const {
    data: responses = [],
    isLoading: responsesLoading,
    isError,
    error,
  } = usePulseResponses(institutionId, { limit: 200 });

  const activeSurveys = useMemo(
    () => configs.filter((c) => c.status === 'active'),
    [configs],
  );
  const criticalResponses = useMemo(
    () => responses.filter((r) => r.is_critical),
    [responses],
  );
  const heatmapCells = useMemo(
    () => WellnessService.buildHeatmap(responses),
    [responses],
  );
  const recentResponses = useMemo(() => responses.slice(0, 8), [responses]);

  if (!institutionId) {
    return (
      <ContentLayout title="Student Wellness">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Campus Living', href: '/campus-living' },
            { label: 'Student Wellness' },
          ]}
        />
        <div className="container mx-auto p-6 max-w-3xl">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Pick an institution</AlertTitle>
            <AlertDescription>
              Wellness data is scoped per-institution. Switch into an
              institution context to see pulse responses and surveys.
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  const isLoading = configsLoading || responsesLoading;

  return (
    <ContentLayout title="Student Wellness">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Student Wellness' },
        ]}
      />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link href="/campus-living">
              <Button variant="ghost" size="sm" className="mb-2 -ml-2">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to Campus Living
              </Button>
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <HeartPulse className="h-6 w-6 text-rose-600" />
              Student Wellness
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Pulse surveys, anonymous feedback, and critical-flag escalation
              so wardens can act before issues grow.
            </p>
          </div>
          <Link href="/campus-living/wellness/surveys">
            <Button variant="outline" size="sm">
              <Settings2 className="h-4 w-4 mr-1.5" />
              Manage surveys
            </Button>
          </Link>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Active surveys
              </div>
              <div className="text-3xl font-semibold mt-1">
                {activeSurveys.length}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {configs.length} total · {configs.length - activeSurveys.length} inactive
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <HeartPulse className="h-3.5 w-3.5" />
                Responses
              </div>
              <div className="text-3xl font-semibold mt-1">
                {responses.length}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                across {activeSurveys.length} active survey{activeSurveys.length === 1 ? '' : 's'}
              </div>
            </CardContent>
          </Card>
          <Card
            className={
              criticalResponses.length > 0 ? 'border-red-300 bg-red-50/40' : ''
            }
          >
            <CardContent className="pt-5 pb-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Critical flags
              </div>
              <div
                className={`text-3xl font-semibold mt-1 ${
                  criticalResponses.length > 0 ? 'text-red-700' : ''
                }`}
              >
                {criticalResponses.length}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                low-mood responses awaiting follow-up
              </div>
            </CardContent>
          </Card>
        </div>

        {isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Failed to load responses</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Unexpected error.'}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading pulse data…</span>
          </div>
        ) : (
          <>
            {/* Heatmap */}
            <ResponseHeatmap cells={heatmapCells} />

            {/* Critical inbox */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  Critical-flag inbox
                </CardTitle>
                <Badge variant="secondary" className="font-mono">
                  {criticalResponses.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {criticalResponses.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <TrendingDown className="h-4 w-4 text-emerald-600" />
                    <span>
                      No critical flags. Mood is at or above each survey&apos;s threshold.
                    </span>
                  </div>
                ) : (
                  criticalResponses.map((r) => (
                    <CriticalFlagRow key={r.id} response={r} />
                  ))
                )}
              </CardContent>
            </Card>

            {/* Recent responses */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent responses</CardTitle>
              </CardHeader>
              <CardContent>
                {recentResponses.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Info className="h-4 w-4" />
                    <span>
                      No responses yet. Publish a survey to start collecting pulses.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentResponses.map((r) => {
                      const anon = r.config?.questions?.anonymous_mode === true;
                      return (
                        <div
                          key={r.id}
                          className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">
                              {r.config?.title ?? 'Pulse response'}
                              {r.config ? (
                                <span className="text-muted-foreground font-normal ml-2 text-xs">
                                  {PULSE_FREQUENCY_LABELS[r.config.frequency]}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                              {anon ? `anon-${r.id.slice(-6)}` : r.learner_id}
                              <span className="mx-1.5">·</span>
                              period {r.period_start}
                              <span className="mx-1.5">·</span>
                              {formatDate(r.submitted_at)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Badge
                              variant={r.is_critical ? 'destructive' : 'secondary'}
                              className="font-mono"
                            >
                              {r.overall_mood == null
                                ? 'n/a'
                                : `${r.overall_mood}/5`}
                            </Badge>
                            {r.is_critical ? (
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
