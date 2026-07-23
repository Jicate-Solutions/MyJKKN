'use client';

import { useRouter } from 'next/navigation';
import { Plus, List, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function StreamsMobileNav() {
  const router = useRouter();

  return (
    <div className='fixed bottom-0 left-0 right-0 z-40 block md:hidden bg-white border-t border-border shadow-lg'>
      <div className='flex items-center justify-around h-16 px-4'>
        {/* New Stream Button */}
        <Button
          variant='ghost'
          size='sm'
          className='flex-1 flex flex-col items-center gap-1 h-auto py-2'
          onClick={() => router.push('/organizations/degrees/new')}
        >
          <Plus className='h-5 w-5' />
          <span className='text-xs font-medium'>New</span>
        </Button>

        {/* View All */}
        <Button
          variant='ghost'
          size='sm'
          className='flex-1 flex flex-col items-center gap-1 h-auto py-2'
          onClick={() => router.push('/organizations/degrees')}
        >
          <List className='h-5 w-5' />
          <span className='text-xs font-medium'>All</span>
        </Button>

        {/* Filters */}
        <Button
          variant='ghost'
          size='sm'
          className='flex-1 flex flex-col items-center gap-1 h-auto py-2'
          onClick={() => {
            const filtersElement = document.getElementById('streams-filters');
            filtersElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          <Filter className='h-5 w-5' />
          <span className='text-xs font-medium'>Filter</span>
        </Button>
      </div>
    </div>
  );
}
