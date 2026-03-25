/**
 * Refunds Pagination Client Component
 *
 * URL-based pagination for refund list page.
 * Updates URL search params for page navigation.
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';

interface RefundsPaginationClientProps {
  totalPages: number;
  currentPage: number;
  totalItems: number;
}

export function RefundsPaginationClient({
  totalPages,
  currentPage,
  totalItems
}: RefundsPaginationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());

    startTransition(() => {
      router.push(`/billing/refunds?${params.toString()}`);
    });
  };

  const changePageSize = (size: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('limit', size);
    params.set('page', '1'); // Reset to first page when changing size

    startTransition(() => {
      router.push(`/billing/refunds?${params.toString()}`);
    });
  };

  const currentLimit = searchParams.get('limit') || '10';

  // Calculate range
  const startItem = (currentPage - 1) * parseInt(currentLimit) + 1;
  const endItem = Math.min(currentPage * parseInt(currentLimit), totalItems);

  return (
    <div className='flex flex-col sm:flex-row items-center justify-between gap-4 py-4'>
      <div className='flex items-center gap-2'>
        <span className='text-sm text-muted-foreground'>Rows per page:</span>
        <Select
          value={currentLimit}
          onValueChange={changePageSize}
          disabled={isPending}
        >
          <SelectTrigger className='w-[70px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='5'>5</SelectItem>
            <SelectItem value='10'>10</SelectItem>
            <SelectItem value='20'>20</SelectItem>
            <SelectItem value='50'>50</SelectItem>
            <SelectItem value='100'>100</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className='flex items-center gap-2'>
        <span className='text-sm text-muted-foreground'>
          {startItem}-{endItem} of {totalItems}
        </span>
      </div>

      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='icon'
          onClick={() => goToPage(1)}
          disabled={currentPage === 1 || isPending}
          title='First page'
        >
          <ChevronsLeft className='h-4 w-4' />
        </Button>

        <Button
          variant='outline'
          size='icon'
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1 || isPending}
          title='Previous page'
        >
          <ChevronLeft className='h-4 w-4' />
        </Button>

        <div className='flex items-center gap-2 px-2'>
          <span className='text-sm font-medium'>
            Page {currentPage} of {totalPages}
          </span>
        </div>

        <Button
          variant='outline'
          size='icon'
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages || isPending}
          title='Next page'
        >
          <ChevronRight className='h-4 w-4' />
        </Button>

        <Button
          variant='outline'
          size='icon'
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages || isPending}
          title='Last page'
        >
          <ChevronsRight className='h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
