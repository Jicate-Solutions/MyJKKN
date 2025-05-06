'use client';

import { useCallback, useState, useEffect } from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PlusCircle,
  RefreshCw,
  FilterX,
  Filter,
  ChevronDown,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ContentLayout } from '@/components/layout/content-layout';
import { RequestsTable } from './_components/requests-table';
import { RequestFilters } from './_components/request-filters';
import { useResourceRequests } from '@/hooks/resource/physical/use-resource-requests';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';

export default function ResourceRequestsPage() {
  const router = useRouter();
  const { fetchRequests, updateFilters } = useResourceRequests();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Permissions state
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });
  const isLoading = authLoading || permissionsLoading;

  // Check for view access permission
  const canViewRequests =
    isSuperAdmin || canAccess('physical_resources.requests', 'view');
  const canCreateRequests =
    isSuperAdmin || canAccess('physical_resources.requests', 'create');
  const canApproveRequests =
    isSuperAdmin || canAccess('physical_resources.requests', 'approve');
  const canRejectRequests =
    isSuperAdmin || canAccess('physical_resources.requests', 'reject');

  // Debug permissions
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Resource requests permissions debug:', {
        isSuperAdmin,
        canViewRequests: canAccess('physical_resources.requests', 'view'),
        canCreateRequests: canAccess('physical_resources.requests', 'create'),
        canApproveRequests: canAccess('physical_resources.requests', 'approve'),
        canRejectRequests: canAccess('physical_resources.requests', 'reject'),
        effectiveCanView: canViewRequests,
        effectiveCanCreate: canCreateRequests
      });
    }
  }, [
    permissionsLoading,
    isSuperAdmin,
    canAccess,
    canViewRequests,
    canCreateRequests,
    canApproveRequests,
    canRejectRequests
  ]);

  // Initialize Supabase and check auth state
  useEffect(() => {
    const supabase = createClientSupabaseClient();

    // Check auth on component mount
    const checkAuth = async () => {
      try {
        setAuthLoading(true);
        const { data: sessionData } = await supabase.auth.getSession();

        if (sessionData?.session) {
          console.log('Auth session found:', sessionData.session.user.id);
          setUser(sessionData.session.user);
        } else {
          console.log('No session found, trying to get user');
          const { data } = await supabase.auth.getUser();
          if (data?.user) {
            console.log('User found:', data.user.id);
            setUser(data.user);
          } else {
            console.log('No authenticated user found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    // Check auth immediately
    checkAuth();

    // Setup auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event);
        if (session) {
          console.log('New session user:', session.user.id);
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

  // Redirect if not allowed to view requests
  useEffect(() => {
    if (!isLoading && (!user || !canViewRequests)) {
      if (!user) {
        console.log('Redirecting: No authenticated user');
        toast.error('You must be logged in to view resource requests');
        router.push('/login');
      } else if (!canViewRequests) {
        console.log('Redirecting: Permission denied', {
          user: user?.id,
          isSuperAdmin,
          permissions: 'physical_resources.requests'
        });
        toast.error('You do not have permission to view resource requests');
        router.push('/resources/physical-resources/dashboard');
      }
    }
  }, [user, isLoading, canViewRequests, router, isSuperAdmin]);

  const handleRefresh = useCallback(() => {
    fetchRequests();
    toast.success('Resource requests refreshed');
  }, [fetchRequests]);

  const handleResetFilters = useCallback(() => {
    updateFilters({
      search: undefined,
      requester_id: undefined,
      resource_type: undefined,
      priority: undefined,
      status: undefined,
      page: 1
    });
    toast.success('Filters reset');
  }, [updateFilters]);

  // If loading, show loading state
  if (isLoading) {
    return (
      <ContentLayout title='Resource Requests'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
          <span className='ml-2'>Loading...</span>
        </div>
      </ContentLayout>
    );
  }

  // If not authenticated or no permission, show error state
  if (!user) {
    return (
      <ContentLayout title='Resource Requests'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>
            Authentication Required
          </p>
          <p className='text-muted-foreground mb-4'>
            You must be logged in to view resource requests
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/login'>Go to Login</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!canViewRequests) {
    return (
      <ContentLayout title='Resource Requests'>
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-amber-500 mx-auto mb-4' />
          <p className='text-destructive text-xl font-medium'>Access Denied</p>
          <p className='text-muted-foreground mb-4'>
            You do not have permission to view resource requests
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resources/physical-resources/dashboard'>
              Return to Dashboard
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Resource Requests'>
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
            <BreadcrumbPage>Resource Requests</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Resource Requests</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage requests for new resources and equipment
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              size='sm'
              className='h-9 gap-1'
              onClick={handleRefresh}
            >
              <RefreshCw className='h-4 w-4' />
              <span className='hidden sm:inline'>Refresh</span>
            </Button>
            <Button
              variant='outline'
              size='sm'
              className='h-9 gap-1'
              onClick={handleResetFilters}
            >
              <FilterX className='h-4 w-4' />
              <span className='hidden sm:inline'>Reset Filters</span>
            </Button>
            {canCreateRequests && (
              <Button asChild className='h-9 gap-1'>
                <Link href='/resources/physical-resources/requests/new'>
                  <PlusCircle className='h-4 w-4' />
                  <span>New Request</span>
                </Link>
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between'>
              <CardTitle>Resource Requests</CardTitle>
              <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant='outline' size='sm' className='h-8 gap-1'>
                    <Filter className='h-3.5 w-3.5' />
                    <span>Filters</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        isFiltersOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
            <CardDescription>
              View and manage resource acquisition requests
            </CardDescription>

            <Collapsible
              open={isFiltersOpen}
              onOpenChange={setIsFiltersOpen}
              className='w-full'
            >
              <CollapsibleContent className='pt-4'>
                <div className='bg-muted/50 p-4 rounded-lg'>
                  <Suspense
                    fallback={<Skeleton className='h-[100px] w-full' />}
                  >
                    <RequestFilters onApply={() => setIsFiltersOpen(false)} />
                  </Suspense>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardHeader>
          <Separator />
          <CardContent className='pt-6'>
            <Suspense fallback={<Skeleton className='h-[400px] w-full' />}>
              <RequestsTable />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
