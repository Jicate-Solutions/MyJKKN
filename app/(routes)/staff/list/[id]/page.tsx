// app/(routes)/staff/[id]/page.tsx

'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
import type { Staff } from '@/types/staff';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StaffService } from '@/lib/services/staff/staff-service';

interface StaffDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function StaffDetailsPage({ params }: StaffDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);

  useEffect(() => {
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
  }, [id]);

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  if (loading) {
    return (
      <ContentLayout title='Staff Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !staff) {
    return (
      <ContentLayout title='Staff Details'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Staff member not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/staff'>Back to Staff</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Staff Details'>
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
            <BreadcrumbPage>Staff Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              {staff.first_name} {staff.last_name}
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Staff Details
            </p>
          </div>
          <Button asChild>
            <Link href={`/staff/list/${id}/edit`}>
              <PenSquare className='mr-2 h-4 w-4' />
              Edit Staff
            </Link>
          </Button>
        </div>

        {/* Profile Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Overview</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center gap-4'>
              <Avatar className='h-20 w-20'>
                <AvatarImage src={staff.profile_picture || undefined} />
                <AvatarFallback className='text-lg'>
                  {getInitials(staff.first_name, staff.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <h2 className='text-xl font-semibold'>
                    {staff.first_name} {staff.last_name}
                  </h2>
                  <Badge variant={staff.is_active ? 'default' : 'secondary'}>
                    {staff.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className='text-lg font-semibold text-primary'>
                  {staff.designation}
                </p>
                <p className='text-sm text-muted-foreground'>
                  Staff ID: {staff.staff_id || 'Not Assigned'}
                </p>
                <Link
                  href={`mailto:${staff.institution_email}`}
                  className='text-sm text-muted-foreground hover:text-primary'
                >
                  {staff.institution_email || 'Not Assigned'}
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <p className='font-medium'>Gender</p>
              <p className='text-base text-muted-foreground capitalize'>
                {staff.gender}
              </p>
            </div>
            <div>
              <p className='font-medium'>Date of Birth</p>
              <p className='text-base text-muted-foreground'>
                {format(new Date(staff.date_of_birth), 'PPP')}
              </p>
            </div>
            <div>
              <p className='font-medium'>Marital Status</p>
              <p className='text-base text-muted-foreground capitalize'>
                {staff.marital_status}
              </p>
            </div>
            <div>
              <p className='font-medium'>Blood Group</p>
              <p className='text-base text-muted-foreground'>
                {staff.blood_group || 'Not Specified'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <p className='font-medium'>Personal Email</p>
              <p className='text-base text-muted-foreground'>{staff.email}</p>
            </div>
            <div>
              <p className='font-medium'>Phone</p>
              <p className='text-base text-muted-foreground'>{staff.phone}</p>
            </div>
            <div>
              <p className='font-medium'>Address</p>
              <p className='text-base text-muted-foreground'>
                {staff.address || 'Not Specified'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Location</p>
              <p className='text-base text-muted-foreground'>
                {[staff.district, staff.state, staff.pincode]
                  .filter(Boolean)
                  .join(', ') || 'Not Specified'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Employment Information */}
        <Card>
          <CardHeader>
            <CardTitle>Employment Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <p className='font-medium'>Date of Joining</p>
              <p className='text-base text-muted-foreground'>
                {format(new Date(staff.date_of_joining), 'PPP')}
              </p>
            </div>
            <div>
              <p className='font-medium'>Category</p>
              <p className='text-base text-muted-foreground'>
                {staff.category?.category_name}
              </p>
            </div>
            <div>
              <p className='font-medium'>Institution</p>
              <p className='text-base text-muted-foreground'>
                {staff.institution?.name}
              </p>
            </div>
            <div>
              <p className='font-medium'>Department</p>
              <p className='text-base text-muted-foreground'>
                {staff.department?.department_name}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
