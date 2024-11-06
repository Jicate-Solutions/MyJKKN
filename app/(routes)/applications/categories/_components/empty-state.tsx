// app/(routes)/applications/categories/_components/
import { FolderTree } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction
}: EmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center p-8 text-center'>
      <div className='rounded-full bg-muted p-3'>
        <FolderTree className='h-6 w-6' />
      </div>
      <h3 className='mt-4 text-lg font-semibold'>{title}</h3>
      <p className='mt-2 text-sm text-muted-foreground'>{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className='mt-4'>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
