'use client';

/**
 * HR Employee Detail — shows staff member details from the HR perspective.
 *
 * After consolidation (migration 20260524083600), all employees come from
 * the staff table. This page shows the HR-specific details for a given
 * staff member.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { AlertCircle } from 'lucide-react';
import { useHREmployee } from '@/hooks/hr/use-employees';

export default function HREmployeeDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;

  const { data, isLoading, error } = useHREmployee(id, 'staff');

  return (
    <ContentLayout title="HR — Employee Detail">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/employees">Workforce</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Detail</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-3xl space-y-4">
        {isLoading && (
          <div className="flex justify-center py-8">
            <BeatLoader color="#3b82f6" />
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load: {error instanceof Error ? error.message : 'Unknown error'}</span>
          </div>
        )}
        {data && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Employee Details</span>
                <Badge variant="outline">
                  {data.hr_employee_code ?? data.staff_id ?? 'Staff'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Staff ID</dt>
                <dd className="font-mono">{data.staff_id ?? id}</dd>
                <dt className="text-muted-foreground">HR Employee Code</dt>
                <dd className="font-mono">{data.hr_employee_code ?? '---'}</dd>
                <dt className="text-muted-foreground">Organization</dt>
                <dd>{data.hr_organization_id ?? '---'}</dd>
                <dt className="text-muted-foreground">Designation</dt>
                <dd>{data.designation_id ?? '---'}</dd>
                <dt className="text-muted-foreground">Cadre</dt>
                <dd>{data.cadre_id ?? '---'}</dd>
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
