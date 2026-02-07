// app/(routes)/staff/[id]/page.tsx

'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare, ArrowLeft, Award, Target, Users, TrendingUp, GraduationCap, Briefcase, Star } from 'lucide-react';
import type { Staff, StaffRoleType, FacilitatorCertification, StaffOutcomeMetrics } from '@/types/staff';
import { Progress } from '@/components/ui/progress';
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
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';

interface StaffDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function StaffDetailsPage({ params }: StaffDetailsPageProps) {
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
    }
  }, [permissionsLoading]);

  // Fetch staff data after permissions are loaded
  useEffect(() => {
    if (!permissionsLoaded) return;

    const canViewStaff = isSuperAdmin || canAccess('staff', 'view');
    if (!canViewStaff) {
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

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // Show loading when permissions or data are loading
  if (permissionsLoading || (loading && permissionsLoaded)) {
    return (
      <ContentLayout title='Staff Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' className='mr-2' />
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
            <Link href='/staff/list'>Back to Staff</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit');

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
        {/* Back Button */}

        <div className='flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href='/staff/list' className='flex items-center gap-2'>
                <ArrowLeft className='h-4 w-4' />
              </Link>
            </Button>
            <div className='flex flex-col'>
              <h1 className='text-2xl font-bold py-1'>
                {staff.first_name} {staff.last_name}
              </h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Staff Details
              </p>
            </div>
          </div>
          {canEditStaff ? (
            <Button asChild>
              <Link href={`/staff/list/${id}/edit`}>
                <PenSquare className='mr-2 h-4 w-4' />
                Edit Staff
              </Link>
            </Button>
          ) : (
            <Button variant='outline' disabled className='opacity-50'>
              <PenSquare className='mr-2 h-4 w-4' />
              Edit Staff
            </Button>
          )}
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
            <div>
              <p className='font-medium'>Role Type</p>
              <Badge variant={staff.role_type === 'facilitator' || staff.role_type === 'hybrid' ? 'default' : 'secondary'} className='capitalize'>
                {(staff.role_type || 'teacher').replace('_', ' ')}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Facilitator & Outcomes */}
        {(staff.role_type && staff.role_type !== 'teacher') && (
          <>
            {/* Certifications */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Award className='h-5 w-5 text-primary' />
                  Facilitator Certifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {staff.facilitator_certification && staff.facilitator_certification.length > 0 ? (
                  <div className='space-y-3'>
                    {staff.facilitator_certification.map((cert: FacilitatorCertification, index: number) => (
                      <div key={index} className='flex items-start justify-between p-3 rounded-lg border'>
                        <div className='space-y-1'>
                          <p className='font-medium'>{cert.certification_name}</p>
                          <p className='text-sm text-muted-foreground'>{cert.issuing_body}</p>
                          <p className='text-xs text-muted-foreground'>
                            Issued: {format(new Date(cert.issue_date), 'PP')}
                            {cert.expiry_date && ` | Expires: ${format(new Date(cert.expiry_date), 'PP')}`}
                          </p>
                        </div>
                        {cert.certificate_url && (
                          <a
                            href={cert.certificate_url}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-xs text-primary hover:underline'
                          >
                            View Certificate
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-muted-foreground'>No certifications recorded yet.</p>
                )}
              </CardContent>
            </Card>

            {/* Outcome Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Target className='h-5 w-5 text-primary' />
                  Outcome Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                {staff.outcome_metrics && Object.keys(staff.outcome_metrics).length > 0 ? (
                  <div className='space-y-4'>
                    <div className='grid gap-4 md:grid-cols-3'>
                      <div className='p-3 rounded-lg border text-center'>
                        <Users className='h-5 w-5 mx-auto mb-1 text-muted-foreground' />
                        <p className='text-2xl font-bold'>{staff.outcome_metrics.learners_mentored ?? '—'}</p>
                        <p className='text-xs text-muted-foreground'>Learners Mentored</p>
                      </div>
                      <div className='p-3 rounded-lg border text-center'>
                        <TrendingUp className='h-5 w-5 mx-auto mb-1 text-muted-foreground' />
                        <p className='text-2xl font-bold'>
                          {staff.outcome_metrics.average_competency_improvement != null
                            ? `${staff.outcome_metrics.average_competency_improvement}%`
                            : '—'}
                        </p>
                        <p className='text-xs text-muted-foreground'>Avg Competency Improvement</p>
                      </div>
                      <div className='p-3 rounded-lg border text-center'>
                        <GraduationCap className='h-5 w-5 mx-auto mb-1 text-muted-foreground' />
                        <p className='text-2xl font-bold'>{staff.outcome_metrics.courses_with_competency_mapping ?? '—'}</p>
                        <p className='text-xs text-muted-foreground'>Courses Mapped</p>
                      </div>
                      <div className='p-3 rounded-lg border text-center'>
                        <Briefcase className='h-5 w-5 mx-auto mb-1 text-muted-foreground' />
                        <p className='text-2xl font-bold'>{staff.outcome_metrics.industry_projects_facilitated ?? '—'}</p>
                        <p className='text-xs text-muted-foreground'>Industry Projects</p>
                      </div>
                      <div className='p-3 rounded-lg border text-center'>
                        <Star className='h-5 w-5 mx-auto mb-1 text-muted-foreground' />
                        <p className='text-2xl font-bold'>
                          {staff.outcome_metrics.placement_success_rate != null
                            ? `${staff.outcome_metrics.placement_success_rate}%`
                            : '—'}
                        </p>
                        <p className='text-xs text-muted-foreground'>Placement Success</p>
                      </div>
                      <div className='p-3 rounded-lg border text-center'>
                        <Star className='h-5 w-5 mx-auto mb-1 text-muted-foreground' />
                        <p className='text-2xl font-bold'>
                          {staff.outcome_metrics.student_satisfaction_score != null
                            ? `${staff.outcome_metrics.student_satisfaction_score}/5`
                            : '—'}
                        </p>
                        <p className='text-xs text-muted-foreground'>Student Satisfaction</p>
                      </div>
                    </div>
                    {staff.outcome_metrics.last_computed && (
                      <p className='text-xs text-muted-foreground text-right'>
                        Last computed: {format(new Date(staff.outcome_metrics.last_computed), 'PPp')}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className='text-sm text-muted-foreground'>No outcome metrics recorded yet.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
