'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { LearnerProfileHeader } from '@/components/layout/learner-profile-header';
import { LearnerBannerCarousel } from '@/components/layout/learner-banner-carousel';
import { LearnerServiceCategories } from '@/components/layout/learner-service-categories';
import { Skeleton } from '@/components/ui/skeleton';

export default function LearnerDashboardPage() {
  const { user, loading } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className='min-h-screen bg-gray-50'>
        <div className='px-4 py-6'>
          <div className='space-y-4'>
            <Skeleton className='h-20 w-full rounded-xl' />
            <Skeleton className='h-12 w-full rounded-full' />
            <Skeleton className='h-48 w-full rounded-2xl' />
            <div className='grid grid-cols-3 gap-6'>
              <Skeleton className='h-20 w-full rounded-xl' />
              <Skeleton className='h-20 w-full rounded-xl' />
              <Skeleton className='h-20 w-full rounded-xl' />
              <Skeleton className='h-20 w-full rounded-xl' />
              <Skeleton className='h-20 w-full rounded-xl' />
              <Skeleton className='h-20 w-full rounded-xl' />
              <Skeleton className='h-20 w-full rounded-xl' />
              <Skeleton className='h-20 w-full rounded-xl' />
              <Skeleton className='h-20 w-full rounded-xl' />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='pb-20'>
        {' '}
        {/* Add padding for bottom navigation */}
        <LearnerProfileHeader user={user} currentTime={currentTime} />
        <LearnerBannerCarousel />
        <LearnerServiceCategories />
      </div>
    </div>
  );
}
