'use client';

import React from 'react';
import Link from 'next/link';
import { Eye, ExternalLink } from 'lucide-react';
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

interface ApplicationCardProps {
  application: Application;
}

export function ApplicationCard({ application }: ApplicationCardProps) {
  return (
    <Card className='group h-[260px] relative flex flex-col overflow-hidden transition-all hover:shadow-lg hover:scale-[1.02] border-2 border-gray-100'>
      <CardHeader className='space-y-2 p-5 pb-3'>
        <div className='flex items-start justify-between space-x-2'>
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
            <span className='text-xs mt-2 text-muted-foreground'>
              {application.category?.name || 'Uncategorized'}
            </span>
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

      <CardFooter className='p-5 pt-0 mt-auto'>
        <Button
          asChild
          variant='ghost'
          size='sm'
          className='w-full gap-2 hover:bg-primary hover:text-primary-foreground'
        >
          <Link
            href={application.url}
            target='_blank'
            className='flex items-center justify-center'
          >
            <Eye className='h-4 w-4' />
            <span>View Application</span>
            <ExternalLink className='h-3 w-3 ml-1' />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
