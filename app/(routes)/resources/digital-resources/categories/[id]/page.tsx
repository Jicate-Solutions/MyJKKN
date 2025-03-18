'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { DigitalResourceCategory, DigitalResource } from '@/types/digital-resources';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Edit,
  Trash2,
  FolderTree,
  ChevronLeft,
  FileDigit,
  Tag,
  Loader2
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { toast } from 'sonner';

interface CategoryDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function DigitalResourceCategoryDetailPage({
  params
}: CategoryDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<DigitalResourceCategory | null>(null);
  const [resources, setResources] = useState<DigitalResource[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSessionAndLoadData = async () => {
      try {
        // Check session
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          router.push('/auth/login');
          return;
        }

        // Load category data
        const { data: categoryData, error: categoryError } = await supabase
          .from('digital_resource_categories')
          .select('*')
          .eq('id', id)
          .single();

        if (categoryError) {
          throw new Error(categoryError.message);
        }

        setCategory(categoryData);

        // Load resources in this category
        const { data: resourcesData, error: resourcesError } = await supabase
          .from('digital_resources')
          .select('*')
          .eq('category_id', id)
          .eq('is_active', true);

        if (resourcesError) {
          throw new Error(resourcesError.message);
        }

        setResources(resourcesData || []);
        setLoading(false);
      } catch (error) {
        console.error('Error:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
        setLoading(false);
      }
    };

    checkSessionAndLoadData();
  }, [id, router, supabase]);

  const handleDelete = async () => {
    if (!category) return;

    if (
      window.confirm(
        `Are you sure you want to delete the category "${category.category_name}"?`
      )
    ) {
      try {
        setLoading(true);
        
        // Check if there are resources using this category
        if (resources.length > 0) {
          toast.error('Cannot delete category with associated resources');
          setLoading(false);
          return;
        }
        
        const { error } = await supabase
          .from('digital_resource_categories')
          .delete()
          .eq('id', category.id);
          
        if (error) {
          throw new Error(error.message);
        }
        
        toast.success('Category deleted successfully');
        router.push('/resources/digital-resources/categories');
      } catch (error) {
        console.error('Error deleting category:', error);
        setError(
          error instanceof Error ? error.message : 'Failed to delete category'
        );
        toast.error('Failed to delete category');
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <ContentLayout title='Category Details'>
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
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/categories'>Categories</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Category Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Category Details'>
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
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/categories'>Categories</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Category Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>Error: {error}</p>
          <Button variant='outline' asChild>
            <Link href='/resources/digital-resources/categories'>Back to Categories</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!category) {
    return (
      <ContentLayout title='Category Details'>
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
              <BreadcrumbLink asChild>
                <Link href='/resources/digital-resources/categories'>Categories</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Category Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>Category not found</p>
          <Button variant='outline' asChild>
            <Link href='/resources/digital-resources/categories'>Back to Categories</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Category: ${category.category_name}`}>
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
            <BreadcrumbLink asChild>
              <Link href='/resources/digital-resources/categories'>Categories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{category.category_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              {category.category_name}
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Category details and resources
            </p>
          </div>
          <div className='flex space-x-2'>
            <Link href={`/resources/digital-resources/categories/${category.id}/edit`}>
              <Button variant='outline'>
                <Edit className='h-4 w-4 mr-2' />
                Edit
              </Button>
            </Link>
            <Button variant='destructive' onClick={handleDelete}>
              <Trash2 className='h-4 w-4 mr-2' />
              Delete
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className='flex items-center'>
              <FolderTree className='h-6 w-6 mr-2 text-muted-foreground' />
              <CardTitle>{category.category_name}</CardTitle>
            </div>
            <div className='text-sm text-muted-foreground'>
              {category.is_active ? (
                <Badge variant='outline' className='bg-green-50'>
                  Active
                </Badge>
              ) : (
                <Badge variant='outline' className='bg-red-50'>
                  Inactive
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className='space-y-6'>
            {category.description && (
              <div>
                <h3 className='text-lg font-medium mb-2'>Description</h3>
                <p className='text-muted-foreground'>{category.description}</p>
              </div>
            )}

            {category.attributes && category.attributes.length > 0 && (
              <div>
                <h3 className='text-lg font-medium mb-2'>Attributes</h3>
                <div className='flex flex-wrap gap-2'>
                  {category.attributes.map((attr, index) => (
                    <Badge
                      key={index}
                      variant='outline'
                      className='flex items-center'
                    >
                      <Tag className='h-3 w-3 mr-1' />
                      {attr}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div>
              <div className='flex justify-between items-center mb-4'>
                <h3 className='text-lg font-medium'>
                  Resources in this Category
                </h3>
                <Link href={`/resources/digital-resources/new?category_id=${category.id}`}>
                  <Button variant='outline' size='sm'>
                    Add Resource
                  </Button>
                </Link>
              </div>

              {resources.length === 0 ? (
                <div className='text-center py-8 bg-muted/50 rounded-md'>
                  <p className='text-muted-foreground'>
                    No resources in this category yet
                  </p>
                  <Link href={`/resources/digital-resources/new?category_id=${category.id}`}>
                    <Button className='mt-2'>Add Resource</Button>
                  </Link>
                </div>
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Access Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resources.map((resource) => (
                        <TableRow key={resource.id}>
                          <TableCell className='font-medium'>
                            <Link
                              href={`/resources/digital-resources/${resource.id}`}
                              className='hover:underline'
                            >
                              {resource.digital_resource_name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {resource.type.charAt(0).toUpperCase() + resource.type.slice(1).replace(/-/g, ' ')}
                          </TableCell>
                          <TableCell>
                            {resource.access_method.replace(/-/g, ' ')}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                resource.is_active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }
                            >
                              {resource.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-right'>
                            <Link href={`/resources/digital-resources/${resource.id}`}>
                              <Button variant='ghost' size='sm'>
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
