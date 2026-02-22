'use client';

import { useState, useMemo } from 'react';
import { AlertCircle, RefreshCw, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
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

// Generate academic year options (current + next)
function getAcademicYearOptions(): string[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Academic year starts in June. If before June, current AY started last year.
  const startYear = month >= 5 ? currentYear : currentYear - 1;
  return [
    `${startYear}-${(startYear + 1).toString().slice(-2)}`,
    `${startYear + 1}-${(startYear + 2).toString().slice(-2)}`,
  ];
}

const STAGE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Stages' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'not_reachable', label: 'Not Reachable' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow_up_scheduled', label: 'Follow-up Scheduled' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'application_started', label: 'App Started' },
  { value: 'application_submitted', label: 'App Submitted' },
  { value: 'documents_pending', label: 'Docs Pending' },
  { value: 'documents_verified', label: 'Docs Verified' },
  { value: 'interview_scheduled', label: 'Interview Set' },
  { value: 'interview_completed', label: 'Interview Done' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'token_paid', label: 'Token Paid' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'offered', label: 'Offered' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrew', label: 'Withdrew' },
  { value: 'expired', label: 'Expired' },
  { value: 'lost', label: 'Lost' },
  { value: 'dormant', label: 'Dormant' },
];

function CounselorViewPageContent() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId;

  const [stageFilter, setStageFilter] = useState('all');
  const [academicYearFilter, setAcademicYearFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

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

  // Split followups into today's priorities vs rest
  const { todayFollowups, otherFollowups } = useMemo(() => {
    let filtered = followups;

    // Apply stage filter
    if (stageFilter !== 'all') {
      filtered = filtered.filter((l) => l.funnel_stage === stageFilter);
    }

    // Apply academic year filter
    if (academicYearFilter !== 'all') {
      filtered = filtered.filter((l) => l.academic_year === academicYearFilter);
    }

    const today = filtered.filter((l) => l.urgency === 'overdue' || l.urgency === 'today');
    const other = filtered.filter((l) => l.urgency !== 'overdue' && l.urgency !== 'today');
    return { todayFollowups: today, otherFollowups: other };
  }, [followups, stageFilter, academicYearFilter]);

  const academicYearOptions = useMemo(() => getAcademicYearOptions(), []);

  const hasActiveFilters = stageFilter !== 'all' || academicYearFilter !== 'all';

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
    <ContentLayout title="Counselor View">
      <div className="p-4 sm:p-6 space-y-4 mx-auto">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Counselor View</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showFilters ? 'default' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
            className="h-8"
          >
            <Filter className={`h-3.5 w-3.5 mr-1 ${hasActiveFilters ? 'text-primary-foreground' : ''}`} />
            {hasActiveFilters ? 'Filtered' : 'Filters'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filters row */}
      {showFilters && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent>
              {STAGE_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={academicYearFilter} onValueChange={setAcademicYearFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Academic Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Years</SelectItem>
              {academicYearOptions.map((yr) => (
                <SelectItem key={yr} value={yr} className="text-xs">
                  {yr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => {
                setStageFilter('all');
                setAcademicYearFilter('all');
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

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
        <div className="lg:col-span-2 space-y-4">
          {/* Today's follow-ups (priority section) */}
          {todayFollowups.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <h3 className="text-sm font-semibold text-red-700">
                  Today&apos;s Priority ({todayFollowups.length})
                </h3>
              </div>
              <FollowupList
                leads={todayFollowups}
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
          )}

          {/* Upcoming follow-ups */}
          {otherFollowups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                Upcoming ({otherFollowups.length})
              </h3>
              <FollowupList
                leads={otherFollowups}
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
          )}

          {/* Empty state when no followups */}
          {todayFollowups.length === 0 && otherFollowups.length === 0 && !isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No follow-ups scheduled.</p>
              <p className="text-xs mt-1">Great job staying on top of things!</p>
            </div>
          )}
        </div>

        {/* Side column: Pipeline + Activity */}
        <div className="space-y-4">
          <MiniPipeline pipeline={pipeline} isLoading={isLoading} />
          <TodayActivityLog activities={todayActivities} isLoading={isLoading} />
        </div>
      </div>
      </div>
    </ContentLayout>
  );
}

export default function CounselorViewPage() {
  return (
    <PermissionGuard module="admission" action="view">
      <AdmissionErrorBoundary>
        <CounselorViewPageContent />
      </AdmissionErrorBoundary>
    </PermissionGuard>
  );
}
