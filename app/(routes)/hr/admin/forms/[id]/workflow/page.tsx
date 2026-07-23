// =====================================================================
// /hr/admin/forms/[id]/workflow — Approval workflow editor (W3-M9 follow-up)
// =====================================================================
// Loads the form server-side, loads available roles (custom_roles) for the
// step picker, then hands off to the WorkflowEditor client component.
//
// Director-lock R5-Q2: form-builder writes are super_admin only. Read-side
// is guarded by SuperAdminOnly at the page level.
//
// Director-lock R6-Q3: each form has its own approval chain. Steps live in
// hr_forms.approval_workflow.steps[] as an ordered array — this editor is
// the only UI that writes it.
// =====================================================================
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { formBuilderService } from '@/lib/services/hr/form-builder-service';
import { WorkflowEditor } from './workflow-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HrFormWorkflowPage({ params }: PageProps) {
  return (
    <SuperAdminOnly>
      <ContentLayout title="HR Form Workflow Editor">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Forms', href: '/hr/admin/forms' },
            { label: 'Workflow Editor' },
          ]}
        />
        <WorkflowEditorContent params={params} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

// --------------------------------------------------------------------------
// Server data loader
// --------------------------------------------------------------------------

interface RoleRow {
  id: string;
  role_key: string;
  role_name: string;
}

async function WorkflowEditorContent({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const form = await formBuilderService.getForm(supabase, id);
  if (!form) notFound();

  // Load available roles for the step picker.
  const { data: roles, error: rolesErr } = await supabase
    .from('custom_roles')
    .select('id, role_key, role_name')
    .order('role_name', { ascending: true });

  if (rolesErr) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load roles</AlertTitle>
        <AlertDescription>{rolesErr.message}</AlertDescription>
      </Alert>
    );
  }

  // Workflow being edited = draft if set, else current published.
  const initialSteps =
    form.draft_approval_workflow?.steps ?? form.approval_workflow?.steps ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{form.form_title}</h2>
          <p className="text-sm text-muted-foreground">
            <code className="text-xs">{form.form_key}</code> ·{' '}
            {form.classification} ·{' '}
            {form.is_published ? 'Published' : 'Draft only'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/hr/admin/forms">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to forms
          </Link>
        </Button>
      </div>

      <Alert>
        <AlertTitle>Per-form approval chain (Director-lock R6-Q3)</AlertTitle>
        <AlertDescription>
          Each step assigns a role that must approve before the submission
          advances. The first step receives the submission; later steps run
          in order. Notification channels per step are best-effort —
          configurations that target a missing role / channel silently
          skip rather than block the workflow.
        </AlertDescription>
      </Alert>

      <WorkflowEditor
        formId={form.id}
        initialSteps={initialSteps}
        availableRoles={(roles ?? []) as RoleRow[]}
      />
    </div>
  );
}
