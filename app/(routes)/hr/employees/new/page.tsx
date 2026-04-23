'use client';

/**
 * HR New Employee — Sprint 1 Phase D (minimal polymorphic form).
 * Supports guest type only for v1 simplicity (full_time created via backfill; staff_id FK wiring = Sprint 1.5).
 */

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle } from 'lucide-react';
import { useCreateHREmployee } from '@/hooks/hr/use-employees';
import type { HRNonStaffEmploymentType } from '@/types/hr';
import { EMPLOYMENT_TYPE_LABELS } from '@/types/hr';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/hr/employees',
} as const;


export default function NewHREmployeePage() {
  const router = useRouter();
  const create = useCreateHREmployee();

  const [form, setForm] = useState({
    hr_organization_id: '',
    employment_type: 'guest' as HRNonStaffEmploymentType,
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    vendor_name: '',
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        hr_organization_id: form.hr_organization_id,
        employment_type: form.employment_type,
        employee_code: form.employee_code,
        first_name: form.first_name,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        vendor_name: form.employment_type === 'vendor_monitored' ? form.vendor_name : null,
      });
      router.push('/hr/employees');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  };

  return (
    <ContentLayout title="HR — Add Non-Staff Employee">
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
            <BreadcrumbPage>Add</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Add Non-Staff Employee</CardTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Guest lecturer, vendor-monitored worker, or unpaid volunteer.
              Full-time staff are added at <Link href="/staff/list" className="underline">Employee Management</Link>.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="hr_organization_id">HR Organization ID</Label>
                  <Input
                    id="hr_organization_id"
                    placeholder="UUID of hr_organizations row"
                    value={form.hr_organization_id}
                    onChange={(e) => setForm({ ...form, hr_organization_id: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Sprint 1 stub: lookup by institution will arrive in Sprint 1.5. Use an hr_organizations UUID for now.
                  </p>
                </div>

                <div>
                  <Label htmlFor="employment_type">Employment Type</Label>
                  <Select
                    value={form.employment_type}
                    onValueChange={(v) => setForm({ ...form, employment_type: v as HRNonStaffEmploymentType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="guest">{EMPLOYMENT_TYPE_LABELS.guest}</SelectItem>
                      <SelectItem value="vendor_monitored">{EMPLOYMENT_TYPE_LABELS.vendor_monitored}</SelectItem>
                      <SelectItem value="unpaid_volunteer">{EMPLOYMENT_TYPE_LABELS.unpaid_volunteer}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sprint 1 supports guest + vendor creation. Full-time employees come from backfilled staff table. Student TAs arrive in Sprint 1.5.
                  </p>
                </div>

                <div>
                  <Label htmlFor="employee_code">Employee Code</Label>
                  <Input
                    id="employee_code"
                    value={form.employee_code}
                    onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                </div>

                {form.employment_type === 'vendor_monitored' && (
                  <div>
                    <Label htmlFor="vendor_name">Vendor Name</Label>
                    <Input
                      id="vendor_name"
                      value={form.vendor_name}
                      onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                      required
                    />
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Creating...' : 'Create Employee'}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/hr/employees">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
