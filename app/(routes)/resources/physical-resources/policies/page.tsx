'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  PlusCircle,
  RefreshCw,
  Search,
  Share2,
  Filter,
  Eye,
  PenSquare,
  Trash2,
  MoreHorizontal,
  AlertTriangle
} from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { SharingPolicy } from '@/types/resources';
import { useSharingPolicies } from '@/hooks/resource/physical/use-sharing-policies';
import { PolicyFilters } from './_components/policy-filters';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';
import { useRouter } from 'next/navigation';

export default function SharingPoliciesPage() {
  const router = useRouter();
  const {
    policies,
    loading,
    error,
    metadata,
    filters,
    fetchPolicies,
    updateFilters,
    changePage,
    deletePolicy
  } = useSharingPolicies();
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<string | null>(null);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Get permissions with waitForLoad option to ensure they're fully loaded
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Define access permissions
  const canViewPolicies =
    isSuperAdmin || canAccess('physical_resources.policies', 'view');
  const canCreatePolicies =
    isSuperAdmin || canAccess('physical_resources.policies', 'create');
  const canEditPolicies =
    isSuperAdmin || canAccess('physical_resources.policies', 'edit');
  const canDeletePolicies =
    isSuperAdmin || canAccess('physical_resources.policies', 'delete');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Policies permissions debug:', {
        isSuperAdmin,
        canViewPolicies: canAccess('physical_resources.policies', 'view'),
        canCreatePolicies: canAccess('physical_resources.policies', 'create'),
        canEditPolicies: canAccess('physical_resources.policies', 'edit'),
        canDeletePolicies: canAccess('physical_resources.policies', 'delete')
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  useEffect(() => {
    // Only proceed if permissions are loaded
    if (!permissionsLoaded) return;

    if (!canViewPolicies) {
      console.log('User does not have permission to view policies');
      router.push('/unauthorized');
      return;
    }

    fetchPolicies();
  }, [fetchPolicies, permissionsLoaded, canViewPolicies, router]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPolicies().finally(() => {
      setRefreshing(false);
    });
  };

  const handleResetFilters = () => {
    updateFilters({
      resource_type_id: undefined,
      institution_id: undefined,
      approval_required: undefined,
      isActive: undefined,
      page: 1
    });
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const hasActiveFilters = () => {
    return !!(
      (filters.resource_type_id && filters.resource_type_id !== 'all_types') ||
      (filters.institution_id &&
        filters.institution_id !== 'all_institutions') ||
      filters.approval_required !== undefined ||
      filters.isActive !== undefined
    );
  };

  const openDeleteDialog = (id: string) => {
    // Check if user has delete permission before allowing this action
    if (!canDeletePolicies) {
      toast.error('You do not have permission to delete policies');
      return;
    }

    setPolicyToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!policyToDelete || !canDeletePolicies) return;

    try {
      setDeleting(true);
      const success = await deletePolicy(policyToDelete);
      if (success) {
        toast.success('Sharing policy deleted successfully');
        setDeleteDialogOpen(false);
        setPolicyToDelete(null);
      }
    } catch (error) {
      console.error('Error deleting sharing policy:', error);
      toast.error('Failed to delete sharing policy');
    } finally {
      setDeleting(false);
    }
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Sharing Policies'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
          <span className='ml-2'>Loading permissions...</span>
        </div>
      </ContentLayout>
    );
  }

  // Permission check (redundant due to the redirect above, but added for safety)
  if (permissionsLoaded && !canViewPolicies) {
    return (
      <ContentLayout title='Sharing Policies'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view sharing policies
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

  return (
    <ContentLayout title='Sharing Policies'>
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
            <BreadcrumbPage>Sharing Policies</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='flex justify-between items-center mt-6'>
        <h1 className='text-2xl font-bold'>Resource Sharing Policies</h1>
        {canCreatePolicies && (
          <Link href='/resources/physical-resources/policies/new'>
            <Button>
              <PlusCircle className='mr-2 h-4 w-4' />
              New Policy
            </Button>
          </Link>
        )}
      </div>

      <Card className='mt-6'>
        <CardHeader>
          <CardTitle>Sharing Policies</CardTitle>
          <CardDescription>
            Define how resources can be shared across institutions and
            departments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex justify-between items-center mb-4'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setShowFilters(!showFilters)}
              className={hasActiveFilters() ? 'bg-muted' : ''}
            >
              <Filter className='mr-2 h-4 w-4' />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
              {hasActiveFilters() && (
                <Badge variant='secondary' className='ml-2 px-1 py-0'>
                  Active
                </Badge>
              )}
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={handleRefresh}
              disabled={loading || refreshing}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
          </div>

          {showFilters && (
            <div className='mb-6'>
              <PolicyFilters
                filters={filters}
                onFilterChange={updateFilters}
                onReset={handleResetFilters}
              />
            </div>
          )}

          {loading ? (
            <div className='flex justify-center items-center py-8'>
              <Loader2 className='h-8 w-8 animate-spin' />
            </div>
          ) : error ? (
            <div className='text-center py-8'>
              <p className='text-destructive'>{error}</p>
              <Button
                variant='outline'
                onClick={handleRefresh}
                className='mt-4'
              >
                Try Again
              </Button>
            </div>
          ) : policies.length === 0 ? (
            <div className='text-center py-8'>
              <Share2 className='h-12 w-12 mx-auto text-muted-foreground' />
              <h3 className='mt-4 text-lg font-medium'>
                No sharing policies found
              </h3>
              <p className='mt-2 text-sm text-muted-foreground'>
                {hasActiveFilters()
                  ? 'Try adjusting your filters or create a new policy'
                  : 'Get started by creating a new sharing policy'}
              </p>
              {hasActiveFilters() ? (
                <Button
                  variant='outline'
                  className='mt-4 mr-2'
                  onClick={handleResetFilters}
                >
                  Reset Filters
                </Button>
              ) : canCreatePolicies ? (
                <Link href='/resources/physical-resources/policies/new'>
                  <Button className='mt-4'>
                    <PlusCircle className='mr-2 h-4 w-4' />
                    Create Policy
                  </Button>
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>S.No</TableHead>
                      <TableHead>Resource Type</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map((policy, index) => (
                      <TableRow key={policy.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          {policy.resource_type?.category_name || 'All Types'}
                        </TableCell>
                        <TableCell>
                          {policy.institution?.name || 'All Institutions'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={policy.is_active ? 'default' : 'secondary'}
                          >
                            {policy.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {policy.updated_at
                            ? formatDate(policy.updated_at)
                            : 'N/A'}
                        </TableCell>
                        <TableCell className='text-right'>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant='ghost' className='h-8 w-8 p-0'>
                                <span className='sr-only'>Open menu</span>
                                <MoreHorizontal className='h-4 w-4' />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end'>
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/resources/physical-resources/policies/${policy.id}`}
                                >
                                  <Eye className='mr-2 h-4 w-4' />
                                  View
                                </Link>
                              </DropdownMenuItem>
                              {canEditPolicies && (
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/resources/physical-resources/policies/${policy.id}/edit`}
                                  >
                                    <PenSquare className='mr-2 h-4 w-4' />
                                    Edit
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              {canDeletePolicies && (
                                <DropdownMenuItem
                                  className='text-destructive'
                                  onClick={() => openDeleteDialog(policy.id)}
                                >
                                  <Trash2 className='mr-2 h-4 w-4' />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {metadata && (
                <div className='flex items-center justify-between space-x-2 mt-4'>
                  <div className='text-sm text-muted-foreground'>
                    Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
                    {Math.min(metadata.page * metadata.limit, metadata.total)}{' '}
                    of {metadata.total} policies
                  </div>
                  <div className='flex items-center space-x-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => changePage(metadata.page - 1)}
                      disabled={metadata.page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => changePage(metadata.page + 1)}
                      disabled={
                        metadata.page === metadata.totalPages ||
                        metadata.totalPages === 0
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className='sm:max-w-[425px]'>
          <DialogHeader>
            <DialogTitle className='flex items-center'>
              <AlertTriangle className='h-5 w-5 text-destructive mr-2' />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this sharing policy? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
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
