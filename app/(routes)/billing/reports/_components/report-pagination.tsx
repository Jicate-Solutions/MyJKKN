'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function ReportPagination({ page, pageSize, totalCount, onPageChange }: Props) {
  if (totalCount === 0) return null;

  const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);

  return (
    <div className='flex flex-col items-center justify-between gap-3 border-t pt-4 sm:flex-row'>
      <p className='text-muted-foreground text-sm'>
        Showing {first}–{last} of {totalCount.toLocaleString('en-IN')}
      </p>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline' size='sm'
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className='mr-1 h-4 w-4' /> Previous
        </Button>
        <span className='text-sm'>Page {page} of {lastPage}</span>
        <Button
          variant='outline' size='sm'
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight className='ml-1 h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
