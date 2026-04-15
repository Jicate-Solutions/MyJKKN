'use client';

/**
 * HR Non-Staff Employee Detail — guests, vendors, student TAs, unpaid volunteers.
 *
 * If a caller arrives with ?source=staff, redirect to /staff/[id] — full-time
 * JKKN staff are managed in the staff module, not here. This route is exclusive
 * to the hr_employees table (non-staff types). Keeps the mental model clean:
 * one URL per persona, no overlap.
 */

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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

  // Redirect to staff module if this is a full-time staff row.
  // /hr/employees is now scoped to non-staff only.
  useEffect(() => {
    if (source === 'staff' && id) {
      router.replace(`/staff/list/${id}`);
    }
  }, [source, id, router]);

  const { data, isLoading, error } = useHREmployee(id, source, source !== 'staff');
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

  // While redirecting to /staff/list/[id], render a tiny placeholder so we don't
  // flash the (now-deprecated) staff-source detail card.
  if (source === 'staff') {
    return (
      <ContentLayout title="Redirecting to Staff…">
        <div className="flex justify-center py-12">
          <BeatLoader color="#3b82f6" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="HR — Non-Staff Employee">
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
              <Link href="/hr/employees">Non-Staff Workforce</Link>
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
                <span>Non-Staff Employee</span>
                <Badge variant="outline">{data.employment_type}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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
            </CardContent>
          </Card>
        )}

        {data && data.is_active && (
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

      </div>
    </ContentLayout>
  );
}
