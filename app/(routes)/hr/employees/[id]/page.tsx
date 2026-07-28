'use client';

/**
 * HR Employee Detail — read-only, name-resolved view of one staff member from
 * the HR perspective, with cross-links into the staff record and HR modules.
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
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import { AlertCircle } from 'lucide-react';
import { useHREmployee } from '@/hooks/hr/use-employees';
import { getErrorMessage } from '@/lib/utils';

export default function HREmployeeDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;
  const { data, isLoading, error } = useHREmployee(id);

  return (
    <ContentLayout title="HR Directory — Employee">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr/employees">Employees</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Detail</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-3xl space-y-4">
        {isLoading && <div className="flex justify-center py-8"><BeatLoader color="#3b82f6" /></div>}
        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load: {getErrorMessage(error)}</span>
          </div>
        )}
        {data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{data.first_name} {data.last_name ?? ''}</span>
                  <Badge variant="outline" className="shrink-0">{data.hr_employee_code ?? data.staff_code ?? 'Staff'}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Staff Code</dt>
                  <dd className="font-mono">{data.staff_code ?? '—'}</dd>
                  <dt className="text-muted-foreground">HR Employee Code</dt>
                  <dd className="font-mono">{data.hr_employee_code ?? '—'}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{data.email ?? '—'}</dd>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{data.phone ?? '—'}</dd>
                  <dt className="text-muted-foreground">Institution</dt>
                  <dd>{data.institution_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Department</dt>
                  <dd>{data.department_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Organization</dt>
                  <dd>{data.organization_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Designation</dt>
                  <dd>{data.designation_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Cadre</dt>
                  <dd>{data.cadre_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Reports To</dt>
                  <dd>{data.reports_to_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Date of Joining</dt>
                  <dd>{data.date_of_joining ?? '—'}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    {data.is_active
                      ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Active</Badge>
                      : <Badge variant="outline" className="bg-gray-50 text-gray-600">Inactive</Badge>}
                  </dd>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Related</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/staff/list/${data.id}`}>Full staff record</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/hr/leave">Leave workflow</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/hr/documents/verify">Documents</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/hr/admin/payroll/periods">Payroll</Link>
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
