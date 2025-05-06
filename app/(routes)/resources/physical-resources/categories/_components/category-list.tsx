'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useResourceCategories } from '@/hooks/resource/physical/use-resource-categories';
import { ResourceCategoryFilters } from '@/types/resources';
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
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import {
  PlusCircle,
  MoreHorizontal,
  Search,
  Filter,
  FolderTree,
  RefreshCw,
  Eye,
  Edit,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { CategoryFiltersComponent } from './category-filters';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

export function CategoryList() {
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get permissions
  const { canAccess, isSuperAdmin } = usePermissions();

  // Define access permissions
  const canViewCategories =
    isSuperAdmin || canAccess('physical_resources.categories', 'view');
  const canEditCategories =
    isSuperAdmin || canAccess('physical_resources.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('physical_resources.categories', 'delete');

  const {
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories,
    deleteCategory
  } = useResourceCategories();

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleSearch = () => {
    updateFilters({ search: searchQuery });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleFilterChange = (newFilters: Partial<ResourceCategoryFilters>) => {
    updateFilters(newFilters);
  };

  const openDeleteDialog = (id: string) => {
    if (!canDeleteCategories) {
      toast.error('You do not have permission to delete categories');
      return;
    }
    setCategoryToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!categoryToDelete || !canDeleteCategories) return;

    try {
      setIsDeleting(true);
      await deleteCategory(categoryToDelete);
      toast.success('Category deleted successfully');
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  if (error) {
    return (
      <div className='text-center py-10'>
        <p className='text-red-500'>Error: {error}</p>
        <Button onClick={() => fetchCategories()} className='mt-4'>
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
              placeholder='Search categories...'
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
          <Button variant='outline' onClick={() => fetchCategories()}>
            <RefreshCw className='h-4 w-4 mr-2' />
            Refresh
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className='p-4'>
          <CategoryFiltersComponent
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </Card>
      )}

      {loading ? (
        <div className='text-center py-10'>
          <p className='text-muted-foreground'>Loading categories...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className='text-center py-10'>
          <p className='text-muted-foreground'>No categories found</p>
          <Button onClick={() => fetchCategories()} className='mt-4'>
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
                  <TableHead>Category Name</TableHead>
                  <TableHead>Parent Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category, index) => (
                  <TableRow key={category.id}>
                    <TableCell className='font-medium'>{index + 1}</TableCell>
                    <TableCell className='font-medium'>
                      <div className='flex items-center'>
                        <FolderTree className='h-4 w-4 mr-2 text-muted-foreground' />
                        <Link
                          href={`/resources/physical-resources/categories/${category.id}`}
                          className='hover:underline'
                        >
                          {category.category_name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      {category.parent_category?.category_name || 'None'}
                    </TableCell>
                    <TableCell>
                      {category.description ? (
                        <span className='line-clamp-2'>
                          {category.description}
                        </span>
                      ) : (
                        <span className='text-muted-foreground'>
                          No description
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {category.attributes && category.attributes.length > 0 ? (
                        <div className='flex flex-wrap gap-1'>
                          {category.attributes
                            .slice(0, 3)
                            .map((attr, index) => (
                              <Badge key={index} variant='outline'>
                                {attr}
                              </Badge>
                            ))}
                          {category.attributes.length > 3 && (
                            <Badge variant='outline'>
                              +{category.attributes.length - 3} more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className='text-muted-foreground'>
                          No attributes
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {category.is_active ? (
                        <Badge variant='outline' className='bg-green-50'>
                          Active
                        </Badge>
                      ) : (
                        <Badge variant='outline' className='bg-red-50'>
                          Inactive
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
                          {/* View is always available since they already have view permission */}
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/resources/physical-resources/categories/${category.id}`}
                            >
                              <Eye className='h-4 w-4 mr-2' />
                              View
                            </Link>
                          </DropdownMenuItem>

                          {/* Only show Edit if user has edit permission */}
                          {canEditCategories && (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/resources/physical-resources/categories/${category.id}/edit`}
                              >
                                <Edit className='h-4 w-4 mr-2' />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          )}

                          {/* Only show Delete if user has delete permission */}
                          {canDeleteCategories && (
                            <DropdownMenuItem
                              className='text-red-600'
                              onClick={() => openDeleteDialog(category.id)}
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

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center'>
              <AlertTriangle className='h-5 w-5 text-destructive mr-2' />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this category? This action cannot
              be undone. Any resources assigned to this category will be left
              without a category.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
