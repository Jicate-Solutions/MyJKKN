// =====================================================================
// /hr/admin/forms — Wave 3 M9 Form Builder substrate index
// =====================================================================
// SUBSTRATE-ONLY (2026-05-15). Lists the 5 seeded placeholder forms so
// HR admins can see what's coming. The visual drag-drop builder, per-
// widget React components, and workflow engine ship in follow-up PRs.
//
// Director-lock R5-Q2 (memory: project_wave3_hr_policy_lock_2026_05_15):
//   Form-builder access is super_admin only. SuperAdminOnly enforces.
//
// Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md §W3-M9
// =====================================================================
import Link from 'next/link';
import { FileText, AlertTriangle, Pencil, Workflow } from 'lucide-react';

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
import type { HrForm } from '@/types/hr-forms';

// ---------------------------------------------------------------------------
// Page wrapper
// ---------------------------------------------------------------------------

export default function HrFormsIndexPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="HR Forms — Form Builder Substrate">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Forms' },
          ]}
        />
        <HrFormsIndexContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

// ---------------------------------------------------------------------------
// Server component — loads forms from hr_forms table via service
// ---------------------------------------------------------------------------

async function HrFormsIndexContent() {
  const supabase = await createClient();

  let forms: HrForm[] = [];
  let loadError: string | null = null;
  try {
    forms = await formBuilderService.listForms(supabase);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load forms';
  }

  return (
    <div className="space-y-6">
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertTitle>HR Form Builder (Wave 3 — M9)</AlertTitle>
        <AlertDescription>
          Drag-and-drop visual builder is live. Click "Open builder" on any
          form to assemble widgets (text, file upload, signature,
          conditional logic, and more), then save a draft or publish to
          make it live for staff.
        </AlertDescription>
      </Alert>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load forms</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Seeded forms ({forms.length})</CardTitle>
          <CardDescription>
            Five placeholders seeded by migration{' '}
            <code className="text-xs">20260613_hr_forms_substrate</code>.
            Schemas are empty — they fill in across follow-up PRs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form key</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Draft present</TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No forms found.
                  </TableCell>
                </TableRow>
              ) : (
                forms.map((form) => {
                  const stepsLive = form.approval_workflow?.steps?.length ?? 0;
                  const stepsDraft =
                    form.draft_approval_workflow?.steps?.length ?? null;
                  return (
                    <TableRow key={form.id}>
                      <TableCell>
                        <code className="text-xs">{form.form_key}</code>
                      </TableCell>
                      <TableCell>{form.form_title}</TableCell>
                      <TableCell>
                        <Badge
                          variant={form.classification === 'major' ? 'default' : 'outline'}
                        >
                          {form.classification}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={form.is_published ? 'default' : 'outline'}>
                          {form.is_published ? 'Published' : 'Draft'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={form.draft_schema ? 'secondary' : 'outline'}>
                          {form.draft_schema ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {stepsLive === 0 && stepsDraft == null ? (
                          <span className="text-muted-foreground">empty</span>
                        ) : (
                          <span>
                            {stepsLive} step{stepsLive === 1 ? '' : 's'}
                            {stepsDraft != null ? ` · ${stepsDraft} draft` : ''}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/hr/admin/forms/${form.id}/builder`}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Builder
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/hr/admin/forms/${form.id}/workflow`}>
                              <Workflow className="h-3 w-3 mr-1" />
                              Workflow
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent submissions</CardTitle>
          <CardDescription>
            Submissions land in <code className="text-xs">hr_form_submissions</code>{' '}
            once a form is published and submitted. Open each one to see the
            approval history and advance / reject the workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/hr/admin/forms/submissions">
              View submissions queue
            </Link>
          </Button>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Follow-up scope still open: visual drag-drop builder at{' '}
        <code className="text-xs">/hr/admin/forms/[id]/builder</code> with
        per-widget renderers (text, textarea, number, date, dropdown, radio,
        checkbox, file upload, signature, conditional logic). The workflow
        engine + WhatsApp + in-app notifications + per-form approval chain
        editor shipped in this PR.
      </p>
    </div>
  );
}
