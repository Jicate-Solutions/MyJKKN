'use client';

/**
 * SF100MyTeamDashboard — Unified tabbed dashboard for the current user's team
 *
 * Auto-discovers the user's enrollment in the active program and renders
 * the rich 5-tab experience (Overview | Check-ins | Paid Users | Interviews | Pivots).
 *
 * Replaces the fragmented experience where users navigated between:
 *   /dashboard (simple overview)
 *   /team/[id]/check-ins
 *   /team/[id]/paid-users
 *   /team/[id]/interviews
 *   /team/[id]/pivots
 *
 * Now: all of the above is ONE page with tabs + URL query param deep-linking.
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Rocket, PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-provider';
import { useMySF100Enrollment, useSF100Programs } from '@/hooks/startup-studio';
import { SF100TeamDetail } from '../../team/[enrollmentId]/_components/sf100-team-detail';

const VALID_TABS = ['overview', 'check-ins', 'paid-users', 'interviews', 'pivots'] as const;
type TabValue = typeof VALID_TABS[number];

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export function SF100MyTeamDashboard() {
  useAuth();
  const searchParams = useSearchParams();

  // URL query param support — deep-linkable tabs
  const urlTab = searchParams.get('tab');
  const defaultTab: TabValue = (urlTab && (VALID_TABS as readonly string[]).includes(urlTab))
    ? (urlTab as TabValue)
    : 'overview';

  // Discover active program
  const { data: programsRaw, isLoading: programsLoading } = useSF100Programs();
  const programs = Array.isArray(programsRaw) ? programsRaw : (programsRaw as any)?.data || [];
  const activeProgram = programs.find((p: any) => p.status === 'active') || programs[0];
  const activeProgramId: string = activeProgram?.id ?? '';

  // Get user's enrollment
  const {
    data: myEnrollment,
    isLoading: enrollmentLoading,
    error: enrollmentError,
  } = useMySF100Enrollment(activeProgramId);

  const enrollmentId: string | undefined = (myEnrollment as any)?.id;

  const isLoading = programsLoading || enrollmentLoading;
  if (isLoading) return <DashboardSkeleton />;

  // No active program
  if (!activeProgramId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Rocket className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-lg font-medium">No active Solve for 100 program</p>
          <p className="text-sm text-muted-foreground mt-1">
            There's no program running right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Not enrolled
  if (enrollmentError || !enrollmentId) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <Rocket className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="text-lg font-medium">You&apos;re not enrolled</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your team hasn&apos;t joined the active Solve for 100 program yet.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button asChild variant="outline" size="sm">
              <Link href="/startup-studio/solve-for-100">Learn about the program</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/startup-studio/events">Back to events</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Enrolled — render rich tabbed dashboard
  return (
    <div className="space-y-4">
      {/* Primary action: Submit Check-in is the most common team action */}
      <div className="flex items-center justify-between bg-muted/30 border rounded-xl p-3 gap-2">
        <p className="text-sm text-muted-foreground hidden sm:block">
          Ready to update your team&apos;s progress?
        </p>
        <Button asChild size="sm">
          <Link href={`/startup-studio/solve-for-100/dashboard/checkin?enrollmentId=${enrollmentId}`}>
            <PlusCircle className="h-4 w-4 mr-1.5" /> Submit Weekly Check-in
          </Link>
        </Button>
      </div>

      {/* Rich 5-tab team detail — URL query ?tab=X controls initial tab */}
      <SF100TeamDetail enrollmentId={enrollmentId} defaultTab={defaultTab} />
    </div>
  );
}
