import Link from 'next/link';
import { FolderIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SectionEmptyStateProps {
  canCreate: boolean;
}

export function SectionEmptyState({ canCreate }: SectionEmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center py-12 px-4 text-center'>
      <div className='rounded-full bg-muted p-3 mb-4'>
        <FolderIcon className='h-10 w-10 text-muted-foreground' />
      </div>
      <h3 className='text-lg font-medium mb-2'>No sections found</h3>
      <p className='text-sm text-muted-foreground mb-6 max-w-md'>
        There are no sections available matching your filters. Try adjusting
        your search criteria or create a new section.
      </p>
      {canCreate ? (
        <Button asChild>
          <Link href='/organizations/sections/new'>Create Section</Link>
        </Button>
      ) : (
        <Button variant='outline' disabled>
          Create Section
        </Button>
      )}
    </div>
  );
}
