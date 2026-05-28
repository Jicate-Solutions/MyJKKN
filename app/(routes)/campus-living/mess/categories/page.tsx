'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { MessCategoriesDataTable } from './_components/mess-categories-data-table';
import { MessCategoryFormDialog } from './_components/mess-category-form-dialog';

export default function MessCategoriesPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <ContentLayout title='Mess Categories'>
      <div className='space-y-6'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href='/campus-living'>Campus Living</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href='/campus-living/mess'>Mess</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Mess Categories</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardContent className='p-6'>
            <div className='space-y-6'>
              <div className='flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold'>Mess Categories</h2>
                  <p className='text-sm text-muted-foreground'>
                    Manage mess categories used across the mess module.
                    Categories are shared across all institutions.
                  </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className='h-4 w-4 mr-2' />
                  Add Category
                </Button>
              </div>

              <MessCategoriesDataTable />
            </div>
          </CardContent>
        </Card>

        <MessCategoryFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          mode='create'
        />
      </div>
    </ContentLayout>
  );
}
