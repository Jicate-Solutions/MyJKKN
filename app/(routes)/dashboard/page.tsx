import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardBentoGrid } from './_components/dashboard-bento-grid';
import { LoadingSkeleton } from '@/components/loading-skeleton';

export default async function DashboardPage() {

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
