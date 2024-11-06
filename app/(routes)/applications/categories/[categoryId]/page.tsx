'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import { use } from 'react';
import {
  Pencil,
  Trash2,
  PlusCircle,
  MoreVertical,
  ArrowLeft
} from 'lucide-react';
import BeatLoader from 'react-spinners/BeatLoader';

import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/providers/auth-provider';
import { CategoryWithSubcategories } from '@/types/categories';

interface CategoryDetailsPageProps {
  params: Promise<{
    categoryId: string;
  }>;
}

export default function CategoryDetailsPage({
  params
}: CategoryDetailsPageProps) {
  const resolvedParams = use(params);
  const categoryId = resolvedParams.categoryId;

  const router = useRouter();
  const supabase = createClientComponentClient();
  const { user } = useAuth();
  const [category, setCategory] = useState<CategoryWithSubcategories | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [deleteSubcategoryId, setDeleteSubcategoryId] = useState<string | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCategoryDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('application_categories')
        .select(
          `
          *,
          subcategories:application_subcategories(*)
        `
        )
        .eq('id', categoryId)
        .single();

      if (error) throw error;
      setCategory(data);
    } catch (error) {
      console.error('Error fetching category details:', error);
      toast.error('Failed to load category details');
      router.push('/applications/categories');
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, router, supabase]); // Add dependencies

  useEffect(() => {
    fetchCategoryDetails();
  }, [fetchCategoryDetails]); // Add fetchCategoryDetails to dependency array

  const handleDeleteSubcategory = async () => {
    if (!deleteSubcategoryId) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('application_subcategories')
        .delete()
        .eq('id', deleteSubcategoryId);

      if (error) throw error;

      toast.success('Subcategory deleted successfully');
      fetchCategoryDetails(); // Refresh the list after deletion
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      toast.error('Failed to delete subcategory');
    } finally {
      setIsDeleting(false);
      setDeleteSubcategoryId(null);
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title='Category Details'>
        <div className='flex items-center justify-center h-screen'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!category) {
    return (
      <ContentLayout title='Category Details'>
        <div className='text-center'>
          <h2 className='text-lg font-semibold'>Category not found</h2>
          <p className='text-muted-foreground'>
            The category you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link href='/applications/categories' className='mt-4 inline-block'>
            Return to categories
          </Link>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={category.name}>
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
              <Link href='/applications/categories'>Categories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{category.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 py-6'>
        {/* Category Details Card */}
        <div className='flex items-center justify-between'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => router.back()}
            className='gap-2'
          >
            <ArrowLeft size={16} />
            Back
          </Button>
          <Link
            href={`/applications/categories/${category.id}/subcategories/new`}
          >
            <Button>
              <PlusCircle className='mr-2 h-4 w-4' />
              Add Subcategory
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <div>
                <CardTitle className='text-2xl'>{category.name}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </div>
              <Badge variant={category.is_active ? 'default' : 'secondary'}>
                {category.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Subcategories List */}
        <Card>
          <CardHeader>
            <CardTitle>Subcategories</CardTitle>
          </CardHeader>
          <CardContent>
            {category.subcategories && category.subcategories.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Display Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className='w-[70px]'></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {category.subcategories.map((subcategory) => (
                    <TableRow key={subcategory.id}>
                      <TableCell className='font-medium'>
                        {subcategory.name}
                      </TableCell>
                      <TableCell>{subcategory.description}</TableCell>
                      <TableCell>{subcategory.display_order}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            subcategory.is_active ? 'default' : 'secondary'
                          }
                        >
                          {subcategory.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant='ghost' className='h-8 w-8 p-0'>
                              <MoreVertical className='h-4 w-4' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/applications/categories/${category.id}/subcategories/${subcategory.id}/edit`}
                                className='cursor-pointer'
                              >
                                <Pencil className='mr-2 h-4 w-4' />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className='text-destructive focus:text-destructive'
                              onClick={() =>
                                setDeleteSubcategoryId(subcategory.id)
                              }
                            >
                              <Trash2 className='mr-2 h-4 w-4' />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className='text-center py-6'>
                <p className='text-muted-foreground'>
                  No subcategories found. Add your first subcategory!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteSubcategoryId}
        onOpenChange={() => setDeleteSubcategoryId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              subcategory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubcategory}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
