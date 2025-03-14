'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
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
  DialogTitle,
} from '@/components/ui/dialog';
import { useDigitalResourceCategories } from '@/hooks/resource/use-digital-resource-categories';
import { toast } from 'sonner';
import { BeatLoader } from 'react-spinners';
import { CategoryList } from './_components/category-list';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { DigitalResourceCategory } from '@/types/digital-resources';

export default function DigitalResourceCategoriesPage() {
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DigitalResourceCategory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const { 
    categories, 
    loading, 
    error, 
    fetchCategories,
    deleteCategory
  } = useDigitalResourceCategories({
    isActive: true,
    limit: 100
  });
  
  const supabase = createClientComponentClient();
  
  // Check authentication
  useEffect(() => {
    const checkSession = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          router.push('/auth/login');
          return;
        }

        setAuthLoading(false);
      } catch (error) {
        console.error('Error checking session:', error);
        setAuthError('Authentication error. Please try again.');
        setAuthLoading(false);
      }
    };

    checkSession();
  }, [router, supabase.auth]);

  // Fetch categories on component mount
  useEffect(() => {
    if (!authLoading && !authError) {
      fetchCategories();
    }
  }, [fetchCategories, authLoading, authError]);

  const handleDeleteCategory = async () => {
    if (!selectedCategory) return;

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
    router.push(`/digital-resources/categories/${category.id}/edit`);
  };

  const openDeleteDialog = (category: DigitalResourceCategory) => {
    setSelectedCategory(category);
    setIsDeleteDialogOpen(true);
  };

  if (authLoading) {
    return (
      <ContentLayout title="Digital Resource Categories">
        <div className="flex justify-center items-center p-8">
          <BeatLoader color="#3498db" />
        </div>
      </ContentLayout>
    );
  }

  if (authError) {
    return (
      <ContentLayout title="Digital Resource Categories">
        <div className="text-center py-8">
          <p className="text-destructive">{authError}</p>
          <Button
            variant="outline"
            onClick={() => router.push('/auth/login')}
            className="mt-4"
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Digital Resource Categories">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/digital-resources">Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Categories</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Digital Resource Categories</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage categories for digital resources
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              className="w-full sm:w-auto" 
              onClick={() => router.push('/digital-resources/categories/new')}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <CategoryList 
              categories={categories} 
              onEdit={handleEdit} 
              onDelete={openDeleteDialog} 
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
              Are you sure you want to delete the category &quot;{selectedCategory?.category_name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
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
