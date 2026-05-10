'use client';

/**
 * AI Pulse — Live Session Page (per-cycle)
 *
 * Route: /ai-pulse/live/[cycle]
 *
 * Wave B.2 deliverable. Permission-gated by `aiPulse:view.self` (PR #716);
 * the actual UX (Join, polls, quiz, engagement progress, heartbeat) lives
 * in the client shell `_components/live-session-shell.tsx`. This file
 * resolves the cycle param + gates rendering on permission.
 *
 * Stack deps:
 *   - PR #644: event_team_attendance.engagement_signals JSONB column
 *   - PR #716: aiPulse:view.self / aiPulse:submit.quiz permission keys
 *
 * Spec: specs/myjkkn-ai-pulse-spec.md §2 / §5 / Q5 (4-AND engagement gate)
 */

import { use } from 'react';
import Link from 'next/link';
import { Lock, ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { LiveSessionShell } from './_components/live-session-shell';

interface PageProps {
  params: Promise<{ cycle: string }>;
}

export default function AiPulseLiveSessionPage({ params }: PageProps) {
  const { cycle } = use(params);
  const { can, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title="AI Pulse — Live Session">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Checking access…
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!can('aiPulse:view.self')) {
    return (
      <ContentLayout title="AI Pulse — Live Session">
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">You don&apos;t have access to this AI Pulse cycle.</p>
            <p className="text-sm text-muted-foreground max-w-md">
              The Live Session view is for enrolled learners. If you believe this
              is a mistake, ask your Class Incharge or AI Pulse Champion to grant
              the <code className="bg-muted px-1 rounded">aiPulse:view.self</code>{' '}
              permission.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/ai-pulse">
                <ArrowLeft className="h-4 w-4" />
                Back to My Pulse
              </Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="AI Pulse — Live Session">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Live Session', href: `/ai-pulse/live/${cycle}` },
        ]}
      />
      <LiveSessionShell cycleId={cycle} />
    </ContentLayout>
  );
}
