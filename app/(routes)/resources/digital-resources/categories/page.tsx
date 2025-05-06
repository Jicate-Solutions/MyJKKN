'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useDigitalResourceCategories } from '@/hooks/resource/digital/use-digital-resource-categories';
import { CategoryList } from './_components/category-list';
import { DigitalResourceCategory } from '@/types/digital-resources';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

export default function DigitalResourceCategoriesPage() {
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<DigitalResourceCategory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Permissions state
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });
  const isLoading = authLoading || permissionsLoading;

  // Specific permission checks
  const canViewCategories =
    isSuperAdmin || canAccess('digital_resources.categories', 'view');
  const canCreateCategories =
    isSuperAdmin || canAccess('digital_resources.categories', 'create');
  const canEditCategories =
    isSuperAdmin || canAccess('digital_resources.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('digital_resources.categories', 'delete');

  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    fetchCategories,
    deleteCategory
  } = useDigitalResourceCategories({
    isActive: true,
    limit: 100
  });

  // Initialize Supabase and check auth state
  useEffect(() => {
    const supabase = createClientSupabaseClient();

    // Check auth on component mount
    const checkAuth = async () => {
      try {
        setAuthLoading(true);
        const { data: sessionData } = await supabase.auth.getSession();

        if (sessionData?.session) {
          console.log(
            'Categories: Auth session found:',
            sessionData.session.user.id
          );
          setUser(sessionData.session.user);
        } else {
          console.log('Categories: No session found, trying to get user');
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log('Categories: User found:', data.user.id);
            setUser(data.user);
          } else {
            console.log('Categories: No authenticated user found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Categories: Auth check error:', error);
        setUser(null);
        setAuthError('Authentication error. Please try again.');
      } finally {
        setAuthLoading(false);
      }
    };

    // Check auth immediately
    checkAuth();

    // Setup auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Categories: Auth state changed:', event);
        if (session) {
          console.log('Categories: New session user:', session.user.id);
          setUser(session.user);
        } else {
          setUser(null);
        }
      }
    );

    // Cleanup
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Debug permissions once they're loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Categories permissions debug:', {
        isSuperAdmin,
        canViewCategories: canAccess('digital_resources.categories', 'view'),
        canCreateCategories: canAccess(
          'digital_resources.categories',
          'create'
        ),
        canEditCategories: canAccess('digital_resources.categories', 'edit'),
        canDeleteCategories: canAccess('digital_resources.categories', 'delete')
      });
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Redirect if not allowed to view categories
  useEffect(() => {
    if (!isLoading && (!user || !canViewCategories)) {
      if (!user) {
        toast.error(
          'You must be logged in to view digital resource categories'
        );
        router.push('/login');
      } else if (!canViewCategories) {
        toast.error(
          'You do not have permission to view digital resource categories'
        );
        router.push('/resources/digital-resources');
      }
    }
  }, [user, isLoading, canViewCategories, router]);

  // Fetch categories on component mount
  useEffect(() => {
    if (!isLoading && user && canViewCategories) {
      fetchCategories();
    }
  }, [fetchCategories, isLoading, user, canViewCategories]);

  const handleDeleteCategory = async () => {
    if (!selectedCategory || !canDeleteCategories) return;

    setIsSubmitting(true);
    try {
      await deleteCategory(selectedCategory.id);
      setIsDeleteDialogOpen(false);
      fetchCategories();
      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (category: DigitalResourceCategory) => {
    if (canEditCategories) {
      router.push(
        `/resources/digital-resources/categories/${category.id}/edit`
      );
    } else {
      toast.error('You do not have permission to edit categories');
    }
  };

  const openDeleteDialog = (category: DigitalResourceCategory) => {
    if (canDeleteCategories) {
      setSelectedCategory(category);
      setIsDeleteDialogOpen(true);
    } else {
      toast.error('You do not have permission to delete categories');
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title='Digital Resource Categories'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
          <span className='ml-2'>Loading...</span>
        </div>
      </ContentLayout>
    );
  }

  if (authError) {
    return (
      <ContentLayout title='Digital Resource Categories'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Error</p>
          <p className='text-muted-foreground mb-4'>{authError}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/login')}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // If not authenticated, show error state
  if (!user) {
    return (
      <ContentLayout title='Digital Resource Categories'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Authentication Required
          </p>
          <p className='text-muted-foreground mb-4'>
            You must be logged in to view digital resource categories
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/login'>Go to Login</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!canViewCategories) {
    return (
      <ContentLayout title='Digital Resource Categories'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Access Denied</p>
          <p className='text-muted-foreground mb-4'>
            You do not have permission to view digital resource categories
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resources/digital-resources'>
              Return to Digital Resources
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Digital Resource Categories'>
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
              <Link href='/resources/digital-resources'>Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Categories</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              Digital Resource Categories
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage categories for digital resources
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateCategories && (
              <Button
                className='w-full sm:w-auto'
                onClick={() =>
                  router.push('/resources/digital-resources/categories/new')
                }
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Category
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <CategoryList
              categories={categories}
              onEdit={handleEdit}
              onDelete={openDeleteDialog}
              canEdit={canEditCategories}
              canDelete={canDeleteCategories}
              loading={categoriesLoading}
              error={categoriesError}
            />
          </CardContent>
        </Card>
      </div>

      {/* Delete Category Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the category &quot;
              {selectedCategory?.category_name}&quot;? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDeleteCategory}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
