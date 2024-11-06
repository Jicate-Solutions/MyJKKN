// app/(routes)/applications/categories/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useCategories } from '@/hooks/use-categories';
import { useManageCategories } from '@/hooks/use-manage-categories';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

import { CategoryList } from './_components/category-list';
import { CreateCategoryModal } from './_components/create-category-modal';
import { LoadingState } from './_components/loading-state';
import { ErrorState } from './_components/error-state';
import { EmptyState } from './_components/empty-state';

export default function CategoriesPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { categories, isLoading, error, mutate } = useCategories();
  const { searchCategories } = useManageCategories();

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = await searchCategories(query);
      // Update the categories list with search results
      mutate(results, false);
    } else {
      // Reset to full list when search is cleared
      mutate();
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    mutate();
  };

  const renderContent = () => {
    if (isLoading) {
      return <LoadingState />;
    }

    if (error) {
      return (
        <ErrorState
          message='Failed to load categories'
          onRetry={() => mutate()}
        />
      );
    }

    if (!categories.length) {
      return (
        <EmptyState
          title='No Categories Found'
          description={
            searchQuery
              ? 'No categories match your search criteria'
              : 'Get started by creating your first category'
          }
          actionLabel={searchQuery ? undefined : 'Create Category'}
          onAction={searchQuery ? undefined : () => setShowCreateModal(true)}
        />
      );
    }

    return <CategoryList categories={categories} onUpdate={() => mutate()} />;
  };

  return (
    <ContentLayout title='Categories & Subcategories'>
      <div className='container mx-auto px-4 sm:px-6 lg:px-8'>
        <Breadcrumb className='mb-6'>
          <BreadcrumbList className='flex-wrap'>
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

        <div className='space-y-6 max-w-7xl mx-auto'>
          <div className='flex flex-col lg:flex-row justify-between gap-6'>
            <div className='space-y-1'>
              <h1 className='text-2xl sm:text-3xl font-bold tracking-tight'>
                Categories
              </h1>
              <p className='text-sm text-muted-foreground'>
                Manage application categories and subcategories
              </p>
            </div>
            <div className='flex flex-col sm:flex-row items-start sm:items-center gap-4'>
              <div className='relative w-full sm:w-auto min-w-[250px]'>
                <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none' />
                <Input
                  placeholder='Search categories...'
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className='pl-9 w-full'
                  aria-label='Search categories'
                />
              </div>
              <Button
                onClick={() => setShowCreateModal(true)}
                className='w-full sm:w-auto whitespace-nowrap'
                aria-label='Add new category'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Category
              </Button>
            </div>
          </div>

          <Card className='shadow-sm'>
            <CardHeader className='space-y-1 px-4 sm:px-6'>
              <CardTitle className='text-xl'>Application Categories</CardTitle>
              <CardDescription className='text-sm'>
                Organize your applications with categories and subcategories
              </CardDescription>
            </CardHeader>
            <CardContent className='px-4 sm:px-6 py-4 sm:py-6'>
              {renderContent()}
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateCategoryModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />
    </ContentLayout>
  );
}
