// app/(routes)/staff/[id]/edit/page.tsx

'use client';

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
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      setPermissionsLoaded(true);
      console.log('Edit Staff permissions debug:', {
        isSuperAdmin,
        canEditStaff: canAccess('staff', 'edit')
      });
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Fetch staff data after permissions are loaded
  useEffect(() => {
    if (!permissionsLoaded) return;

    const canEditStaff = isSuperAdmin || canAccess('staff', 'edit');
    if (!canEditStaff) {
      console.log('User does not have permission to edit staff');
      router.push('/unauthorized');
      return;
    }

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
  }, [id, permissionsLoaded, isSuperAdmin, canAccess, router]);

  // Show loading state while permissions or data are loading
  if (permissionsLoading || (loading && permissionsLoaded)) {
    return (
      <ContentLayout title='Edit Staff'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' className='mr-2' />
          <span>
            {permissionsLoading
              ? 'Loading permissions...'
              : 'Loading staff details...'}
          </span>
        </div>
      </ContentLayout>
    );
  }

  if (error || !staff) {
    return (
      <ContentLayout title='Edit Staff'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Staff member not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/staff/list'>Back to Staff</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Staff'>
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
              <Link href='/staff/list'>Staff List</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Staff</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Staff</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update staff member information
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
