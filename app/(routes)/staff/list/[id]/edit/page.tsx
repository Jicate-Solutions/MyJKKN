'use client';

// app/(routes)/staff/[id]/edit/page.tsx


import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { StaffForm } from '../../_components/staff-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Staff } from '@/types/staff';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { StaffService } from '@/lib/services/staff/staff-service';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';

interface EditStaffPageProps {
  params: Promise<{ id: string }>;
}

export default function EditStaffPage({ params }: EditStaffPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading]);

  // Fetch staff data after permissions are loaded. The edit-permission gate
  // (below, once `staff` is available) also allows self-edit — mirroring the
  // API's isSelfEdit branch in app/api/staff/[id]/route.ts — which needs the
  // fetched record's institution_email/profile_id, so the fetch can no longer
  // be blocked on the blanket `staff.edit` permission check alone
  // (BUG-002565: own-record users without staff.edit could never reach here).
  useEffect(() => {
    if (!permissionsLoaded) return;

    async function fetchStaff() {
      try {
        setLoading(true);
        setError(null);
        const data = await StaffService.getStaffById(id);
        setStaff(data);
      } catch (err) {
        console.error('Error fetching staff:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch staff');
      } finally {
        setLoading(false);
      }
    }

    fetchStaff();
  }, [id, permissionsLoaded]);

  // Gate access once both permissions and the staff record are available.
  const canEditStaff =
    !!staff &&
    (isSuperAdmin ||
      canAccess('staff', 'edit') ||
      (!!staff.institution_email && staff.institution_email === userProfile?.email) ||
      (!!(staff as any).profile_id && (staff as any).profile_id === userProfile?.id));

  useEffect(() => {
    if (!permissionsLoaded || loading || !staff) return;
    if (!canEditStaff) {
      console.log('User does not have permission to edit staff');
      router.push('/unauthorized');
    }
  }, [permissionsLoaded, loading, staff, canEditStaff, router]);

  // Show loading state while permissions or data are loading
  if (permissionsLoading || (loading && permissionsLoaded)) {
    return (
      <ContentLayout title='Edit Employee'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' className='mr-2' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !staff) {
    return (
      <ContentLayout title='Edit Employee'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Staff member not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/staff/list'>Back to Employees</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Employee'>
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
              <Link href='/staff/list'>Employees</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Employee</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
            <h1 className='text-2xl font-bold py-1'>Edit Employee</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update employee information
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <StaffForm staff={staff} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
