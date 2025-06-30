'use client';

import { Calendar, Users } from 'lucide-react';

interface AttendanceEmptyStateProps {
  message: string;
  description: string;
}

export function AttendanceEmptyState({
  message,
  description
}: AttendanceEmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center py-12 text-center'>
      <div className='flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4'>
        <Users className='h-8 w-8 text-muted-foreground' />
      </div>
      <h3 className='text-lg font-medium text-gray-900 mb-2'>{message}</h3>
      <p className='text-sm text-muted-foreground max-w-md'>{description}</p>
    </div>
  );
}
