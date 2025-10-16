'use client';

import React from 'react';
import Link from 'next/link';
import {
  Eye,
  ExternalLink,
  Image as ImageIcon,
  Shield,
  Layers
} from 'lucide-react';
import { Application } from '@/types/applications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import Image from 'next/image';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';

interface ApplicationCardProps {
  application: Application;
}

export function ApplicationCard({ application }: ApplicationCardProps) {
  const [screenshotIndex, setScreenshotIndex] = useState(0);
  const hasScreenshots =
    application.screenshots && application.screenshots.length > 0;

  return (
    <Card className='group relative flex flex-col h-[320px] overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] border hover:border-primary/50'>
      {/* Status Badge - Top Right Corner */}
      <div className='absolute top-3 right-3 z-10'>
        <Badge
          variant={application.is_active ? 'default' : 'secondary'}
          className='text-xs shadow-sm'
        >
          {application.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <CardHeader className='space-y-3 p-6 pb-4'>
        {/* Icon and Title Section */}
        <div className='flex items-start gap-4'>
          {/* Application Icon */}
          <div className='flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 bg-gradient-to-br from-primary/10 to-primary/5 shadow-sm'>
            {application.icon_path ? (
              <Image
                src={application.icon_path}
                alt={application.name}
                width={64}
                height={64}
                className='w-full h-full object-cover'
              />
            ) : (
              <div className='w-full h-full flex items-center justify-center'>
                <Layers className='h-7 w-7 text-primary/60' />
              </div>
            )}
          </div>

          {/* Title and Category */}
          <div className='flex-1 min-w-0 pr-12'>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardTitle className='text-base sm:text-lg font-bold leading-tight mb-1.5 line-clamp-2 cursor-pointer hover:text-primary transition-colors'>
                    {application.name}
                  </CardTitle>
                </TooltipTrigger>
                {application.name.length > 30 && (
                  <TooltipContent side='top' className='max-w-[300px]'>
                    <p className='text-sm font-medium'>{application.name}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-xs font-medium text-muted-foreground'>
                {application.category?.name || 'Uncategorized'}
              </span>
              {application.uses_parent_auth && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge
                        variant='outline'
                        className='text-[10px] px-1.5 py-0 h-5 gap-1 border-primary/30 text-primary'
                      >
                        <Shield className='h-2.5 w-2.5' />
                        <span className='hidden sm:inline'>MyJKKN Auth</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className='text-xs'>Uses MyJKKN Authentication</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className='flex-1 px-6 pb-4 space-y-3'>
        {/* Description */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className='text-left w-full'>
              <p className='line-clamp-3 text-sm text-muted-foreground leading-relaxed'>
                {application.description || 'No description available'}
              </p>
            </TooltipTrigger>
            {application.description &&
              application.description.length > 100 && (
                <TooltipContent
                  side='bottom'
                  className='max-w-[400px]'
                  align='start'
                >
                  <p className='text-sm leading-relaxed'>
                    {application.description}
                  </p>
                </TooltipContent>
              )}
          </Tooltip>
        </TooltipProvider>

        {/* Tags */}
        {application.tags && application.tags.length > 0 && (
          <div className='flex flex-wrap gap-1.5'>
            {application.tags.slice(0, 4).map((tag) => (
              <Badge
                key={tag}
                variant='secondary'
                className='text-[10px] sm:text-xs py-0.5 px-2 bg-secondary/60 hover:bg-secondary/80 transition-colors'
              >
                {tag}
              </Badge>
            ))}
            {application.tags.length > 4 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant='secondary'
                      className='text-[10px] sm:text-xs py-0.5 px-2 bg-secondary/60'
                    >
                      +{application.tags.length - 4}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className='flex flex-wrap gap-1 max-w-[250px]'>
                      {application.tags.slice(4).map((tag) => (
                        <Badge
                          key={tag}
                          variant='secondary'
                          className='text-xs'
                        >
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
        <div className='flex items-center gap-2 text-xs text-muted-foreground pt-1'>
          <span className='capitalize'>{application.supported_platforms}</span>
          <span>•</span>
          <span className='capitalize'>
            {application.integration_type.replace('_', ' ')}
          </span>
        </div>
      </CardContent>

      <CardFooter className='p-6 pt-0 flex gap-2'>
        {/* Open Application Button */}
        <Button asChild size='sm' className='flex-1 gap-2 transition-all'>
          <Link
            href={application.url}
            target='_blank'
            className='flex items-center justify-center'
          >
            <Eye className='h-4 w-4' />
            <span className='font-medium'>Open</span>
            <ExternalLink className='h-3 w-3 ml-1 opacity-70' />
          </Link>
        </Button>

        {/* Screenshots Button */}
        {hasScreenshots && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                className='gap-1.5 transition-all'
              >
                <ImageIcon className='h-4 w-4' />
                <span className='hidden sm:inline'>Screens</span>
              </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[90vw] md:max-w-[900px] max-h-[90vh] overflow-y-auto'>
              <DialogHeader>
                <DialogTitle className='text-xl font-bold'>
                  {application.name} Screenshots
                </DialogTitle>
                <DialogDescription>
                  Browse screenshots of this application
                </DialogDescription>
              </DialogHeader>
              <div className='mt-4 space-y-4'>
                {/* Screenshot Container */}
                <div className='relative w-full max-h-[65vh] overflow-hidden rounded-lg border-2 shadow-lg bg-muted flex items-center justify-center'>
                  <Image
                    src={application.screenshots![screenshotIndex]}
                    alt={`${application.name} screenshot ${
                      screenshotIndex + 1
                    }`}
                    width={1920}
                    height={1080}
                    className='w-full h-auto max-h-[65vh] object-contain'
                    priority
                  />
                </div>

                {/* Navigation */}
                {application.screenshots &&
                  application.screenshots.length > 1 && (
                    <div className='flex flex-col items-center gap-3 pt-2'>
                      <span className='text-sm font-medium text-muted-foreground'>
                        Screenshot {screenshotIndex + 1} of{' '}
                        {application.screenshots.length}
                      </span>
                      <div className='flex items-center gap-2'>
                        {application.screenshots.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => setScreenshotIndex(index)}
                            className={`h-2.5 rounded-full transition-all ${
                              index === screenshotIndex
                                ? 'bg-primary w-8'
                                : 'bg-muted-foreground/30 hover:bg-muted-foreground/50 w-2.5'
                            }`}
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

      {/* Hover Effect Overlay */}
      <div className='absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none' />
    </Card>
  );
}
