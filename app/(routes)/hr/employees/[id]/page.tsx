'use client';

/**
 * HR Employee Detail — Sprint 1 Phase D (read-only + deactivate).
 * Full edit form arrives in Sprint 1.5.
 */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import type { HREmploymentType } from '@/types/hr';
import { EMPLOYMENT_TYPE_LABELS } from '@/types/hr';

export default function HREmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;

  const { data: employee, isLoading, error } = useHREmployee(id);
  const deactivate = useDeactivateHREmployee();
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [reason, setReason] = useState('');
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const handleDeactivate = async () => {
    if (!id) return;
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
            <BreadcrumbPage>{employee ? `${employee.first_name} ${employee.last_name ?? ''}` : 'Detail'}</BreadcrumbPage>
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
        {employee && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>
                    {employee.first_name} {employee.last_name ?? ''}
                  </span>
                  {employee.is_active ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-600">Inactive</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Employee Code</dt>
                  <dd className="font-mono">{employee.employee_code}</dd>

                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{EMPLOYMENT_TYPE_LABELS[employee.employment_type as HREmploymentType] ?? employee.employment_type}</dd>

                  <dt className="text-muted-foreground">Designation</dt>
                  <dd>{employee.designation?.name ?? '—'}</dd>

                  <dt className="text-muted-foreground">Institution</dt>
                  <dd>{employee.organization?.name ?? '—'}</dd>

                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{employee.email ?? '—'}</dd>

                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{employee.phone ?? '—'}</dd>

                  <dt className="text-muted-foreground">Date of Joining</dt>
                  <dd>{employee.date_of_joining ?? '—'}</dd>

                  {employee.deactivated_at && (
                    <>
                      <dt className="text-muted-foreground">Deactivated At</dt>
                      <dd>{new Date(employee.deactivated_at).toLocaleString()}</dd>
                      <dt className="text-muted-foreground">Deactivation Reason</dt>
                      <dd>{employee.deactivation_reason ?? '—'}</dd>
                    </>
                  )}
                </dl>
              </CardContent>
            </Card>

            {employee.is_active && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  {!showDeactivate ? (
                    <Button
                      variant="destructive"
                      onClick={() => setShowDeactivate(true)}
                    >
                      <UserX className="mr-2 h-4 w-4" />
                      Deactivate Employee
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">Reason for deactivation (required, min 5 chars)</label>
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
                        <Button
                          variant="destructive"
                          onClick={handleDeactivate}
                          disabled={reason.length < 5 || deactivate.isPending}
                        >
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
          </>
        )}
      </div>
    </ContentLayout>
  );
}
