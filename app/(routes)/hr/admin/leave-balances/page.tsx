'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useGenerateBalances } from '@/hooks/hr/use-hr-leave-types';
import type { GenerateBalancesResult } from '@/lib/services/hr/leave-type-service';
import { getErrorMessage } from '@/lib/utils';

export default function GenerateLeaveBalancesPage() {
  const { mappings, institutionIdByOrg } = useHrOrgMappings();
  const [hrOrgId, setHrOrgId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [result, setResult] = useState<GenerateBalancesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const institutionId = hrOrgId ? institutionIdByOrg.get(hrOrgId) : undefined;
  const { data: yearsResp } = useAcademicYears(institutionId);
  const mutation = useGenerateBalances();

  const run = async (dryRun: boolean) => {
    setError(null);
    try {
      const res = await mutation.mutateAsync({ hrOrgId, academicYearId, dryRun });
      setResult(res);
    } catch (err) {
      // Supabase errors are plain objects, not Error instances.
      setError(getErrorMessage(err));
      setResult(null);
    }
  };

  const canRun = !!hrOrgId && !!academicYearId && !mutation.isPending;

  return (
    <PermissionGuard module="hr.leave.balance" action="manage">
      <ContentLayout title="Generate Leave Balances">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/admin">Admin</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Leave Balances</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="mt-4">
          <CardHeader><CardTitle>Generate balances for an academic year</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Run this <strong>before</strong> team members apply for leave. Approving leave with no
                balance row creates one with zero entitlement and non-zero usage, leaving a
                permanently negative balance. Always preview first.
              </AlertDescription>
            </Alert>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Organization</Label>
                <Select value={hrOrgId} onValueChange={(v) => { setHrOrgId(v); setAcademicYearId(''); setResult(null); }}>
                  <SelectTrigger><SelectValue placeholder="Select an organization" /></SelectTrigger>
                  <SelectContent>
                    {mappings.map((m) => (
                      <SelectItem key={m.hr_organization_id} value={m.hr_organization_id}>
                        {m.organization_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Academic Year</Label>
                <Select value={academicYearId} onValueChange={(v) => { setAcademicYearId(v); setResult(null); }} disabled={!hrOrgId}>
                  <SelectTrigger><SelectValue placeholder="Select an academic year" /></SelectTrigger>
                  <SelectContent>
                    {(yearsResp?.data ?? []).map((y) => (
                      <SelectItem key={y.id} value={y.id}>{y.academic_year_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" disabled={!canRun} onClick={() => run(true)}>
                {mutation.isPending ? 'Working…' : 'Preview (dry run)'}
              </Button>
              <Button disabled={!canRun || !result?.dry_run} onClick={() => run(false)}>
                Generate
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {result && (
              <div className="border rounded-md p-4 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {result.dry_run ? 'Preview' : 'Generated'}
                </div>
                <p className="text-sm">
                  {result.dry_run ? 'Would create' : 'Created'} <strong>{result.created}</strong> balance rows
                  {result.skipped > 0 && <> · <strong>{result.skipped}</strong> already existed</>}
                </p>
                {result.fallback_count > 0 && (
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-1">
                      <strong>{result.fallback_count}</strong> used the leave type default because no
                      cadre entitlement resolved:
                    </p>
                    <ul className="max-h-48 overflow-y-auto list-disc pl-5">
                      {result.fallback.slice(0, 100).map((f, i) => (
                        <li key={`${f.staff_code}-${i}`}>{f.staff_code} {f.name} — {f.reason}</li>
                      ))}
                    </ul>
                    {result.fallback.length > 100 && <p className="mt-1">…and {result.fallback.length - 100} more</p>}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </ContentLayout>
    </PermissionGuard>
  );
}
