// =====================================================================
// /admin/hr/forms — Wave 3 M9 Form Builder substrate index
// =====================================================================
// SUBSTRATE-ONLY (2026-05-15). Lists the 5 seeded placeholder forms so
// HR admins can see what's coming. The visual drag-drop builder, per-
// widget React components, and workflow engine ship in follow-up PRs.
//
// Director-lock R5-Q2 (memory: project_wave3_hr_policy_lock_2026_05_15):
//   Form-builder access is super_admin only. PermissionGuard enforces.
//
// Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md §W3-M9
// =====================================================================
import { FileText, AlertTriangle } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
    <PermissionGuard module="users" action="manage">
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
    </PermissionGuard>
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
        <AlertTitle>Form Builder substrate (Wave 3 — M9)</AlertTitle>
        <AlertDescription>
          Tables, types, and service skeleton are in place. The visual
          drag-drop builder, per-widget renderers (text, file upload,
          signature, conditional logic, etc.), and the approval-workflow
          engine ship in follow-up PRs. Each row below links to the
          eventual builder — placeholder for now.
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
                <TableHead>Builder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No forms found.
                  </TableCell>
                </TableRow>
              ) : (
                forms.map((form) => (
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
                    <TableCell className="text-xs text-muted-foreground">
                      Schema pending — builder in follow-up PR
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Follow-up PRs (each module in its own PR):
        visual drag-drop builder at{' '}
        <code className="text-xs">/admin/hr/forms/[id]/builder</code> — per-widget
        renderers (text, textarea, number, date, dropdown, radio, checkbox,
        file upload, signature, conditional logic) — workflow engine wiring
        approval steps to staff + HOD + CAO — WhatsApp notification dispatch.
      </p>
    </div>
  );
}
