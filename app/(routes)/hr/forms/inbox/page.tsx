// =====================================================================
// /hr/forms/inbox — submission inbox
// =====================================================================
// Wave 3 M9 follow-up. Lists the current user's HR form submissions and
// any forms awaiting their approval (when a workflow step's required_role
// matches one of their roles). Real role-matching against the approval
// chain ships with the workflow-engine PR; for now this lists every
// submission the caller can see via RLS.
// =====================================================================
import Link from 'next/link';
import { Inbox, FileText, AlertTriangle } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClient } from '@/lib/supabase/server';

interface SubmissionRow {
  id: string;
  form_id: string;
  status: string;
  current_step: number;
  created_at: string;
  hr_forms: { form_title: string; classification: string } | null;
}

const STATUS_VARIANTS: Record<
  string,
  'default' | 'outline' | 'secondary' | 'destructive'
> = {
  submitted: 'default',
  in_review: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  withdrawn: 'outline',
};

export default async function HrFormsInboxPage() {
  return (
    <ContentLayout title="HR Forms Inbox">
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'HR Forms' },
          { label: 'Inbox' },
        ]}
      />
      <InboxContent />
    </ContentLayout>
  );
}

async function InboxContent() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  let rows: SubmissionRow[] = [];
  let loadError: string | null = null;

  if (!user) {
    loadError = 'You must be signed in to view your inbox';
  } else {
    const { data, error } = await supabase
      .from('hr_form_submissions')
      .select('id, form_id, status, current_step, created_at, hr_forms(form_title, classification)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) loadError = error.message;
    else rows = (data ?? []) as unknown as SubmissionRow[];
  }

  const pending = rows.filter((r) =>
    ['submitted', 'in_review'].includes(r.status),
  );

  return (
    <div className="space-y-6">
      <Alert>
        <Inbox className="h-4 w-4" />
        <AlertTitle>Submission inbox</AlertTitle>
        <AlertDescription>
          Submissions awaiting action and your past submission history. The
          full role-based routing engine ships with the workflow PR; this
          view shows every submission you can see via row-level security.
        </AlertDescription>
      </Alert>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load submissions</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pending ({pending.length})</CardTitle>
          <CardDescription>
            Submissions still moving through approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubmissionTable rows={pending} emptyMessage="Nothing pending." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All submissions ({rows.length})</CardTitle>
          <CardDescription>
            Most recent 100 submissions visible to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubmissionTable rows={rows} emptyMessage="No submissions yet." />
        </CardContent>
      </Card>
    </div>
  );
}

function SubmissionTable({
  rows,
  emptyMessage,
}: {
  rows: SubmissionRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Form</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Step</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead className="w-32">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-testid="submission-row">
            <TableCell>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {row.hr_forms?.form_title ?? row.form_id}
                </span>
                {row.hr_forms?.classification ? (
                  <Badge variant="outline" className="text-[10px]">
                    {row.hr_forms.classification}
                  </Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANTS[row.status] ?? 'outline'}>
                {row.status.replace('_', ' ')}
              </Badge>
            </TableCell>
            <TableCell className="text-xs">{row.current_step}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(row.created_at).toLocaleString()}
            </TableCell>
            <TableCell>
              <Button asChild size="sm" variant="outline">
                <Link href={`/hr/forms/${row.form_id}/submit`}>
                  View form
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
