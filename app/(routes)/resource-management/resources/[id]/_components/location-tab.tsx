// app/(routes)/resource-management/resources/[id]/_components/location-tab.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Building2, Home, Navigation } from 'lucide-react';
import type { Resource } from '@/types/resource-management';

interface LocationTabProps {
  resource: Resource;
}

export function LocationTab({ resource }: LocationTabProps) {
  const hasPhysicalLocation =
    resource.building_number ||
    resource.block_number ||
    resource.floor_number ||
    resource.room_number;

  return (
    <div className='grid gap-6 md:grid-cols-2'>
      {/* Primary Location */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Building2 className='h-5 w-5' />
            Primary Location
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <p className='text-sm font-medium text-muted-foreground'>
              Institution
            </p>
            <p className='text-base font-semibold'>
              {resource.institution?.name || 'N/A'}
            </p>
          </div>

          {resource.department && (
            <div>
              <p className='text-sm font-medium text-muted-foreground'>
                Department
              </p>
              <p className='text-base font-semibold'>
                {resource.department.department_name}
              </p>
            </div>
          )}

          {!resource.department && (
            <div className='rounded-lg border border-blue-200 bg-blue-50 p-3'>
              <p className='text-sm text-blue-800'>
                This resource is institution-wide and not assigned to a specific
                department
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Physical Location */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <MapPin className='h-5 w-5' />
            Physical Location
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {hasPhysicalLocation ? (
            <div className='grid grid-cols-2 gap-4'>
              {resource.building_number && (
                <div>
                  <p className='text-sm font-medium text-muted-foreground'>
                    Building
                  </p>
                  <p className='text-sm font-semibold'>
                    {resource.building_number}
                  </p>
                </div>
              )}

              {resource.block_number && (
                <div>
                  <p className='text-sm font-medium text-muted-foreground'>
                    Block
                  </p>
                  <p className='text-sm font-semibold'>
                    {resource.block_number}
                  </p>
                </div>
              )}

              {resource.floor_number && (
                <div>
                  <p className='text-sm font-medium text-muted-foreground'>
                    Floor
                  </p>
                  <p className='text-sm font-semibold'>
                    {resource.floor_number}
                  </p>
                </div>
              )}

              {resource.room_number && (
                <div>
                  <p className='text-sm font-medium text-muted-foreground'>
                    Room
                  </p>
                  <p className='text-base font-semibold'>
                    {resource.room_number}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className='rounded-lg border border-gray-200 bg-gray-50 p-4 text-center'>
              <Home className='h-8 w-8 mx-auto mb-2 text-muted-foreground' />
              <p className='text-sm text-muted-foreground'>
                No physical location details specified
              </p>
            </div>
          )}

          {resource.location_notes && (
            <div className='rounded-lg border bg-muted p-3'>
              <p className='text-sm font-medium mb-1'>Location Notes</p>
              <p className='text-sm text-muted-foreground'>
                {resource.location_notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Address Display */}
      <Card className='md:col-span-2'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Navigation className='h-5 w-5' />
            Complete Address
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='rounded-lg border-2 border-primary/20 bg-primary/5 p-4'>
            <p className='text-base leading-relaxed'>
              {resource.name}
              {resource.room_number && `, Room ${resource.room_number}`}
              {resource.floor_number && `, ${resource.floor_number}`}
              {resource.block_number && `, ${resource.block_number}`}
              {resource.building_number && `, ${resource.building_number}`}
              {resource.department &&
                `, ${resource.department.department_name}`}
              {resource.institution && `, ${resource.institution.name}`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
