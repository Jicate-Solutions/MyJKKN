'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { LearnerDashboardMain } from '@/components/layout/dashboard/learner-dashboard-main';
import { Skeleton } from '@/components/ui/skeleton';

export default function LearnerDashboardPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-green-50/20'>
        <div className='p-6'>
          <div className='space-y-6'>
            {/* Header Skeleton */}
            <div className='space-y-2'>
              <Skeleton className='h-8 w-48' />
              <Skeleton className='h-5 w-80' />
            </div>

            {/* Stats Cards Skeleton */}
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6'>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className='h-32 w-full rounded-xl' />
              ))}
            </div>

            {/* Analytics Section Skeleton */}
            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
              <Skeleton className='lg:col-span-2 h-80 w-full rounded-xl' />
              <Skeleton className='h-80 w-full rounded-xl' />
            </div>

            {/* Bottom Section Skeleton */}
            <div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
              <Skeleton className='lg:col-span-2 h-96 w-full rounded-xl' />
              <Skeleton className='lg:col-span-2 h-96 w-full rounded-xl' />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <LearnerDashboardMain />;
}
