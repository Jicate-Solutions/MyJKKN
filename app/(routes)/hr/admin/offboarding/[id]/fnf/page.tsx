'use client';

// ============================================================================
// /hr/admin/offboarding/[id]/fnf — Full & Final calculator (T6.4)
// ============================================================================
// HR officer enters salary breakdown + leave balance + tenure for a specific
// offboarding case. The page runs the gratuity / leave-encashment formulas
// (OffboardingService.calculateFnf) and persists a hr_fnf_calculations row.
//
// Once saved, the page shows the persisted summary + net payable. An admin
// can re-save (creates a NEW row — append-only history) or hit Approve to
// stamp approved_at on the latest row.
//
// Permission: HR officer / admin / super_admin (SuperAdminOnly module=users).
// RLS pins data visibility.
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calculator, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { OffboardingService } from '@/lib/services/hr/offboarding-service';
import type {
  FnfCalcResult,
  FnfSalaryBreakdown,
} from '@/lib/services/hr/offboarding-service';

interface CaseRow {
  id: string;
  staff_id: string;
  separation_type: 'resignation' | 'retirement' | 'termination' | 'death';
  reason: string;
  recommended_last_day: string | null;
  status: 'open' | 'withdrawn' | 'completed';
  initiated_at: string;
  staff?: {
    first_name: string;
    last_name: string;
    designation: string;
    date_of_joining: string | null;
  } | null;
}

function diffYears(fromIso: string | null): number {
  if (!fromIso) return 0;
  const start = new Date(fromIso);
  const now = new Date();
  const years = (now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.round(years * 10) / 10);
}

export default function FnfCalculatorPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="Full & Final Settlement">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Offboarding', href: '/hr/admin/offboarding' },
            { label: 'Full & Final' },
          ]}
        />
        <FnfContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function FnfContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const caseId = params?.id ?? '';

  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [latestFnf, setLatestFnf] = useState<FnfCalcResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  // Form state
  const [basic, setBasic] = useState('');
  const [da, setDa] = useState('');
  const [hra, setHra] = useState('');
  const [leaveDays, setLeaveDays] = useState('');
  const [tenure, setTenure] = useState('');
  const [pfBalance, setPfBalance] = useState('');
  const [otherPayable, setOtherPayable] = useState('');
  const [otherRecoverable, setOtherRecoverable] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data: c, error: cErr } = await supabase
          .from('hr_offboarding_cases')
          .select(
            `id, staff_id, separation_type, reason, recommended_last_day,
             status, initiated_at,
             staff:staff_id ( first_name, last_name, designation, date_of_joining )`,
          )
          .eq('id', caseId)
          .single();
        if (cErr) throw cErr;
        if (cancelled) return;
        setCaseRow(c as unknown as CaseRow);

        // Default tenure from date_of_joining
        const joinDate = (c as unknown as CaseRow).staff?.date_of_joining ?? null;
        if (joinDate) setTenure(String(diffYears(joinDate)));

        // Latest F&F (if any)
        const fnf = await OffboardingService.getLatestFnf(supabase, caseId);
        if (cancelled) return;
        if (fnf) {
          setLatestFnf(fnf);
          const b = fnf.last_salary_breakdown ?? {};
          setBasic(String(b.basic ?? ''));
          setDa(String(b.da ?? ''));
          setHra(String(b.hra ?? ''));
          setLeaveDays(String(b.leave_balance_days ?? ''));
          setTenure(String(b.tenure_years ?? tenure));
          setPfBalance(String(fnf.pf_balance ?? ''));
          setOtherPayable(String(fnf.other_payable ?? ''));
          setOtherRecoverable(String(fnf.other_recoverable ?? ''));
          setNotes(fnf.notes ?? '');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function handleCalculate() {
    if (!caseId) return;
    const salaryBreakdown: FnfSalaryBreakdown = {
      basic: basic ? Number(basic) : undefined,
      da: da ? Number(da) : undefined,
      hra: hra ? Number(hra) : undefined,
      leave_balance_days: leaveDays ? Number(leaveDays) : undefined,
      tenure_years: tenure ? Number(tenure) : undefined,
    };
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const row = await OffboardingService.calculateFnf(supabase, {
        caseId,
        salaryBreakdown,
        pfBalance: pfBalance ? Number(pfBalance) : 0,
        otherPayable: otherPayable ? Number(otherPayable) : 0,
        otherRecoverable: otherRecoverable ? Number(otherRecoverable) : 0,
        notes: notes || undefined,
      });
      setLatestFnf(row);
      toast.success(
        `F&F calculated. Net payable ₹${Math.round(row.net_payable).toLocaleString('en-IN')}.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to calculate F&F.');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!latestFnf) return;
    setApproving(true);
    try {
      const supabase = createClientSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error: upErr } = await supabase
        .from('hr_fnf_calculations')
        .update({
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq('id', latestFnf.id);
      if (upErr) throw upErr;
      setLatestFnf({ ...latestFnf, approved_at: new Date().toISOString() });
      toast.success('F&F approved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to approve F&F.');
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load case</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!caseRow) {
    return (
      <Alert>
        <AlertTitle>Case not found</AlertTitle>
        <AlertDescription>
          This offboarding case may have been removed or you may not have access
          to it.
        </AlertDescription>
      </Alert>
    );
  }

  const staffName = caseRow.staff
    ? `${caseRow.staff.first_name} ${caseRow.staff.last_name}`
    : 'Unknown staff';

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/hr/admin/offboarding">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to offboarding
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>{staffName}</CardTitle>
              <CardDescription>
                {caseRow.staff?.designation ?? '—'} · Initiated{' '}
                {format(new Date(caseRow.initiated_at), 'd MMM yyyy')}
              </CardDescription>
            </div>
            <Badge variant="outline" className="self-start text-sm">
              {caseRow.separation_type.charAt(0).toUpperCase() +
                caseRow.separation_type.slice(1)}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Salary inputs</CardTitle>
          <CardDescription>
            Provide last-drawn salary breakdown + leave balance + tenure. The
            calculator uses the Indian Payment of Gratuity Act formula (15/26 ×
            (basic + DA) × completed years, capped at ₹20 lakh) and leave
            encashment = (basic + DA) / 30 × leave_balance_days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="basic">Basic (₹/month)</Label>
              <Input id="basic" type="number" value={basic} onChange={(e) => setBasic(e.target.value)} placeholder="e.g. 30000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="da">DA (₹/month)</Label>
              <Input id="da" type="number" value={da} onChange={(e) => setDa(e.target.value)} placeholder="e.g. 4000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hra">HRA (₹/month)</Label>
              <Input id="hra" type="number" value={hra} onChange={(e) => setHra(e.target.value)} placeholder="e.g. 8000" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="leaveDays">Leave balance (days)</Label>
              <Input id="leaveDays" type="number" value={leaveDays} onChange={(e) => setLeaveDays(e.target.value)} placeholder="e.g. 45" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenure">Tenure (years)</Label>
              <Input id="tenure" type="number" value={tenure} onChange={(e) => setTenure(e.target.value)} placeholder="e.g. 12.5" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf">PF balance (₹)</Label>
              <Input id="pf" type="number" value={pfBalance} onChange={(e) => setPfBalance(e.target.value)} placeholder="e.g. 600000" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="otherPay">Other payable (₹)</Label>
              <Input id="otherPay" type="number" value={otherPayable} onChange={(e) => setOtherPayable(e.target.value)} placeholder="Notice-period payout, bonus, etc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="otherRec">Other recoverable (₹)</Label>
              <Input id="otherRec" type="number" value={otherRecoverable} onChange={(e) => setOtherRecoverable(e.target.value)} placeholder="Advance recovery, etc." />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything reviewers should know about this calculation." />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCalculate} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating…
                </>
              ) : (
                <>
                  <Calculator className="mr-2 h-4 w-4" /> Calculate & save
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {latestFnf && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest calculation</CardTitle>
            <CardDescription>
              Saved {format(new Date(latestFnf.calculated_at), 'd MMM yyyy, h:mm a')}.
              {latestFnf.approved_at && (
                <Badge variant="secondary" className="ml-2">
                  Approved {format(new Date(latestFnf.approved_at), 'd MMM yyyy')}
                </Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <SummaryStat label="Gratuity" value={latestFnf.gratuity} />
              <SummaryStat label="Leave encashment" value={latestFnf.leave_encashment} />
              <SummaryStat label="PF balance" value={latestFnf.pf_balance} />
              <SummaryStat label="Other payable" value={latestFnf.other_payable} />
              <SummaryStat label="Other recoverable" value={latestFnf.other_recoverable} />
              <SummaryStat label="Net payable" value={latestFnf.net_payable} primary />
            </div>
            {!latestFnf.approved_at && (
              <div className="flex">
                <Button onClick={handleApprove} disabled={approving} variant="default">
                  {approving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Approve F&F
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryStat({ label, value, primary }: { label: string; value: number; primary?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${primary ? 'bg-primary/10' : 'bg-muted/30'}`}>
      <div className={`text-2xl font-semibold ${primary ? 'text-primary' : ''}`}>
        ₹{Math.round(value).toLocaleString('en-IN')}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
