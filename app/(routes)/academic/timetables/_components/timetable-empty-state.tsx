'use client';

import Link from 'next/link';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TimetableEmptyStateProps {
  canCreate?: boolean;
}

export function TimetableEmptyState({
  canCreate = false
}: TimetableEmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center p-8 text-center'>
      <div className='flex h-20 w-20 items-center justify-center rounded-full bg-primary/10'>
        <CalendarRange className='h-10 w-10 text-primary' />
      </div>
      <h3 className='mt-4 text-lg font-medium'>No timetables found</h3>
      <p className='mt-2 text-sm text-muted-foreground'>
        {canCreate
          ? "You haven't created any timetables yet. Create your first timetable to start organizing your academic schedule."
          : 'No timetables have been created yet. Contact an administrator to create timetables.'}
      </p>
      {canCreate && (
        <Button className='mt-4' asChild>
          <Link href='/academic/timetables/new'>Create a timetable</Link>
        </Button>
      )}
    </div>
  );
}
