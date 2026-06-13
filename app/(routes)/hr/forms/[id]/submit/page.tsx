// =====================================================================
// /hr/forms/[id]/submit — staff-facing form submission renderer
// =====================================================================
// Wave 3 M9 follow-up. Reads the published `schema` from hr_forms and
// renders each widget via WidgetRenderer. On submit, writes a row to
// hr_form_submissions via a thin server action (the workflow-engine
// implementation in formBuilderService.submitForm ships in a follow-up,
// so this page inserts the raw row + an initial approval_history entry
// directly, which is forward-compatible with the engine landing later).
// =====================================================================
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/server';
import { formBuilderService } from '@/lib/services/hr/form-builder-service';

import { SubmitClient } from './_components/SubmitClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HrFormSubmitPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <ContentLayout title="Submit HR Form">
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'HR Forms', href: '/hr/forms/inbox' },
          { label: 'Submit' },
        ]}
      />
      <SubmitShell id={id} />
    </ContentLayout>
  );
}

async function SubmitShell({ id }: { id: string }) {
  const supabase = await createClient();
  const form = await formBuilderService.getForm(supabase, id);

  if (!form) {
    notFound();
  }

  if (!form.is_published) {
    return (
      <Alert variant="destructive">
        <FileText className="h-4 w-4" />
        <AlertTitle>This form has not been published yet</AlertTitle>
        <AlertDescription>
          Ask a director to publish the form before submitting.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertTitle>{form.form_title}</AlertTitle>
        <AlertDescription>
          {form.description ?? 'Fill in the fields below and submit.'}
        </AlertDescription>
      </Alert>
      <SubmitClient
        formId={form.id}
        formTitle={form.form_title}
        widgets={form.schema.widgets}
      />
    </div>
  );
}
