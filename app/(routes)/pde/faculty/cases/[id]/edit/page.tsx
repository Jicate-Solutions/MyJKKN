'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertCircle, Eye, Archive, Send, Undo2 } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import {
  useFacultyCaseDetail,
  useUpdateFacultyCase,
  useTransitionFacultyCase,
} from '@/hooks/pde/use-faculty-cases';
import { useVACCourses } from '@/hooks/vac/use-vac';
import { CaseFormBuilder } from '../../_components/CaseFormBuilder';
import type {
  CreateClinicalCaseInput,
  ClinicalCaseStatus,
  ClinicalCaseQuestion,
} from '@/types/pde';

function StatusPill({ status }: { status: ClinicalCaseStatus }) {
  if (status === 'published') {
    return <Badge className="bg-green-500/10 text-green-600 border-green-200">Published</Badge>;
  }
  if (status === 'archived') return <Badge variant="secondary">Archived</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export default function EditClinicalCasePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const { data, isLoading, error } = useFacultyCaseDetail(id);
  const update = useUpdateFacultyCase();
  const transition = useTransitionFacultyCase();
  const { data: coursesData } = useVACCourses();
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  if (isLoading) {
    return (
      <ContentLayout title="Edit Case">
        <div className="flex justify-center p-8">
          <BeatLoader color="#0b6d41" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !data?.data) {
    return (
      <ContentLayout title="Edit Case">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load case. {error?.message || 'Not found.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/pde/faculty/cases">Back to cases</Link>
        </Button>
      </ContentLayout>
    );
  }

  const c = data.data;
  const courseOptions = (coursesData?.data || []).map((cc: any) => ({
    id: cc.id,
    code: cc.code,
    name: cc.name,
  }));

  // Map server Q rows back into CreateClinicalQuestionInput shape so the builder
  // can edit them with the same component contract used by /new.
  const initialQuestions = (c.questions || []).map((q: ClinicalCaseQuestion) => ({
    question_type: q.question_type,
    question_text: q.question_text,
    question_media_url: q.question_media_url,
    options: q.options,
    correct_answer: q.correct_answer,
    expected_regions: q.expected_regions,
    points: q.points,
    order_index: q.order_index,
    metadata: q.metadata,
  }));

  const initialValue: Partial<CreateClinicalCaseInput> = {
    course_id: c.course_id,
    title: c.title,
    description: c.description || undefined,
    case_scenario: c.case_scenario || {
      patient_name: '',
      age: 0,
      gender: '',
      chief_complaint: '',
      hopi: '',
    },
    metadata: c.metadata,
    time_limit_minutes: c.time_limit_minutes,
    pass_threshold: c.pass_threshold,
    questions: initialQuestions,
  };

  const isArchived = c.status === 'archived';

  const handleSave = async (value: CreateClinicalCaseInput) => {
    setActionError(null);
    try {
      await update.mutateAsync({
        id: c.id,
        input: {
          title: value.title,
          description: value.description,
          case_scenario: value.case_scenario,
          metadata: value.metadata,
          time_limit_minutes: value.time_limit_minutes,
          pass_threshold: value.pass_threshold,
          questions: value.questions,
        },
      });
    } catch (e: any) {
      setActionError(e?.message || 'Failed to save.');
    }
  };

  const handleTransition = async (status: ClinicalCaseStatus) => {
    setActionError(null);
    if (status === 'archived') {
      const ok = window.confirm(
        `Archive "${c.title}"? Students will no longer be able to attempt this case. Existing submissions stay intact. This is irreversible.`
      );
      if (!ok) return;
    }
    // Publish is confirmed via the AlertDialog below (handlePublishConfirmed),
    // so it does not prompt here.
    try {
      await transition.mutateAsync({ id: c.id, status });
    } catch (e: any) {
      setActionError(e?.message || 'Transition failed.');
    }
  };

  const handlePublishConfirmed = async () => {
    setShowPublishConfirm(false);
    await handleTransition('published');
  };

  return (
    <ContentLayout title="Edit Case">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Clinical Cases', href: '/pde/faculty/cases' },
          { label: c.title.slice(0, 40) + (c.title.length > 40 ? '…' : '') },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div className="flex flex-col sm:flex-row justify-between gap-3 sm:items-start">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
                {c.title}
              </h1>
              <StatusPill status={c.status} />
              <Badge variant="outline">v{c.version}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {c.course_code ? `${c.course_code} — ${c.course_name}` : c.course_name} ·{' '}
              {c.questions.length} questions
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/pde/faculty/cases/${c.id}/preview`}>
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </Link>
            </Button>
            {c.status === 'published' ? (
              <Button asChild variant="outline">
                <Link href={`/pde/faculty/cases/${c.id}/attempts`}>Cohort</Link>
              </Button>
            ) : null}
            {c.status === 'draft' ? (
              <Button
                onClick={() => setShowPublishConfirm(true)}
                disabled={transition.isPending}
                className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
              >
                <Send className="mr-2 h-4 w-4" />
                Publish
              </Button>
            ) : null}
            {c.status === 'published' ? (
              <Button
                variant="outline"
                onClick={() => handleTransition('draft')}
                disabled={transition.isPending}
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Revoke to draft
              </Button>
            ) : null}
            {!isArchived ? (
              <Button
                variant="outline"
                onClick={() => handleTransition('archived')}
                disabled={transition.isPending}
                className="text-red-600 hover:text-red-700"
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </Button>
            ) : null}
          </div>
        </div>

        {actionError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {isArchived ? (
          <Alert>
            <Archive className="h-4 w-4" />
            <AlertDescription>
              This case is archived. Past submissions are preserved but no new attempts can be made.
              Editing is disabled.
            </AlertDescription>
          </Alert>
        ) : (
          <CaseFormBuilder
            initialValue={initialValue}
            courseOptions={courseOptions}
            saving={update.isPending}
            saveLabel={
              c.status === 'published' ? 'Save changes (bumps version)' : 'Save draft'
            }
            onSave={handleSave}
            extraActions={
              <p className="text-xs text-muted-foreground">
                Editing a published case bumps the version. Past learner submissions stay
                pinned to the version they took.
              </p>
            }
          />
        )}
      </div>

      <AlertDialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this case?</AlertDialogTitle>
            <AlertDialogDescription>
              Publish — learners will see it immediately. You can still edit after
              (editing a published case bumps the version; past submissions stay
              pinned to the version they took).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transition.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePublishConfirmed}
              disabled={transition.isPending}
              className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
