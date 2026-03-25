'use client';

import Link from 'next/link';
import { Folder, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ParentCategoryEmptyStateProps {
  canCreate?: boolean;
}

export function ParentCategoryEmptyState({
  canCreate = false
}: ParentCategoryEmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center py-12 text-center'>
      <div className='flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4'>
        <Folder className='h-8 w-8 text-muted-foreground' />
      </div>
      <h3 className='text-lg font-medium text-gray-900 mb-2'>
        No resource categories found
      </h3>
      <p className='text-sm text-muted-foreground max-w-md mb-6'>
        Get started by creating your first resource category to organize and
        manage your resources effectively.
      </p>
      {canCreate && (
        <Button asChild>
          <Link href='/resource-management/categories/new'>
            <Plus className='mr-2 h-4 w-4' />
            Create Your First Category
          </Link>
        </Button>
      )}
    </div>
  );
}
