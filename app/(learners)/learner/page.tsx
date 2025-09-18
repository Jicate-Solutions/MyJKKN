'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { LearnerProfileHeader } from '@/components/layout/learner-profile-header';
import { LearnerBannerCarousel } from '@/components/layout/learner-banner-carousel';
import { LearnerServiceCategories } from '@/components/layout/learner-service-categories';
import { LearnerDashboardCards } from '@/components/layout/learner-dashboard-cards';
import { Skeleton } from '@/components/ui/skeleton';
import { useFavorites } from '@/hooks/use-favorites';
import { motion } from 'framer-motion';
import { Heart, Star, Play, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

export default function LearnerDashboardPage() {
  const { user, loading } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const { favorites, loading: favoritesLoading } = useFavorites();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  const handleLaunchApp = (app: any) => {
    window.open(app.url, '_blank', 'noopener,noreferrer');
  };

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
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900 relative transition-colors duration-200'>
      <div className='pb-20 relative'>
        {/* Add padding for bottom navigation */}
        {/* <LearnerProfileHeader user={user} currentTime={currentTime} /> */}

        {/* Dashboard Cards - Featured prominently */}
        <LearnerDashboardCards />

        <LearnerBannerCarousel />

        {/* Favorite Apps Section - Play Store Style */}
        {!favoritesLoading && favorites.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className='px-4 py-6 relative z-10'
          >
            <div className='bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative'>
              {/* Section Header */}
              <div className='flex items-center justify-between p-4 pb-3 border-b border-gray-50 relative z-20'>
                <div className='flex items-center gap-3'>
                  <div className='w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center'>
                    <Heart className='h-4 w-4 text-white fill-white' />
                  </div>
                  <div>
                    <h3 className='text-lg font-bold text-gray-900'>
                      My Favorites
                    </h3>
                    <p className='text-sm text-gray-500'>
                      Quick access to your favorite apps
                    </p>
                  </div>
                </div>
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-blue-600 hover:text-blue-700 hover:bg-blue-50 cursor-pointer relative z-30 pointer-events-auto'
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('See all button clicked!');
                    window.location.href = '/learner/apps';
                  }}
                >
                  See all
                  <ChevronRight className='h-4 w-4 ml-1' />
                </Button>
              </div>

              {/* Grid Layout for Apps */}
              <div className='p-4 relative z-20'>
                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'>
                  {favorites.slice(0, 12).map((app, index) => (
                    <motion.div
                      key={app.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className='bg-white border border-gray-100 rounded-2xl p-3 hover:shadow-lg hover:border-blue-200 transition-all duration-200 cursor-pointer group relative z-30 pointer-events-auto'
                      onClick={(e) => {
                        e.preventDefault();
                        console.log('App card clicked:', app.name);
                        window.open(app.url, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      {/* App Icon */}
                      <div className='relative mb-3 flex justify-center'>
                        <div className='w-16 h-16 rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white group-hover:scale-105 transition-transform duration-200'>
                          {app.icon_path ? (
                            <Image
                              src={app.icon_path}
                              alt={app.name}
                              width={64}
                              height={64}
                              className='w-full h-full object-cover'
                            />
                          ) : (
                            <div className='w-full h-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center'>
                              <Play className='h-7 w-7 text-blue-500' />
                            </div>
                          )}
                        </div>
                        {/* Active indicator */}
                        {app.is_active && (
                          <div className='absolute -top-1 -right-4 w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-sm' />
                        )}
                      </div>

                      {/* App Info */}
                      <div className='text-center'>
                        <h4 className='font-semibold text-gray-900 text-sm mb-1 line-clamp-2 group-hover:text-blue-600 transition-colors leading-tight'>
                          {app.name}
                        </h4>
                        <p className='text-xs text-gray-500 mb-2'>
                          {app.category?.name || 'Educational'}
                        </p>

                        {/* Rating */}
                        <div className='flex items-center justify-center gap-1 mb-3'>
                          <Star className='h-3 w-3 fill-yellow-400 text-yellow-400' />
                          <span className='text-xs font-medium text-gray-600'>
                            {(4.2 + Math.random() * 0.8).toFixed(1)}
                          </span>
                          <span className='text-xs text-gray-400'>
                            ({Math.floor(Math.random() * 500 + 50)})
                          </span>
                        </div>

                        {/* Action Button */}
                        <Button
                          size='sm'
                          className='w-full h-8 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-medium rounded-lg shadow-sm cursor-pointer relative z-40 pointer-events-auto'
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            console.log('Open button clicked:', app.name);
                            window.open(
                              app.url,
                              '_blank',
                              'noopener,noreferrer'
                            );
                          }}
                        >
                          <Play className='h-3 w-3 mr-1' />
                          Open
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* View All Link */}
                {favorites.length > 12 && (
                  <div className='text-center mt-4 relative z-30'>
                    <Button
                      variant='ghost'
                      className='text-blue-600 hover:text-blue-700 hover:bg-blue-50 cursor-pointer relative z-40 pointer-events-auto'
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('View more apps button clicked!');
                        window.location.href = '/learner/apps';
                      }}
                    >
                      View {favorites.length - 12} more apps
                      <ChevronRight className='h-4 w-4 ml-1' />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}

        <LearnerServiceCategories />
      </div>
    </div>
  );
}
