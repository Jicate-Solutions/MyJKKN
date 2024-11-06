'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { PlusCircle, Search } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import BeatLoader from 'react-spinners/BeatLoader';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { CategoryCard } from '@/components/categories/category-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryWithSubcategories } from '@/types/categories';
import { useAuth } from '@/providers/auth-provider';

interface CategoryStats {
  total: number;
  active: number;
  totalSubcategories: number;
  activeSubcategories: number;
}

// Create a Database type for better type checking
type Database = {
  public: {
    Tables: {
      application_categories: {
        Row: CategoryWithSubcategories;
      };
      application_subcategories: {
        Row: any;
      };
    };
  };
};

export default function CategoriesPage() {
  const supabase = createClientComponentClient<Database>();
  const { user, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<CategoryWithSubcategories[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<CategoryStats>({
    total: 0,
    active: 0,
    totalSubcategories: 0,
    activeSubcategories: 0
  });

  // Memoize the fetch function
  const fetchCategories = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsError(false);

      // Fetch categories with their subcategories in a single query
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('application_categories')
        .select(
          `
          *,
          subcategories:application_subcategories(*)
        `
        )
        .order('display_order', { ascending: true });

      if (categoriesError) {
        console.error('Error fetching categories:', categoriesError);
        throw categoriesError;
      }

      if (!categoriesData) {
        throw new Error('No data received');
      }

      setCategories(categoriesData);

      // Calculate stats
      const statsData = categoriesData.reduce(
        (acc, category) => {
          acc.total += 1;
          if (category.is_active) acc.active += 1;
          if (category.subcategories) {
            acc.totalSubcategories += category.subcategories.length;
            acc.activeSubcategories += category.subcategories.filter(
              (sub: any) => sub.is_active
            ).length;
          }
          return acc;
        },
        { total: 0, active: 0, totalSubcategories: 0, activeSubcategories: 0 }
      );

      setStats(statsData);
    } catch (error) {
      console.error('Error in fetchCategories:', error);
      setIsError(true);
      toast.error('Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // Initial data fetch
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Filter categories based on search query
  const filteredCategories = categories.filter(
    (category) =>
      category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.subcategories?.some((sub: any) =>
        sub.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  // Loading state
  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen'>
        <h2 className='text-lg font-semibold mb-4'>
          Failed to load categories
        </h2>
        <Button onClick={fetchCategories}>Try Again</Button>
      </div>
    );
  }

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

      <div className='space-y-4 px-1 sm:px-2 py-4'>
        <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-4'>
          <div>
            <h1 className='text-xl sm:text-2xl font-bold tracking-tight'>
              Categories & Subcategories
            </h1>
            <p className='text-sm text-muted-foreground'>
              Manage application categories and subcategories
            </p>
          </div>

          <Link href='/applications/categories/new'>
            <Button>
              <PlusCircle className='mr-2 h-4 w-4' />
              Add Category
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{stats.total}</div>
              <p className='text-xs text-muted-foreground'>
                {stats.active} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Subcategories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {stats.totalSubcategories}
              </div>
              <p className='text-xs text-muted-foreground'>
                {stats.activeSubcategories} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Categories/Subcategories Ratio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {stats.total > 0
                  ? (stats.totalSubcategories / stats.total).toFixed(1)
                  : '0'}
              </div>
              <p className='text-xs text-muted-foreground'>
                Subcategories per category
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Active Categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {stats.total > 0
                  ? `${((stats.active / stats.total) * 100).toFixed(1)}%`
                  : '0%'}
              </div>
              <p className='text-xs text-muted-foreground'>
                {stats.active} out of {stats.total}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search categories...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='pl-10'
          />
        </div>

        {/* Categories Grid */}
        {filteredCategories.length === 0 ? (
          <Card className='p-8 text-center'>
            <p className='text-muted-foreground'>
              {searchQuery
                ? 'No categories found matching your search'
                : 'No categories yet. Add your first category!'}
            </p>
          </Card>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {filteredCategories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                onDelete={async () => {
                  await fetchCategories(); // Refresh after delete
                }}
              />
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
