'use client';

/**
 * The balance generator. Extracted from the page when the Analytics tab was
 * added; moved onto hr_academic_years on 2026-08-10.
 */

import { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useHRAcademicYears } from '@/hooks/hr/use-hr-academic-years';
import { useGenerateBalances } from '@/hooks/hr/use-hr-leave-types';
import type { GenerateBalancesResult } from '@/lib/services/hr/leave-type-service';
import { getErrorMessage } from '@/lib/utils';

export function GenerateBalancesForm() {
  const { mappings } = useHrOrgMappings();
  const [hrOrgId, setHrOrgId] = useState('');
  const [hrAcademicYearId, setHrAcademicYearId] = useState('');
  const [result, setResult] = useState<GenerateBalancesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Group-wide years, so the two selects are independent. This used to map
  // hr_organization_id -> institution_id -> academic_years, which meant an org
  // whose institution had no year configured could not be generated at all.
  const { data: years = [] } = useHRAcademicYears({ isActive: true });
  const mutation = useGenerateBalances();

  const run = async (dryRun: boolean) => {
    setError(null);
    try {
      const res = await mutation.mutateAsync({ hrOrgId, hrAcademicYearId, dryRun });
      setResult(res);
    } catch (err) {
      // Supabase errors are plain objects, not Error instances.
      setError(getErrorMessage(err));
      setResult(null);
    }
  };

  const canRun = !!hrOrgId && !!hrAcademicYearId && !mutation.isPending;

  return (
    <Card>
      <CardHeader><CardTitle>Generate balances for an HR academic year</CardTitle></CardHeader>
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
            <Select
              value={hrOrgId}
              onValueChange={(v) => { setHrOrgId(v); setResult(null); }}
            >
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
            <Label>HR Academic Year</Label>
            <Select
              value={hrAcademicYearId}
              onValueChange={(v) => { setHrAcademicYearId(v); setResult(null); }}
            >
              <SelectTrigger><SelectValue placeholder="Select an HR academic year" /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.year_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {years.length === 0 && (
              <p className="mt-1.5 text-xs text-destructive">
                No HR academic years are configured, so balances cannot be generated.
                Create one under HR → Admin → HR Academic Years first.
              </p>
            )}
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
            {result.dry_run && result.created === 0 && (
              <p className="text-xs text-muted-foreground">
                Nothing to create — every staff × leave-type pair already has a balance row
                for this year. Generating will make no changes.
              </p>
            )}
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
                {result.fallback.length > 100 && (
                  <p className="mt-1">…and {result.fallback.length - 100} more</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
