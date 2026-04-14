'use client';

/**
 * HR Person Detail — handles both sources:
 * - source=staff: shows hr_staff_details with staff_id FK (HR extension of a JKKN staff row)
 * - source=hr_employees: shows hr_employees (guest/student_ta/vendor) with soft-delete flow
 */

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { AlertCircle, UserX } from 'lucide-react';
import { useHREmployee, useDeactivateHREmployee } from '@/hooks/hr/use-employees';

export default function HREmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;
  const source = (searchParams.get('source') as 'staff' | 'hr_employees') ?? 'hr_employees';

  const { data, isLoading, error } = useHREmployee(id, source);
  const deactivate = useDeactivateHREmployee();
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [reason, setReason] = useState('');
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const handleDeactivate = async () => {
    if (!id || source !== 'hr_employees') return;
    setDeactivateError(null);
    try {
      await deactivate.mutateAsync({ id, reason });
      router.push('/hr/employees');
    } catch (err) {
      setDeactivateError(err instanceof Error ? err.message : 'Deactivate failed');
    }
  };

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
              <Link href="/hr/employees">Employees</Link>
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
                <span>{source === 'staff' ? 'JKKN Staff (HR extension)' : 'HR Employee'}</span>
                <Badge variant="outline">source: {source}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {source === 'staff' ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Staff ID</dt>
                  <dd className="font-mono">{data.staff_id ?? '—'}</dd>
                  <dt className="text-muted-foreground">HR Employee Code</dt>
                  <dd className="font-mono">{data.hr_employee_code ?? '—'}</dd>
                  <dt className="text-muted-foreground">HR Organization</dt>
                  <dd className="font-mono">{data.hr_organization_id ?? '—'}</dd>
                  <dt className="text-muted-foreground">Designation</dt>
                  <dd>{data.designation_id ? `(id: ${data.designation_id})` : 'Not yet assigned'}</dd>
                  <dt className="text-muted-foreground">Cadre</dt>
                  <dd>{data.cadre_id ? `(id: ${data.cadre_id})` : 'Not yet assigned'}</dd>
                  <dt className="text-muted-foreground">Reports To</dt>
                  <dd>{data.reports_to_staff_id ? `(staff_id: ${data.reports_to_staff_id})` : '—'}</dd>
                  <dt className="text-muted-foreground">HR Deactivated At</dt>
                  <dd>{data.hr_deactivated_at ? new Date(data.hr_deactivated_at).toLocaleString() : '—'}</dd>
                </dl>
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Employee Code</dt>
                  <dd className="font-mono">{data.employee_code ?? '—'}</dd>
                  <dt className="text-muted-foreground">Name</dt>
                  <dd>
                    {data.first_name} {data.last_name ?? ''}
                  </dd>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{data.employment_type}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{data.email ?? '—'}</dd>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{data.phone ?? '—'}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{data.is_active ? 'Active' : 'Inactive'}</dd>
                  {data.deactivated_at && (
                    <>
                      <dt className="text-muted-foreground">Deactivated At</dt>
                      <dd>{new Date(data.deactivated_at).toLocaleString()}</dd>
                      <dt className="text-muted-foreground">Deactivation Reason</dt>
                      <dd>{data.deactivation_reason ?? '—'}</dd>
                    </>
                  )}
                </dl>
              )}
            </CardContent>
          </Card>
        )}

        {data && source === 'hr_employees' && data.is_active && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              {!showDeactivate ? (
                <Button variant="destructive" onClick={() => setShowDeactivate(true)}>
                  <UserX className="mr-2 h-4 w-4" />
                  Deactivate Employee
                </Button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Reason (min 5 chars)</label>
                    <textarea
                      className="mt-1 w-full rounded-md border p-2 text-sm"
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                  {deactivateError && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      <span>{deactivateError}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={handleDeactivate} disabled={reason.length < 5 || deactivate.isPending}>
                      {deactivate.isPending ? 'Deactivating...' : 'Confirm Deactivate'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDeactivate(false);
                        setReason('');
                        setDeactivateError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {data && source === 'staff' && (
          <Card>
            <CardContent className="text-sm text-muted-foreground pt-6">
              This row is a JKKN staff member managed by the Staff module.
              Edit staff fields (name, email, department) via <Link href="/staff/list" className="underline underline-offset-2">Staff → List</Link>.
              HR-specific fields (designation, cadre, reports-to) are editable here — wiring arrives in Sprint 2.
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
