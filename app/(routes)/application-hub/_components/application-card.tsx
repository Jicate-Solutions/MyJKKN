'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Eye,
  ExternalLink,
  Image as ImageIcon,
  Shield,
  Layers,
  Globe,
  Smartphone,
  Monitor,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Application } from '@/types/applications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ApplicationCardProps {
  application: Application;
}

// Get platform icon based on supported platforms
function getPlatformIcon(platform: string) {
  switch (platform?.toLowerCase()) {
    case 'web':
      return Globe;
    case 'mobile':
      return Smartphone;
    case 'desktop':
      return Monitor;
    default:
      return Globe;
  }
}

export function ApplicationCard({ application }: ApplicationCardProps) {
  const [screenshotIndex, setScreenshotIndex] = useState(0);
  const hasScreenshots = application.screenshots && application.screenshots.length > 0;
  const PlatformIcon = getPlatformIcon(application.supported_platforms);

  const handlePrevScreenshot = () => {
    if (application.screenshots) {
      setScreenshotIndex((prev) =>
        prev === 0 ? application.screenshots!.length - 1 : prev - 1
      );
    }
  };

  const handleNextScreenshot = () => {
    if (application.screenshots) {
      setScreenshotIndex((prev) =>
        prev === application.screenshots!.length - 1 ? 0 : prev + 1
      );
    }
  };

  return (
    <Card className={cn(
      'group relative flex flex-col overflow-hidden',
      'h-auto min-h-[280px] sm:min-h-[300px]',
      'transition-all duration-300 ease-out',
      'bg-white dark:bg-gray-800/50',
      'border border-gray-200 dark:border-gray-700/50',
      'hover:border-primary/40 dark:hover:border-primary/40',
      'hover:shadow-lg hover:shadow-primary/5 dark:hover:shadow-primary/10',
      'hover:-translate-y-1'
    )}>
      {/* Top Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <CardHeader className="space-y-3 p-4 sm:p-5 pb-3">
        {/* Icon and Title Section */}
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Application Icon */}
          <div className={cn(
            'flex-shrink-0 relative',
            'w-12 h-12 sm:w-14 sm:h-14',
            'rounded-xl overflow-hidden',
            'bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10',
            'border border-gray-200 dark:border-gray-700',
            'shadow-sm'
          )}>
            {application.icon_path ? (
              <Image
                src={application.icon_path}
                alt={application.name}
                width={56}
                height={56}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Layers className="h-6 w-6 sm:h-7 sm:w-7 text-primary/60 dark:text-primary/70" />
              </div>
            )}
          </div>

          {/* Title and Badges */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <h3 className={cn(
                    'text-sm sm:text-base font-semibold',
                    'text-gray-900 dark:text-gray-100',
                    'leading-tight line-clamp-2',
                    'group-hover:text-primary dark:group-hover:text-primary-light',
                    'transition-colors duration-200'
                  )}>
                    {application.name}
                  </h3>
                </TooltipTrigger>
                {application.name.length > 25 && (
                  <TooltipContent side="top" className="max-w-[280px]">
                    <p className="text-sm font-medium">{application.name}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {/* Category & Auth Badge Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {application.category?.name || 'Uncategorized'}
              </span>

              {application.uses_parent_auth && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] px-1.5 py-0 h-5',
                          'border-primary/30 dark:border-primary/40',
                          'text-primary dark:text-primary-light',
                          'bg-primary/5 dark:bg-primary/10'
                        )}
                      >
                        <Shield className="h-2.5 w-2.5 mr-1" />
                        <span className="hidden xs:inline">SSO</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Uses MyJKKN Single Sign-On</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 px-4 sm:px-5 pb-3 space-y-3">
        {/* Description */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className={cn(
                'text-xs sm:text-sm leading-relaxed',
                'text-gray-600 dark:text-gray-400',
                'line-clamp-2 sm:line-clamp-3'
              )}>
                {application.description || 'No description available'}
              </p>
            </TooltipTrigger>
            {application.description && application.description.length > 80 && (
              <TooltipContent
                side="bottom"
                align="start"
                className="max-w-[320px]"
              >
                <p className="text-sm leading-relaxed">{application.description}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Tags */}
        {application.tags && application.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {application.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className={cn(
                  'text-[10px] sm:text-xs py-0.5 px-2',
                  'bg-gray-100 dark:bg-gray-700/50',
                  'text-gray-600 dark:text-gray-300',
                  'hover:bg-gray-200 dark:hover:bg-gray-700',
                  'transition-colors duration-150'
                )}
              >
                {tag}
              </Badge>
            ))}
            {application.tags.length > 3 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="text-[10px] sm:text-xs py-0.5 px-2 bg-gray-100 dark:bg-gray-700/50"
                    >
                      +{application.tags.length - 3}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {application.tags.slice(3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {/* Platform & Integration Info */}
        <div className={cn(
          'flex items-center gap-3 pt-1',
          'text-xs text-gray-500 dark:text-gray-400'
        )}>
          <span className="inline-flex items-center gap-1">
            <PlatformIcon className="h-3.5 w-3.5" />
            <span className="capitalize">{application.supported_platforms}</span>
          </span>
          <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          <span className="capitalize">
            {application.integration_type?.replace('_', ' ')}
          </span>
        </div>
      </CardContent>

      <CardFooter className="p-4 sm:p-5 pt-3 flex gap-2 border-t border-gray-100 dark:border-gray-700/50">
        {/* Open Application Button */}
        <Button
          asChild
          size="sm"
          className={cn(
            'flex-1 gap-2',
            'bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90',
            'text-white font-medium',
            'transition-all duration-200',
            'focus:ring-2 focus:ring-primary focus:ring-offset-2',
            'active:scale-[0.98]'
          )}
        >
          <Link
            href={application.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center"
          >
            <Eye className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Open</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Link>
        </Button>

        {/* Screenshots Button */}
        {hasScreenshots && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'gap-1.5',
                  'border-gray-200 dark:border-gray-700',
                  'hover:bg-gray-100 dark:hover:bg-gray-700',
                  'hover:border-primary/30 dark:hover:border-primary/40',
                  'transition-all duration-200',
                  'active:scale-[0.98]'
                )}
              >
                <ImageIcon className="h-4 w-4" />
                <span className="hidden sm:inline text-xs sm:text-sm">Preview</span>
              </Button>
            </DialogTrigger>
            <DialogContent className={cn(
              'w-[95vw] sm:max-w-[90vw] md:max-w-[800px] lg:max-w-[900px]',
              'max-h-[90vh] overflow-hidden',
              'p-0'
            )}>
              <DialogHeader className="p-4 sm:p-6 pb-0">
                <DialogTitle className="text-lg sm:text-xl font-semibold">
                  {application.name}
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
                  Application screenshots preview
                </DialogDescription>
              </DialogHeader>

              <div className="p-4 sm:p-6 pt-4 space-y-4">
                {/* Screenshot Container */}
                <div className={cn(
                  'relative w-full overflow-hidden rounded-lg',
                  'border border-gray-200 dark:border-gray-700',
                  'bg-gray-100 dark:bg-gray-800',
                  'aspect-video'
                )}>
                  <Image
                    src={application.screenshots![screenshotIndex]}
                    alt={`${application.name} screenshot ${screenshotIndex + 1}`}
                    fill
                    className="object-contain"
                    priority
                  />

                  {/* Navigation Arrows */}
                  {application.screenshots && application.screenshots.length > 1 && (
                    <>
                      <button
                        onClick={handlePrevScreenshot}
                        className={cn(
                          'absolute left-2 top-1/2 -translate-y-1/2',
                          'p-2 rounded-full',
                          'bg-black/50 hover:bg-black/70',
                          'text-white',
                          'transition-all duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-white/50'
                        )}
                        aria-label="Previous screenshot"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        onClick={handleNextScreenshot}
                        className={cn(
                          'absolute right-2 top-1/2 -translate-y-1/2',
                          'p-2 rounded-full',
                          'bg-black/50 hover:bg-black/70',
                          'text-white',
                          'transition-all duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-white/50'
                        )}
                        aria-label="Next screenshot"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Pagination Dots */}
                {application.screenshots && application.screenshots.length > 1 && (
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
                      {screenshotIndex + 1} / {application.screenshots.length}
                    </span>
                    <div className="flex items-center gap-2">
                      {application.screenshots.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setScreenshotIndex(index)}
                          className={cn(
                            'h-2 rounded-full transition-all duration-200',
                            index === screenshotIndex
                              ? 'bg-primary w-6'
                              : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 w-2'
                          )}
                          aria-label={`View screenshot ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardFooter>

      {/* Subtle Hover Overlay */}
      <div className={cn(
        'absolute inset-0 pointer-events-none',
        'bg-gradient-to-t from-primary/3 to-transparent',
        'opacity-0 group-hover:opacity-100',
        'transition-opacity duration-300'
      )} />
    </Card>
  );
}
