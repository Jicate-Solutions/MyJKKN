'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { Plus, ChevronDown, MoreVertical, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BeatLoader } from 'react-spinners';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ContentLayout } from '@/components/layout/content-layout';
import type { Category, Subcategory } from '@/types/categories';

export default function CategoriesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const supabase = createClientComponentClient();

  const fetchCategories = async () => {
    try {
      setIsLoading(true);

      const [categoriesResponse, subcategoriesResponse] = await Promise.all([
        supabase
          .from('application_categories')
          .select('*')
          .order('display_order', { ascending: true }),
        supabase
          .from('application_subcategories')
          .select('*')
          .order('display_order', { ascending: true })
      ]);

      if (categoriesResponse.error) throw categoriesResponse.error;
      if (subcategoriesResponse.error) throw subcategoriesResponse.error;

      setCategories(categoriesResponse.data || []);
      setSubcategories(subcategoriesResponse.data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: string, type: 'category' | 'subcategory') => {
    try {
      const table =
        type === 'category'
          ? 'application_categories'
          : 'application_subcategories';
      const { error } = await supabase.from(table).delete().eq('id', id);

      if (error) throw error;

      toast.success(
        `${
          type === 'category' ? 'Category' : 'Subcategory'
        } deleted successfully`
      );
      fetchCategories();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete');
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title='Categories & Subcategories'>
        <div className='flex items-center justify-center h-screen w-full'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Categories & Subcategories'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/applications'>Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Categories & Subcategories</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-4 p-4 sm:p-6'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Categories & Subcategories
            </h1>
            <p className='text-sm text-muted-foreground'>
              Manage application categories and subcategories
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Link href='/applications/categories/new'>
              <Button>
                <Plus className='mr-2 h-4 w-4' />
                Add New Category
              </Button>
            </Link>
          </div>
        </div>

        <div className='grid gap-6'>
          {categories.map((category) => (
            <Card key={category.id}>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-lg font-medium'>
                  {category.name}
                </CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='ghost' className='h-8 w-8 p-0'>
                      <MoreVertical className='h-4 w-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem>
                      <Link
                        href={`/applications/categories/${category.id}/edit`}
                      >
                        Edit Category
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Link
                        href={`/applications/categories/${category.id}/subcategories/new`}
                      >
                        Add Subcategory
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className='text-red-600'
                      onClick={() => handleDelete(category.id, 'category')}
                    >
                      Delete Category
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                {category.description && (
                  <p className='text-sm text-muted-foreground mb-4'>
                    {category.description}
                  </p>
                )}
                <div className='grid gap-2'>
                  {subcategories
                    .filter((sub) => sub.category_id === category.id)
                    .map((subcategory) => (
                      <div
                        key={subcategory.id}
                        className='flex items-center justify-between p-2 rounded-lg border'
                      >
                        <div>
                          <p className='font-medium'>{subcategory.name}</p>
                          {subcategory.description && (
                            <p className='text-sm text-muted-foreground'>
                              {subcategory.description}
                            </p>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant='ghost' className='h-8 w-8 p-0'>
                              <MoreVertical className='h-4 w-4' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem>
                              <Link
                                href={`/applications/categories/${category.id}/subcategories/${subcategory.id}/edit`}
                              >
                                Edit Subcategory
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className='text-red-600'
                              onClick={() =>
                                handleDelete(subcategory.id, 'subcategory')
                              }
                            >
                              Delete Subcategory
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
