'use client';

import Link from 'next/link';
import { Plus, FolderPlus, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface SubCategoryEmptyStateProps {
  canCreate: boolean;
}

export function SubCategoryEmptyState({
  canCreate
}: SubCategoryEmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center py-12'>
      <div className='flex items-center justify-center w-20 h-20 bg-primary/10 rounded-full mb-6'>
        <Layers3 className='w-10 h-10 text-primary' />
      </div>

      <div className='text-center space-y-2 mb-6'>
        <h3 className='text-lg font-semibold'>No subcategories found</h3>
        <p className='text-muted-foreground max-w-md'>
          Get started by creating your first subcategory to organize resources
          with custom attributes and specialized properties.
        </p>
      </div>

      <div className='flex flex-col sm:flex-row gap-3'>
        {canCreate ? (
          <Button asChild>
            <Link href='/resource-management/categories/sub-categories/new'>
              <Plus className='mr-2 h-4 w-4' />
              Create Subcategory
            </Link>
          </Button>
        ) : (
          <Button disabled variant='outline'>
            <Plus className='mr-2 h-4 w-4' />
            Create Subcategory
          </Button>
        )}

        <Button variant='outline' asChild>
          <Link href='/resource-management/categories'>
            <FolderPlus className='mr-2 h-4 w-4' />
            View Parent Categories
          </Link>
        </Button>
      </div>

      <Card className='mt-8 max-w-md'>
        <CardContent className='pt-6'>
          <div className='text-center text-sm text-muted-foreground'>
            <p className='font-medium mb-2'>💡 Quick tip:</p>
            <p>
              Subcategories can have custom attributes like specifications,
              ratings, or any other properties specific to your resource types.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
