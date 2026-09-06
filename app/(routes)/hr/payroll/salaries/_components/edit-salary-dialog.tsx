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
import { useTdsSlabs } from '@/hooks/hr/use-tds-slabs';
import { describeSlab, resolveTds } from '@/lib/hr/payroll/tds-slabs';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const STRUCTURES = ['Monthly', 'Weekly', 'Daily', 'Hourly'] as const;
const OVERTIME_LEVELS = ['No overtime', 'Grade', 'Employee'] as const;

/**
 * `eligible_for_pf` is labelled EPF, not PF. They are the same statutory scheme,
 * and a second flag beside it could disagree with it on the same row — so the
 * column stays and only the wording changes.
 *
 * ESI is genuinely new: this table had no ESI concept at all before 2026-09-01.
 */
const FLAGS = [
  { field: 'eligible_for_pf', label: 'Eligible for EPF' },
  { field: 'eligible_for_esi', label: 'Eligible for ESI' },
  { field: 'eligible_for_insurance', label: 'Eligible for insurance' },
  { field: 'eligible_for_gratuity', label: 'Eligible for gratuity' },
  { field: 'eligible_for_etf', label: 'Eligible for ETF' },
  { field: 'exempt_edli', label: 'Exempt from EDLI' },
] as const;

type FlagField = (typeof FLAGS)[number]['field'];

/** The two flags that carry a rupee figure, and the state key holding it. */
const CONTRIBUTIONS = [
  {
    flag: 'eligible_for_pf',
    key: 'epf',
    label: 'EPF amount',
    hint: 'Deducted in full each month, even in a month with unpaid days.',
  },
  {
    flag: 'eligible_for_esi',
    key: 'esi',
    label: 'ESI amount',
    hint: 'Deducted in full each month, even in a month with unpaid days.',
  },
] as const;

type ContributionKey = (typeof CONTRIBUTIONS)[number]['key'];

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
  // TDS is DERIVED, never stored against the person — so the dialog resolves it
  // live from the bands rather than showing a figure someone typed.
  const { data: tdsSlabs } = useTdsSlabs();

  const [monthly, setMonthly] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [structure, setStructure] = useState<string>('Monthly');
  const [overtimeLevel, setOvertimeLevel] = useState<string>('No overtime');
  const [overtimeAmount, setOvertimeAmount] = useState('0');
  const [flags, setFlags] = useState<Record<FlagField, boolean>>({
    eligible_for_pf: false,
    eligible_for_esi: false,
    eligible_for_insurance: false,
    eligible_for_gratuity: false,
    eligible_for_etf: false,
    exempt_edli: false,
  });
  // Held as strings, like `monthly` and `overtimeAmount`: a number state would
  // fight the user mid-keystroke over an empty field or a trailing decimal point.
  const [amounts, setAmounts] = useState<Record<ContributionKey, string>>({
    epf: '',
    esi: '',
  });
  const [allowance, setAllowance] = useState('');
  const [allowanceLabel, setAllowanceLabel] = useState('');
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
      eligible_for_esi: row.eligible_for_esi,
      eligible_for_insurance: row.eligible_for_insurance,
      eligible_for_gratuity: row.eligible_for_gratuity,
      eligible_for_etf: row.eligible_for_etf,
      exempt_edli: row.exempt_edli,
    });
    // Blank, not '0', when nothing is recorded — the field is only visible when
    // its flag is on, and a pre-filled zero there reads as a decided figure.
    setAmounts({
      epf: row.epf_amount ? String(row.epf_amount) : '',
      esi: row.esi_amount ? String(row.esi_amount) : '',
    });
    setAllowance(row.allowance_amount ? String(row.allowance_amount) : '');
    setAllowanceLabel(row.allowance_label ?? '');
    setNotes(row.notes ?? '');
  }

  const amount = Number(monthly.replace(/[,\s₹]/g, ''));
  const amountValid = Number.isFinite(amount) && amount > 0;
  const hasPayer = Boolean(row?.payer_org_id);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom);

  /**
   * A contribution counts only while its flag is on, so unticking a box
   * discards whatever was typed rather than saving a figure the flag does not
   * authorise. The database enforces the same rule, but relying on that alone
   * would let the form show a number it is not going to send.
   */
  const parseAmount = (raw: string): number => Number(raw.replace(/[,\s₹]/g, ''));
  const epfAmount = flags.eligible_for_pf ? parseAmount(amounts.epf) : 0;
  const esiAmount = flags.eligible_for_esi ? parseAmount(amounts.esi) : 0;

  // Only what is VISIBLE is validated. A blank field reads as zero, which is a
  // legitimate answer — "eligible, contributing nothing this month".
  const contributionErrors = CONTRIBUTIONS.map(({ flag, key, label }) => {
    if (!flags[flag]) return null;
    const v = parseAmount(amounts[key]);
    if (amounts[key].trim() !== '' && !Number.isFinite(v)) return `${label} is not a number.`;
    if (v < 0) return `${label} cannot be negative.`;
    if (amountValid && v > amount) return `${label} is more than the monthly gross.`;
    return null;
  }).filter(Boolean) as string[];

  const allowanceAmount = Math.max(0, parseAmount(allowance) || 0);
  const allowanceValid =
    allowance.trim() === '' || (Number.isFinite(parseAmount(allowance)) && allowanceAmount >= 0);
  const totalMonthly = (amountValid ? amount : 0) + allowanceAmount;

  /**
   * TDS resolves against the GROSS ALONE — never gross + allowance.
   *
   * This is the rule the whole feature turns on: an allowance must not push
   * somebody into a tax band, so the figure fed here is `amount`, not
   * `totalMonthly`. Same pure resolver the register uses, so the preview and the
   * payslip cannot disagree.
   */
  const tds = resolveTds(amountValid ? amount : 0, tdsSlabs ?? []);

  const canSave =
    hasPayer &&
    amountValid &&
    dateValid &&
    allowanceValid &&
    contributionErrors.length === 0 &&
    !setSalary.isPending;

  /**
   * COMPARES THE WHOLE PAYLOAD, not just the gross and the date.
   *
   * The RPC returns the incumbent untouched when nothing differs, and this hint
   * says so. While it tested only two fields it lied about every other kind of
   * edit — and once the amounts existed, "I changed the EPF figure" became the
   * commonest case it would have got wrong.
   */
  const unchanged = useMemo(
    () =>
      row !== null &&
      row.monthly_gross === amount &&
      row.effective_from === effectiveFrom &&
      row.salary_structure === structure &&
      row.overtime_level === overtimeLevel &&
      (row.overtime_amount ?? 0) === (Number(overtimeAmount) || 0) &&
      row.eligible_for_pf === flags.eligible_for_pf &&
      row.eligible_for_esi === flags.eligible_for_esi &&
      row.eligible_for_insurance === flags.eligible_for_insurance &&
      row.eligible_for_gratuity === flags.eligible_for_gratuity &&
      row.eligible_for_etf === flags.eligible_for_etf &&
      row.exempt_edli === flags.exempt_edli &&
      (row.epf_amount ?? 0) === epfAmount &&
      (row.esi_amount ?? 0) === esiAmount &&
      (row.allowance_amount ?? 0) === allowanceAmount &&
      // The RPC drops a label whose amount is zero, so the comparison must too —
      // otherwise a stale label makes an otherwise-identical save look changed.
      (row.allowance_label ?? '') ===
        (allowanceAmount > 0 ? allowanceLabel.trim() : '') &&
      (row.notes ?? '') === notes.trim(),
    [
      allowanceAmount, allowanceLabel, amount, effectiveFrom, epfAmount,
      esiAmount, flags, notes, overtimeAmount, overtimeLevel, row, structure,
    ]
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
        epfAmount,
        eligibleForEsi: flags.eligible_for_esi,
        esiAmount,
        allowanceAmount,
        allowanceLabel: allowanceLabel.trim() || null,
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
    allowanceAmount, allowanceLabel, amount, effectiveFrom, epfAmount, esiAmount,
    flags, notes, onOpenChange, overtimeAmount, overtimeLevel, row, setSalary,
    structure,
  ]);

  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      {/*
        Flex shell with an explicit max height. DialogContent ships with no
        max-height and no overflow of its own, so a dialog that outgrows the
        viewport pushes its footer off-screen with no way to scroll to it. This
        one gained two conditional amount fields and now can.
      */}
      <DialogContent className='flex max-h-[90vh] max-w-lg flex-col'>
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

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto pr-1'>
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
              <Label htmlFor='salary-allowance'>Allowance</Label>
              <Input
                id='salary-allowance'
                inputMode='decimal'
                placeholder='0'
                value={allowance}
                disabled={!hasPayer}
                onChange={(e) => setAllowance(e.target.value)}
              />
              <p className='text-xs text-muted-foreground'>
                Paid on top of the gross. Not counted for TDS.
              </p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='salary-allowance-label'>What it is for</Label>
              <Input
                id='salary-allowance-label'
                placeholder='Conveyance'
                value={allowanceLabel}
                // A label with no money behind it is dropped on save, so there is
                // nothing to type here until an amount exists.
                disabled={!hasPayer || allowanceAmount <= 0}
                onChange={(e) => setAllowanceLabel(e.target.value)}
              />
              <p className='text-xs text-muted-foreground'>
                {allowanceAmount > 0
                  ? `Total monthly ${INR.format(totalMonthly)}`
                  : 'Optional, and only kept when there is an amount.'}
              </p>
            </div>
          </div>

          {/*
            TDS IS SHOWN, NOT ENTERED. It falls out of the bands under
            Payroll -> TDS Bands, so there is no field here to disagree with them.
          */}
          <div className='rounded-md border bg-muted/40 p-3'>
            <div className='flex items-baseline justify-between gap-3'>
              <Label className='text-xs uppercase tracking-wide text-muted-foreground'>
                TDS
              </Label>
              <span className='text-sm font-semibold tabular-nums'>
                {tds.amount > 0 ? `${INR.format(tds.amount)} a month` : 'None'}
              </span>
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              {!amountValid
                ? 'Enter a monthly gross to see the TDS it attracts.'
                : tds.slab
                  ? `${INR.format(amount)} falls in ${describeSlab(tds.slab, (n) => INR.format(n))} → ${tds.rate_pct}% of the monthly gross.`
                  : (tdsSlabs?.length ?? 0) === 0
                    ? 'No TDS bands are configured, so no tax is deducted from anyone.'
                    : `${INR.format(amount)} falls outside every configured band, so no TDS is deducted.`}
              {allowanceAmount > 0 && ' The allowance is excluded from this calculation.'}
            </p>
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
                    onCheckedChange={(v) => {
                      const on = v === true;
                      setFlags((prev) => ({ ...prev, [field]: on }));
                      // Unticking clears the figure, so a stale amount cannot be
                      // left sitting behind a hidden field and re-revealed later
                      // as though it had been decided.
                      if (!on) {
                        const c = CONTRIBUTIONS.find((x) => x.flag === field);
                        if (c) setAmounts((prev) => ({ ...prev, [c.key]: '' }));
                      }
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/*
            The amount appears only once its eligibility is ticked — the same
            reveal the overtime amount above uses. Rendering both fields always
            would ask for a figure that is meaningless when the flag is off, and
            the RPC would discard it anyway.
          */}
          {CONTRIBUTIONS.some(({ flag }) => flags[flag]) && (
            <div className='grid grid-cols-2 gap-3'>
              {CONTRIBUTIONS.map(({ flag, key, label, hint }) =>
                flags[flag] ? (
                  <div key={key} className='space-y-2'>
                    <Label htmlFor={`salary-${key}`}>{label}</Label>
                    <Input
                      id={`salary-${key}`}
                      inputMode='decimal'
                      placeholder='0'
                      value={amounts[key]}
                      disabled={!hasPayer}
                      onChange={(e) =>
                        setAmounts((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                    <p className='text-xs text-muted-foreground'>{hint}</p>
                  </div>
                ) : null
              )}
            </div>
          )}

          {contributionErrors.length > 0 && (
            <Alert variant='destructive'>
              <AlertDescription>
                {contributionErrors.map((e) => <div key={e}>{e}</div>)}
              </AlertDescription>
            </Alert>
          )}

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
