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
import { useSharingPolicies } from '@/hooks/resource/use-sharing-policies';
import { PolicyFilters } from './_components/policy-filters';

export default function SharingPoliciesPage() {
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

  useEffect(() => {
    fetchPolicies();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setPolicyToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!policyToDelete) return;

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
              <Link href='/resources'>Resource Management</Link>
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
        <Link href='/resources/policies/new'>
          <Button>
            <PlusCircle className='mr-2 h-4 w-4' />
            New Policy
          </Button>
        </Link>
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
                  <Filter className='mr-2 h-4 w-4' />
                  Clear Filters
                </Button>
              ) : null}
              <Button className='mt-4' asChild>
                <Link href='/resources/policies/new'>
                  <PlusCircle className='mr-2 h-4 w-4' />
                  New Policy
                </Link>
              </Button>
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
                      <TableHead>Approval Required</TableHead>
                      <TableHead>Max Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map((policy, index) => (
                      <TableRow key={policy.id}>
                        <TableCell className='font-medium'>
                          {index + 1}
                        </TableCell>
                        <TableCell className='font-medium'>
                          <Link
                            href={`/resources/policies/${policy.id}`}
                            className='hover:underline'
                          >
                            {policy.resource_type?.category_name || 'All Types'}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {policy.institution?.name || 'All Institutions'}
                        </TableCell>
                        <TableCell>
                          {policy.approval_required ? 'Yes' : 'No'}
                        </TableCell>
                        <TableCell>
                          {policy.max_reservation_duration} hours
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={policy.is_active ? 'default' : 'secondary'}
                          >
                            {policy.is_active ? 'Active' : 'Inactive'}
                          </Badge>
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
                              <Link href={`/resources/policies/${policy.id}`}>
                                <DropdownMenuItem>
                                  <Eye className='h-4 w-4 mr-2' />
                                  View
                                </DropdownMenuItem>
                              </Link>
                              <Link
                                href={`/resources/policies/${policy.id}/edit`}
                              >
                                <DropdownMenuItem>
                                  <PenSquare className='h-4 w-4 mr-2' />
                                  Edit
                                </DropdownMenuItem>
                              </Link>
                              <DropdownMenuItem
                                className='text-red-600'
                                onClick={() => openDeleteDialog(policy.id)}
                              >
                                <Trash2 className='h-4 w-4 mr-2' />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {metadata.totalPages > 1 && (
                <div className='flex items-center justify-between mt-4'>
                  <div className='text-sm text-muted-foreground'>
                    Showing {policies.length} of {metadata.total} policies
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => changePage(metadata.page - 1)}
                      disabled={metadata.page <= 1}
                    >
                      Previous
                    </Button>
                    <span className='text-sm text-muted-foreground'>
                      Page {metadata.page} of {metadata.totalPages}
                    </span>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => changePage(metadata.page + 1)}
                      disabled={metadata.page >= metadata.totalPages}
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

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-destructive' />
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
              onClick={() => {
                setDeleteDialogOpen(false);
                setPolicyToDelete(null);
              }}
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
                'Delete Policy'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
