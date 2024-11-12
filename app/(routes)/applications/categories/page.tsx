// app/(routes)/applications/categories/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import { CategoryService } from '@/lib/services/category-service';
import { Category } from '@/types/categories';
import { Button } from '@/components/ui/button';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { CategoryList } from './_components/category-list';
import { CreateCategoryModal } from './_components/create-category-modal';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const data = await CategoryService.getCategories();
      setCategories(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load categories'
      );
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return (
    <ContentLayout title='Categories'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/applications'>Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Categories</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Categories</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage application categories and subcategories
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className='mr-2 h-4 w-4' />
            Add Category
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            {error ? (
              <div className='text-center text-red-500'>{error}</div>
            ) : loading ? (
              <div className='flex justify-center items-center p-6'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <CategoryList
                categories={categories}
                onRefresh={fetchCategories}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <CreateCategoryModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false);
          fetchCategories();
        }}
      />
    </ContentLayout>
  );
}
