'use client';

import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1
}: PaginationProps) {
  // If there are less than 2 pages, don't render pagination
  if (totalPages <= 1) {
    return null;
  }

  // Function to generate page numbers to show
  const getPageNumbers = () => {
    const pageNumbers = [];

    // Always show first page
    pageNumbers.push(1);

    // Calculate range around current page
    const leftSibling = Math.max(2, currentPage - siblingCount);
    const rightSibling = Math.min(totalPages - 1, currentPage + siblingCount);

    // Add ellipsis if needed before left siblings
    if (leftSibling > 2) {
      pageNumbers.push(-1); // -1 represents ellipsis
    }

    // Add page numbers around current page
    for (let i = leftSibling; i <= rightSibling; i++) {
      pageNumbers.push(i);
    }

    // Add ellipsis if needed after right siblings
    if (rightSibling < totalPages - 1) {
      pageNumbers.push(-2); // -2 represents ellipsis (different key from the first one)
    }

    // Always show last page if more than 1 page
    if (totalPages > 1) {
      pageNumbers.push(totalPages);
    }

    return pageNumbers;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className='flex items-center justify-center space-x-2 py-4'>
      <Button
        variant='outline'
        size='icon'
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        <ChevronLeft className='h-4 w-4' />
        <span className='sr-only'>Previous page</span>
      </Button>

      {pageNumbers.map((pageNumber, index) => {
        // Render ellipsis
        if (pageNumber < 0) {
          return (
            <Button key={pageNumber} variant='ghost' size='icon' disabled>
              <MoreHorizontal className='h-4 w-4' />
              <span className='sr-only'>More pages</span>
            </Button>
          );
        }

        // Render page number
        return (
          <Button
            key={pageNumber}
            variant={pageNumber === currentPage ? 'default' : 'outline'}
            onClick={() => onPageChange(pageNumber)}
          >
            {pageNumber}
          </Button>
        );
      })}

      <Button
        variant='outline'
        size='icon'
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        <ChevronRight className='h-4 w-4' />
        <span className='sr-only'>Next page</span>
      </Button>
    </div>
  );
}
