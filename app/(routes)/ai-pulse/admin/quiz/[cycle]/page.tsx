'use client';

// app/(routes)/ai-pulse/admin/quiz/[cycle]/page.tsx
// ============================================
// AI PULSE — QUIZ AUTHORING CONSOLE (Wave B.7)
// ============================================
// Champion (Krishnaveni) + Co-Champion (Ranjith) author bilingual quizzes per
// cycle here. Spec: specs/myjkkn-ai-pulse-spec.md §5 + Q7 + Q16.
//
// Permission gate: super_admin OR aiPulse:quiz.author.
// Permission key is shipped via PR #716 (catalog). Until then, only super_admin
// can reach this page in production — the gate is correct, the catalog just
// hasn't enumerated the key yet.
//
// Storage: quiz lives in startup_events.config.quiz JSONB.
// ============================================

import { use } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

import { QuizEditor } from './_components/quiz-editor';

const QUIZ_AUTHOR_PERMISSION = 'aiPulse:quiz.author';

interface QuizAuthoringPageProps {
  params: Promise<{ cycle: string }>;
}

export default function QuizAuthoringPage({ params }: QuizAuthoringPageProps) {
  const { cycle } = use(params);
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();

  const canAuthor = isSuperAdmin || can(QUIZ_AUTHOR_PERMISSION);

  if (permsLoading) {
    return (
      <ContentLayout title="AI Pulse · Quiz Authoring">
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!canAuthor) {
    return (
      <ContentLayout title="AI Pulse · Quiz Authoring">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access denied</AlertTitle>
          <AlertDescription>
            This console is restricted to AI Pulse Champions (and super-admins).
            Required permission:{' '}
            <code className="font-mono">{QUIZ_AUTHOR_PERMISSION}</code>. Ask a
            super-admin to assign you the AI Pulse Champion or Co-Champion role
            in Role Management.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="AI Pulse · Quiz Authoring">
      <PageBreadcrumb
        items={[
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Admin', href: '/ai-pulse/admin/cycles' },
          { label: 'Quiz' },
        ]}
      />

      <div className="mt-4 mb-6 max-w-3xl">
        <h1 className="text-2xl font-semibold">Quiz Authoring Console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Author bilingual (English + Tamil) quiz questions for this cycle.
          Quizzes gate engagement-attendance for both live and async-make-up
          learners. Use AI-suggest to seed 5 questions from the recording, then
          edit / replace as needed.
        </p>
      </div>

      <QuizEditor cycleId={cycle} />
    </ContentLayout>
  );
}
