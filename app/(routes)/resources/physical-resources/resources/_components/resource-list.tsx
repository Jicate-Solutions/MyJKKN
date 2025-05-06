'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useResources } from '@/hooks/resource/physical/use-resources';
import { ResourceFilters } from '@/types/resources';
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
import { ResourceFiltersComponent } from './resource-filters';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';

export function ResourceList() {
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<string | null>(null);
  const [deletingResource, setDeletingResource] = useState(false);

  // Get permissions
  const { canAccess, isSuperAdmin } = usePermissions();

  // Define access permissions
  const canViewResources =
    isSuperAdmin || canAccess('physical_resources', 'view');
  const canEditResources =
    isSuperAdmin || canAccess('physical_resources', 'edit');
  const canDeleteResources =
    isSuperAdmin || canAccess('physical_resources', 'delete');
  const canReserveResources =
    isSuperAdmin || canAccess('physical_resources.reservations', 'create');

  const {
    resources,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchResources,
    deleteResource
  } = useResources();

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const handleSearch = () => {
    updateFilters({ search: searchQuery });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleFilterChange = (newFilters: Partial<ResourceFilters>) => {
    updateFilters(newFilters);
  };

  const openDeleteDialog = (id: string) => {
    if (!canDeleteResources) {
      toast.error('You do not have permission to delete resources');
      return;
    }
    setResourceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!resourceToDelete || !canDeleteResources) return;

    try {
      setDeletingResource(true);
      await deleteResource(resourceToDelete);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting resource:', error);
    } finally {
      setDeletingResource(false);
      setResourceToDelete(null);
    }
  };

  const getConditionBadge = (condition: string) => {
    const colorMap: Record<string, string> = {
      excellent: 'bg-green-100 text-green-800',
      good: 'bg-blue-100 text-blue-800',
      fair: 'bg-yellow-100 text-yellow-800',
      poor: 'bg-red-100 text-red-800'
    };

    return (
      <Badge className={colorMap[condition] || 'bg-gray-100 text-gray-800'}>
        {condition.charAt(0).toUpperCase() + condition.slice(1)}
      </Badge>
    );
  };

  if (error) {
    return (
      <div className='text-center py-10'>
        <p className='text-red-500'>Error: {error}</p>
        <Button onClick={() => fetchResources()} className='mt-4'>
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
              placeholder='Search resources...'
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
          <Button variant='outline' onClick={() => fetchResources()}>
            <RefreshCw className='h-4 w-4 mr-2' />
            Refresh
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className='p-4'>
          <ResourceFiltersComponent
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </Card>
      )}

      {loading ? (
        <div className='text-center py-10'>
          <p className='text-muted-foreground'>Loading resources...</p>
        </div>
      ) : resources.length === 0 ? (
        <div className='text-center py-10'>
          <p className='text-muted-foreground'>No resources found</p>
          <Button onClick={() => fetchResources()} className='mt-4'>
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
                  <TableHead>Location</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Shareable</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((resource, index) => (
                  <TableRow key={resource.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className='font-medium'>
                      <Link
                        href={`/resources/physical-resources/${resource.id}`}
                        className='hover:underline'
                      >
                        {resource.resource_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {resource.resource_type.charAt(0).toUpperCase() +
                        resource.resource_type.slice(1)}
                    </TableCell>
                    <TableCell>
                      {resource.category?.category_name || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {resource.building
                        ? `${resource.building}${
                            resource.room ? `, Room ${resource.room}` : ''
                          }`
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {getConditionBadge(resource.condition)}
                    </TableCell>
                    <TableCell>
                      {resource.is_shareable ? (
                        <Badge variant='outline' className='bg-green-50'>
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant='outline' className='bg-red-50'>
                          No
                        </Badge>
                      )}
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
                          {/* Always show View since it requires same permission as viewing the page */}
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/resources/physical-resources/${resource.id}`}
                            >
                              <Eye className='h-4 w-4 mr-2' />
                              View
                            </Link>
                          </DropdownMenuItem>

                          {/* Only show Edit if user has edit permission */}
                          {canEditResources && (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/resources/physical-resources/${resource.id}/edit`}
                              >
                                <PenSquare className='h-4 w-4 mr-2' />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          )}

                          {/* Only show Reserve if user has reservation permission */}
                          {canReserveResources && (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/resources/physical-resources/reservations/new?resource_id=${resource.id}`}
                              >
                                <Calendar className='h-4 w-4 mr-2' />
                                Reserve
                              </Link>
                            </DropdownMenuItem>
                          )}

                          {/* Only show Delete if user has delete permission */}
                          {canDeleteResources && (
                            <DropdownMenuItem
                              className='text-red-600'
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
            <DialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-red-500' />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this resource? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='flex space-x-2 justify-end'>
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
