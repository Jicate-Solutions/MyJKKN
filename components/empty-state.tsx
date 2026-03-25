'use client';

import { FolderX } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title = 'No data available',
  description = 'There are no items to display at this time.',
  icon = <FolderX className='h-10 w-10 text-muted-foreground' />,
  action
}: EmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center py-12'>
      <div className='mb-4'>{icon}</div>
      <h3 className='text-lg font-medium'>{title}</h3>
      <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
      {action && <div className='mt-4'>{action}</div>}
    </div>
  );
}
