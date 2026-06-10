// =====================================================================
// /hr/admin/forms/[id]/builder — Visual drag-drop form builder
// =====================================================================
// Wave 3 M9 follow-up (2026-05-15). Director-lock R5-Q1: all 10 widget
// types supported. Director-lock R5-Q2: super_admin only (SuperAdminOnly).
//
// Server component loads the form by id, hands it off to the client-side
// builder which is a two-pane layout: widget palette (left) + canvas
// (right). Drag from palette → drop onto canvas. Existing widgets are
// reorderable via @dnd-kit/sortable. Click a widget to open the right-side
// edit panel.
//
// Save Draft writes to hr_forms.draft_schema; Publish promotes the draft
// to schema and flips is_published = true.
//
// Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md §W3-M9
// =====================================================================
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/server';
import { formBuilderService } from '@/lib/services/hr/form-builder-service';

import { BuilderClient } from './_components/BuilderClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HrFormBuilderPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <SuperAdminOnly>
      <ContentLayout title="HR Form Builder">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Forms', href: '/hr/admin/forms' },
            { label: 'Builder' },
          ]}
        />
        <BuilderShell id={id} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

async function BuilderShell({ id }: { id: string }) {
  const supabase = await createClient();
  const form = await formBuilderService.getForm(supabase, id);

  if (!form) {
    notFound();
  }

  const initialSchema =
    form.draft_schema?.widgets ?? form.schema?.widgets ?? [];

  return (
    <div className="space-y-4">
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertTitle>{form.form_title}</AlertTitle>
        <AlertDescription>
          {form.description ??
            'Drag widgets from the left palette onto the canvas to assemble your form. Save a draft any time; publish to make it live for staff.'}
        </AlertDescription>
      </Alert>
      <BuilderClient
        formId={form.id}
        formTitle={form.form_title}
        initialSchema={initialSchema}
        isPublished={form.is_published}
        hasDraft={Boolean(form.draft_schema)}
      />
    </div>
  );
}
