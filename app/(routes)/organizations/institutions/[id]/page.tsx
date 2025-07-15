'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import type { Institution } from '@/types/organizations';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import {
  INSTITUTION_TYPES,
  INSTITUTION_CATEGORIES,
  TIMETABLE_TYPES
} from '@/lib/constants/institutions';
import { usePermissions } from '@/hooks/use-permissions';

interface InstitutionDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function InstitutionDetailsPage({
  params
}: InstitutionDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    institution: Institution;
    departments: Record<string, any>;
  } | null>(null);

  // Get permissions
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditInstitution =
    isSuperAdmin || canAccess('organizations.institutions', 'edit');

  useEffect(() => {
    async function fetchInstitution() {
      try {
        setLoading(true);
        setError(null);
        const result = await OrganizationService.getInstitution(id);
        setData(result);
      } catch (err) {
        console.error('Error fetching institution:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch institution'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchInstitution();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Institution Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Institution Details'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>{error}</p>
          <Button variant='outline' asChild>
            <Link href='/organizations/institutions'>Back to Institutions</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!data) {
    return (
      <ContentLayout title='Institution Details'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>Institution not found</p>
          <Button variant='outline' asChild>
            <Link href='/organizations/institutions'>Back to Institutions</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const { institution, departments } = data;

  const getInstitutionTypeLabel = (value: string) => {
    return (
      INSTITUTION_TYPES.find((type) => type.value === value)?.label || value
    );
  };

  const getInstitutionCategoryLabel = (value: string) => {
    return (
      INSTITUTION_CATEGORIES.find((category) => category.value === value)
        ?.label || value
    );
  };

  const getTimetableTypeLabel = (value: string) => {
    return TIMETABLE_TYPES.find((type) => type.value === value)?.label || value;
  };

  return (
    <ContentLayout title='Institution Details'>
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
              <Link href='/organizations'>Organizations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations/institutions'>Institutions</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Institution Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold text-black py-1'>
              {institution.name}
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Institution Details
            </p>
          </div>
          {canEditInstitution ? (
            <Button asChild>
              <Link href={`/organizations/institutions/${id}/edit`}>
                <PenSquare className='mr-2 h-4 w-4' />
                Edit Institution
              </Link>
            </Button>
          ) : (
            <Button disabled variant='outline'>
              <PenSquare className='mr-2 h-4 w-4' />
              Edit Institution
            </Button>
          )}
        </div>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-6'>
            <div className='flex items-center gap-4'>
              {institution.logo_url && (
                <div className='relative w-24 h-24'>
                  <Image
                    src={institution.logo_url}
                    alt='Institution logo'
                    fill
                    className='object-contain'
                  />
                </div>
              )}
              <div className='space-y-4'>
                <Badge
                  variant={institution.is_active ? 'default' : 'secondary'}
                >
                  {institution.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <div className='grid gap-4 grid-cols-1 md:grid-cols-2'>
                  <p className='text-base text-muted-foreground'>
                    <span className='font-medium text-black'>Code: </span>
                    {institution.counselling_code}
                  </p>
                  <p className='text-base text-muted-foreground'>
                    <span className='font-medium text-black'>Type: </span>
                    {getInstitutionTypeLabel(institution.institution_type)}
                  </p>
                  <p className='text-base text-muted-foreground'>
                    <span className='font-medium text-black'>Category: </span>
                    {getInstitutionCategoryLabel(institution.category)}
                  </p>
                  <p className='text-base text-muted-foreground'>
                    <span className='font-medium text-black'>
                      Timetable Type:{' '}
                    </span>
                    {getTimetableTypeLabel(institution.timetable_type)}
                  </p>
                  <p className='text-base text-muted-foreground'>
                    <span className='font-medium text-black'>
                      Accredited By:{' '}
                    </span>
                    {institution.accredited_by}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4'>
            <div className='grid sm:grid-cols-2 gap-4'>
              <div>
                <p className='font-medium'>Email</p>
                <p className='text-base text-muted-foreground'>
                  {institution.email}
                </p>
              </div>
              <div>
                <p className='font-medium'>Phone</p>
                <p className='text-base text-muted-foreground'>
                  {institution.phone}
                </p>
              </div>
              {institution.website && (
                <div>
                  <p className='font-medium'>Website</p>
                  <a
                    href={institution.website}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-base text-primary hover:underline'
                  >
                    {institution.website}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Address Information */}
        <Card>
          <CardHeader>
            <CardTitle>Address Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4'>
            <div>
              <p className='font-medium'>Address</p>
              <p className='text-base text-muted-foreground'>
                {institution.address_line1}
              </p>
              {institution.address_line2 && (
                <p className='text-base text-muted-foreground'>
                  {institution.address_line2}
                </p>
              )}
              {institution.address_line3 && (
                <p className='text-base text-muted-foreground'>
                  {institution.address_line3}
                </p>
              )}
            </div>
            <div className='grid sm:grid-cols-2 gap-4'>
              <div>
                <p className='font-medium'>City</p>
                <p className='text-base text-muted-foreground'>
                  {institution.city}
                </p>
              </div>
              <div>
                <p className='font-medium'>State</p>
                <p className='text-base text-muted-foreground'>
                  {institution.state}
                </p>
              </div>
              <div>
                <p className='font-medium'>Country</p>
                <p className='text-base text-muted-foreground'>
                  {institution.country}
                </p>
              </div>
              <div>
                <p className='font-medium'>PIN Code</p>
                <p className='text-base text-muted-foreground'>
                  {institution.pin_code}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Department Contacts */}
        <Card>
          <CardHeader>
            <CardTitle>Department Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid gap-6'>
              {Object.entries(departments).map(([type, contact]) => (
                <div
                  key={type}
                  className='border-b last:border-0 pb-4 last:pb-0'
                >
                  <h3 className='font-medium mb-2 capitalize'>
                    {type.replace(/([A-Z])/g, ' $1').trim()} Department
                  </h3>
                  <div className='grid sm:grid-cols-2 gap-4'>
                    <div>
                      <p className='text-base font-medium'>Contact Name</p>
                      <p className='text-base text-muted-foreground'>
                        {contact.contact_name}
                      </p>
                    </div>
                    <div>
                      <p className='text-base font-medium'>Designation</p>
                      <p className='text-base text-muted-foreground'>
                        {contact.designation}
                      </p>
                    </div>
                    <div>
                      <p className='text-base font-medium'>Email</p>
                      <p className='text-base text-muted-foreground'>
                        {contact.email}
                      </p>
                    </div>
                    <div>
                      <p className='text-base font-medium'>Mobile</p>
                      <p className='text-base text-muted-foreground'>
                        {contact.mobile}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
