'use client';
// ============================================
// STAFF FORM — "OFFICE" TAB (payer + salary + bank account)
// ============================================
// Created: 2026-09-26
// Renders the nested `office` fields of the staff form. Values live in the
// parent's react-hook-form; saving happens in staff-form.tsx via
// saveStaffOffice() after the staff row is written. Shown only to super admin
// and holders of hr.payroll.salary.manage (HR Head) — the parent gates it.
// ============================================

import type { UseFormReturn } from 'react-hook-form';
import { Building2, IndianRupee, Landmark, Info } from 'lucide-react';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { usePayrollOrganizations } from '@/hooks/hr/use-staff-payroll';
import { OVERTIME_LEVELS, SALARY_STRUCTURES } from '@/lib/hr/payroll/staff-office';

interface OfficeSectionProps {
  form: UseFormReturn<any>;
  /** The chosen employment category is excluded from HR (included_in_hr=false). */
  categoryExcludedFromHr?: boolean;
  isEditing: boolean;
  /** Edit only: the current payer / salary / bank could not be read. */
  loadFailed?: boolean;
}

const ELIGIBILITY: Array<{ name: string; label: string }> = [
  { name: 'eligible_for_pf', label: 'Eligible for PF' },
  { name: 'exempt_edli', label: 'Exempt from EDLI' },
  { name: 'eligible_for_esi', label: 'Eligible for ESI' },
  { name: 'eligible_for_insurance', label: 'Eligible for Insurance' },
  { name: 'eligible_for_gratuity', label: 'Eligible for Gratuity' },
  { name: 'eligible_for_etf', label: 'Eligible for ETF' }
];

export function OfficeSection({
  form,
  categoryExcludedFromHr,
  isEditing,
  loadFailed
}: OfficeSectionProps) {
  const { data: payrollOrgs = [], isLoading: orgsLoading } = usePayrollOrganizations();
  const pfOn = form.watch('office.salary.eligible_for_pf');
  const esiOn = form.watch('office.salary.eligible_for_esi');

  const text = (name: string, label: string, placeholder = '', type = 'text') => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem data-field={name}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              inputMode={type === 'number' ? 'decimal' : undefined}
              placeholder={placeholder}
              {...field}
              value={field.value ?? ''}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const select = (name: string, label: string, options: readonly string[]) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem data-field={name}>
          <FormLabel>{label}</FormLabel>
          <Select onValueChange={field.onChange} value={field.value ?? ''}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <div className='space-y-8'>
      <Alert>
        <Info className='h-4 w-4' />
        <AlertDescription>
          Optional. Anything filled here is saved to Payroll Organisation, Employee
          Salaries and Bank Accounts right after the staff record is saved.
          {isEditing &&
            ' Changing the salary or bank account records a new entry and keeps the old one as history.'}
        </AlertDescription>
      </Alert>

      {loadFailed && (
        <Alert variant='destructive'>
          <AlertDescription>
            The current payroll organisation, salary or bank account could not be loaded.
            Nothing entered here will be saved — update them on the HR payroll pages.
          </AlertDescription>
        </Alert>
      )}

      {categoryExcludedFromHr && (
        <Alert variant='destructive'>
          <AlertDescription>
            The selected employment category is excluded from HR, so this person will
            not appear on the HR salary and bank-account lists even if details are
            saved here.
          </AlertDescription>
        </Alert>
      )}

      {/* Payroll organisation */}
      <div className='space-y-4'>
        <h2 className='flex items-center gap-2 text-lg font-semibold'>
          <Building2 className='h-5 w-5' /> Payroll Organisation
        </h2>
        <div className='grid gap-4 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='office.payer_org_id'
            render={({ field }) => (
              <FormItem data-field='office.payer_org_id'>
                <FormLabel>Paid by</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={orgsLoading ? 'Loading…' : 'Select payroll organisation'}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {payrollOrgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-xs text-muted-foreground'>
                  Pre-selected from the institution when it runs its own payroll.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Salary */}
      <div className='space-y-4'>
        <h2 className='flex items-center gap-2 text-lg font-semibold'>
          <IndianRupee className='h-5 w-5' /> Salary
        </h2>
        <div className='grid gap-4 md:grid-cols-3'>
          {text('office.salary.monthly_gross', 'Monthly Gross (₹)', 'e.g. 35000', 'number')}
          {select('office.salary.salary_structure', 'Salary Structure', SALARY_STRUCTURES)}
          {text('office.salary.effective_from', 'Effective From', '', 'date')}
          {select('office.salary.overtime_level', 'Overtime Level', OVERTIME_LEVELS)}
          {text('office.salary.overtime_amount', 'Overtime Amount (₹)', '0', 'number')}
        </div>

        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {ELIGIBILITY.map((e) => (
            <FormField
              key={e.name}
              control={form.control}
              name={`office.salary.${e.name}`}
              render={({ field }) => (
                <FormItem className='flex items-center justify-between rounded-md border px-3 py-2'>
                  <FormLabel className='font-normal'>{e.label}</FormLabel>
                  <FormControl>
                    <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          ))}
        </div>

        <div className='grid gap-4 md:grid-cols-3'>
          {pfOn && text('office.salary.epf_amount', 'EPF Amount (₹)', '0', 'number')}
          {esiOn && text('office.salary.esi_amount', 'ESI Amount (₹)', '0', 'number')}
          {text('office.salary.allowance_amount', 'Allowance Amount (₹)', '0', 'number')}
          {text('office.salary.allowance_label', 'Allowance Label', 'e.g. Special allowance')}
        </div>

        <FormField
          control={form.control}
          name='office.salary.notes'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Salary Notes</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Bank account */}
      <div className='space-y-4'>
        <h2 className='flex items-center gap-2 text-lg font-semibold'>
          <Landmark className='h-5 w-5' /> Bank Account
        </h2>
        <div className='grid gap-4 md:grid-cols-2'>
          {text('office.bank.account_holder_name', 'Account Holder Name', 'As printed on the passbook')}
          {text('office.bank.account_number', 'Account Number', '6 to 20 digits')}
          {text('office.bank.ifsc_code', 'IFSC Code', 'e.g. SBIN0001234')}
          {text('office.bank.bank_name', 'Bank Name')}
          {text('office.bank.branch_name', 'Branch')}
          {select('office.bank.account_type', 'Account Type', ['savings', 'current'])}
          {text('office.bank.effective_from', 'Effective From', '', 'date')}
        </div>
        <p className='text-xs text-muted-foreground'>
          Without an IFSC code the account is recorded but cannot be paid until it is added.
        </p>
      </div>
    </div>
  );
}
