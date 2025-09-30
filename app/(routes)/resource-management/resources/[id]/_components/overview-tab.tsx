// app/(routes)/resource-management/resources/[id]/_components/overview-tab.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Resource } from '@/types/resource-management';
import { formatDate } from '@/lib/utils';

interface OverviewTabProps {
  resource: Resource;
}

export function OverviewTab({ resource }: OverviewTabProps) {
  return (
    <div className='grid gap-6 md:grid-cols-2'>
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <p className='text-sm font-medium text-muted-foreground'>
              Resource Name
            </p>
            <p className='text-base font-semibold'>{resource.name}</p>
          </div>

          <Separator />

          <div>
            <p className='text-sm font-medium text-muted-foreground'>
              Description
            </p>
            <p className='text-base'>
              {resource.description || 'No description'}
            </p>
          </div>

          <Separator />

          <div>
            <p className='text-sm font-medium text-muted-foreground'>
              Category
            </p>
            <div className='flex items-center gap-2 mt-1'>
              <Badge variant='outline'>
                {resource.parent_category?.name || 'N/A'}
              </Badge>
              <span className='text-muted-foreground'>→</span>
              <Badge variant='outline'>
                {resource.subcategory?.name || 'N/A'}
              </Badge>
            </div>
          </div>

          <Separator />

          <div>
            <p className='text-sm font-medium text-muted-foreground'>Status</p>
            <Badge
              className={`mt-1 ${
                resource.status === 'available'
                  ? 'bg-green-100 text-green-800'
                  : resource.status === 'occupied'
                  ? 'bg-blue-100 text-blue-800'
                  : resource.status === 'maintenance'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {resource.status}
            </Badge>
          </div>

          {resource.tags && resource.tags.length > 0 && (
            <>
              <Separator />
              <div>
                <p className='text-sm font-medium text-muted-foreground mb-2'>
                  Tags
                </p>
                <div className='flex flex-wrap gap-2'>
                  {resource.tags.map((tag, index) => (
                    <Badge key={index} variant='secondary'>
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stock & Vendor */}
      <Card>
        <CardHeader>
          <CardTitle>Stock & Vendor Information</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <p className='text-sm font-medium text-muted-foreground'>
                Initial Stock
              </p>
              <p className='text-2xl font-bold'>
                {resource.initial_stock_quantity || 0}
              </p>
            </div>
            <div>
              <p className='text-sm font-medium text-muted-foreground'>
                Current Stock
              </p>
              <p className='text-2xl font-bold'>
                {resource.current_stock_quantity || 0}
              </p>
            </div>
          </div>

          <Separator />

          {resource.caretaker && (
            <>
              <div>
                <p className='text-sm font-medium text-muted-foreground'>
                  Caretaker
                </p>
                <p className='text-base font-semibold'>
                  {resource.caretaker.full_name}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {resource.caretaker.email}
                </p>
                {resource.caretaker.phone_number && (
                  <p className='text-sm text-muted-foreground'>
                    {resource.caretaker.phone_number}
                  </p>
                )}
              </div>
              <Separator />
            </>
          )}

          {resource.vendor_name && (
            <div>
              <p className='text-sm font-medium text-muted-foreground'>
                Vendor Details
              </p>
              <div className='mt-2 space-y-1'>
                <p className='text-base font-semibold'>
                  {resource.vendor_name}
                </p>
                {resource.vendor_contact && (
                  <p className='text-sm text-muted-foreground'>
                    {resource.vendor_contact}
                  </p>
                )}
                {resource.vendor_email && (
                  <p className='text-sm text-muted-foreground'>
                    {resource.vendor_email}
                  </p>
                )}
                {resource.vendor_address && (
                  <p className='text-sm text-muted-foreground'>
                    {resource.vendor_address}
                  </p>
                )}
              </div>
            </div>
          )}

          {(resource.purchase_date ||
            resource.warranty_expiry_date ||
            resource.maintenance_schedule) && (
            <>
              <Separator />
              <div className='space-y-2'>
                {resource.purchase_date && (
                  <div className='flex justify-between'>
                    <span className='text-sm text-muted-foreground'>
                      Purchase Date
                    </span>
                    <span className='text-sm font-medium'>
                      {formatDate(resource.purchase_date)}
                    </span>
                  </div>
                )}
                {resource.warranty_expiry_date && (
                  <div className='flex justify-between'>
                    <span className='text-sm text-muted-foreground'>
                      Warranty Expiry
                    </span>
                    <span className='text-sm font-medium'>
                      {formatDate(resource.warranty_expiry_date)}
                    </span>
                  </div>
                )}
                {resource.maintenance_schedule && (
                  <div className='flex justify-between'>
                    <span className='text-sm text-muted-foreground'>
                      Maintenance Schedule
                    </span>
                    <span className='text-sm font-medium'>
                      {resource.maintenance_schedule}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card className='md:col-span-2'>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid gap-4 md:grid-cols-3'>
            <div>
              <p className='text-sm font-medium text-muted-foreground'>
                Created At
              </p>
              <p className='text-base'>{formatDate(resource.created_at)}</p>
              {resource.created_by_user && (
                <p className='text-sm text-muted-foreground'>
                  by {resource.created_by_user.full_name}
                </p>
              )}
            </div>

            <div>
              <p className='text-sm font-medium text-muted-foreground'>
                Last Updated
              </p>
              <p className='text-base'>{formatDate(resource.updated_at)}</p>
              {resource.updated_by_user && (
                <p className='text-sm text-muted-foreground'>
                  by {resource.updated_by_user.full_name}
                </p>
              )}
            </div>

            <div>
              <p className='text-sm font-medium text-muted-foreground'>
                Resource ID
              </p>
              <p className='text-base font-mono'>{resource.id}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
