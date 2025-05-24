'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ResourceCategoryService } from '@/lib/services/resource/physical/resource-category-service';
import { ResourceService } from '@/lib/services/resource/physical/resource-service';
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
  Loader2,
  AlertTriangle
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
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

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
  const supabase = createClientSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<ResourceCategory | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Get permissions with waitForLoad option to ensure they're fully loaded
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Define access permissions
  const canViewCategories =
    isSuperAdmin || canAccess('physical_resources.categories', 'view');
  const canEditCategories =
    isSuperAdmin || canAccess('physical_resources.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('physical_resources.categories', 'delete');
  const canCreateResources =
    isSuperAdmin || canAccess('physical_resources', 'create');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Category Details permissions debug:', {
        isSuperAdmin,
        canViewCategories: canAccess('physical_resources.categories', 'view'),
        canEditCategories: canAccess('physical_resources.categories', 'edit'),
        canDeleteCategories: canAccess(
          'physical_resources.categories',
          'delete'
        ),
        canCreateResources: canAccess('physical_resources', 'create')
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  useEffect(() => {
    // Only proceed if permissions are loaded
    if (!permissionsLoaded) return;

    if (!canViewCategories) {
      console.log('User does not have permission to view category details');
      router.push('/unauthorized');
      return;
    }

    const checkSessionAndLoadData = async () => {
      try {
        // Check session
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user) {
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
  }, [id, router, supabase.auth, permissionsLoaded, canViewCategories]);

  const openDeleteDialog = () => {
    if (!canDeleteCategories) {
      toast.error('You do not have permission to delete categories');
      return;
    }
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!category || !canDeleteCategories) return;

    try {
      setIsDeleting(true);
      await ResourceCategoryService.deleteResourceCategory(category.id);
      toast.success('Category deleted successfully');
      router.push('/resources/physical-resources/categories');
    } catch (error) {
      console.error('Error deleting category:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to delete category'
      );
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Category Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Permission check (redundant due to the redirect above, but added for safety)
  if (permissionsLoaded && !canViewCategories) {
    return (
      <ContentLayout title='Category Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view category details
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resources/physical-resources/dashboard'>
              Back to Resource Management
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

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
                <Link href='/resources/physical-resources/dashboard'>
                  Resource Management
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/physical-resources/categories'>
                  Categories
                </Link>
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
                <Link href='/resources/physical-resources'>
                  Resource Management
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/physical-resources/categories'>
                  Categories
                </Link>
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
            <Link href='/resources/physical-resources/categories'>
              Back to Categories
            </Link>
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
                <Link href='/resources/physical-resources'>
                  Resource Management
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/resources/physical-resources/categories'>
                  Categories
                </Link>
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
            <Link href='/resources/physical-resources/categories'>
              Back to Categories
            </Link>
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
              <Link href='/resources/physical-resources'>
                Resource Management
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/physical-resources/categories'>
                Categories
              </Link>
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
            {canEditCategories && (
              <Link
                href={`/resources/physical-resources/categories/${category.id}/edit`}
              >
                <Button variant='outline'>
                  <Edit className='h-4 w-4 mr-2' />
                  Edit
                </Button>
              </Link>
            )}
            {canDeleteCategories && (
              <Button variant='destructive' onClick={openDeleteDialog}>
                <Trash2 className='h-4 w-4 mr-2' />
                Delete
              </Button>
            )}
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
                  href={`/resources/physical-resources/categories/${category.parent_category.id}`}
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
                      href={`/resources/physical-resources/categories/${subcat.id}`}
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
                {canCreateResources && (
                  <Link
                    href={`/resources/physical-resources/new?category_id=${category.id}`}
                  >
                    <Button variant='outline' size='sm'>
                      Add Resource
                    </Button>
                  </Link>
                )}
              </div>

              {resources.length === 0 ? (
                <div className='text-center py-8 bg-muted/50 rounded-md'>
                  <p className='text-muted-foreground'>
                    No resources in this category yet
                  </p>
                  {canCreateResources && (
                    <Link
                      href={`/resources/physical-resources/new?category_id=${category.id}`}
                    >
                      <Button className='mt-2'>Add Resource</Button>
                    </Link>
                  )}
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
                              href={`/resources/physical-resources/${resource.id}`}
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
                            <Link
                              href={`/resources/physical-resources/${resource.id}`}
                            >
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

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center'>
              <AlertTriangle className='h-5 w-5 text-destructive mr-2' />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this category? Any resources
              assigned to this category will be left without a category. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
