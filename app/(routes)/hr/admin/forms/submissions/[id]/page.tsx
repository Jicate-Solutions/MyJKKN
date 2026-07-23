// =====================================================================
// /hr/admin/forms/submissions/[id] — Submission detail (W3-M9 follow-up)
// =====================================================================
// Shows submission_data + approval_history; renders an advance/reject
// control when the workflow is still in-flight.
// =====================================================================
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { createClient } from '@/lib/supabase/server';
import { formBuilderService } from '@/lib/services/hr/form-builder-service';
import { AdvanceControls } from './advance-controls';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HrSubmissionDetailPage({ params }: PageProps) {
  return (
    <SuperAdminOnly>
      <ContentLayout title="HR Form Submission">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Forms', href: '/hr/admin/forms' },
            { label: 'Submissions', href: '/hr/admin/forms/submissions' },
            { label: 'Detail' },
          ]}
        />
        <SubmissionDetailContent params={params} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

async function SubmissionDetailContent({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const submission = await formBuilderService.getSubmission(supabase, id);
  if (!submission) notFound();

  const form = await formBuilderService.getForm(supabase, submission.form_id);
  const submitter = await fetchProfile(supabase, submission.submitted_by);

  const sortedSteps = (form?.approval_workflow.steps ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  const currentStepDef = sortedSteps.find(
    (s) => s.order === submission.current_step,
  );

  const inFlight =
    submission.status === 'submitted' || submission.status === 'in_review';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            {form?.form_title ?? submission.form_id}
          </h2>
          <p className="text-sm text-muted-foreground">
            Submitted by {submitter?.full_name ?? submission.submitted_by} ·{' '}
            {new Date(submission.created_at).toLocaleString()}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/hr/admin/forms/submissions">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to queue
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Step {submission.current_step}{' '}
            {currentStepDef ? `· ${currentStepDef.label}` : ''}{' '}
            · <Badge variant="outline">{submission.status}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inFlight && currentStepDef ? (
            <AdvanceControls
              submissionId={submission.id}
              currentStepLabel={currentStepDef.label}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This submission is no longer active ({submission.status}).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approval history</CardTitle>
          <CardDescription>
            Append-only audit trail. {submission.approval_history?.length ?? 0}{' '}
            entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submission.approval_history?.length ? (
            <ol className="space-y-3 list-decimal pl-5">
              {submission.approval_history.map((entry, i) => (
                <li key={i} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">step {entry.step}</Badge>
                    <Badge>{entry.action}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm mt-1">
                    <span className="text-muted-foreground">Reason:</span>{' '}
                    {entry.reason}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submission data</CardTitle>
          <CardDescription>
            Raw payload — full widget renderers ship in the builder follow-up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
            {JSON.stringify(submission.submission_data, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

async function fetchProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<{ full_name: string | null } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as { full_name: string | null } | null;
}
