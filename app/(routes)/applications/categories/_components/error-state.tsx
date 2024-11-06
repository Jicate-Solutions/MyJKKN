// app/(routes)/applications/categories/_components/error-state.tsx
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Error',
  message,
  onRetry
}: ErrorStateProps) {
  return (
    <Alert variant='destructive'>
      <AlertCircle className='h-4 w-4' />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className='flex items-center justify-between'>
        <span>{message}</span>
        {onRetry && (
          <Button
            variant='outline'
            size='sm'
            onClick={onRetry}
            className='ml-2'
          >
            Try Again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}




