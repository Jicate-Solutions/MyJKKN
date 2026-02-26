import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardBentoGrid } from './_components/dashboard-bento-grid';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import StudentDashboard from './_components/dashboards/student-dashboard';
import AdminDashboard from './_components/dashboards/admin-dashboard';
import { redirect } from 'next/navigation';

// Force dynamic rendering to prevent PPR timing issues with redirect()
// This is a Next.js 16.1.1 workaround for async server components with auth
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  console.log('[Dashboard Page] 🏠 Dashboard page loaded');

  return (
    <ContentLayout title='Dashboard'>
      {/* Animated glass background */}
      <div className='fixed inset-0 -z-10 overflow-hidden pointer-events-none'>
        <div className='absolute inset-0 bg-gradient-to-br from-green-50/50 via-emerald-50/30 to-green-50/50 dark:from-green-950/30 dark:via-emerald-950/20 dark:to-green-950/30' />
        <div className='absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-green-400/10 via-transparent to-emerald-400/10 blur-3xl animate-blob' />
        <div className='absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-tr from-emerald-400/10 via-transparent to-green-400/10 blur-3xl animate-blob animation-delay-2000' />
      </div>

      <div className='space-y-3 sm:space-y-4 lg:space-y-6 px-1 sm:px-2 lg:px-4'>
        {/* BentoGrid Section - Server rendered with Suspense */}
        <Suspense fallback={<LoadingSkeleton />}>
          <BentoGridSection />
        </Suspense>

        {/* Role-Based Dashboard Section - Server rendered with Suspense */}
        <Suspense fallback={<LoadingSkeleton />}>
          <RoleBasedDashboard />
        </Suspense>
      </div>
    </ContentLayout>
  );
}

/**
 * BentoGrid Section - Async Server Component
 */
async function BentoGridSection() {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <DashboardBentoGrid currentUser='Guest' />
    );
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const currentUser = profile?.full_name || user.email?.split('@')[0] || 'User';

  return (
    <div className='w-full'>
      <DashboardBentoGrid currentUser={currentUser} />
    </div>
  );
}

/**
 * Role-Based Dashboard Section - Async Server Component
 */
async function RoleBasedDashboard() {
  const supabase = await createServerSupabaseClient();

  // Get current user — destructure error so we can distinguish auth failure from query failure
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    console.error('[Dashboard] getUser() error:', userError.message, userError.status);
  }

  if (!user) {
    // Only redirect if there's no error (truly unauthenticated).
    // If there IS an auth error it likely means a bad/expired session — redirect anyway,
    // but at least we have a log trail to distinguish the two cases.
    console.warn('[Dashboard] No user found — redirecting to login', userError ? `(error: ${userError.message})` : '(clean null)');
    redirect('/login');
  }

  // Get user profile with role — always destructure the error so RLS/network failures
  // are visible in server logs and don't silently look like "no profile exists"
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, learner_id')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('[Dashboard] Profile query error for user', user.id, ':', profileError.message, profileError.code);
    // Return an error UI instead of redirecting — a DB/RLS error is not an auth failure.
    // Redirecting to login here would create an infinite loop for authenticated users.
    return (
      <div className='text-center py-8 text-muted-foreground'>
        Unable to load your profile. Please refresh the page or contact support.
        {process.env.NODE_ENV === 'development' && (
          <pre className='mt-2 text-xs text-left bg-muted p-2 rounded'>{profileError.message} ({profileError.code})</pre>
        )}
      </div>
    );
  }

  if (!profile) {
    console.warn('[Dashboard] Profile not found for user', user.id, '— redirecting to login');
    redirect('/login');
  }

  // Fetch dashboard preferences
  const { data: preferences } = await supabase
    .from('user_dashboard_preferences')
    .select('widget_id, is_visible')
    .eq('user_id', user.id);

  // Build visibility map from preferences
  const visibilityMap: Record<string, boolean> = {};
  if (preferences && preferences.length > 0) {
    preferences.forEach((pref) => {
      visibilityMap[pref.widget_id] = pref.is_visible;
    });
  }

  // Route to role-specific dashboard
  switch (profile.role) {
    case 'student': {
      if (!profile.learner_id) {
        console.error('[Dashboard] Student role but no learner_id assigned to profile');
        return (
          <div className='flex flex-col items-center justify-center min-h-[400px] gap-4'>
            <div className='text-center space-y-2'>
              <h2 className='text-lg font-semibold'>Profile Setup Incomplete</h2>
              <p className='text-sm text-muted-foreground'>
                Your student profile is not yet linked to a section.
                Please contact your administrator to complete your profile setup.
              </p>
            </div>
          </div>
        );
      }

      // Fetch learner profile to get student_id and section_id
      const { data: learner } = await supabase
        .from('learners_profiles')
        .select('id, section_id')
        .eq('id', profile.learner_id)
        .single();

      if (!learner) {
        console.error('[Dashboard] Student role but no learner profile found for id:', profile.learner_id);
        return (
          <div className='flex flex-col items-center justify-center min-h-[400px] gap-4'>
            <div className='text-center space-y-2'>
              <h2 className='text-lg font-semibold'>Profile Setup Incomplete</h2>
              <p className='text-sm text-muted-foreground'>
                Your student profile record could not be found.
                Please contact your administrator to complete your profile setup.
              </p>
            </div>
          </div>
        );
      }

      if (!learner.section_id) {
        console.warn('[Dashboard] Student has no section assigned');
        return (
          <div className='flex flex-col items-center justify-center min-h-[400px] gap-4'>
            <div className='text-center space-y-2'>
              <h2 className='text-lg font-semibold'>Profile Setup Incomplete</h2>
              <p className='text-sm text-muted-foreground'>
                You have not been assigned to a section yet.
                Please contact your administrator to complete your profile setup.
              </p>
            </div>
          </div>
        );
      }

      return (
        <StudentDashboard
          userId={user.id}
          studentId={learner.id}
          sectionId={learner.section_id}
          role={profile.role}
          visibilityMap={visibilityMap}
        />
      );
    }

    case 'faculty': {
      // TODO: Implement FacultyDashboard in next task
      return (
        <div className='text-center py-8 text-muted-foreground'>
          Faculty dashboard coming soon...
        </div>
      );
    }

    case 'hod': {
      // FIX: 2026-01-31 - Added HOD role support
      // HODs get admin dashboard access for department management
      return (
        <AdminDashboard
          userId={user.id}
          role={profile.role}
          visibilityMap={visibilityMap}
        />
      );
    }

    case 'leadership': {
      // TODO: Implement LeadershipDashboard in next task
      return (
        <div className='text-center py-8 text-muted-foreground'>
          Leadership dashboard coming soon...
        </div>
      );
    }

    case 'store_admin':
    case 'admin':
    case 'super_admin': {
      return (
        <AdminDashboard
          userId={user.id}
          role={profile.role}
          visibilityMap={visibilityMap}
        />
      );
    }

    default: {
      console.error('[Dashboard] Unknown role:', profile.role);
      return (
        <div className='text-center py-8 text-muted-foreground'>
          Dashboard not available for your role.
        </div>
      );
    }
  }
}
