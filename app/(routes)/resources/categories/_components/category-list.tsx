'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useResourceCategories } from '@/hooks/resource/use-resource-categories';
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
import { Pagination } from '@/components/ui/pagination';
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
  Trash2
} from 'lucide-react';
import { CategoryFiltersComponent } from './category-filters';

export function CategoryList() {
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this category?')) {
      await deleteCategory(id);
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
                  <TableHead>Category Name</TableHead>
                  <TableHead>Parent Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className='font-medium'>
                      <div className='flex items-center'>
                        <FolderTree className='h-4 w-4 mr-2 text-muted-foreground' />
                        <Link
                          href={`/resources/categories/${category.id}`}
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
                          <Link href={`/resources/categories/${category.id}`}>
                            <DropdownMenuItem>
                              <Eye className='h-4 w-4 mr-2' />
                              View
                            </DropdownMenuItem>
                          </Link>
                          <Link
                            href={`/resources/categories/${category.id}/edit`}
                          >
                            <DropdownMenuItem>
                              <Edit className='h-4 w-4 mr-2' />
                              Edit
                            </DropdownMenuItem>
                          </Link>
                          <DropdownMenuItem
                            className='text-red-600'
                            onClick={() => handleDelete(category.id)}
                          >
                            <Trash2 className='h-4 w-4 mr-2' />
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

          <Pagination
            currentPage={metadata.page}
            totalPages={metadata.totalPages}
            onPageChange={changePage}
          />
        </>
      )}
    </div>
  );
}
