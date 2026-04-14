'use client';

/**
 * SF100SmartRouter — role-based router for /solve-for-100
 *
 * Auto-redirects authenticated users to their canonical dashboard:
 *   • Admin (super_admin, administrator, hod, principal) → /admin
 *   • Mentor (faculty)                                   → /mentor
 *   • Enrolled student                                   → /dashboard
 *   • Unenrolled student / visitor                       → show landing page
 *
 * Override: visiting /solve-for-100?view=landing bypasses the redirect
 * and shows the original program landing page for everyone.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-provider';
import { useMySF100Enrollment, useSF100Programs } from '@/hooks/startup-studio';
import { SF100Landing } from './sf100-landing';

const ADMIN_ROLES = ['super_admin', 'administrator', 'hod', 'principal'];
const MENTOR_ROLES = ['faculty'];

export function SF100SmartRouter() {
  const { profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Escape hatch: ?view=landing shows the landing page regardless of role
  const forceShowLanding = searchParams.get('view') === 'landing';

  // Discover active program + user enrollment
  const { data: programsRaw, isLoading: programsLoading } = useSF100Programs();
  const programs = Array.isArray(programsRaw) ? programsRaw : (programsRaw as any)?.data || [];
  const activeProgram = programs.find((p: any) => p.status === 'active') || programs[0];
  const activeProgramId: string = activeProgram?.id ?? '';

  const { data: myEnrollment, isLoading: enrollmentLoading } = useMySF100Enrollment(activeProgramId);
  const enrollmentId: string | undefined = (myEnrollment as any)?.id;

  const [redirected, setRedirected] = useState(false);
  const [shouldShowLanding, setShouldShowLanding] = useState(false);

  useEffect(() => {
    // Wait for all data to load
    if (authLoading || programsLoading || enrollmentLoading) return;
    if (redirected || shouldShowLanding) return;

    // User forced landing view OR unauthenticated → show landing
    if (forceShowLanding || !profile) {
      setShouldShowLanding(true);
      return;
    }

    const role = profile.role ?? '';
    const isAdmin = ADMIN_ROLES.includes(role);
    const isMentor = MENTOR_ROLES.includes(role);

    // Admin → unified admin dashboard
    if (isAdmin) {
      setRedirected(true);
      router.replace('/startup-studio/solve-for-100/admin');
      return;
    }

    // Mentor → mentor dashboard
    if (isMentor) {
      setRedirected(true);
      router.replace('/startup-studio/solve-for-100/mentor');
      return;
    }

    // Enrolled student → team dashboard
    if (enrollmentId) {
      setRedirected(true);
      router.replace('/startup-studio/solve-for-100/dashboard');
      return;
    }

    // Unenrolled / unknown role → show landing
    setShouldShowLanding(true);
  }, [
    authLoading, programsLoading, enrollmentLoading, profile, enrollmentId,
    forceShowLanding, redirected, shouldShowLanding, router,
  ]);

  // Loading state while we decide
  if (!shouldShowLanding && !redirected) {
    return <RoutingSkeleton />;
  }

  // Mid-redirect — show a brief "taking you there" state
  if (redirected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Taking you to your dashboard…</p>
        </CardContent>
      </Card>
    );
  }

  // Landing page (unenrolled or ?view=landing)
  return <SF100Landing />;
}

function RoutingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}
