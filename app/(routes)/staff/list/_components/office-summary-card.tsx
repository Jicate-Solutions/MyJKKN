'use client';
// ============================================
// STAFF DETAIL — "OFFICE" CARD (read-only payer + salary + bank account)
// ============================================
// Created: 2026-09-26
// Rendered by /staff/list/[id] only for super admin and holders of
// hr.payroll.salary.view (HR Head). RLS on the three payroll tables is the
// real gate; this card just never asks for what the viewer cannot see.
// ============================================

import Link from 'next/link';
import { Building2, IndianRupee, Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useStaffPayer } from '@/hooks/hr/use-staff-payroll';
import { useStaffCurrentSalary } from '@/hooks/hr/use-staff-salaries';
import { useStaffBankHistory } from '@/hooks/hr/use-staff-bank-accounts';
import { isPayable, maskAccountNumber } from '@/lib/hr/payroll/bank-account-validation';
import { getErrorMessage } from '@/lib/utils';

const inr = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `₹${Number(v).toLocaleString('en-IN')}`;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className='font-medium'>{label}</p>
      <p className='text-base text-muted-foreground'>{value}</p>
    </div>
  );
}

// A failed read must not masquerade as "Not set" — that is how a broken
// payer lookup went unnoticed for every staff member.
function LoadError({ error }: { error: unknown }) {
  return (
    <p className='text-sm text-destructive'>
      Could not load: {getErrorMessage(error)}
    </p>
  );
}

function NotSet({ href, label }: { href: string; label: string }) {
  return (
    <p className='text-sm text-muted-foreground'>
      Not set.{' '}
      <Link href={href} className='text-primary hover:underline'>
        Open {label}
      </Link>
    </p>
  );
}

export function OfficeSummaryCard({ staffId }: { staffId: string }) {
  const { data: payer, isLoading: payerLoading, error: payerError } = useStaffPayer(staffId);
  const { data: salary, isLoading: salaryLoading, error: salaryError } =
    useStaffCurrentSalary(staffId);
  const { data: bankHistory, isLoading: bankLoading, error: bankError } =
    useStaffBankHistory(staffId);
  const bank = (bankHistory ?? []).find((b) => !b.superseded_by) ?? null;

  const loading = payerLoading || salaryLoading || bankLoading;

  const flags = salary
    ? [
        salary.eligible_for_pf && 'PF',
        salary.exempt_edli && 'EDLI exempt',
        salary.eligible_for_esi && 'ESI',
        salary.eligible_for_insurance && 'Insurance',
        salary.eligible_for_gratuity && 'Gratuity',
        salary.eligible_for_etf && 'ETF'
      ].filter(Boolean)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Office</CardTitle>
      </CardHeader>
      <CardContent className='space-y-6'>
        {loading ? (
          <Skeleton className='h-32' />
        ) : (
          <>
            <section className='space-y-3'>
              <h3 className='flex items-center gap-2 font-semibold'>
                <Building2 className='h-4 w-4' /> Payroll Organisation
              </h3>
              {payerError ? (
                <LoadError error={payerError} />
              ) : payer ? (
                <Row label='Paid by' value={payer.organization_name ?? '—'} />
              ) : (
                <NotSet href='/hr/payroll/organisation' label='Payroll Organisation' />
              )}
            </section>

            <section className='space-y-3'>
              <h3 className='flex items-center gap-2 font-semibold'>
                <IndianRupee className='h-4 w-4' /> Salary
              </h3>
              {salaryError ? (
                <LoadError error={salaryError} />
              ) : salary ? (
                <div className='grid gap-4 md:grid-cols-3'>
                  <Row label='Monthly Gross' value={inr(salary.monthly_gross)} />
                  <Row label='Annual Gross' value={inr(salary.annual_gross)} />
                  <Row label='Structure' value={salary.salary_structure} />
                  <Row label='Effective From' value={salary.effective_from ?? '—'} />
                  <Row
                    label='Overtime'
                    value={
                      salary.overtime_level === 'No overtime'
                        ? 'No overtime'
                        : `${salary.overtime_level} · ${inr(salary.overtime_amount)}`
                    }
                  />
                  <Row
                    label='Allowance'
                    value={
                      Number(salary.allowance_amount) > 0
                        ? `${inr(salary.allowance_amount)}${salary.allowance_label ? ` (${salary.allowance_label})` : ''}`
                        : '—'
                    }
                  />
                  {salary.eligible_for_pf && <Row label='EPF' value={inr(salary.epf_amount)} />}
                  {salary.eligible_for_esi && <Row label='ESI' value={inr(salary.esi_amount)} />}
                  <div className='md:col-span-3'>
                    <p className='font-medium'>Eligibility</p>
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {flags.length ? (
                        flags.map((f) => (
                          <Badge key={f as string} variant='secondary'>
                            {f}
                          </Badge>
                        ))
                      ) : (
                        <span className='text-muted-foreground'>None</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <NotSet href='/hr/payroll/salaries' label='Employee Salaries' />
              )}
            </section>

            <section className='space-y-3'>
              <h3 className='flex items-center gap-2 font-semibold'>
                <Landmark className='h-4 w-4' /> Bank Account
              </h3>
              {bankError ? (
                <LoadError error={bankError} />
              ) : bank ? (
                <div className='grid gap-4 md:grid-cols-3'>
                  <Row label='Account Holder' value={bank.account_holder_name} />
                  <Row label='Account Number' value={maskAccountNumber(bank.account_number)} />
                  <Row label='IFSC' value={bank.ifsc_code || '—'} />
                  <Row label='Bank' value={bank.bank_name || '—'} />
                  <Row label='Branch' value={bank.branch_name || '—'} />
                  <Row
                    label='Status'
                    value={
                      isPayable(bank) ? (
                        bank.verified_at ? 'Payable · verified' : 'Payable · not verified'
                      ) : (
                        'Recorded, not payable (IFSC missing)'
                      )
                    }
                  />
                </div>
              ) : (
                <NotSet href='/hr/payroll/bank-accounts' label='Bank Accounts' />
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
