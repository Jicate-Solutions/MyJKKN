// ============================================================================
// HR PAYROLL — READ-ONLY PAYSLIP PREVIEW (T4.1 + T4.2 deliverable)
// ============================================================================
// Spec: specs/t4-payroll-design-lock-2026-05-15.md
//
// This page demonstrates the T4.2 deduction engine end-to-end on three
// representative staff profiles. It is a READ-ONLY surface — no save, no
// approval flow, no period-locking. T4.3 will replace this with the real
// period-prep workflow.
//
// The three sample profiles span the realistic deduction-band split:
//   - Junior staff (gross 22k): ESI applies + low TDS + PT mid-slab
//   - Mid faculty   (gross 65k): ESI exempt + moderate TDS + PT upper
//   - Senior faculty (gross 1.2L): ESI exempt + significant TDS + PT top
//
// All numbers come from `computeDeductions()` against the 5 platform_policies
// rows seeded in migration 20260626000000.
// ============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  loadPayrollPolicies,
  computeDeductions,
  type PayrollPolicies,
  type DeductionResult,
} from '@/lib/services/hr/payroll/deduction-engine';
import { AlertTriangle } from 'lucide-react';

export const navMeta = {
  label: 'Payroll Preview (read-only)',
  icon: 'Receipt',
} as const;

export const dynamic = 'force-dynamic';

// ---- Sample profiles --------------------------------------------------------

interface SampleProfile {
  staffName: string;
  designation: string;
  engineType: 'faculty' | 'non_teaching';
  basicPay: number;
  da: number; // Dearness Allowance
  hra: number; // House Rent Allowance
  // Computed below
}

const SAMPLES: SampleProfile[] = [
  {
    staffName: 'Priya R. (Sample)',
    designation: 'Lab Assistant',
    engineType: 'non_teaching',
    basicPay: 14000,
    da: 4200, // 30% of basic
    hra: 3500, // 25% of basic
  },
  {
    staffName: 'Dr. Karthik S. (Sample)',
    designation: 'Assistant Professor',
    engineType: 'faculty',
    basicPay: 45000,
    da: 13500,
    hra: 9000,
  },
  {
    staffName: 'Dr. Meena P. (Sample)',
    designation: 'Professor',
    engineType: 'faculty',
    basicPay: 95000,
    da: 28500,
    hra: 19000,
  },
];

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function PayslipCard({
  profile,
  policies,
}: {
  profile: SampleProfile;
  policies: PayrollPolicies;
}) {
  const gross = profile.basicPay + profile.da + profile.hra;
  const result: DeductionResult = computeDeductions(
    { basicPay: profile.basicPay, grossPay: gross, paymentMode: 'neft' },
    policies,
  );

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between gap-2'>
          <div>
            <CardTitle className='text-base'>{profile.staffName}</CardTitle>
            <CardDescription>
              {profile.designation} ·{' '}
              <Badge variant='outline' className='ml-1'>
                {profile.engineType === 'faculty' ? 'Faculty' : 'Non-Teaching'}
              </Badge>
            </CardDescription>
          </div>
          <div className='text-right'>
            <div className='text-2xl font-semibold tabular-nums'>
              {formatINR(result.netPay)}
            </div>
            <div className='text-xs text-muted-foreground'>net pay</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Earnings */}
        <div>
          <div className='mb-2 text-xs font-medium uppercase text-muted-foreground'>
            Earnings
          </div>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Basic Pay</TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatINR(profile.basicPay)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Dearness Allowance (DA)</TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatINR(profile.da)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>House Rent Allowance (HRA)</TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatINR(profile.hra)}
                </TableCell>
              </TableRow>
              <TableRow className='font-semibold'>
                <TableCell>Gross Pay</TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatINR(gross)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <Separator />

        {/* Deductions */}
        <div>
          <div className='mb-2 text-xs font-medium uppercase text-muted-foreground'>
            Deductions (engine-computed)
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-[120px]'>Code</TableHead>
                <TableHead>Basis</TableHead>
                <TableHead className='text-right'>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.lines.map((line) => (
                <TableRow key={line.code}>
                  <TableCell className='font-medium'>
                    <Badge variant='secondary'>{line.code}</Badge>{' '}
                    <span className='ml-1 text-xs text-muted-foreground'>
                      {line.label}
                    </span>
                  </TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    {line.basis}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatINR(line.amount)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className='font-semibold'>
                <TableCell colSpan={2}>Total Deductions</TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatINR(result.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <Separator />

        <div className='flex items-center justify-between rounded-md bg-muted/40 p-3'>
          <span className='text-sm font-medium'>Net pay (gross − deductions)</span>
          <span className='text-lg font-semibold tabular-nums'>
            {formatINR(result.netPay)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PayrollPreviewPage() {
  const policies = await loadPayrollPolicies(null);

  return (
    <SuperAdminOnly>
    <ContentLayout title='Payroll Preview (read-only)'>
      <div className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>T4.1 + T4.2 — Pay components & deduction engine</CardTitle>
            <CardDescription>
              Read-only preview demonstrating the deduction engine end-to-end on three
              sample profiles. Real payroll periods, approval chain, and payslip
              persistence ship in T4.3. All deduction numbers come from{' '}
              <code className='rounded bg-muted px-1 py-0.5 text-xs'>
                computeDeductions()
              </code>{' '}
              against the 5 policy rows in{' '}
              <code className='rounded bg-muted px-1 py-0.5 text-xs'>
                platform_policies
              </code>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex flex-wrap gap-2 text-xs'>
              <Badge variant='outline'>FY 2026-27</Badge>
              <Badge variant='outline'>New regime TDS</Badge>
              <Badge variant='outline'>PF 12% / ceiling ₹15,000</Badge>
              <Badge variant='outline'>ESI 0.75% (≤ ₹21k gross)</Badge>
              <Badge variant='outline'>PT (Tamil Nadu)</Badge>
              <Badge variant='outline'>Std deduction ₹75,000</Badge>
            </div>
          </CardContent>
        </Card>

        {!policies ? (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-amber-700'>
                <AlertTriangle className='h-5 w-5' />
                Policy rows missing
              </CardTitle>
              <CardDescription>
                One or more of the 5 required policy rows could not be loaded via
                <code className='mx-1 rounded bg-muted px-1 py-0.5 text-xs'>
                  fn_get_policy
                </code>
                . Check that migration{' '}
                <code className='rounded bg-muted px-1 py-0.5 text-xs'>
                  20260626000000_hr_pay_components_and_payslip_line_items.sql
                </code>{' '}
                has been applied to the active environment.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className='grid gap-4 lg:grid-cols-1 xl:grid-cols-1'>
            {SAMPLES.map((p) => (
              <PayslipCard key={p.staffName} profile={p} policies={policies} />
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>What ships next (T4.3 +)</CardTitle>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            <ul className='ml-5 list-disc space-y-1'>
              <li>
                <span className='font-medium text-foreground'>T4.3</span> — hr_payroll_periods +
                4-stage approval chain (HR Officer → CAO → Accounts → Chairperson)
              </li>
              <li>
                <span className='font-medium text-foreground'>T4.4</span> — Bank-file CSV +
                cheque-roll PDF (per-staff payment mode)
              </li>
              <li>
                <span className='font-medium text-foreground'>T4.5</span> — PDF payslip
                generation + Supabase Storage + portal download
              </li>
              <li>
                <span className='font-medium text-foreground'>T4.6</span> — Year-end Form 16 +
                quarterly Form 24Q
              </li>
              <li>
                <span className='font-medium text-foreground'>T4.7</span> — Emergency salary
                advances + recovery line items
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
