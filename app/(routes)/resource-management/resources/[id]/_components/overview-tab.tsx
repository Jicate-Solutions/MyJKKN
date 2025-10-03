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
    <div className='grid gap-6 lg:grid-cols-2'>
      {/* Basic Information */}
      <Card className='h-fit'>
        <CardHeader className='pb-4'>
          <CardTitle className='text-lg'>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div className='space-y-1.5'>
            <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
              Resource Name
            </p>
            <p className='text-base font-semibold'>{resource.name}</p>
          </div>

          <Separator />

          <div className='space-y-1.5'>
            <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
              Description
            </p>
            <p className='text-sm leading-relaxed'>
              {resource.description || 'No description provided'}
            </p>
          </div>

          <Separator />

          <div className='space-y-2'>
            <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
              Category
            </p>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className='font-medium'>
                {resource.parent_category?.name || 'N/A'}
              </Badge>
              <span className='text-muted-foreground'>→</span>
              <Badge variant='outline' className='font-medium'>
                {resource.subcategory?.name || 'N/A'}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className='space-y-2'>
            <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
              Status
            </p>
            <Badge
              className={`capitalize ${
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
              <div className='space-y-2'>
                <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                  Tags
                </p>
                <div className='flex flex-wrap gap-2'>
                  {resource.tags.map((tag, index) => (
                    <Badge key={index} variant='secondary' className='font-medium'>
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
      <Card className='h-fit'>
        <CardHeader className='pb-4'>
          <CardTitle className='text-lg'>Stock & Vendor Information</CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div className='grid grid-cols-2 gap-6'>
            <div className='space-y-1.5'>
              <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                Initial Stock
              </p>
              <p className='text-3xl font-bold'>
                {resource.initial_stock_quantity || 0}
              </p>
            </div>
            <div className='space-y-1.5'>
              <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                Current Stock
              </p>
              <p className='text-3xl font-bold'>
                {resource.current_stock_quantity || 0}
              </p>
            </div>
          </div>

          <Separator />

          {resource.caretaker && (
            <>
              <div className='space-y-2'>
                <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                  Caretaker
                </p>
                <div className='space-y-1'>
                  <p className='text-base font-semibold'>
                    {resource.caretaker.first_name} {resource.caretaker.last_name}
                  </p>
                  {resource.caretaker.designation && (
                    <p className='text-xs text-muted-foreground'>
                      {resource.caretaker.designation}
                    </p>
                  )}
                  <p className='text-sm text-muted-foreground'>
                    {resource.caretaker.email}
                  </p>
                  {resource.caretaker.phone && (
                    <p className='text-sm text-muted-foreground'>
                      {resource.caretaker.phone}
                    </p>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {resource.vendor_name && (
            <>
              <div className='space-y-2'>
                <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                  Vendor Details
                </p>
                <div className='space-y-1'>
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
              <Separator />
            </>
          )}

          {(resource.purchase_date ||
            resource.warranty_expiry_date ||
            resource.maintenance_schedule) && (
            <div className='space-y-3'>
              <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                Important Dates
              </p>
              <div className='space-y-2'>
                {resource.purchase_date && (
                  <div className='flex justify-between items-center py-1.5'>
                    <span className='text-sm text-muted-foreground'>
                      Purchase Date
                    </span>
                    <span className='text-sm font-medium'>
                      {formatDate(resource.purchase_date)}
                    </span>
                  </div>
                )}
                {resource.warranty_expiry_date && (
                  <div className='flex justify-between items-center py-1.5'>
                    <span className='text-sm text-muted-foreground'>
                      Warranty Expiry
                    </span>
                    <span className='text-sm font-medium'>
                      {formatDate(resource.warranty_expiry_date)}
                    </span>
                  </div>
                )}
                {resource.maintenance_schedule && (
                  <div className='flex justify-between items-center py-1.5'>
                    <span className='text-sm text-muted-foreground'>
                      Maintenance Schedule
                    </span>
                    <span className='text-sm font-medium capitalize'>
                      {resource.maintenance_schedule.replace(/-/g, ' ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card className='lg:col-span-2'>
        <CardHeader className='pb-4'>
          <CardTitle className='text-lg'>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
            <div className='space-y-2'>
              <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                Created At
              </p>
              <div className='space-y-1'>
                <p className='text-sm font-medium'>{formatDate(resource.created_at)}</p>
                {resource.created_by_user && (
                  <p className='text-xs text-muted-foreground'>
                    by {resource.created_by_user.full_name}
                  </p>
                )}
              </div>
            </div>

            <div className='space-y-2'>
              <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                Last Updated
              </p>
              <div className='space-y-1'>
                <p className='text-sm font-medium'>{formatDate(resource.updated_at)}</p>
                {resource.updated_by_user && (
                  <p className='text-xs text-muted-foreground'>
                    by {resource.updated_by_user.full_name}
                  </p>
                )}
              </div>
            </div>

            <div className='space-y-2'>
              <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                Resource Code
              </p>
              <p className='text-xs font-mono bg-muted px-2 py-1.5 rounded break-all'>
                {resource.resource_code || 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
