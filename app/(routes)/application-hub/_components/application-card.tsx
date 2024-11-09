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
    <Card className='group h-[280px] relative flex flex-col overflow-hidden transition-all hover:shadow-lg hover:scale-[1.02] border-2'>
      <CardHeader className='space-y-2 p-5 pb-3'>
        <div className='flex items-start justify-between space-x-2'>
          <CardTitle className='line-clamp-1 flex-1 text-lg font-semibold'>
            {application.name}
          </CardTitle>
          <Badge
            variant={application.is_active ? 'default' : 'secondary'}
            className='text-xs shrink-0'
          >
            {application.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
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
      </CardHeader>

      <CardContent className='flex-1 p-5 pt-0'>
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
