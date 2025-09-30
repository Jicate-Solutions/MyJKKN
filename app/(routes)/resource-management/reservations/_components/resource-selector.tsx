// app/(routes)/resource-management/reservations/_components/resource-selector.tsx
'use client';

import { useState } from 'react';
import { Search, Filter, MapPin, Users, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useResources } from '@/hooks/resource-management/use-resources';
import { useParentCategories } from '@/hooks/resource-management/use-parent-categories';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type { Resource } from '@/types/resource-management';

interface ResourceSelectorProps {
  onSelectResource: (resource: Resource) => void;
  selectedResourceId?: string;
}

export function ResourceSelector({
  onSelectResource,
  selectedResourceId
}: ResourceSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedInstitution, setSelectedInstitution] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('available');

  // Fetch data
  const { institutions, loading: loadingInstitutions } =
    useInstitutionsWithAccess();
  const { categories, loading: loadingCategories } = useParentCategories();

  const { resources, loading: loadingResources } = useResources({
    status: (selectedStatus === 'all' ? undefined : selectedStatus) as any,
    parent_category_id:
      selectedCategory === 'all' ? undefined : selectedCategory,
    institution_id:
      selectedInstitution === 'all' ? undefined : selectedInstitution,
    search: searchQuery || undefined
  });

  // Filter resources
  const filteredResources = resources.filter((resource: any) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        resource.name.toLowerCase().includes(query) ||
        resource.description?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const isLoading =
    loadingInstitutions || loadingCategories || loadingResources;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <h2 className='text-2xl font-bold'>Select a Resource</h2>
        <p className='text-muted-foreground'>
          Browse available resources and select one to make a reservation
        </p>
      </div>

      {/* Search & Filters */}
      <div className='space-y-4'>
        {/* Search Bar */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder='Search resources by name or description...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='pl-10'
          />
        </div>

        {/* Filter Row */}
        <div className='grid gap-4 md:grid-cols-3'>
          {/* Institution Filter */}
          <div className='space-y-2'>
            <label className='text-sm font-medium'>Institution</label>
            <Select
              value={selectedInstitution}
              onValueChange={setSelectedInstitution}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Institutions</SelectItem>
                {institutions.map((inst: any) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Filter */}
          <div className='space-y-2'>
            <label className='text-sm font-medium'>Category</label>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Categories' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Categories</SelectItem>
                {categories.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className='space-y-2'>
            <label className='text-sm font-medium'>Status</label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder='Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Status</SelectItem>
                <SelectItem value='available'>Available</SelectItem>
                <SelectItem value='occupied'>Occupied</SelectItem>
                <SelectItem value='maintenance'>Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active Filters Display */}
        <div className='flex items-center gap-2 flex-wrap'>
          {searchQuery && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Search: {searchQuery}
            </Badge>
          )}
          {selectedCategory !== 'all' && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Category:{' '}
              {categories.find((c: any) => c.id === selectedCategory)?.name}
            </Badge>
          )}
          {selectedInstitution !== 'all' && (
            <Badge variant='secondary' className='gap-1'>
              <Filter className='h-3 w-3' />
              Institution:{' '}
              {
                institutions.find((i: any) => i.id === selectedInstitution)
                  ?.name
              }
            </Badge>
          )}
          {(searchQuery ||
            selectedCategory !== 'all' ||
            selectedInstitution !== 'all') && (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedInstitution('all');
              }}
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className='flex items-center justify-between'>
        <p className='text-sm text-muted-foreground'>
          {isLoading ? (
            'Loading resources...'
          ) : (
            <>
              <span className='font-semibold'>{filteredResources.length}</span>{' '}
              resource{filteredResources.length !== 1 ? 's' : ''} found
            </>
          )}
        </p>
      </div>

      {/* Resource Grid */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {isLoading ? (
          // Loading Skeletons
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className='h-6 w-3/4' />
              </CardHeader>
              <CardContent>
                <Skeleton className='h-4 w-full mb-2' />
                <Skeleton className='h-4 w-2/3' />
              </CardContent>
            </Card>
          ))
        ) : filteredResources.length === 0 ? (
          // Empty State
          <div className='col-span-full py-12 text-center'>
            <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
              <Search className='h-8 w-8 text-muted-foreground' />
            </div>
            <h3 className='mb-2 text-lg font-semibold'>No resources found</h3>
            <p className='text-sm text-muted-foreground mb-4'>
              Try adjusting your filters or search query
            </p>
            <Button
              variant='outline'
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedInstitution('all');
                setSelectedStatus('available');
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          // Resource Cards
          filteredResources.map((resource: any) => (
            <Card
              key={resource.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedResourceId === resource.id ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => onSelectResource(resource)}
            >
              <CardHeader className='pb-3'>
                <div className='flex items-start justify-between'>
                  <CardTitle className='text-base line-clamp-1'>
                    {resource.name}
                  </CardTitle>
                  <Badge
                    variant={
                      resource.status === 'available'
                        ? 'default'
                        : resource.status === 'maintenance'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {resource.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className='space-y-3'>
                {/* Description */}
                <p className='text-sm text-muted-foreground line-clamp-2'>
                  {resource.description || 'No description available'}
                </p>

                {/* Resource Info */}
                <div className='space-y-2 text-xs text-muted-foreground'>
                  {/* Location */}
                  {(resource.building_number || resource.room_number) && (
                    <div className='flex items-center gap-2'>
                      <MapPin className='h-3 w-3' />
                      <span>
                        {[
                          resource.building_number &&
                            `Building ${resource.building_number}`,
                          resource.block_number &&
                            `Block ${resource.block_number}`,
                          resource.room_number && `Room ${resource.room_number}`
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Capacity/Quantity */}
                  {resource.current_stock_quantity && (
                    <div className='flex items-center gap-2'>
                      <Users className='h-3 w-3' />
                      <span>Available: {resource.current_stock_quantity}</span>
                    </div>
                  )}

                  {/* Booking Type */}
                  <div className='flex items-center gap-2'>
                    <Calendar className='h-3 w-3' />
                    <span className='capitalize'>
                      {resource.booking_type?.replace('_', ' ') || 'No booking'}
                    </span>
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  className='w-full mt-4'
                  size='sm'
                  variant={
                    selectedResourceId === resource.id ? 'default' : 'outline'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectResource(resource);
                  }}
                >
                  {selectedResourceId === resource.id
                    ? 'Selected'
                    : 'Select Resource'}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
