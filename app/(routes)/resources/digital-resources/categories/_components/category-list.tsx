'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDigitalResourceCategories } from '@/hooks/resource/digital/use-digital-resource-categories';
import {
  DigitalResourceCategory,
  DigitalResourceCategoryFilters
} from '@/types/digital-resources';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import {
  PlusCircle,
  MoreHorizontal,
  Search,
  Filter,
  FileText,
  RefreshCw,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';

interface CategoryListProps {
  categories?: DigitalResourceCategory[];
  onEdit?: (category: DigitalResourceCategory) => void;
  onDelete?: (category: DigitalResourceCategory) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  loading?: boolean;
  error?: string | null;
}

export function CategoryList({
  categories: propCategories,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
  loading: propLoading,
  error: propError
}: CategoryListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const {
    categories: hookCategories,
    loading: categoriesLoading,
    error: categoriesError,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories,
    deleteCategory
  } = useDigitalResourceCategories({
    isActive: true
  });

  const categories = propCategories || hookCategories;
  const loading = propLoading !== undefined ? propLoading : categoriesLoading;
  const error = propError !== undefined ? propError : categoriesError;

  useEffect(() => {
    if (!propCategories) {
      fetchCategories();
    }
  }, [fetchCategories, propCategories]);

  const handleSearch = () => {
    updateFilters({ search: searchQuery });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleFilterChange = (
    newFilters: Partial<DigitalResourceCategoryFilters>
  ) => {
    updateFilters(newFilters);
  };

  const handleDelete = async (category: DigitalResourceCategory) => {
    if (onDelete) {
      onDelete(category);
      return;
    }

    if (window.confirm('Are you sure you want to delete this category?')) {
      try {
        await deleteCategory(category.id);
        toast.success('Category deleted successfully');
      } catch (error) {
        console.error('Error deleting category:', error);
        toast.error('Failed to delete category');
      }
    }
  };

  const handleEdit = (category: DigitalResourceCategory) => {
    if (onEdit) {
      onEdit(category);
    } else {
      // Navigate to edit page if no handler provided
      window.location.href = `/resources/digital-resources/categories/${category.id}/edit`;
    }
  };

  if (error && !propCategories) {
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
      {!propCategories && (
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
          </div>
          <div className='flex items-center space-x-2'>
            <Button variant='outline' onClick={() => fetchCategories()}>
              <RefreshCw className='h-4 w-4 mr-2' />
              Refresh
            </Button>
            <Button asChild>
              <Link href='/resources/digital-resources/categories/new'>
                <PlusCircle className='h-4 w-4 mr-2' />
                Add Category
              </Link>
            </Button>
          </div>
        </div>
      )}

      {loading && !propCategories ? (
        <div className='text-center py-10'>
          <p className='text-muted-foreground'>Loading categories...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className='text-center py-10'>
          <p className='text-muted-foreground'>No categories found</p>
          {!propCategories && (
            <Button onClick={() => fetchCategories()} className='mt-4'>
              <RefreshCw className='h-4 w-4 mr-2' />
              Refresh
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>S.No</TableHead>
                  <TableHead>Category Name</TableHead>
                  <TableHead>Description</TableHead>
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
                        <FileText className='h-4 w-4 mr-2 text-muted-foreground' />
                        <span>{category.category_name}</span>
                      </div>
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
                      <Badge
                        variant={category.is_active ? 'default' : 'destructive'}
                      >
                        {category.is_active ? 'Active' : 'Inactive'}
                      </Badge>
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
                              href={`/resources/digital-resources/categories/${category.id}`}
                            >
                              <Eye className='h-4 w-4 mr-2' />
                              View
                            </Link>
                          </DropdownMenuItem>

                          {canEdit && (
                            <DropdownMenuItem
                              onClick={() => handleEdit(category)}
                            >
                              <Edit className='h-4 w-4 mr-2' />
                              Edit
                            </DropdownMenuItem>
                          )}

                          {canDelete && (
                            <DropdownMenuItem
                              onClick={() => handleDelete(category)}
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

          {!propCategories && metadata.totalPages > 1 && (
            <div className='flex justify-center mt-4'>
              <div className='flex items-center justify-center space-x-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => changePage(metadata.page - 1)}
                  disabled={metadata.page <= 1}
                >
                  Previous
                </Button>
                <span className='text-sm'>
                  Page {metadata.page} of {metadata.totalPages}
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => changePage(metadata.page + 1)}
                  disabled={metadata.page >= metadata.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
