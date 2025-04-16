'use client';

import React from 'react';
import Link from 'next/link';
import { Eye, ExternalLink, Image as ImageIcon } from 'lucide-react';
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
    <Card className='group h-[260px] relative flex flex-col overflow-hidden transition-all hover:shadow-lg hover:scale-[1.02] border-2 border-gray-100'>
      <CardHeader className='space-y-2 p-5 pb-3'>
        <div className='flex items-start justify-between space-x-2'>
          <div className='flex items-center gap-3'>
            <div className='flex-shrink-0 w-10 h-10 rounded-md overflow-hidden border bg-muted'>
              {application.icon_path ? (
                <Image
                  src={application.icon_path}
                  alt={application.name}
                  width={40}
                  height={40}
                  className='w-full h-full object-cover'
                />
              ) : (
                <div className='w-full h-full flex items-center justify-center'>
                  <ImageIcon className='h-5 w-5 text-muted-foreground' />
                </div>
              )}
            </div>
            <div className='flex flex-col flex-1'>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardTitle className='line-clamp-1 text-lg font-semibold cursor-pointer'>
                      {application.name}
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent side='top' className='max-w-[300px]'>
                    <p className='text-sm'>{application.name}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className='text-xs mt-1 text-muted-foreground'>
                {application.category?.name || 'Uncategorized'}
              </span>
            </div>
          </div>
          <Badge
            variant={application.is_active ? 'default' : 'secondary'}
            className='text-xs shrink-0'
          >
            {application.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className='flex-1 p-5 pt-0 space-y-3'>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className='text-left w-full'>
              <p className='line-clamp-3 text-sm text-muted-foreground'>
                {application.description || 'No description available'}
              </p>
            </TooltipTrigger>
            {application.description && (
              <TooltipContent side='right' className='max-w-[300px]'>
                <p className='text-sm'>{application.description}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {application.tags?.length > 0 && (
          <div className='flex flex-wrap gap-1.5'>
            {application.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant='secondary'
                className='text-xs bg-secondary/50'
              >
                {tag}
              </Badge>
            ))}
            {application.tags.length > 3 && (
              <Badge variant='secondary' className='text-xs bg-secondary/50'>
                +{application.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className='p-5 pt-0 mt-auto flex gap-2'>
        <Button
          asChild
          variant='ghost'
          size='sm'
          className='flex-1 gap-2 hover:bg-primary hover:text-primary-foreground'
        >
          <Link
            href={application.url}
            target='_blank'
            className='flex items-center justify-center'
          >
            <Eye className='h-4 w-4' />
            <span>Open</span>
            <ExternalLink className='h-3 w-3 ml-1' />
          </Link>
        </Button>

        {hasScreenshots && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant='outline' size='sm' className='gap-1'>
                <ImageIcon className='h-4 w-4' />
                <span className='sr-md:inline hidden'>Screenshots</span>
              </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[800px]'>
              <DialogHeader>
                <DialogTitle>{application.name} Screenshots</DialogTitle>
                <DialogDescription>
                  Browse screenshots of this application
                </DialogDescription>
              </DialogHeader>
              <div className='mt-4 relative'>
                <div className='relative aspect-video w-full overflow-hidden rounded-lg'>
                  <Image
                    src={application.screenshots[screenshotIndex]}
                    alt={`${application.name} screenshot ${
                      screenshotIndex + 1
                    }`}
                    fill
                    className='object-cover'
                  />
                </div>
                {application.screenshots.length > 1 && (
                  <div className='flex justify-center gap-2 mt-4'>
                    {application.screenshots.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setScreenshotIndex(index)}
                        className={`w-2 h-2 rounded-full ${
                          index === screenshotIndex
                            ? 'bg-primary'
                            : 'bg-muted-foreground/30'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardFooter>
    </Card>
  );
}
