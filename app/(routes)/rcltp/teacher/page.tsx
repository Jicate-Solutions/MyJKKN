'use client';

// =============================================================================
// /rcltp/teacher — RCLTP Teacher Console hub INDEX (Phase 4c)
// =============================================================================
// The teacher's home for running RCLTP in their classes: open assessments for a
// class, review Part A voice recordings, and approve Part B comprehension
// questions. This page is a real index — it links to the three teacher sub-tools;
// each sub-route enforces its own permission gate.
//
// Gated to rcltp.assessment.manage (the core "run assessments for my class"
// capability). Access failures are surfaced explicitly (rule #27), never a
// silent redirect.
// =============================================================================

import Link from 'next/link';
import { ClipboardList, Mic, ListChecks, Sparkles, Lock } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const navMeta = {
  label: 'RCLTP Teacher',
  icon: 'Users',
} as const;

interface TeacherTool {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  /** The permission the destination page itself gates on (shown for clarity). */
  permission: string;
}

const TEACHER_TOOLS: TeacherTool[] = [
  {
    id: 'assessments',
    title: 'Open assessment for class',
    description:
      'Assign a reading assessment to a learner — pick the school, learner, approved passage, type (baseline / cycle / practice) and grade. Manage the 6 yearly assessment windows here too.',
    href: '/rcltp/teacher/assessments',
    icon: ClipboardList,
    permission: 'rcltp.assessment.manage',
  },
  {
    id: 'recordings',
    title: 'Recording review',
    description:
      'Listen to learners’ Part A voice recordings and record your manual review. Auto voice-scoring is pending (MyJKKN) — you score by hand for now.',
    href: '/rcltp/teacher/recordings',
    icon: Mic,
    permission: 'rcltp.review',
  },
  {
    id: 'questions',
    title: 'Question review',
    description:
      'Approve or retire draft Part B comprehension questions before they reach students. Draft content is never shown to learners until you approve it.',
    href: '/rcltp/teacher/questions',
    icon: ListChecks,
    permission: 'rcltp.question.approve',
  },
  {
    id: 'remedial-plans',
    title: 'Remedial plans',
    description:
      'At-risk readers are flagged from their latest cycle. Request an AI-drafted remedial reading plan, then review, edit, and approve it — the AI drafts, you decide.',
    href: '/rcltp/teacher/remedial-plans',
    icon: Sparkles,
    permission: 'rcltp.review',
  },
];

function ToolCard({ tool }: { tool: TeacherTool }) {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.href}
      className='group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      aria-label={`Open ${tool.title}`}
    >
      <Card className='h-full transition-all hover:border-primary/60 hover:shadow-md'>
        <CardHeader>
          <div className='mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20'>
            <Icon className='h-5 w-5' aria-hidden='true' />
          </div>
          <CardTitle className='text-base group-hover:text-primary'>
            {tool.title}
          </CardTitle>
          <CardDescription className='leading-relaxed'>
            {tool.description}
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

export default function RcltpTeacherPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='RCLTP Teacher Console'>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-64' />
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            <Skeleton className='h-44 w-full' />
            <Skeleton className='h-44 w-full' />
            <Skeleton className='h-44 w-full' />
          </div>
        </div>
      </ContentLayout>
    );
  }

  const allowed = isSuperAdmin || can('rcltp.assessment.manage');
  if (!allowed) {
    return (
      <ContentLayout title='RCLTP Teacher Console'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to the Teacher Console</AlertTitle>
          <AlertDescription>
            Running RCLTP assessments for your class requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>
              rcltp.assessment.manage
            </code>{' '}
            permission. Contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='RCLTP Teacher Console'>
      <div className='space-y-6'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            Teacher Console
          </h1>
          <p className='mt-1 max-w-2xl text-sm text-muted-foreground'>
            Your tools for running RCLTP reading assessments in your classes —
            open assessments and schedule the yearly cycle windows, review Part A
            voice recordings by hand, and approve the comprehension questions
            learners will see.
          </p>
        </div>

        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {TEACHER_TOOLS.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>

        <p className='border-t pt-4 text-xs text-muted-foreground'>
          Each tool checks its own permission — if you can open this console but
          a tool says “no access”, ask your administrator to grant that specific
          permission. RCLTP v1 is English-only.
        </p>
      </div>
    </ContentLayout>
  );
}
