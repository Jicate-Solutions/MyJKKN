'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Star,
  Users,
  Shield,
  ExternalLink,
  Play,
  Calendar,
  Globe,
  Smartphone,
  Monitor,
  Info,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { Application } from '@/types/applications';
import { motion, AnimatePresence } from 'framer-motion';

interface LearnerAppDetailDialogProps {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunchApp: () => void;
}

export function LearnerAppDetailDialog({
  application,
  open,
  onOpenChange,
  onLaunchApp
}: LearnerAppDetailDialogProps) {
  const [currentScreenshot, setCurrentScreenshot] = useState(0);
  const [imageError, setImageError] = useState(false);

  const mockRating = 4.2 + Math.random() * 0.8;
  const mockDownloads = Math.floor(Math.random() * 5000) + 1000;
  const mockReviews = Math.floor(Math.random() * 500) + 50;

  const hasScreenshots =
    application.screenshots && application.screenshots.length > 0;

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'mobile':
        return <Smartphone className='h-4 w-4' />;
      case 'web':
        return <Globe className='h-4 w-4' />;
      case 'both':
        return <Monitor className='h-4 w-4' />;
      default:
        return <Globe className='h-4 w-4' />;
    }
  };

  const getDataSensitivityColor = (level: string) => {
    switch (level) {
      case 'public':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'restricted':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'confidential':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const nextScreenshot = useCallback(() => {
    if (hasScreenshots) {
      setCurrentScreenshot((prev) =>
        prev === application.screenshots!.length - 1 ? 0 : prev + 1
      );
    }
  }, [hasScreenshots, application.screenshots]);

  const prevScreenshot = useCallback(() => {
    if (hasScreenshots) {
      setCurrentScreenshot((prev) =>
        prev === 0 ? application.screenshots!.length - 1 : prev - 1
      );
    }
  }, [hasScreenshots, application.screenshots]);

  // Update keyboard navigation to include proper dependencies
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!open || !hasScreenshots) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevScreenshot();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextScreenshot();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [open, hasScreenshots, prevScreenshot, nextScreenshot]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-4xl h-[95vh] max-h-[95vh] p-0 gap-0 overflow-hidden rounded-2xl'>
        <ScrollArea className='h-full'>
          <div className='p-4 sm:p-6'>
            <DialogHeader className='space-y-3 sm:space-y-4'>
              {/* App Header */}
              <div className='flex flex-col sm:flex-row sm:items-start gap-4'>
                <div className='relative flex-shrink-0 mx-auto sm:mx-0'>
                  <div className='w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 sm:border-3 border-gray-100 shadow-lg bg-gradient-to-br from-gray-50 to-gray-100'>
                    {application.icon_path && !imageError ? (
                      <Image
                        src={application.icon_path}
                        alt={application.name}
                        width={80}
                        height={80}
                        className='w-full h-full object-cover'
                        onError={() => setImageError(true)}
                      />
                    ) : (
                      <div className='w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/10 to-purple-500/10'>
                        <ImageIcon className='h-6 w-6 sm:h-8 sm:w-8 text-blue-500' />
                      </div>
                    )}
                  </div>
                  {application.is_active && (
                    <div className='absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-green-500 rounded-full border-2 sm:border-3 border-white shadow-sm' />
                  )}
                </div>

                <div className='flex-1 min-w-0 text-center sm:text-left'>
                  <DialogTitle className='text-xl sm:text-2xl font-bold text-gray-900 mb-2 line-clamp-2'>
                    {application.name}
                  </DialogTitle>
                  <DialogDescription className='text-sm sm:text-base text-gray-600 mb-3'>
                    {application.category?.name || 'Educational Tools'}
                  </DialogDescription>

                  {/* Rating and Stats */}
                  <div className='flex flex-col sm:flex-row items-center gap-3 sm:gap-6 mb-4'>
                    <div className='flex items-center gap-2'>
                      <div className='flex items-center gap-1'>
                        <Star className='h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400' />
                        <span className='font-semibold text-base sm:text-lg'>
                          {mockRating.toFixed(1)}
                        </span>
                      </div>
                      <span className='text-xs sm:text-sm text-gray-500'>
                        ({mockReviews} reviews)
                      </span>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Users className='h-3 w-3 sm:h-4 sm:w-4 text-gray-500' />
                      <span className='text-xs sm:text-sm text-gray-600'>
                        {(mockDownloads / 1000).toFixed(1)}k users
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className='flex flex-col sm:flex-row items-center gap-2 sm:gap-3'>
                    <Button
                      onClick={onLaunchApp}
                      className='w-full sm:w-auto bg-gradient-to-r from-lime-500 to-green-500 hover:from-green-500 hover:to-lime-500 text-white px-6 sm:px-8 py-2.5 rounded-full font-medium shadow-sm'
                    >
                      <Play className='h-4 w-4 mr-2' />
                      Launch App
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() => window.open(application.url, '_blank')}
                      className='w-full sm:w-auto px-4 sm:px-6 py-2.5 rounded-full border-2'
                    >
                      <ExternalLink className='h-4 w-4 mr-2' />
                      <span className='hidden sm:inline'>Open in New Tab</span>
                      <span className='sm:hidden'>Open External</span>
                    </Button>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <Separator className='my-4 sm:my-6' />

            {/* Screenshots Section */}
            {hasScreenshots && (
              <div className='mb-4 sm:mb-6'>
                <h3 className='text-base sm:text-lg font-semibold mb-3 sm:mb-4'>
                  Screenshots
                </h3>
                <div className='relative max-w-3xl mx-auto'>
                  <div
                    className='aspect-[4/3] sm:aspect-[16/10] w-full overflow-hidden rounded-lg sm:rounded-xl border bg-gradient-to-br from-gray-50 to-gray-100 shadow-md group cursor-pointer'
                    onClick={() =>
                      window.open(
                        application.screenshots![currentScreenshot],
                        '_blank'
                      )
                    }
                    title='Click to view full size'
                  >
                    <AnimatePresence mode='wait'>
                      <motion.div
                        key={currentScreenshot}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className='w-full h-full'
                      >
                        <Image
                          src={application.screenshots![currentScreenshot]}
                          alt={`${application.name} screenshot ${
                            currentScreenshot + 1
                          }`}
                          width={800}
                          height={600}
                          className='w-full h-full object-contain bg-white transition-all duration-300 group-hover:scale-105'
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      </motion.div>
                    </AnimatePresence>
                    {/* Click overlay hint */}
                    <div className='absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors duration-300'>
                      <div className='opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-lg'>
                        <ExternalLink className='h-4 w-4 text-gray-700' />
                      </div>
                    </div>
                  </div>

                  {application.screenshots!.length > 1 && (
                    <>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={prevScreenshot}
                        className='absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-black/80 text-white touch-manipulation backdrop-blur-sm border border-white/20'
                      >
                        <ChevronLeft className='h-4 w-4 sm:h-5 sm:w-5' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={nextScreenshot}
                        className='absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-black/80 text-white touch-manipulation backdrop-blur-sm border border-white/20'
                      >
                        <ChevronRight className='h-4 w-4 sm:h-5 sm:w-5' />
                      </Button>
                    </>
                  )}
                </div>

                {/* Caption */}
                <div className='text-center mt-2 space-y-1'>
                  <p className='text-xs sm:text-sm text-gray-500'>
                    Click image to view full size
                  </p>
                  {application.screenshots!.length > 1 && (
                    <p className='text-xs text-gray-400 flex items-center justify-center gap-2'>
                      <span>Navigate:</span>
                      <kbd className='px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono'>
                        ←
                      </kbd>
                      <kbd className='px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono'>
                        →
                      </kbd>
                    </p>
                  )}
                </div>

                {/* Screenshot Indicators */}
                {application.screenshots!.length > 1 && (
                  <div className='flex justify-center gap-2 sm:gap-2.5 mt-3 sm:mt-4'>
                    {application.screenshots!.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentScreenshot(index)}
                        className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all duration-200 touch-manipulation ${
                          index === currentScreenshot
                            ? 'bg-blue-600 scale-110 shadow-sm'
                            : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div className='mb-4 sm:mb-6'>
              <h3 className='text-base sm:text-lg font-semibold mb-2 sm:mb-3'>
                About this app
              </h3>
              <p className='text-sm sm:text-base text-gray-700 leading-relaxed'>
                {application.description ||
                  `${application.name} is a powerful educational tool designed to enhance your learning experience. This application provides intuitive features and seamless integration with your academic workflow, making it easier to achieve your educational goals.`}
              </p>
            </div>

            {/* Tags */}
            {application.tags && application.tags.length > 0 && (
              <div className='mb-4 sm:mb-6'>
                <h3 className='text-base sm:text-lg font-semibold mb-2 sm:mb-3'>
                  Features
                </h3>
                <div className='flex flex-wrap gap-1.5 sm:gap-2'>
                  {application.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant='secondary'
                      className='px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg'
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* App Information */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6'>
              <div>
                <h3 className='text-base sm:text-lg font-semibold mb-2 sm:mb-3'>
                  App Information
                </h3>
                <div className='space-y-2 sm:space-y-3'>
                  <div className='flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg'>
                    <span className='text-sm sm:text-base text-gray-600 font-medium'>
                      Platform
                    </span>
                    <div className='flex items-center gap-2'>
                      {getPlatformIcon(application.supported_platforms)}
                      <span className='text-sm sm:text-base capitalize'>
                        {application.supported_platforms}
                      </span>
                    </div>
                  </div>

                  <div className='flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg'>
                    <span className='text-sm sm:text-base text-gray-600 font-medium'>
                      Integration
                    </span>
                    <Badge
                      variant='outline'
                      className='text-xs sm:text-sm capitalize'
                    >
                      {application.integration_type.replace('_', ' ')}
                    </Badge>
                  </div>

                  <div className='flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg'>
                    <span className='text-sm sm:text-base text-gray-600 font-medium'>
                      Authentication
                    </span>
                    <div className='flex items-center gap-2'>
                      {application.auth_method === 'sso' && (
                        <Shield className='h-3 w-3 sm:h-4 sm:w-4 text-green-500' />
                      )}
                      <span className='text-xs sm:text-sm capitalize'>
                        {application.auth_method === 'sso'
                          ? 'SSO'
                          : application.auth_method === 'separate_login'
                          ? 'Separate'
                          : 'None'}
                      </span>
                    </div>
                  </div>

                  <div className='flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg'>
                    <span className='text-sm sm:text-base text-gray-600 font-medium'>
                      Type
                    </span>
                    <Badge
                      variant='outline'
                      className='text-xs sm:text-sm capitalize'
                    >
                      {application.application_type}
                    </Badge>
                  </div>
                </div>
              </div>

              <div>
                <h3 className='text-base sm:text-lg font-semibold mb-2 sm:mb-3'>
                  Security & Privacy
                </h3>
                <div className='space-y-2 sm:space-y-3'>
                  <div className='flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg'>
                    <span className='text-sm sm:text-base text-gray-600 font-medium'>
                      Data Sensitivity
                    </span>
                    <Badge
                      className={`text-xs sm:text-sm capitalize border ${getDataSensitivityColor(
                        application.data_sensitivity
                      )}`}
                    >
                      {application.data_sensitivity}
                    </Badge>
                  </div>

                  <div className='flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg'>
                    <span className='text-sm sm:text-base text-gray-600 font-medium'>
                      Status
                    </span>
                    <Badge
                      variant={application.is_active ? 'default' : 'secondary'}
                      className='text-xs sm:text-sm'
                    >
                      {application.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className='flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg'>
                    <span className='text-sm sm:text-base text-gray-600 font-medium'>
                      Updated
                    </span>
                    <span className='text-xs sm:text-sm font-medium'>
                      {new Date(application.updated_at).toLocaleDateString(
                        'en-US',
                        {
                          month: 'short',
                          day: 'numeric',
                          year: '2-digit'
                        }
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Support Contact */}
            {application.support_contact && (
              <div className='mt-4 sm:mt-6 p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100'>
                <h3 className='text-base sm:text-lg font-semibold mb-2 sm:mb-3 text-blue-900'>
                  Support Contact
                </h3>
                <div className='space-y-1 sm:space-y-2'>
                  <div className='flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2'>
                    <span className='text-xs sm:text-sm font-medium text-blue-700'>
                      Name:
                    </span>
                    <span className='text-xs sm:text-sm text-blue-800'>
                      {application.support_contact.name}
                    </span>
                  </div>
                  <div className='flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2'>
                    <span className='text-xs sm:text-sm font-medium text-blue-700'>
                      Email:
                    </span>
                    <a
                      href={`mailto:${application.support_contact.email}`}
                      className='text-xs sm:text-sm text-blue-600 hover:text-blue-800 underline break-all'
                    >
                      {application.support_contact.email}
                    </a>
                  </div>
                  {application.support_contact.phone && (
                    <div className='flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2'>
                      <span className='text-xs sm:text-sm font-medium text-blue-700'>
                        Phone:
                      </span>
                      <a
                        href={`tel:${application.support_contact.phone}`}
                        className='text-xs sm:text-sm text-blue-600 hover:text-blue-800 underline'
                      >
                        {application.support_contact.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
