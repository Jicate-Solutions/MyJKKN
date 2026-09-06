'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CalendarPlus, Loader2, Users } from 'lucide-react';
import { useInterviews } from '@/hooks/hr/use-recruitment-interviews';
import { useCandidates, useJobs } from '@/hooks/hr/use-recruitment';
import { InterviewStatusBadge } from '@/features/hr/recruitment/interview-status-badge';
import { ScheduleInterviewDialog } from '@/features/hr/recruitment/schedule-interview-dialog';
import {
  INTERVIEW_MODE_LABELS,
  type InterviewStatus,
  type HRRecruitmentInterview,
} from '@/types/hr-recruitment';

// ---- Status filter tabs ----
const STATUS_TABS: Array<{ label: string; value: InterviewStatus | '' }> = [
  { label: 'All', value: '' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'No Show', value: 'no_show' },
  { label: 'Rescheduled', value: 'rescheduled' },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ', ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function InterviewsListPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<InterviewStatus | ''>('');
  const [showSchedule, setShowSchedule] = useState(false);

  const filters = statusFilter
    ? { status: statusFilter as InterviewStatus }
    : {};

  const { data, isLoading } = useInterviews(filters);
  const interviews = data?.data ?? [];

  // Preload candidates + jobs to resolve names client-side
  const { data: candidatesData } = useCandidates({ pageSize: 500 });
  const candidateMap = new Map(
    (candidatesData?.data ?? []).map((c) => [c.id, c]),
  );

  const { data: jobsData } = useJobs({ pageSize: 500 });
  const jobMap = new Map(
    (jobsData?.data ?? []).map((j) => [j.id, j]),
  );

  const getCandidateName = (id: string) =>
    candidateMap.get(id)?.name ?? 'Unknown';

  const getJobTitle = (id: string | null) => {
    if (!id) return '-';
    return jobMap.get(id)?.title ?? '-';
  };

  return (
    <ContentLayout title="Interviews">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/recruitment">Recruitment</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Interviews</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Interviews</h1>
            <p className="text-sm text-muted-foreground">
              Schedule, track, and score candidate interviews
            </p>
          </div>
          <Button className="shrink-0" onClick={() => setShowSchedule(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Schedule Interview
          </Button>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-1.5 border-b pb-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : interviews.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No interviews found</p>
                {statusFilter && (
                  <button
                    onClick={() => setStatusFilter('')}
                    className="text-xs text-primary underline mt-1"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">
                      <Users className="h-4 w-4 inline-block" /> Panel
                    </TableHead>
                    <TableHead>Round</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interviews.map((iv) => (
                    <TableRow
                      key={iv.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(`/hr/recruitment/interviews/${iv.id}`)
                      }
                    >
                      <TableCell className="font-medium">
                        {getCandidateName(iv.candidate_id)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {getJobTitle(iv.job_id)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(iv.scheduled_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {INTERVIEW_MODE_LABELS[iv.mode] ?? iv.mode}
                      </TableCell>
                      <TableCell>
                        <InterviewStatusBadge status={iv.status} />
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {iv.panel_member_ids?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {iv.round_name
                          ? `#${iv.round_number} ${iv.round_name}`
                          : `#${iv.round_number}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Schedule dialog */}
      <ScheduleInterviewDialog
        open={showSchedule}
        onOpenChange={setShowSchedule}
      />
    </ContentLayout>
  );
}
