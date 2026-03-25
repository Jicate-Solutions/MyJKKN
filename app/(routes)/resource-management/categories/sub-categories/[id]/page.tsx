'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  Edit,
  Trash2,
  ArrowLeft,
  ImageIcon,
  Calendar,
  User,
  Hash,
  Folder,
  Package,
  Settings,
  Tag,
  Link as LinkIcon,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { SubCategoryService } from '@/lib/services/resource-management/sub-category-service';
import { useSubCategoryOperations } from '@/hooks/resource-management/use-sub-categories';
import type {
  SubCategory,
  AttributeDefinition
} from '@/types/resource-management';
import { CATEGORY_STATUS, ATTRIBUTE_TYPE } from '@/types/resource-management';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';
import { toast } from 'react-hot-toast';

interface SubCategoryDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function SubCategoryDetailsPage({
  params
}: SubCategoryDetailsPageProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const { deleteCategory, loading: operationLoading } =
    useSubCategoryOperations();

  const [category, setCategory] = useState<SubCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const canViewCategories =
    isSuperAdmin || canAccess('resources.categories', 'view');
  const canEditCategories =
    isSuperAdmin || canAccess('resources.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('resources.categories', 'delete');

  // Unwrap params
  useEffect(() => {
    params.then((resolvedParams) => {
      setCategoryId(resolvedParams.id);
    });
  }, [params]);

  // Fetch category data
  useEffect(() => {
    const fetchCategory = async () => {
      if (!categoryId) return;

      try {
        setLoading(true);
        setError(null);
        const categoryData = await SubCategoryService.getSubCategory(
          categoryId
        );
        setCategory(categoryData);
      } catch (err) {
        console.error('Error fetching subcategory:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch subcategory'
        );
      } finally {
        setLoading(false);
      }
    };

    if (categoryId && canViewCategories) {
      fetchCategory();
    }
  }, [categoryId, canViewCategories]);

  // Handle delete action
  const handleDelete = async () => {
    if (!category) return;

    try {
      await deleteCategory(category.id);
      toast.success('Subcategory deleted successfully');
      router.push('/resource-management/categories/sub-categories');
    } catch (error) {
      // Error handling is done in the hook
      console.error('Delete error:', error);
    }
  };

  // Get status badge component
  const getStatusBadge = (status: string) => {
    switch (status) {
      case CATEGORY_STATUS.ACTIVE:
        return <Badge variant='default'>Active</Badge>;
      case CATEGORY_STATUS.INACTIVE:
        return <Badge variant='secondary'>Inactive</Badge>;
      case CATEGORY_STATUS.ARCHIVED:
        return <Badge variant='destructive'>Archived</Badge>;
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  // Get attribute type badge
  const getAttributeTypeBadge = (type: string) => {
    const typeLabels = {
      [ATTRIBUTE_TYPE.TEXT]: 'Text',
      [ATTRIBUTE_TYPE.NUMBER]: 'Number',
      [ATTRIBUTE_TYPE.DATE]: 'Date',
      [ATTRIBUTE_TYPE.BOOLEAN]: 'Yes/No',
      [ATTRIBUTE_TYPE.DROPDOWN]: 'Dropdown',
      [ATTRIBUTE_TYPE.TEXTAREA]: 'Long Text',
      [ATTRIBUTE_TYPE.EMAIL]: 'Email',
      [ATTRIBUTE_TYPE.URL]: 'URL'
    };

    return (
      <Badge variant='outline' className='text-xs'>
        {typeLabels[type as keyof typeof typeLabels] || type}
      </Badge>
    );
  };

  // Get category initials for avatar fallback
  const getCategoryInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!canViewCategories) {
    return <Loading title='Loading...' />;
  }

  if (loading) {
    return <Loading title='Loading subcategory details...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Subcategory Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => window.location.reload()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!category) {
    return (
      <ContentLayout title='Subcategory Details'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>Subcategory not found</p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resource-management/categories/sub-categories'>
              Back to Subcategories
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Subcategory Details'>
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
              <Link href='/resource-management'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resource-management/categories'>Categories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resource-management/categories/sub-categories'>
                Subcategories
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{category.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center space-x-4'>
            <Avatar className='h-16 w-16'>
              <AvatarImage src={category.image_url} alt={category.name} />
              <AvatarFallback className='bg-primary/10'>
                {category.image_url ? (
                  <ImageIcon className='h-6 w-6' />
                ) : (
                  getCategoryInitials(category.name)
                )}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className='text-2xl font-bold py-1'>{category.name}</h1>
              <div className='flex items-center space-x-2'>
                {getStatusBadge(category.status)}
                {category.display_order && (
                  <Badge variant='outline'>
                    Order: {category.display_order}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className='flex items-center space-x-2'>
            <Button variant='outline' asChild>
              <Link href='/resource-management/categories/sub-categories'>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back
              </Link>
            </Button>
            {canEditCategories && (
              <Button variant='outline' asChild>
                <Link
                  href={`/resource-management/categories/sub-categories/${category.id}/edit`}
                >
                  <Edit className='mr-2 h-4 w-4' />
                  Edit
                </Link>
              </Button>
            )}
            {canDeleteCategories && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant='destructive' disabled={operationLoading}>
                    <Trash2 className='mr-2 h-4 w-4' />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Permanently Delete Subcategory
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to permanently delete &quot;
                      {category.name}
                      &quot;? This action is irreversible and will also delete
                      any associated images and attribute definitions from
                      storage.
                      {category.resources_count &&
                        category.resources_count > 0 && (
                          <span className='text-destructive font-medium'>
                            <br />
                            <br />
                            This subcategory has {category.resources_count}{' '}
                            resource(s). You must delete them first.
                          </span>
                        )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      disabled={
                        operationLoading || (category.resources_count || 0) > 0
                      }
                    >
                      {operationLoading ? 'Deleting...' : 'Delete Permanently'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Category Information */}
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Main Information */}
          <div className='lg:col-span-2 space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>Subcategory Information</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                {/* Parent Category */}
                {category.parent_category && (
                  <div>
                    <h4 className='text-sm font-medium text-muted-foreground mb-2'>
                      Parent Category
                    </h4>
                    <div className='flex items-center space-x-2'>
                      <LinkIcon className='h-4 w-4 text-muted-foreground' />
                      <Link
                        href={`/resource-management/categories/${category.parent_category.id}`}
                        className='text-sm font-medium hover:underline text-primary'
                      >
                        {category.parent_category.name}
                      </Link>
                    </div>
                  </div>
                )}

                {category.description && (
                  <div>
                    <h4 className='text-sm font-medium text-muted-foreground mb-2'>
                      Description
                    </h4>
                    <p className='text-sm'>{category.description}</p>
                  </div>
                )}

                <Separator />

                <div className='grid grid-cols-2 gap-4'>
                  <div className='flex items-center space-x-2'>
                    <Settings className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <p className='text-sm font-medium'>Custom Attributes</p>
                      <p className='text-sm text-muted-foreground'>
                        {category.attribute_definitions?.length || 0}
                      </p>
                    </div>
                  </div>
                  <div className='flex items-center space-x-2'>
                    <Package className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <p className='text-sm font-medium'>Resources</p>
                      <p className='text-sm text-muted-foreground'>
                        {category.resources_count || 0}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Custom Attribute Definitions */}
            {category.attribute_definitions &&
              category.attribute_definitions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <div className='flex items-center space-x-2'>
                        <Settings className='h-5 w-5' />
                        <span>
                          Custom Attributes (
                          {category.attribute_definitions.length})
                        </span>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-4'>
                      {category.attribute_definitions.map((attr) => (
                        <div
                          key={attr.id}
                          className='flex items-start justify-between p-4 border rounded-lg'
                        >
                          <div className='space-y-2 flex-1'>
                            <div className='flex items-center space-x-2'>
                              <Tag className='h-4 w-4 text-muted-foreground' />
                              <h5 className='font-medium'>
                                {attr.description || attr.attribute_key}
                              </h5>
                              {attr.is_required && (
                                <Badge
                                  variant='destructive'
                                  className='text-xs'
                                >
                                  Required
                                </Badge>
                              )}
                              {attr.is_multiple && (
                                <Badge variant='secondary' className='text-xs'>
                                  Multiple
                                </Badge>
                              )}
                            </div>

                            <div className='flex items-center space-x-4 text-sm text-muted-foreground'>
                              <span>
                                Key:{' '}
                                <code className='text-xs bg-muted px-1 py-0.5 rounded'>
                                  {attr.attribute_key}
                                </code>
                              </span>
                              {getAttributeTypeBadge(attr.attribute_type)}
                            </div>

                            {attr.default_value && (
                              <div className='text-sm'>
                                <span className='text-muted-foreground'>
                                  Default:{' '}
                                </span>
                                <span className='font-mono bg-muted px-1 py-0.5 rounded text-xs'>
                                  {attr.default_value}
                                </span>
                              </div>
                            )}

                            {attr.options && attr.options.length > 0 && (
                              <div className='text-sm'>
                                <span className='text-muted-foreground'>
                                  Options:{' '}
                                </span>
                                <div className='flex flex-wrap gap-1 mt-1'>
                                  {attr.options.map((option, index) => (
                                    <Badge
                                      key={index}
                                      variant='outline'
                                      className='text-xs'
                                    >
                                      {option}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
          </div>

          {/* Metadata */}
          <div className='space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex items-center space-x-2'>
                  <Calendar className='h-4 w-4 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-medium'>Created</p>
                    <p className='text-sm text-muted-foreground'>
                      {format(new Date(category.created_at), 'PPP')}
                    </p>
                  </div>
                </div>

                {category.created_by_user && (
                  <div className='flex items-center space-x-2'>
                    <User className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <p className='text-sm font-medium'>Created by</p>
                      <p className='text-sm text-muted-foreground'>
                        {category.created_by_user.full_name}
                      </p>
                    </div>
                  </div>
                )}

                <Separator />

                <div className='flex items-center space-x-2'>
                  <Calendar className='h-4 w-4 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-medium'>Last Updated</p>
                    <p className='text-sm text-muted-foreground'>
                      {format(new Date(category.updated_at), 'PPP')}
                    </p>
                  </div>
                </div>

                {category.updated_by_user && (
                  <div className='flex items-center space-x-2'>
                    <User className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <p className='text-sm font-medium'>Updated by</p>
                      <p className='text-sm text-muted-foreground'>
                        {category.updated_by_user.full_name}
                      </p>
                    </div>
                  </div>
                )}

                {category.display_order && (
                  <>
                    <Separator />
                    <div className='flex items-center space-x-2'>
                      <Hash className='h-4 w-4 text-muted-foreground' />
                      <div>
                        <p className='text-sm font-medium'>Display Order</p>
                        <p className='text-sm text-muted-foreground'>
                          {category.display_order}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
