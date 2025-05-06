// app/(routes)/digital-resources/_components/digital-resources-table.tsx

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import {
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  Download,
  MoreHorizontal as DotsIcon
} from 'lucide-react';
import { useDigitalResources } from '@/hooks/resource/digital/use-digital-resources';
import {
  DigitalResource,
  DigitalResourceType,
  AccessMethod
} from '@/types/digital-resources';
import { format, isValid, parseISO } from 'date-fns';
import { useSearchParams } from 'next/navigation';

interface ResourceMetadata {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
}

// Custom Ellipsis component to replace PaginationEllipsis
const PaginationEllipsis = ({ className }: { className?: string }) => (
  <div
    className={`flex h-9 w-9 items-center justify-center ${className}`}
    aria-hidden='true'
  >
    <DotsIcon className='h-4 w-4' />
    <span className='sr-only'>More pages</span>
  </div>
);

// Create arrays of possible values for the type and access method
const DIGITAL_RESOURCE_TYPES: DigitalResourceType[] = [
  'e-book',
  'journal',
  'software',
  'online-course',
  'streaming-media',
  'other'
];

const ACCESS_METHODS: AccessMethod[] = [
  'direct-download',
  'web-portal',
  'license-key',
  'ip-restricted'
];

export function DigitalResourcesTable() {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [page, setPage] = useState<number>(
    Number(searchParams.get('page')) || 1
  );
  const [pageSize, setPageSize] = useState<number>(
    Number(searchParams.get('pageSize')) || 10
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    searchParams.get('search') || ''
  );
  const [selectedType, setSelectedType] = useState<string>('all-types');
  const [selectedAccessMethod, setSelectedAccessMethod] =
    useState<string>('all-methods');

  const {
    resources,
    metadata,
    loading,
    error,
    fetchDigitalResources,
    deleteDigitalResource
  } = useDigitalResources({
    search: searchQuery,
    page,
    limit: pageSize
  });

  const handleSearch = () => {
    fetchDigitalResources({
      search: searchQuery,
      page: 1
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    fetchDigitalResources({
      search: searchQuery,
      type: value === 'all-types' ? undefined : (value as DigitalResourceType),
      page: 1
    });
  };

  const handleAccessMethodChange = (value: string) => {
    setSelectedAccessMethod(value);
    fetchDigitalResources({
      search: searchQuery,
      access_method:
        value === 'all-methods' ? undefined : (value as AccessMethod),
      page: 1
    });
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedType('all-types');
    setSelectedAccessMethod('all-methods');
    fetchDigitalResources({
      search: undefined,
      type: undefined,
      access_method: undefined,
      page: 1
    });
  };

  const handleDelete = (id: string) => {
    setResourceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (resourceToDelete) {
      await deleteDigitalResource(resourceToDelete);
      setDeleteDialogOpen(false);
      setResourceToDelete(null);
    }
  };

  const handleEdit = (id: string) => {
    router.push(`/resources/digital-resources/edit/${id}`);
  };

  const handleView = (id: string) => {
    router.push(`/resources/digital-resources/${id}`);
  };

  const handleCreateNew = () => {
    router.push('/digital-resources/create');
  };

  const renderPagination = () => {
    const { page, totalPages } = metadata as ResourceMetadata;

    if (totalPages <= 1) return null;

    return (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={page > 1 ? () => setPage(page - 1) : undefined}
              className={page === 1 ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum;

            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (page <= 3) {
              pageNum = i + 1;
            } else if (page >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }

            return (
              <PaginationItem key={pageNum}>
                <PaginationLink
                  onClick={() => setPage(pageNum)}
                  isActive={page === pageNum}
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            );
          })}

          {totalPages > 5 && page < totalPages - 2 && (
            <>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink onClick={() => setPage(totalPages)}>
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            </>
          )}

          <PaginationItem>
            <PaginationNext
              onClick={page < totalPages ? () => setPage(page + 1) : undefined}
              className={
                page === totalPages ? 'pointer-events-none opacity-50' : ''
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  const getStatusBadge = (resource: DigitalResource) => {
    if (!resource.is_active) {
      return <Badge variant='destructive'>Inactive</Badge>;
    }

    // Check if license is expired
    if (resource.license_information?.expiration_date) {
      const expirationDate = parseISO(
        resource.license_information.expiration_date
      );
      if (isValid(expirationDate) && expirationDate < new Date()) {
        return <Badge variant='destructive'>Expired</Badge>;
      }
    }

    return (
      <Badge
        variant='outline'
        className='bg-green-100 text-green-800 hover:bg-green-100'
      >
        Active
      </Badge>
    );
  };

  // Show a message if there are database setup issues
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Database Setup Required</CardTitle>
          <CardDescription>
            The digital resources module requires database tables to be created
            first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <p>
              Please run the SQL script in{' '}
              <code>supabase/digital-resources.sql</code> to create the
              necessary tables.
            </p>
            <p className='text-muted-foreground text-sm'>
              Error details: {error}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='w-full'>
      <CardHeader>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <CardTitle>Digital Resources</CardTitle>
            <CardDescription>
              Manage your digital resources and licenses
            </CardDescription>
          </div>
          <Button onClick={handleCreateNew}>
            <Plus className='mr-2 h-4 w-4' />
            Add Resource
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className='flex flex-col sm:flex-row gap-4 mb-6'>
          <div className='flex w-full sm:w-auto'>
            <Input
              placeholder='Search resources...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className='rounded-r-none'
            />
            <Button
              variant='secondary'
              className='rounded-l-none'
              onClick={handleSearch}
            >
              <Search className='h-4 w-4' />
            </Button>
          </div>

          <div className='flex gap-2 flex-wrap sm:flex-nowrap'>
            <Select value={selectedType} onValueChange={handleTypeChange}>
              <SelectTrigger className='w-full sm:w-[180px]'>
                <SelectValue placeholder='Resource Type' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all-types'>All Types</SelectItem>
                {DIGITAL_RESOURCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedAccessMethod}
              onValueChange={handleAccessMethodChange}
            >
              <SelectTrigger className='w-full sm:w-[180px]'>
                <SelectValue placeholder='Access Method' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all-methods'>All Methods</SelectItem>
                {ACCESS_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant='outline' onClick={handleResetFilters}>
              <Filter className='h-4 w-4 mr-2' />
              Reset
            </Button>

            <Button variant='outline'>
              <Download className='h-4 w-4 mr-2' />
              Export
            </Button>
          </div>
        </div>

        {loading ? (
          <div className='flex justify-center items-center h-64'>
            <Loader2 className='h-8 w-8 animate-spin text-primary' />
          </div>
        ) : resources.length === 0 ? (
          <div className='text-center py-8 text-muted-foreground'>
            No digital resources found. Create your first resource to get
            started.
          </div>
        ) : (
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Access Method</TableHead>
                  <TableHead>License Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((resource) => (
                  <TableRow key={resource.id}>
                    <TableCell className='font-medium'>{resource.id}</TableCell>
                    <TableCell>{resource.digital_resource_name}</TableCell>
                    <TableCell>{resource.type}</TableCell>
                    <TableCell>{resource.access_method}</TableCell>
                    <TableCell>
                      {resource.license_information?.expiration_date
                        ? (() => {
                            const date = parseISO(
                              resource.license_information.expiration_date
                            );
                            return isValid(date)
                              ? format(date, 'dd MMM yyyy')
                              : 'Invalid date';
                          })()
                        : 'N/A'}
                    </TableCell>
                    <TableCell>{getStatusBadge(resource)}</TableCell>
                    <TableCell className='text-right'>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant='ghost' className='h-8 w-8 p-0'>
                            <span className='sr-only'>Open menu</span>
                            <MoreHorizontal className='h-4 w-4' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => handleView(resource.id)}
                          >
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleEdit(resource.id)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className='text-destructive'
                            onClick={() => handleDelete(resource.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <CardFooter className='flex justify-between'>
        <div className='text-sm text-muted-foreground'>
          Showing {resources.length} of {(metadata as ResourceMetadata).total}{' '}
          resources
        </div>
        {renderPagination()}
      </CardFooter>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this digital resource? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant='destructive' onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
