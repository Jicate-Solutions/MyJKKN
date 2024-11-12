// app/(routes)/organizations/institutions/[id]/departments/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Department, Institution } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DepartmentFilter } from '../../../departments/_components/department-filters';
import { DepartmentList } from '../../../departments/_components/department-list';

interface InstitutionDepartmentsPageProps {
  params: Promise<{ id: string }>;
}

export default function InstitutionDepartmentsPage({
  params
}: InstitutionDepartmentsPageProps) {
  const { id } = use(params);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchInstitution = useCallback(async () => {
    try {
      const data = await OrganizationService.getInstitutionWithDepartments(id);
      if (!data) {
        throw new Error('Institution not found');
      }
      setInstitution(data);
    } catch (err) {
      console.error('Error fetching institution:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load institution'
      );
    }
  }, [id]);

  const fetchDepartments = useCallback(
    async (page = 1) => {
      try {
        const result = await OrganizationService.getDepartments({
          institutionId: id,
          page,
          limit: 10
        });
        setDepartments(result.data);
        setMetadata(result.metadata);
      } catch (err) {
        console.error('Error fetching departments:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load departments'
        );
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    const loadData = async () => {
      await fetchInstitution();
      await fetchDepartments(1);
    };
    loadData();
  }, [fetchInstitution, fetchDepartments]);

  const handlePageChange = (page: number) => {
    fetchDepartments(page);
  };

  const handleFilterChange = useCallback(() => {
    setLoading(true);
    fetchDepartments(1);
  }, [fetchDepartments]);

  if (loading) {
    return (
      <ContentLayout title='Institution Departments'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !institution) {
    return (
      <ContentLayout title='Error'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error || 'Institution not found'}</p>
          <Button
            variant='outline'
            onClick={() => window.history.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${institution.name} - Departments`}>
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
            <BreadcrumbLink asChild>
              <Link href={`/organizations/institutions/${institution.id}`}>
                {institution.name}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Departments</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-start'>
          <div>
            <h1 className='text-2xl py-1 font-bold'>{institution.name}</h1>
            <p className='text-muted-foreground text-sm sm:text-base'>
              Manage departments for {institution.name}
            </p>
          </div>
          <Button asChild>
            <Link
              href={`/organizations/departments/new?institutionId=${institution.id}`}
            >
              <Plus className='mr-2 h-4 w-4' />
              Add Department
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DepartmentFilter
              filters={{ institutionId: institution.id }}
              onFilterChange={handleFilterChange}
            />

            <DepartmentList
              departments={departments}
              metadata={metadata}
              onPageChange={handlePageChange}
              onRefresh={() => fetchDepartments(metadata.page)}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
