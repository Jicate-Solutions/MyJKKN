'use client';


import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
import { ProgramService } from '@/lib/services/organization/program-service';
import type { Program } from '@/types/organizations';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

interface ProgramDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function ProgramDetailsPage({
  params
}: ProgramDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);

  // Get permissions
  const { canAccess, isSuperAdmin } = usePermissions();
  const adapt = useAdaptiveLabels();
  const pageTitle = adapt('Program Details');
  const canEditProgram =
    isSuperAdmin || canAccess('organizations.programs', 'edit');

  useEffect(() => {
    async function fetchProgram() {
      try {
        setLoading(true);
        setError(null);
        const data = await ProgramService.getProgram(id);
        setProgram(data);
      } catch (err) {
        console.error('Error fetching program:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch program'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchProgram();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !program) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || `${adapt('Program')} not found`}
          </p>
          <Button variant='outline' asChild>
            <Link href='/organizations/programs'>Back to {adapt('Programs')}</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={pageTitle}>
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
              <Link href='/organizations/programs'>{adapt('Programs')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold py-1'>{program.program_name}</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              {pageTitle}
            </p>
          </div>
          {canEditProgram ? (
            <Button asChild>
              <Link href={`/organizations/programs/${id}/edit`}>
                <PenSquare className='mr-2 h-4 w-4' />
                {adapt('Edit Program')}
              </Link>
            </Button>
          ) : (
            <Button disabled variant='outline'>
              <PenSquare className='mr-2 h-4 w-4' />
              {adapt('Edit Program')}
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-6'>
            <div className='grid gap-4 md:grid-cols-2'>
              <div>
                <p className='font-medium'>{adapt('Program ID')}</p>
                <p className='text-base text-muted-foreground'>
                  {program.program_id}
                </p>
              </div>
              <div>
                <p className='font-medium'>Status</p>
                <Badge variant={program.is_active ? 'default' : 'secondary'}>
                  {program.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <p className='font-medium'>{adapt('Degree')}</p>
                <p className='text-base text-muted-foreground'>
                  {program.degree?.degree_name || 'N/A'}
                </p>
              </div>
              <div>
                <p className='font-medium'>{adapt('Department')}</p>
                <p className='text-base text-muted-foreground'>
                  {program.department?.department_name || 'N/A'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Institution</p>
                <p className='text-base text-muted-foreground'>
                  {program.institution?.name || 'N/A'} (
                  {program.institution?.counselling_code})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Academic Details</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-6'>
            <div className='grid gap-4 md:grid-cols-2'>
              <div>
                <p className='font-medium'>Duration</p>
                <p className='text-base text-muted-foreground'>
                  {program.program_duration_yrs != null
                    ? `${Number(program.program_duration_yrs)} ${
                        Number(program.program_duration_yrs) === 1
                          ? 'year'
                          : 'years'
                      }`
                    : 'Not specified'}
                </p>
              </div>
              <div>
                <p className='font-medium'>{adapt('Program')} Type</p>
                <p className='text-base text-muted-foreground'>
                  {program.program_type || 'Not specified'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Pattern</p>
                <p className='text-base text-muted-foreground'>
                  {program.pattern_type || 'Not specified'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Mode</p>
                <p className='text-base text-muted-foreground'>
                  {program.is_part_time ? 'Part-time' : 'Full-time'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Display Name</p>
                <p className='text-base text-muted-foreground'>
                  {program.display_name || 'Not specified'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Sanctioned Intake</p>
                <p className='text-base text-muted-foreground'>
                  {program.sanctioned_intake && program.sanctioned_intake > 0
                    ? program.sanctioned_intake
                    : 'Not configured'}
                </p>
                <p className='text-xs text-muted-foreground'>
                  Managed in Admission → Settings → Seat Config
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
