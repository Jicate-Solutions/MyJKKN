'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDigitalResources } from '@/hooks/resource/digital/use-digital-resources';
import { DigitalResourceFilters } from '@/types/digital-resources';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import {
  PlusCircle,
  MoreHorizontal,
  Search,
  Filter,
  RefreshCw,
  Eye,
  PenSquare,
  Calendar,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  DIGITAL_RESOURCE_TYPES,
  ACCESS_METHODS,
  OWNER_TYPES
} from '@/types/digital-resources';
import { DigitalResourceFiltersComponent } from './digital-resource-filters';

export default function DigitalResourceList({
  canEdit = false,
  canDelete = false,
  canReserve = false
}: {
  canEdit?: boolean;
  canDelete?: boolean;
  canReserve?: boolean;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<string | null>(null);
  const [deletingResource, setDeletingResource] = useState(false);

  const {
    resources,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchDigitalResources,
    deleteDigitalResource
  } = useDigitalResources();

  useEffect(() => {
    fetchDigitalResources();
  }, [fetchDigitalResources]);

  const handleSearch = () => {
    updateFilters({ search: searchQuery });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleFilterChange = (newFilters: Partial<DigitalResourceFilters>) => {
    updateFilters(newFilters);
  };

  const openDeleteDialog = (id: string) => {
    setResourceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!resourceToDelete) return;

    try {
      setDeletingResource(true);
      await deleteDigitalResource(resourceToDelete);
      setDeleteDialogOpen(false);
      toast.success('Digital resource deleted successfully');
    } catch (error) {
      console.error('Error deleting digital resource:', error);
      toast.error('Failed to delete digital resource');
    } finally {
      setDeletingResource(false);
      setResourceToDelete(null);
    }
  };

  const getAccessMethodBadge = (method: string) => {
    const colorMap: Record<string, string> = {
      online: 'bg-blue-100 text-blue-800',
      download: 'bg-green-100 text-green-800',
      api: 'bg-purple-100 text-purple-800',
      physical_media: 'bg-yellow-100 text-yellow-800'
    };

    return (
      <Badge className={colorMap[method] || 'bg-gray-100 text-gray-800'}>
        {method.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
      </Badge>
    );
  };

  if (error) {
    return (
      <div className='text-center py-10'>
        <p className='text-red-500'>Error: {error}</p>
        <Button onClick={() => fetchDigitalResources()} className='mt-4'>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        <div className='flex items-center space-x-2'>
          <div className='relative'>
            <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search digital resources...'
              className='pl-8 w-[250px]'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button variant='outline' onClick={handleSearch}>
            Search
          </Button>
          <Button
            variant='outline'
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className='h-4 w-4 mr-2' />
            Filters
          </Button>
        </div>
        <div className='flex items-center space-x-2'>
          <Button variant='outline' onClick={() => fetchDigitalResources()}>
            <RefreshCw className='h-4 w-4 mr-2' />
            Refresh
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className='p-4'>
          <DigitalResourceFiltersComponent
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </Card>
      )}

      {loading ? (
        <div className='text-center py-10'>
          <p className='text-muted-foreground'>Loading digital resources...</p>
        </div>
      ) : resources.length === 0 ? (
        <div className='text-center py-10'>
          <p className='text-muted-foreground'>No digital resources found</p>
          <Button onClick={() => fetchDigitalResources()} className='mt-4'>
            <RefreshCw className='h-4 w-4 mr-2' />
            Refresh
          </Button>
        </div>
      ) : (
        <>
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>S.No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Access Method</TableHead>
                  <TableHead>License Users</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((resource, index) => (
                  <TableRow key={resource.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className='font-medium'>
                      <Link
                        href={`/resources/digital-resources/${resource.id}`}
                        className='hover:underline'
                      >
                        {resource.digital_resource_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {Object.entries(DIGITAL_RESOURCE_TYPES)
                        .find(([_, value]) => value === resource.type)?.[0]
                        ?.replace(/_/g, ' ') || resource.type}
                    </TableCell>
                    <TableCell>
                      {resource.category?.category_name || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {getAccessMethodBadge(resource.access_method)}
                    </TableCell>
                    <TableCell>
                      {resource.license_information?.allowed_users
                        ? `${resource.license_information.allowed_users} users`
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {Object.entries(OWNER_TYPES)
                        .find(
                          ([_, value]) => value === resource.owner_type
                        )?.[0]
                        ?.replace(/_/g, ' ') || resource.owner_type}
                    </TableCell>
                    <TableCell className='text-right'>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant='ghost' className='h-8 w-8 p-0'>
                            <span className='sr-only'>Open menu</span>
                            <MoreHorizontal className='h-4 w-4' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/resources/digital-resources/${resource.id}`}
                            >
                              <Eye className='h-4 w-4 mr-2' />
                              View Details
                            </Link>
                          </DropdownMenuItem>

                          {canReserve && (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/resources/digital-resources/reservations/new?resource_id=${resource.id}`}
                              >
                                <Calendar className='h-4 w-4 mr-2' />
                                Reserve
                              </Link>
                            </DropdownMenuItem>
                          )}

                          {canEdit && (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/resources/digital-resources/edit/${resource.id}`}
                              >
                                <PenSquare className='h-4 w-4 mr-2' />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          )}

                          {canDelete && (
                            <DropdownMenuItem
                              onClick={() => openDeleteDialog(resource.id)}
                            >
                              <Trash2 className='h-4 w-4 mr-2' />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            currentPage={metadata.page}
            totalPages={metadata.totalPages}
            onPageChange={changePage}
          />
        </>
      )}

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
              disabled={deletingResource}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={deletingResource}
            >
              {deletingResource ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
