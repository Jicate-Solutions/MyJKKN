'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useCounselorDailyView,
  useUnassignedLeads,
  useCounselorsList,
  useCounselorActions,
} from '@/hooks/admission/use-counselor-daily-view';
import { CounselorKPIStrip } from './_components/counselor-kpi-strip';
import { FollowupList } from './_components/followup-list';
import { UnassignedLeadsPanel } from './_components/unassigned-leads-panel';
import { MiniPipeline } from './_components/mini-pipeline';
import { TodayActivityLog } from './_components/today-activity-log';

export default function CounselorViewPage() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId;

  const {
    isLoading,
    isError,
    error,
    refetch,
    isManager,
    isNotCounselor,
    kpis,
    followups,
    pipeline,
    todayActivities,
    unassignedCount,
  } = useCounselorDailyView(institutionId);

  const { leads: unassignedLeads, isLoading: isLoadingUnassigned } = useUnassignedLeads(
    institutionId,
    isManager && unassignedCount > 0
  );

  const { counselors } = useCounselorsList(isManager ? institutionId : undefined);

  const actions = useCounselorActions(institutionId);

  // Not a counselor
  if (isNotCounselor && !isLoading) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not a Counselor</AlertTitle>
          <AlertDescription>
            You are not registered as a counselor. Contact your admin to be added to the
            counselor list.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message || 'Failed to load counselor view.'}
          </AlertDescription>
        </Alert>
        <Button className="mt-4" onClick={() => refetch()}>
          Try Again
        </Button>
      </div>
    );
  }

  const isAnyMutating =
    actions.isRescheduling ||
    actions.isAddingNote ||
    actions.isLoggingCall ||
    actions.isAdvancingStage ||
    actions.isAssigning;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">My Day</h1>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* KPI Strip */}
      <CounselorKPIStrip kpis={kpis || {
        my_leads_today: 0,
        followups_due: 0,
        overdue_followups: 0,
        hot_leads: 0,
        total_active: 0,
        enrolled_this_month: 0,
        total_this_month: 0,
        conversion_rate: 0,
      }} isLoading={isLoading} />

      {/* Manager: Unassigned leads panel */}
      {isManager && unassignedCount > 0 && (
        <UnassignedLeadsPanel
          leads={unassignedLeads}
          counselors={counselors}
          onAssign={(leadIds, counselorId) =>
            actions.assignLeads.mutate({ leadIds, counselorId })
          }
          isAssigning={actions.isAssigning}
          isLoading={isLoadingUnassigned}
        />
      )}

      {/* Two-column layout for larger screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main column: Follow-ups */}
        <div className="lg:col-span-2">
          <FollowupList
            leads={followups}
            onCall={(leadId) => actions.logCall.mutate({ leadId })}
            onAdvanceStage={(leadId, newStage) =>
              actions.advanceStage.mutate({ leadId, newStage })
            }
            onReschedule={(leadId, newDate) =>
              actions.rescheduleFollowup.mutate({ leadId, newDate })
            }
            onAddNote={(leadId, note) =>
              actions.addQuickNote.mutate({ leadId, note })
            }
            isActioning={isAnyMutating}
          />
        </div>

        {/* Side column: Pipeline + Activity */}
        <div className="space-y-4">
          <MiniPipeline pipeline={pipeline} isLoading={isLoading} />
          <TodayActivityLog activities={todayActivities} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
