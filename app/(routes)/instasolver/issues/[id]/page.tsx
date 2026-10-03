'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityTimeline } from '@/components/instasolver/activity-timeline';
import { NotesPanel } from '@/components/instasolver/notes-panel';
import { useInstaSolverAccess, useIssue } from '@/hooks/instasolver/use-instasolver';
import { IssueDetails } from './_components/issue-details';
import { IssueHeader } from './_components/issue-header';
import { NextActionPanel } from './_components/next-action-panel';

export default function IssueDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const { data: issue, isLoading, error } = useIssue(id);
  const { data: access, isLoading: accessLoading } = useInstaSolverAccess();

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/instasolver/issues">
        <ArrowLeft className="mr-1.5 h-4 w-4" /> All issues
      </Link>
    </Button>
  );

  if (isLoading || accessLoading) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !issue || !access) {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <FileQuestion className="h-9 w-9 text-muted-foreground" />
            <p className="font-medium">
              {error ? 'This issue could not be loaded' : 'This issue does not exist or is not visible to you'}
            </p>
            <p className="text-sm text-muted-foreground">
              {error
                ? (error as Error).message
                : 'Check the reference, or ask the person who shared it whether it was raised at your institution.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const uid = access.user_id;
  const isReporter = !!uid && issue.reported_by === uid;
  const isWorker =
    !!uid &&
    (issue.assigned_to === uid ||
      (issue.assigned_team_id !== null && access.team_ids.includes(issue.assigned_team_id)));
  const handlesIt = access.is_manager || isWorker;

  return (
    <div className="space-y-4">
      <PageBreadcrumb
        items={[
          { label: 'InstaSolver', href: '/instasolver/dashboard' },
          { label: 'Issues', href: '/instasolver/issues' },
          { label: issue.reference_no, isCurrent: true }
        ]}
      />
      {back}
      <IssueHeader issue={issue} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <NextActionPanel issue={issue} access={access} />
          <IssueDetails issue={issue} showPhones={handlesIt} />
        </div>
        <div className="min-w-0 space-y-4">
          <NotesPanel entity="issue" id={issue.id} canWrite={handlesIt || isReporter} canWriteInternal={handlesIt} />
          <ActivityTimeline entity="issue" id={issue.id} />
        </div>
      </div>
    </div>
  );
}
