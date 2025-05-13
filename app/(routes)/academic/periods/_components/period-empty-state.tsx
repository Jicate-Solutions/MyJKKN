'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PeriodEmptyStateProps {
  canCreate?: boolean;
}

export function PeriodEmptyState({ canCreate = false }: PeriodEmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center p-8 text-center'>
      <div className='flex h-20 w-20 items-center justify-center rounded-full bg-primary/10'>
        <Clock className='h-10 w-10 text-primary' />
      </div>
      <h3 className='mt-4 text-lg font-medium'>No periods found</h3>
      <p className='mt-2 text-sm text-muted-foreground'>
        {canCreate
          ? "You haven't created any academic periods yet. Create your first period to start building timetables."
          : 'No academic periods have been created yet. Contact an administrator to create periods.'}
      </p>
      {canCreate && (
        <Button className='mt-4' asChild>
          <Link href='/academic/periods/new'>Create a period</Link>
        </Button>
      )}
    </div>
  );
}
