'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  ExternalLink,
  Star,
  Users,
  ChevronRight,
  Image as ImageIcon,
  Play,
  Heart
} from 'lucide-react';
import { Application } from '@/types/applications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { LearnerAppDetailDialog } from './learner-app-detail-dialog';
import { useFavorites } from '@/hooks/use-favorites';

interface LearnerAppCardProps {
  application: Application;
  onAppOpen?: (app: Application) => void;
}

export function LearnerAppCard({
  application,
  onAppOpen
}: LearnerAppCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const {
    isFavorite,
    toggleFavorite,
    loading: favoritesLoading
  } = useFavorites();

  const handleOpenApp = () => {
    if (onAppOpen) {
      onAppOpen(application);
    }
    // Open the application URL
    window.open(application.url, '_blank', 'noopener,noreferrer');
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await toggleFavorite(application.id);
  };

  const mockRating = 4.2 + Math.random() * 0.8; // Mock rating between 4.2-5.0
  const mockDownloads = Math.floor(Math.random() * 5000) + 1000; // Mock downloads

  return (
    <>
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className='h-full'
      >
        <Card className='group h-full flex flex-col overflow-hidden border-0 shadow-lg hover:shadow-2xl transition-all duration-300 bg-white/90 backdrop-blur-md relative'>
          {/* Gradient overlay for visual appeal */}
          <div className='absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-blue-50/30 pointer-events-none' />

          <CardHeader className='p-4 pb-3 relative z-10'>
            <div className='flex items-start gap-3'>
              {/* App Icon */}
              <div className='relative flex-shrink-0'>
                <div className='w-16 h-16 rounded-2xl overflow-hidden border border-gray-200/50 shadow-lg bg-gradient-to-br from-gray-50 to-gray-100 group-hover:shadow-xl transition-shadow duration-300'>
                  {application.icon_path && !imageError ? (
                    <Image
                      src={application.icon_path}
                      alt={application.name}
                      width={64}
                      height={64}
                      className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-110'
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className='w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10'>
                      <ImageIcon className='h-7 w-7 text-blue-500' />
                    </div>
                  )}
                </div>
                {application.is_active && (
                  <div className='absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full border-2 border-white shadow-md flex items-center justify-center'>
                    <div className='w-2 h-2 bg-white rounded-full animate-pulse' />
                  </div>
                )}
              </div>

              {/* App Info */}
              <div className='flex-1 min-w-0'>
                <div className='flex items-start justify-between'>
                  <div className='flex-1 min-w-0'>
                    <h3 className='font-bold text-gray-900 line-clamp-1 text-lg leading-tight mb-1 group-hover:text-blue-600 transition-colors duration-200'>
                      {application.name}
                    </h3>
                    <p className='text-sm text-gray-600 mb-2 font-medium'>
                      {application.category?.name || 'Utilities'}
                    </p>
                  </div>

                  {/* Favorite Button */}
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={handleToggleFavorite}
                    disabled={favoritesLoading}
                    className='h-8 w-8 p-0 hover:bg-red-50 transition-colors duration-200 ml-2'
                  >
                    <Heart
                      className={`h-4 w-4 transition-all duration-200 ${
                        isFavorite(application.id)
                          ? 'fill-red-600 text-red-600 scale-110'
                          : 'text-gray-400 hover:text-pink-400'
                      }`}
                    />
                  </Button>
                </div>

                {/* Rating and Stats */}
                <div className='flex items-center gap-4 text-sm'>
                  <div className='flex items-center gap-1.5 bg-gray-50/80 rounded-full px-2.5 py-1'>
                    <Star className='h-3.5 w-3.5 fill-yellow-400 text-yellow-400' />
                    <span className='font-semibold text-gray-700'>
                      {mockRating.toFixed(1)}
                    </span>
                  </div>
                  <div className='flex items-center gap-1.5 text-gray-600'>
                    <Users className='h-3.5 w-3.5' />
                    <span className='font-medium'>
                      {(mockDownloads / 1000).toFixed(1)}k
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className='p-4 pt-0 flex-1 flex flex-col relative z-10'>
            {/* Description */}
            <p className='text-sm text-gray-700 line-clamp-3 mb-4 leading-relaxed flex-grow'>
              {application.description ||
                'Enhance your learning experience with this powerful application designed for students and educators.'}
            </p>

            {/* Tags */}
            {application.tags && application.tags.length > 0 && (
              <div className='flex flex-wrap gap-1.5 mb-4'>
                {application.tags.slice(0, 2).map((tag) => (
                  <Badge
                    key={tag}
                    variant='secondary'
                    className='h-6 px-2.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/50 font-medium'
                  >
                    {tag}
                  </Badge>
                ))}
                {application.tags.length > 2 && (
                  <Badge
                    variant='secondary'
                    className='h-6 px-2.5 text-xs bg-gray-50 text-gray-600 border border-gray-200/50'
                  >
                    +{application.tags.length - 2}
                  </Badge>
                )}
              </div>
            )}

            {/* Features */}
            <div className='flex items-center justify-between mb-4 text-xs'>
              <div className='flex items-center gap-3'>
                {application.screenshots &&
                  application.screenshots.length > 0 && (
                    <span className='text-gray-500 flex items-center gap-1.5 bg-gray-50 rounded-full px-2 py-1'>
                      <ImageIcon className='h-3 w-3' />
                      <span className='font-medium'>
                        {application.screenshots.length}
                      </span>
                    </span>
                  )}
              </div>

              <Button
                variant='ghost'
                size='sm'
                onClick={() => setIsDetailOpen(true)}
                className='h-7 px-2 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg font-medium'
              >
                Details
                <ChevronRight className='h-3 w-3 ml-1' />
              </Button>
            </div>

            {/* Action Buttons */}
            <div className='flex gap-2 mt-auto'>
              <Button
                onClick={handleOpenApp}
                className='flex-1 h-10 bg-gradient-to-r from-lime-500 to-green-500 hover:from-green-500 hover:to-lime-500 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 relative overflow-hidden group'
              >
                <div className='absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000' />
                <Play className='h-4 w-4 mr-2' />
                Launch App
              </Button>

              <Button
                variant='outline'
                size='icon'
                onClick={() => setIsDetailOpen(true)}
                className='h-10 w-10 rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200'
              >
                <ExternalLink className='h-4 w-4 text-gray-600' />
              </Button>
            </div>
          </CardContent>

          {/* Hover gradient effect */}
          <div className='absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none' />
        </Card>
      </motion.div>

      {/* App Detail Dialog */}
      <LearnerAppDetailDialog
        application={application}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onLaunchApp={handleOpenApp}
      />
    </>
  );
}
