'use client';

// ============================================================================
// /hr/admin/offboarding/retirements — Retirement-specific case list (T6.4)
// ============================================================================
// Filtered view of hr_offboarding_cases where separation_type='retirement'.
// Surfaced from the cron-driven retirement-eligibility detector
// (app/api/cron/hr-retirement-eligibility-detector).
//
// Each row shows:
//   - Staff name + designation
//   - Age at separation
//   - Status (pending_retirement / in-progress / completed)
//   - F&F net payable (if calculated)
//   - Link to the F&F calculator
//
// Permission: HR officer / admin / super_admin (SuperAdminOnly module=users).
// RLS pins data visibility.
// ============================================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';

export const navMeta = {
  label: 'Retirements',
  icon: 'CalendarClock',
} as const;

interface RetirementCase {
  id: string;
  staff_id: string;
  separation_type: 'retirement';
  reason: string;
  initiated_at: string;
  recommended_last_day: string | null;
  current_step_index: number;
  status: 'open' | 'withdrawn' | 'completed';
  retirement_age_at_separation: number | null;
  fnf_calculation: { net_payable?: number; approved_at?: string | null } | null;
  staff?: {
    first_name: string;
    last_name: string;
    designation: string;
    date_of_birth: string | null;
    date_of_joining: string | null;
  } | null;
}

export default function RetirementsPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="Retirements">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Offboarding', href: '/hr/admin/offboarding' },
            { label: 'Retirements' },
          ]}
        />
        <RetirementsContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function RetirementsContent() {
  const [cases, setCases] = useState<RetirementCase[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error: qErr } = await supabase
          .from('hr_offboarding_cases')
          .select(
            `id, staff_id, separation_type, reason, initiated_at,
             recommended_last_day, current_step_index, status,
             retirement_age_at_separation, fnf_calculation,
             staff:staff_id ( first_name, last_name, designation, date_of_birth, date_of_joining )`,
          )
          .eq('separation_type', 'retirement')
          .order('initiated_at', { ascending: false });
        if (qErr) throw qErr;
        if (cancelled) return;
        setCases((data ?? []) as unknown as RetirementCase[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load retirements</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const open = (cases ?? []).filter((c) => c.status === 'open');
  const closed = (cases ?? []).filter((c) => c.status !== 'open');
  const totalFnf = (cases ?? []).reduce(
    (s, c) => s + (c.fnf_calculation?.net_payable ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Retirements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Retirement-flavoured offboarding cases. New cases are auto-created by
          the monthly eligibility detector once staff approach the
          policy-configured retirement age.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="text-base">Summary</CardTitle>
              <CardDescription>
                Cases in progress vs. closed, with running F&amp;F total.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md border bg-muted/30 p-3 text-center">
              <div className="text-2xl font-semibold">{open.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">In progress</div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-center">
              <div className="text-2xl font-semibold">{closed.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">Closed</div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-center">
              <div className="text-2xl font-semibold">
                {(cases ?? []).length}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Total</div>
            </div>
            <div className="rounded-md border bg-primary/10 p-3 text-center">
              <div className="text-2xl font-semibold">
                ₹{Math.round(totalFnf).toLocaleString('en-IN')}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                F&amp;F net total
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Active retirements ({open.length})</h2>
        {open.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <CalendarClock className="mx-auto mb-3 h-8 w-8 opacity-40" />
              No active retirement cases. The monthly detector cron auto-creates
              cases for staff approaching retirement age.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {open.map((c) => (
              <RetirementRow key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-muted-foreground">
            Closed retirements ({closed.length})
          </h2>
          <div className="space-y-3">
            {closed.map((c) => (
              <RetirementRow key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RetirementRow({ c }: { c: RetirementCase }) {
  const fullName = c.staff
    ? `${c.staff.first_name} ${c.staff.last_name}`
    : 'Unknown staff';
  const fnfNet = c.fnf_calculation?.net_payable ?? null;
  const fnfApproved = c.fnf_calculation?.approved_at ?? null;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="font-medium">{fullName}</div>
            <div className="text-xs text-muted-foreground">
              {c.staff?.designation ?? '—'} ·{' '}
              {c.retirement_age_at_separation
                ? `Age ${c.retirement_age_at_separation}`
                : 'Age —'}{' '}
              · Initiated {format(new Date(c.initiated_at), 'd MMM yyyy')}
              {c.recommended_last_day &&
                ` · Last day ${format(new Date(c.recommended_last_day), 'd MMM yyyy')}`}
            </div>
            <div className="text-xs text-muted-foreground">{c.reason}</div>
          </div>
          <div className="flex items-center gap-2">
            {fnfNet !== null ? (
              <div className="text-right">
                <div className="text-sm font-semibold">
                  ₹{Math.round(fnfNet).toLocaleString('en-IN')}
                </div>
                <div className="text-xs">
                  {fnfApproved ? (
                    <Badge variant="secondary">Approved</Badge>
                  ) : (
                    <Badge variant="outline">Draft</Badge>
                  )}
                </div>
              </div>
            ) : (
              <Badge variant="outline" className="text-xs">
                F&amp;F pending
              </Badge>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href={`/hr/admin/offboarding/${c.id}/fnf`}>
                F&amp;F <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
