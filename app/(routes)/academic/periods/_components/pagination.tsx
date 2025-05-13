import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange
}: PaginationProps) {
  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  // Don't render pagination if there's only one page
  if (totalPages <= 1) return null;

  return (
    <div className='flex items-center justify-end space-x-2 py-4'>
      <div className='text-sm text-muted-foreground'>
        Page {currentPage} of {totalPages}
      </div>
      <Button
        variant='outline'
        size='sm'
        onClick={handlePrevious}
        disabled={currentPage <= 1}
      >
        <ChevronLeft className='h-4 w-4' />
        <span className='sr-only'>Previous page</span>
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={handleNext}
        disabled={currentPage >= totalPages}
      >
        <ChevronRight className='h-4 w-4' />
        <span className='sr-only'>Next page</span>
      </Button>
    </div>
  );
}
