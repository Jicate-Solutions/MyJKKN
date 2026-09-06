'use client';

/**
 * /hr/admin/payroll/periods/new — period create flow (T4.3 PR 3).
 *
 * Spec: specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md (Q4 + E14)
 *
 * Two-step flow:
 *   1. User picks Institution + Year + Month + Engine type (faculty / non_teaching).
 *      Defaults: previous calendar month, current calendar year (rolls back to
 *      Dec/prev-year when current month is January).
 *   2. Submit calls useCreatePayrollPeriod → inserts a 'draft' row → redirect
 *      to /hr/admin/payroll/periods/{id} where HR Officer presses
 *      "Prepare for review" to enter the audit chain.
 *
 * The hr_organization_id is resolved from the auth context (profile.organization_id
 * or the selected institution's parent org). Falls back to the picked institution_id
 * if the org link isn't available client-side; server-side RLS will reject if invalid.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { useAuth } from '@/hooks/use-auth';
import { useCreatePayrollPeriod } from '@/hooks/hr/payroll/use-payroll-periods';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';
import type { PayrollEngineType } from '@/types/hr-payroll';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function previousMonth(): { year: number; month: number } {
  const now = new Date();
  let m = now.getMonth(); // 0-indexed; 0 = January
  let y = now.getFullYear();
  // m is already "previous month index" because getMonth() returns 0-indexed
  // current month. If today is Jan (m=0), previous is Dec of prev year.
  if (m === 0) {
    m = 11;
    y -= 1;
  }
  return { year: y, month: m + 1 }; // return 1-indexed
}

export default function NewPayrollPeriodPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="Create Payroll Period">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'HR' },
            { label: 'Payroll' },
            { label: 'Periods', href: '/hr/admin/payroll/periods' },
            { label: 'New' },
          ]}
        />
        <NewPayrollPeriodContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function NewPayrollPeriodContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const create = useCreatePayrollPeriod();
  const { data: institutionsData } = useJkknInstitutions({ limit: 50 });

  const defaults = useMemo(() => previousMonth(), []);
  const currentYear = new Date().getFullYear();

  const institutions = institutionsData?.data ?? [];

  const [institutionId, setInstitutionId] = useState<string>(
    profile?.institution_id ?? '',
  );
  const [year, setYear] = useState<number>(defaults.year);
  const [month, setMonth] = useState<number>(defaults.month);
  const [engineType, setEngineType] = useState<PayrollEngineType>('non_teaching');

  const yearOptions = useMemo(
    () => [currentYear - 1, currentYear, currentYear + 1],
    [currentYear],
  );

  const handleSubmit = async () => {
    if (!institutionId) return;

    // Resolve hr_organization_id from the institution (assume 1:1 for now).
    // The service / RLS will reject if mismatched.
    const hrOrgId = profile?.institution_id === institutionId
      ? profile?.institution_id
      : institutionId;

    try {
      const result = await create.mutateAsync({
        hr_organization_id: hrOrgId,
        institution_id: institutionId,
        engine_type: engineType,
        period_year: year,
        period_month: month,
      });
      router.push(`/hr/admin/payroll/periods/${result.id}`);
    } catch {
      // Surfaced inline via create.error
    }
  };

  const canSubmit = !!institutionId && !create.isPending;

  return (
    <div className="space-y-4 max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/hr/admin/payroll/periods">
          <ArrowLeft className="mr-1 h-4 w-4" />
          All periods
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New payroll period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Creates a <strong>draft</strong> period for the selected month. The HR Officer
            then opens the period detail page and presses <em>"Prepare for review"</em> to
            snapshot pay-matrix + deduction rates and start the 4-stage approval chain.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="institution">Institution</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger id="institution">
                  <SelectValue placeholder="Pick an institution" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="engine">Engine</Label>
              <Select
                value={engineType}
                onValueChange={(v) => setEngineType(v as PayrollEngineType)}
              >
                <SelectTrigger id="engine">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="faculty">Faculty (teaching)</SelectItem>
                  <SelectItem value="non_teaching">Non-teaching</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger id="year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger id="month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((name, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {create.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not create the period</AlertTitle>
              <AlertDescription>{create.error.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link href="/hr/admin/payroll/periods">Cancel</Link>
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {create.isPending ? 'Creating…' : 'Create draft period'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
