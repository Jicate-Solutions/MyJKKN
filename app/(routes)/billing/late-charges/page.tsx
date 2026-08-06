'use client';

/**
 * /billing/late-charges — the platform-wide late-payment charge, PREVIEW ONLY.
 *
 * Director's plan, rank 1 (2026-08-06). This page deliberately has NO control
 * that triggers a live accrual — the only action here is looking. The
 * mechanism is OFF at every layer: the billing.late_charge.enabled policy row
 * is false, no schedule is registered, and turning it on is a Director
 * decision taken elsewhere (Management API), not a button on this page.
 */

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Eye, ShieldOff, Percent } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BillingLateChargeService,
  type LateChargePreviewRow,
} from '@/lib/services/billing/late-charges/late-charge-service';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

function LateChargesInner() {
  const { data: policy } = useQuery({
    queryKey: ['late-charge-policy'],
    queryFn: () => BillingLateChargeService.getPolicySnapshot(),
  });
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['late-charge-preview'],
    queryFn: () => BillingLateChargeService.getPreview(),
  });
  const { data: waived = [] } = useQuery({
    queryKey: ['late-charge-waived'],
    queryFn: () => BillingLateChargeService.listWaived(),
  });

  const rows = preview?.rows ?? [];
  const totalCharge = rows.reduce((s, r) => s + Number(r.would_charge), 0);
  const totalBalance = rows.reduce((s, r) => s + Number(r.balance_amount), 0);
  const learnerCount = new Set(rows.map((r) => r.student_id)).size;

  return (
    <ContentLayout title='Late Payment Charges'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Late Charges', href: '/billing/late-charges' },
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1 flex items-center gap-2'>
            <Percent className='h-6 w-6' /> Late Payment Charges
          </h1>
          <p className='text-sm sm:text-base text-muted-foreground max-w-3xl'>
            The platform-wide late-payment charge: {policy?.ratePercentPerMonth ?? 10}% of the
            unpaid balance per month, {policy?.compounding === false ? 'simple' : 'compounding'},
            no ceiling, from the day a bill goes overdue. This page is a preview only — nothing
            here charges anyone.
          </p>
        </div>

        {/* Master-switch banner */}
        {policy?.enabled ? (
          <div className='rounded-lg border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3'>
            <AlertTriangle className='h-5 w-5 text-destructive shrink-0 mt-0.5' />
            <div className='text-sm'>
              <div className='font-semibold text-destructive'>The late-payment charge is ON.</div>
              <div>
                Accrual runs are live from{' '}
                {policy.effectiveFrom ? fmtDate(policy.effectiveFrom) : 'a date not yet set'}.
                Learners see their figures on My Bills.
              </div>
            </div>
          </div>
        ) : (
          <div className='rounded-lg border bg-muted/40 p-4 flex items-start gap-3'>
            <ShieldOff className='h-5 w-5 text-muted-foreground shrink-0 mt-0.5' />
            <div className='text-sm'>
              <div className='font-semibold'>
                The late-payment charge is OFF
                {policy && !policy.installed ? ' (policy rows not yet installed)' : ''}.
              </div>
              <div className='text-muted-foreground'>
                Master switch <code className='text-xs'>billing.late_charge.enabled</code> is
                false. No charge accrues, no learner sees anything, and no schedule exists. The
                table below shows what WOULD be charged if the Director turned it on today —
                a dry run, nothing more.
              </div>
            </div>
          </div>
        )}

        {/* Preconditions the Director recorded before any first run */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              Before this is ever switched on — the three recorded preconditions
            </CardTitle>
          </CardHeader>
          <CardContent className='text-sm space-y-2'>
            <p>
              <span className='font-medium'>(a)</span> whether a charge this size is defensible to
              parents and a regulator — a human judgement, deliberately unanswered;
            </p>
            <p>
              <span className='font-medium'>(b)</span> each learner can see how her figure was
              derived — this build;
            </p>
            <p>
              <span className='font-medium'>(c)</span> a first run someone signs off deliberately —
              not yet done.
            </p>
          </CardContent>
        </Card>

        {/* Policy values */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Policy values (platform_policies)</CardTitle>
          </CardHeader>
          <CardContent className='grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6'>
            <div>
              <div className='text-xs text-muted-foreground'>Master switch</div>
              <Badge variant={policy?.enabled ? 'destructive' : 'secondary'}>
                {policy?.enabled ? 'ON' : 'OFF'}
              </Badge>
            </div>
            <div>
              <div className='text-xs text-muted-foreground'>Rate / month</div>
              <div className='font-medium'>{policy?.ratePercentPerMonth ?? 10}%</div>
            </div>
            <div>
              <div className='text-xs text-muted-foreground'>Compounding</div>
              <div className='font-medium'>{policy?.compounding === false ? 'No' : 'Yes'}</div>
            </div>
            <div>
              <div className='text-xs text-muted-foreground'>Grace days</div>
              <div className='font-medium'>{policy?.graceDays ?? 0}</div>
            </div>
            <div>
              <div className='text-xs text-muted-foreground'>Warning lead days</div>
              <div className='font-medium'>{policy?.warningLeadDays ?? 7}</div>
            </div>
            <div>
              <div className='text-xs text-muted-foreground'>Effective from</div>
              <div className='font-medium'>
                {policy?.effectiveFrom ? fmtDate(policy.effectiveFrom) : 'Not set'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Warning preview — who would be messaged + the template. NO sending. */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              Warning preview — the message families would receive
            </CardTitle>
          </CardHeader>
          <CardContent className='text-sm space-y-2'>
            <p className='text-muted-foreground'>
              Families are warned first; the charge begins {policy?.warningLeadDays ?? 7} days
              after the warning. Every learner in the table below is who would be messaged.
              There is no send button — the sending path is deliberately not built yet.
            </p>
            {policy?.warningTemplate ? (
              <blockquote className='rounded-md border-l-4 border-muted-foreground/30 bg-muted/30 p-3 italic'>
                {policy.warningTemplate}
              </blockquote>
            ) : (
              <p className='text-muted-foreground'>
                Warning template not installed yet (migration pending).
              </p>
            )}
          </CardContent>
        </Card>

        {/* Dry-run totals */}
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
          <Card>
            <CardContent className='pt-5'>
              <div className='text-xs text-muted-foreground'>Overdue bills in scope</div>
              <div className='text-2xl font-semibold tabular-nums'>{rows.length}</div>
              <div className='text-xs text-muted-foreground'>{learnerCount} learners</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-5'>
              <div className='text-xs text-muted-foreground'>Unpaid balance in scope</div>
              <div className='text-2xl font-semibold tabular-nums'>{inr(totalBalance)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-5'>
              <div className='text-xs text-muted-foreground'>Charge if enabled today</div>
              <div className='text-2xl font-semibold tabular-nums text-destructive'>
                {inr(totalCharge)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview table */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <Eye className='h-4 w-4' /> Preview — what each learner would be charged today
            </CardTitle>
          </CardHeader>
          <CardContent className='overflow-x-auto'>
            {previewLoading ? (
              <p className='text-sm text-muted-foreground py-6'>Loading preview…</p>
            ) : preview?.error ? (
              <p className='text-sm text-muted-foreground py-6'>
                Preview unavailable: {preview.error}
              </p>
            ) : rows.length === 0 ? (
              <p className='text-sm text-muted-foreground py-6'>
                No overdue bills in scope — nothing would be charged.
              </p>
            ) : (
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b text-left text-muted-foreground'>
                    <th className='py-2 pr-4'>Learner</th>
                    <th className='py-2 pr-4'>Bill</th>
                    <th className='py-2 pr-4'>Due date</th>
                    <th className='py-2 pr-4 text-right'>Months overdue</th>
                    <th className='py-2 pr-4 text-right'>Unpaid balance</th>
                    <th className='py-2 pr-4 text-right'>Would be charged</th>
                    <th className='py-2 pr-4 text-right'>Total would owe</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: LateChargePreviewRow) => (
                    <tr key={`${r.bill_id}`} className='border-b last:border-0'>
                      <td className='py-2 pr-4'>{r.learner_name || '—'}</td>
                      <td className='py-2 pr-4 max-w-[16rem] truncate'>
                        {r.bill_description || '—'}
                      </td>
                      <td className='py-2 pr-4 whitespace-nowrap'>{fmtDate(r.due_date)}</td>
                      <td className='py-2 pr-4 text-right tabular-nums'>{r.months_overdue}</td>
                      <td className='py-2 pr-4 text-right tabular-nums'>
                        {inr(Number(r.balance_amount))}
                      </td>
                      <td className='py-2 pr-4 text-right tabular-nums text-destructive'>
                        {inr(Number(r.would_charge))}
                      </td>
                      <td className='py-2 pr-4 text-right tabular-nums font-medium'>
                        {inr(Number(r.total_would_owe))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Waived charges */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              Waived charges — only the Director may waive; every waiver records the approver
            </CardTitle>
          </CardHeader>
          <CardContent className='overflow-x-auto'>
            {waived.length === 0 ? (
              <p className='text-sm text-muted-foreground py-4'>No charges have been waived.</p>
            ) : (
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b text-left text-muted-foreground'>
                    <th className='py-2 pr-4'>Period</th>
                    <th className='py-2 pr-4 text-right'>Charge</th>
                    <th className='py-2 pr-4'>Waived on</th>
                    <th className='py-2 pr-4'>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {waived.map((w) => (
                    <tr key={w.id} className='border-b last:border-0'>
                      <td className='py-2 pr-4 whitespace-nowrap'>
                        {fmtDate(w.period_start)} – {fmtDate(w.period_end)}
                      </td>
                      <td className='py-2 pr-4 text-right tabular-nums'>
                        {inr(Number(w.charge_amount))}
                      </td>
                      <td className='py-2 pr-4 whitespace-nowrap'>{fmtDate(w.waived_at)}</td>
                      <td className='py-2 pr-4'>{w.waiver_reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default function LateChargesPage() {
  return (
    <PermissionGuard module='billing' action='late_charges.view'>
      <LateChargesInner />
    </PermissionGuard>
  );
}
