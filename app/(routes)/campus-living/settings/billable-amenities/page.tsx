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
import { BillableAmenitiesDataTable } from './_components/billable-amenities-data-table';
import { BillableAmenityFormDialog } from './_components/billable-amenity-form-dialog';

export default function BillableAmenitiesPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <ContentLayout title='Billable Amenities'>
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
              <BreadcrumbLink href='/campus-living/settings'>Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Billable Amenities</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardContent className='p-6'>
            <div className='space-y-6'>
              <div className='flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold'>Billable Amenities</h2>
                  <p className='text-sm text-muted-foreground'>
                    Manage amenities that carry a monthly fee (AC, premium
                    services). Each has a fee calculation model and commitment
                    terms.
                  </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className='h-4 w-4 mr-2' />
                  Add Billable Amenity
                </Button>
              </div>

              <BillableAmenitiesDataTable />
            </div>
          </CardContent>
        </Card>

        <BillableAmenityFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          mode='create'
        />
      </div>
    </ContentLayout>
  );
}
