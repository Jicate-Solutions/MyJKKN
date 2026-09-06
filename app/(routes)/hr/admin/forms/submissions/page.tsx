// =====================================================================
// /hr/admin/forms/submissions — Submissions queue (W3-M9 follow-up)
// =====================================================================
// Lists every hr_form_submissions row visible to the caller (RLS-aware).
// Each row links to a detail page where the workflow can be advanced.
// =====================================================================
import Link from 'next/link';
import { FileText } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
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
import { formBuilderService } from '@/lib/services/hr/form-builder-service';

export const dynamic = 'force-dynamic';

export default function HrFormsSubmissionsPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="HR Form Submissions">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Forms', href: '/hr/admin/forms' },
            { label: 'Submissions' },
          ]}
        />
        <SubmissionsContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

async function SubmissionsContent() {
  const supabase = await createClient();

  const [submissions, forms] = await Promise.all([
    formBuilderService.listSubmissions(supabase, { page: 1, pageSize: 50 }),
    formBuilderService.listForms(supabase),
  ]);

  const formById = new Map(forms.map((f) => [f.id, f]));

  return (
    <div className="space-y-6">
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertTitle>Submissions queue</AlertTitle>
        <AlertDescription>
          Most recent {submissions.length} rows. Click a row to view its
          approval history and approve / reject the workflow.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Recent submissions ({submissions.length})</CardTitle>
          <CardDescription>
            Ordered most-recent first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>History</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No submissions yet.
                  </TableCell>
                </TableRow>
              ) : (
                submissions.map((sub) => {
                  const form = formById.get(sub.form_id);
                  return (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <div className="text-sm">
                          {form?.form_title ?? sub.form_id}
                        </div>
                        <code className="text-xs text-muted-foreground">
                          {form?.form_key ?? ''}
                        </code>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={sub.status} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {sub.current_step}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(sub.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {sub.approval_history?.length ?? 0} entries
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={`/hr/admin/forms/submissions/${sub.id}`}
                          >
                            Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: Record<string, 'default' | 'outline' | 'secondary' | 'destructive'> = {
    submitted: 'secondary',
    in_review: 'default',
    approved: 'default',
    rejected: 'destructive',
    withdrawn: 'outline',
  };
  return (
    <Badge variant={variant[status] ?? 'outline'}>
      {status.replace('_', ' ')}
    </Badge>
  );
}
