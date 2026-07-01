'use client';

/**
 * /feedback — Universal Feedback Spine admin dashboard.
 *
 * Reads public.feedback_events (RLS-scoped via browser client).
 * Only users with is_super_admin OR is_admin OR feedback.view get rows;
 * the PermissionGuard renders an explicit access-denied panel for everyone else.
 *
 * Access control: PermissionGuard wraps the page (module="feedback" action="view").
 * The guard shows a hard "no access" panel — no silent redirect.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, MessageSquare } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SummaryTiles } from './_components/summary-tiles';
import { SourceTiles } from './_components/source-tiles';
import { SentimentChart } from './_components/sentiment-chart';
import { TopThemes } from './_components/top-themes';
import { ComplaintsTable } from './_components/complaints-table';
import { ConcentrationTable } from './_components/concentration-table';
import { SuperOverview } from './_components/super-overview';
import { ActionQueue } from './_components/action-queue';
import { InstitutionBreakdown } from './_components/institution-breakdown';
import { SourceHealth } from './_components/source-health';
import { FeedbackExplorer } from './_components/feedback-explorer';
import type { SuperFilters } from '@/lib/services/feedback/super-cockpit-service';
import {
  fetchFeedbackSummary,
  fetchSentimentOverTime,
  fetchTopTopics,
  fetchComplaints,
  fetchConcentrationByPost,
  type FeedbackFilters,
  type FeedbackSummary,
  type SentimentBucket,
  type TopicCount,
  type ComplaintRow,
  type ConcentrationRow,
} from '@/lib/services/feedback/feedback-dashboard-service';
import type { FeedbackSource } from '@/lib/types/feedback-spine';

const SOURCES: Array<{ value: FeedbackSource | 'all'; label: string }> = [
  { value: 'all', label: 'All Sources' },
  { value: 'session_feedback', label: 'Session Feedback' },
  { value: 'class_feedback', label: 'Class Feedback' },
  { value: 'mess', label: 'Mess' },
  { value: 'parent', label: 'Parent' },
  { value: 'scf_checkin', label: 'SCF Check-in' },
  { value: 'ai_pulse', label: 'AI Pulse' },
  { value: 'ig_comment', label: 'IG Comment' },
  { value: 'ig_dm', label: 'IG DM' },
];

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Feedback' },
];

// ─── Dashboard state ──────────────────────────────────────────────────────────

interface DashboardData {
  summary: FeedbackSummary;
  sentimentOverTime: SentimentBucket[];
  topTopics: TopicCount[];
  complaints: ComplaintRow[];
  concentration: ConcentrationRow[];
}

export default function FeedbackDashboardPage() {
  const [source, setSource] = useState<FeedbackSource | 'all'>('all');
  const [hideSpam, setHideSpam] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the Refresh button and used as a React key on the super-cockpit
  // components. Each of them self-fetches on primitive filter changes, so a
  // same-filter refresh needs an explicit remount to re-pull from the DB.
  const [refreshNonce, setRefreshNonce] = useState(0);

  const load = useCallback(
    async (filters: FeedbackFilters) => {
      setIsLoading(true);
      setError(null);
      try {
        const [summary, sentimentOverTime, topTopics, complaints, concentration] =
          await Promise.all([
            fetchFeedbackSummary(filters),
            fetchSentimentOverTime(filters, 30),
            fetchTopTopics(filters, 12),
            fetchComplaints(filters),
            fetchConcentrationByPost(filters),
          ]);
        setData({ summary, sentimentOverTime, topTopics, complaints, concentration });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load feedback data.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load({ source, hideSpam });
  }, [source, hideSpam, load]);

  // Filters handed to the super-cockpit components (each self-fetches on change).
  const superFilters: SuperFilters = { source, hideSpam };

  return (
    <PermissionGuard
      module="feedback"
      action="view"
      fallback={
        <ContentLayout title="Feedback">
          <div className="rounded-md border border-border bg-muted/30 p-8 text-center">
            <MessageSquare className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            <h2 className="text-sm font-medium mb-1">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">
              You do not have access to feedback data. Contact an administrator
              to grant the <code className="text-xs font-mono">feedback.view</code> permission
              to your role.
            </p>
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Feedback Dashboard">
        <PageBreadcrumb items={breadcrumbItems} />

        <div className="mt-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Feedback Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  AI-classified feedback across all sources. Internal voice (sessions,
                  class, mess, parent) is highlighted; external social is separated.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRefreshNonce((n) => n + 1);
                void load({ source, hideSpam });
              }}
              disabled={isLoading}
              className="gap-2 self-start sm:self-center"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Filters row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-lg border bg-muted/20 px-4 py-3">
            {/* Source filter */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Source filter">
              {SOURCES.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={source === opt.value ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setSource(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            {/* Spacer */}
            <div className="hidden sm:block flex-1" />

            {/* Hide spam toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="hide-spam"
                checked={hideSpam}
                onCheckedChange={setHideSpam}
              />
              <Label htmlFor="hide-spam" className="text-sm cursor-pointer">
                Hide spam
              </Label>
            </div>
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* ── Super-cockpit (management view) ─────────────────────────── */}
          {/* Top-line management numbers: total / classified / genuine vs noise. */}
          <SuperOverview key={`overview-${refreshNonce}`} filters={superFilters} />

          {/* Genuine items needing a decision — internal complaints ranked first. */}
          <ActionQueue key={`actionq-${refreshNonce}`} filters={superFilters} />

          {/* Per-institution breakdown, ranked by genuine negatives. */}
          <InstitutionBreakdown key={`inst-${refreshNonce}`} filters={superFilters} />

          {/* Which of the 8 sources are flowing vs dry (global, unfiltered). */}
          <SourceHealth key={`srchealth-${refreshNonce}`} />

          {/* ── Classic dashboard sections ──────────────────────────────── */}
          {/* Sentiment tiles */}
          <SummaryTiles summary={data?.summary ?? null} isLoading={isLoading} />

          {/* Source tiles */}
          <SourceTiles summary={data?.summary ?? null} isLoading={isLoading} />

          {/* Sentiment chart + Top themes (side by side on wide screens) */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SentimentChart
                data={data?.sentimentOverTime ?? []}
                isLoading={isLoading}
              />
            </div>
            <TopThemes topics={data?.topTopics ?? []} isLoading={isLoading} />
          </div>

          {/* Complaints needing reply */}
          <ComplaintsTable
            complaints={data?.complaints ?? []}
            isLoading={isLoading}
          />

          {/* Concentration by post */}
          <ConcentrationTable
            rows={data?.concentration ?? []}
            isLoading={isLoading}
          />

          {/* ── Full feedback explorer (searchable full event list) ──────── */}
          <FeedbackExplorer key={`explorer-${refreshNonce}`} filters={superFilters} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
