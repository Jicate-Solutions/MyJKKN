'use client';


import { use } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvent } from '@/hooks/startup-studio/use-events';
import {
  useEventDashboardKPIs,
  useEventSubmissionMetrics,
  useEventAttendanceSummary,
  useEventVerificationSummary,
  useEventVotingOverview,
  useEventEvaluatorProgress,
  useEventEvaluationByDate,
  useEventChecklistProgress,
  useEventInstitutionBreakdown,
} from '@/hooks/startup-studio/use-event-analytics';
import { AnalyticsKPICards } from './_components/analytics-kpi-cards';
import { OverviewTab } from './_components/overview-tab';
import { AttendanceTab } from './_components/attendance-tab';
import { SubmissionsTab } from './_components/submissions-tab';
import { EvaluationTab } from './_components/evaluation-tab';
import { VotingTab } from './_components/voting-tab';
import { DeclarationsTab } from './_components/declarations-tab';

interface Props {
  params: Promise<{ id: string }>;
}

export default function EventAnalyticsDashboardPage({ params }: Props) {
  const { id: eventId } = use(params);

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Analytics Dashboard">
          <Alert variant="destructive" className="mt-8">
            <AlertDescription>
              This page is only accessible to super administrators.
            </AlertDescription>
          </Alert>
        </ContentLayout>
      }
    >
      <DashboardContent eventId={eventId} />
    </SuperAdminOnly>
  );
}

function DashboardContent({ eventId }: { eventId: string }) {
  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const { data: kpis, isLoading: kpisLoading } = useEventDashboardKPIs(eventId);
  const { data: submissionMetrics, isLoading: subLoading } = useEventSubmissionMetrics(eventId);
  const { data: attendanceSummary, isLoading: attLoading } = useEventAttendanceSummary(eventId);
  const { data: verificationSummary, isLoading: verLoading } = useEventVerificationSummary(eventId);
  const { data: votingOverview, isLoading: voteLoading } = useEventVotingOverview(eventId, event);
  const { data: evaluatorProgress, isLoading: evalLoading } = useEventEvaluatorProgress(eventId);
  const { data: evaluationByDate } = useEventEvaluationByDate(eventId);
  const { data: checklistProgress, isLoading: clLoading } = useEventChecklistProgress(eventId);
  const { data: institutionBreakdown, isLoading: instLoading } = useEventInstitutionBreakdown(eventId);

  const isLoading = eventLoading || kpisLoading;

  return (
    <ContentLayout title="Analytics Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio Events', href: '/startup-studio/events' },
          { label: event?.name ?? 'Event', href: `/startup-studio/events/${eventId}` },
          { label: 'Analytics Dashboard' },
        ]}
      />

      <div className="space-y-6 mt-4 pb-10">
        {/* Page Header */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{event?.name ?? 'Event'} — Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Super admin analytics · All event data in one view
            </p>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && kpis && (
          <>
            {/* KPI Cards */}
            <AnalyticsKPICards kpis={kpis} />

            {/* Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="flex flex-wrap h-auto gap-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="submissions">Submissions</TabsTrigger>
                <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
                <TabsTrigger value="voting">Voting</TabsTrigger>
                <TabsTrigger value="declarations">Declarations</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                {clLoading || instLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <OverviewTab
                    institutionBreakdown={institutionBreakdown ?? []}
                    checklistProgress={checklistProgress ?? []}
                    eventStatus={event?.status ?? 'draft'}
                    startDate={event?.start_date ?? null}
                    endDate={event?.end_date ?? null}
                    demoDate={event?.demo_date ?? null}
                  />
                )}
              </TabsContent>

              <TabsContent value="attendance" className="mt-4">
                {attLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : attendanceSummary ? (
                  <AttendanceTab summary={attendanceSummary} />
                ) : null}
              </TabsContent>

              <TabsContent value="submissions" className="mt-4">
                {subLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : submissionMetrics ? (
                  <SubmissionsTab metrics={submissionMetrics} totalTeams={kpis.totalTeams} />
                ) : null}
              </TabsContent>

              <TabsContent value="evaluation" className="mt-4">
                {verLoading || evalLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : verificationSummary ? (
                  <EvaluationTab
                    verificationSummary={verificationSummary}
                    evaluatorProgress={evaluatorProgress ?? []}
                    evaluationByDate={evaluationByDate ?? []}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="voting" className="mt-4">
                {voteLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : votingOverview ? (
                  <VotingTab overview={votingOverview} />
                ) : null}
              </TabsContent>

              <TabsContent value="declarations" className="mt-4">
                <DeclarationsTab eventId={eventId} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
