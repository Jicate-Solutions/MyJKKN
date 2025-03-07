'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ResourceCategoryService } from '@/lib/services/resource/resource-category-service';
import { ResourceService } from '@/lib/services/resource/resource-service';
import { ResourceCategory, Resource } from '@/types/resources';
import { BeatLoader } from 'react-spinners';
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
  ArrowLeft,
  Building2,
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

interface CategoryDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function CategoryDetailPage({
  params
}: CategoryDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<ResourceCategory | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
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
        const categoryData = await ResourceCategoryService.getResourceCategory(
          id
        );
        setCategory(categoryData);

        // Load resources in this category
        const resourcesData = await ResourceService.getResources({
          category_id: id,
          isActive: true
        });
        setResources(resourcesData.data);

        setLoading(false);
      } catch (error) {
        console.error('Error:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
        setLoading(false);
      }
    };

    checkSessionAndLoadData();
  }, [id, router, supabase.auth]);

  const handleDelete = async () => {
    if (!category) return;

    if (
      window.confirm(
        `Are you sure you want to delete the category "${category.category_name}"?`
      )
    ) {
      try {
        setLoading(true);
        await ResourceCategoryService.deleteResourceCategory(category.id);
        router.push('/resources/categories');
      } catch (error) {
        console.error('Error deleting category:', error);
        setError(
          error instanceof Error ? error.message : 'Failed to delete category'
        );
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
                <Link href='/resources'>Resource Management</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/categories'>Categories</Link>
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
                <Link href='/resources'>Resource Management</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/categories'>Categories</Link>
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
            <Link href='/resources/categories'>Back to Categories</Link>
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
                <Link href='/resources'>Resource Management</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/categories'>Categories</Link>
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
            <Link href='/resources/categories'>Back to Categories</Link>
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
              <Link href='/resources'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/categories'>Categories</Link>
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
            <Link href={`/resources/categories/${category.id}/edit`}>
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

            {category.parent_category && (
              <div>
                <h3 className='text-lg font-medium mb-2'>Parent Category</h3>
                <Link
                  href={`/resources/categories/${category.parent_category.id}`}
                  className='flex items-center text-blue-600 hover:underline'
                >
                  <FolderTree className='h-4 w-4 mr-2' />
                  {category.parent_category.category_name}
                </Link>
              </div>
            )}

            {category.subcategories && category.subcategories.length > 0 && (
              <div>
                <h3 className='text-lg font-medium mb-2'>Subcategories</h3>
                <div className='grid grid-cols-2 gap-2'>
                  {category.subcategories.map((subcat) => (
                    <Link
                      key={subcat.id}
                      href={`/resources/categories/${subcat.id}`}
                      className='flex items-center p-2 border rounded-md hover:bg-muted'
                    >
                      <FolderTree className='h-4 w-4 mr-2 text-muted-foreground' />
                      {subcat.category_name}
                    </Link>
                  ))}
                </div>
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
                <Link href={`/resources/new?category_id=${category.id}`}>
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
                  <Link href={`/resources/new?category_id=${category.id}`}>
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
                        <TableHead>Location</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resources.map((resource) => (
                        <TableRow key={resource.id}>
                          <TableCell className='font-medium'>
                            <Link
                              href={`/resources/${resource.id}`}
                              className='hover:underline'
                            >
                              {resource.resource_name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {resource.resource_type.charAt(0).toUpperCase() +
                              resource.resource_type.slice(1)}
                          </TableCell>
                          <TableCell>
                            <div className='flex items-center'>
                              <Building2 className='h-4 w-4 mr-1 text-muted-foreground' />
                              {resource.institution?.name || 'N/A'}
                              {resource.building && `, ${resource.building}`}
                              {resource.room && `, Room ${resource.room}`}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                resource.condition === 'excellent'
                                  ? 'bg-green-100 text-green-800'
                                  : resource.condition === 'good'
                                  ? 'bg-blue-100 text-blue-800'
                                  : resource.condition === 'fair'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }
                            >
                              {resource.condition.charAt(0).toUpperCase() +
                                resource.condition.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-right'>
                            <Link href={`/resources/${resource.id}`}>
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
