// app/(routes)/resource-management/resources/_components/resource-empty-state.tsx

'use client';

import Link from 'next/link';
import { Package, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ResourceEmptyState() {
  return (
    <div className='container mx-auto flex min-h-[600px] items-center justify-center py-10'>
      <Card className='w-full max-w-2xl p-12'>
        <div className='flex flex-col items-center text-center'>
          <div className='mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10'>
            <Package className='h-10 w-10 text-primary' />
          </div>

          <h2 className='mb-3 text-2xl font-bold'>No Resources Yet</h2>

          <p className='mb-8 max-w-md text-muted-foreground'>
            Start managing your institutional resources by creating your first
            resource. Resources can include equipment, rooms, vehicles, and
            more.
          </p>

          <div className='flex flex-col gap-4 sm:flex-row'>
            <Link href='/resource-management/resources/new'>
              <Button size='lg'>
                <Plus className='mr-2 h-5 w-5' />
                Add Your First Resource
              </Button>
            </Link>

            <Link href='/resource-management/categories'>
              <Button variant='outline' size='lg'>
                Manage Categories First
              </Button>
            </Link>
          </div>

          <div className='mt-12 w-full rounded-lg border bg-muted/50 p-6'>
            <h3 className='mb-4 font-semibold'>Before adding resources:</h3>
            <ul className='space-y-2 text-left text-sm text-muted-foreground'>
              <li className='flex items-start gap-2'>
                <span className='text-primary'>1.</span>
                <span>
                  Create parent categories (e.g., Equipment, Rooms, Vehicles)
                </span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary'>2.</span>
                <span>
                  Create sub-categories with custom attributes (e.g., Laptops,
                  Conference Rooms)
                </span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary'>3.</span>
                <span>
                  Add resources with detailed information and custom attributes
                </span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary'>4.</span>
                <span>Configure booking settings and approval workflows</span>
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
