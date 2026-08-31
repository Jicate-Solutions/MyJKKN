'use client';

/**
 * Set or raise one person's salary.
 *
 * Writes through fn_hr_set_staff_salary, which supersedes the incumbent rather
 * than updating it — so this dialog is equally "record a first salary" and
 * "give a raise", and the previous figure stays readable in the history sheet.
 *
 * A PAYER ORGANISATION IS REQUIRED, and 101 of the 754 people on the roster do
 * not have one. The RPC rejects a NULL payer, so the form refuses up front and
 * points at the screen that fixes it — a 22023 from the database would say the
 * same thing far less usefully.
 *
 * The effective date defaults to the FIRST OF THE CURRENT MONTH, not today.
 * Salaries are monthly and a payslip run keys off the figure in force for the
 * period; dating a correction mid-month invites two salaries inside one payroll
 * period for no reason the user intended.
 */

import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getErrorMessage } from '@/lib/utils';
import { useSetStaffSalary } from '@/hooks/hr/use-staff-salaries';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const STRUCTURES = ['Monthly', 'Weekly', 'Daily', 'Hourly'] as const;
const OVERTIME_LEVELS = ['No overtime', 'Grade', 'Employee'] as const;

const FLAGS = [
  { field: 'eligible_for_pf', label: 'Eligible for PF' },
  { field: 'eligible_for_insurance', label: 'Eligible for insurance' },
  { field: 'eligible_for_gratuity', label: 'Eligible for gratuity' },
  { field: 'eligible_for_etf', label: 'Eligible for ETF' },
  { field: 'exempt_edli', label: 'Exempt from EDLI' },
] as const;

type FlagField = (typeof FLAGS)[number]['field'];

/** First of the current month, in IST, as yyyy-MM-dd. */
function firstOfThisMonthIST(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return `${parts.slice(0, 7)}-01`;
}

interface Props {
  row: StaffSalaryDirectoryRow | null;
  onOpenChange: (open: boolean) => void;
}

export function EditSalaryDialog({ row, onOpenChange }: Props) {
  const setSalary = useSetStaffSalary();

  const [monthly, setMonthly] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [structure, setStructure] = useState<string>('Monthly');
  const [overtimeLevel, setOvertimeLevel] = useState<string>('No overtime');
  const [overtimeAmount, setOvertimeAmount] = useState('0');
  const [flags, setFlags] = useState<Record<FlagField, boolean>>({
    eligible_for_pf: false,
    eligible_for_insurance: false,
    eligible_for_gratuity: false,
    eligible_for_etf: false,
    exempt_edli: false,
  });
  const [notes, setNotes] = useState('');

  /**
   * Re-seed whenever a different person is opened. Without it the dialog carries
   * the previous employee's figures into the next one, which on a salary form is
   * not a cosmetic bug.
   *
   * Done DURING RENDER, not in an effect. React's documented "adjusting state
   * when a prop changes" pattern: React re-runs this component immediately and
   * commits once, so the form never paints the wrong person's numbers — whereas
   * an effect paints them first and corrects afterwards. The React Compiler
   * lint (react-hooks/set-state-in-effect) rejects the effect form outright.
   *
   * Clearing on close is what makes REOPENING the same employee re-seed rather
   * than restore whatever was half-typed last time.
   */
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (!row && seededFor !== null) {
    setSeededFor(null);
  } else if (row && seededFor !== row.staff_uuid) {
    setSeededFor(row.staff_uuid);
    setMonthly(row.monthly_gross === null ? '' : String(row.monthly_gross));
    setEffectiveFrom(row.effective_from ?? firstOfThisMonthIST());
    setStructure(row.salary_structure ?? 'Monthly');
    setOvertimeLevel(row.overtime_level ?? 'No overtime');
    setOvertimeAmount(String(row.overtime_amount ?? 0));
    setFlags({
      eligible_for_pf: row.eligible_for_pf,
      eligible_for_insurance: row.eligible_for_insurance,
      eligible_for_gratuity: row.eligible_for_gratuity,
      eligible_for_etf: row.eligible_for_etf,
      exempt_edli: row.exempt_edli,
    });
    setNotes(row.notes ?? '');
  }

  const amount = Number(monthly.replace(/[,\s₹]/g, ''));
  const amountValid = Number.isFinite(amount) && amount > 0;
  const hasPayer = Boolean(row?.payer_org_id);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom);
  const canSave = hasPayer && amountValid && dateValid && !setSalary.isPending;

  const unchanged = useMemo(
    () =>
      row !== null &&
      row.monthly_gross === amount &&
      row.effective_from === effectiveFrom,
    [amount, effectiveFrom, row]
  );

  const handleSave = useCallback(async () => {
    if (!row || !row.payer_org_id) return;
    try {
      await setSalary.mutateAsync({
        staffId: row.staff_uuid,
        hrOrganizationId: row.payer_org_id,
        monthlyGross: amount,
        effectiveFrom,
        salaryStructure: structure,
        overtimeLevel,
        overtimeAmount: Number(overtimeAmount) || 0,
        eligibleForPf: flags.eligible_for_pf,
        exemptEdli: flags.exempt_edli,
        eligibleForInsurance: flags.eligible_for_insurance,
        eligibleForGratuity: flags.eligible_for_gratuity,
        eligibleForEtf: flags.eligible_for_etf,
        notes: notes.trim() || null,
      });
      toast.success(
        row.salary_id
          ? `${row.person_name} now earns ${INR.format(amount)} a month.`
          : `Salary recorded for ${row.person_name}.`
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [
    amount, effectiveFrom, flags, notes, onOpenChange, overtimeAmount,
    overtimeLevel, row, setSalary, structure,
  ]);

  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {row?.salary_id ? 'Update salary' : 'Record salary'}
          </DialogTitle>
          <DialogDescription>
            {row?.person_name}
            {row?.staff_code ? ` · ${row.staff_code}` : ''}
            {row?.payer_org_name ? ` · paid by ${row.payer_org_name}` : ''}
          </DialogDescription>
        </DialogHeader>

        {!hasPayer && (
          <Alert variant='destructive'>
            <AlertDescription>
              This employee has no payroll organisation, so there is nobody to pay the salary.
              Record one under Payroll → Payroll Organisation first.
            </AlertDescription>
          </Alert>
        )}

        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='salary-monthly'>Monthly gross</Label>
              <Input
                id='salary-monthly'
                inputMode='decimal'
                placeholder='26500'
                value={monthly}
                disabled={!hasPayer}
                onChange={(e) => setMonthly(e.target.value)}
              />
              <p className='text-xs text-muted-foreground'>
                {amountValid
                  ? `${INR.format(amount)} a month · ${INR.format(amount * 12)} a year`
                  : 'The whole monthly pay, not a basic component.'}
              </p>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='salary-effective'>Effective from</Label>
              <Input
                id='salary-effective'
                type='date'
                value={effectiveFrom}
                disabled={!hasPayer}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
              <p className='text-xs text-muted-foreground'>
                Payslips before this date keep the previous figure.
              </p>
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label>Salary structure</Label>
              <Select value={structure} onValueChange={setStructure} disabled={!hasPayer}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRUCTURES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label>Overtime</Label>
              <Select value={overtimeLevel} onValueChange={setOvertimeLevel} disabled={!hasPayer}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OVERTIME_LEVELS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {overtimeLevel !== 'No overtime' && (
            <div className='space-y-2'>
              <Label htmlFor='salary-ot'>Overtime amount</Label>
              <Input
                id='salary-ot'
                inputMode='decimal'
                value={overtimeAmount}
                onChange={(e) => setOvertimeAmount(e.target.value)}
              />
            </div>
          )}

          <div className='space-y-2'>
            <Label>Eligibility</Label>
            <div className='grid grid-cols-2 gap-2'>
              {FLAGS.map(({ field, label }) => (
                <label key={field} className='flex cursor-pointer items-center gap-2 text-sm'>
                  <Checkbox
                    checked={flags[field]}
                    disabled={!hasPayer}
                    onCheckedChange={(v) =>
                      setFlags((prev) => ({ ...prev, [field]: v === true }))
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='salary-notes'>Notes (optional)</Label>
            <Textarea
              id='salary-notes'
              rows={2}
              placeholder='Why this figure changed'
              value={notes}
              disabled={!hasPayer}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {unchanged && row?.salary_id && (
            <p className='text-xs text-muted-foreground'>
              This is the figure already in force — saving will leave it untouched rather than
              adding a duplicate to the history.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {setSalary.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {row?.salary_id ? 'Update salary' : 'Record salary'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
