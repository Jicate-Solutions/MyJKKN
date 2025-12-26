// ============================================
// USER MANAGEMENT PAGE - SERVER COMPONENT (CACHE COMPONENTS ENABLED)
// ============================================
// Created: 2025-01-26
// Updated: Converted to Server Component for performance
// Architecture:
//   - Server: Fetches cached profile and stats
//   - Client: Dynamic user list with filters (UsersClientWrapper)
//   - Caching: Profile + stats cached, list remains dynamic
// ============================================

import { Suspense } from 'react';
import Link from 'next/link';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { getCachedUserStats } from '@/lib/services/users/user-stats-server';
import { Button } from '@/components/ui/button';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Download } from 'lucide-react';
import { UsersClientWrapper } from './_components/users-client-wrapper';

/**
 * Users Management Page - Server Component
 *
 * Performance Optimizations:
 * - Profile fetched on server (cached per user)
 * - Stats fetched on server (cached per institution, 1 hour)
 * - User list client-side for interactivity (filters, pagination)
 * - Suspense boundary for streaming user list
 */
export default async function UsersPage() {
  // Fetch profile and stats in parallel on the server
  const [profileResult, stats] = await Promise.all([
    getEnhancedUserProfile(),
    getCachedUserStats() // Cached with cacheLife('hours')
  ]);

  const profile = profileResult.profile;

  // If user has institution, get stats for that institution
  // Otherwise, get all stats (for super admins)
  const institutionId = profile?.institution_id;
  const institutionStats = institutionId
    ? await getCachedUserStats(institutionId)
    : stats;

  return (
    <ContentLayout title='Users'>
      <div className='flex justify-between items-center'>
        <div className='space-y-1'>
          <PageBreadcrumb
            items={[{ label: 'Home', href: '/' }, { label: 'Users' }]}
          />
          <h2 className='text-2xl font-bold'>User Management</h2>
          <p className='text-sm text-muted-foreground'>
            View and manage user accounts
          </p>
        </div>
        <div className='flex items-center gap-4'>
          <Button variant='outline'>
            <Download className='mr-2 h-4 w-4' />
            Export
          </Button>
          <Button asChild>
            <Link href='/users/new'>
              <Plus className='mr-2 h-4 w-4' />
              Add User
            </Link>
          </Button>
        </div>
      </div>

      {/* Suspense boundary for streaming dynamic content */}
      <div className='mt-4'>
        <Suspense fallback={<UsersPageSkeleton />}>
          <UsersClientWrapper
            initialProfile={profile}
            initialStats={institutionStats}
          />
        </Suspense>
      </div>
    </ContentLayout>
  );
}

/**
 * Loading skeleton for Suspense fallback
 */
function UsersPageSkeleton() {
  return (
    <div className='space-y-6'>
      {/* Stats cards skeleton */}
      <div className='grid gap-4 md:grid-cols-4'>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className='h-24 w-full' />
        ))}
      </div>

      {/* User list skeleton */}
      <Skeleton className='h-[600px] w-full' />
    </div>
  );
}
