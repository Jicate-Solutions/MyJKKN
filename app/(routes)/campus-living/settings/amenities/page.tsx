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
import { AmenitiesDataTable } from './_components/amenities-data-table';
import { AmenityFormDialog } from './_components/amenity-form-dialog';

export default function AmenitiesPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <ContentLayout title='Amenities'>
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
              <BreadcrumbPage>Amenities</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardContent className='p-6'>
            <div className='space-y-6'>
              <div className='flex items-center justify-between'>
                <div>
                  <h2 className='text-lg font-semibold'>Amenities</h2>
                  <p className='text-sm text-muted-foreground'>
                    Manage the catalog of informational amenities (Wi-Fi,
                    Balcony, Attached Bath) that can be assigned to hostel
                    rooms and blocks.
                  </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className='h-4 w-4 mr-2' />
                  Add Amenity
                </Button>
              </div>

              <AmenitiesDataTable />
            </div>
          </CardContent>
        </Card>

        <AmenityFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          mode='create'
        />
      </div>
    </ContentLayout>
  );
}
