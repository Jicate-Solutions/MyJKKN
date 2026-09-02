'use client';

/**
 * The generated register, on screen.
 *
 * Column order matches the exported workbook exactly, so what HR checks here is
 * what finance receives. The table scrolls inside its own container rather than
 * pushing the page sideways — twenty-six columns will not fit any laptop.
 *
 * "Paid By" matters because the register is grouped by WORK location: at Main
 * Office all 121 rows are paid by five other institutions.
 *
 * EXCLUDED PEOPLE ARE SHOWN, below the paid rows and visibly separated. They
 * are the work list: dropping them would make "who did we not pay, and why"
 * unanswerable from the screen that decided it.
 */

import { AlertTriangle, Pencil } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EXCLUSION_LABELS } from '@/lib/services/hr/payroll/salary-register-service';
import type { HRSalaryRegisterLine } from '@/types/hr-payroll';

interface RegisterTableProps {
  lines: HRSalaryRegisterLine[];
  canManage: boolean;
  isSuperseded: boolean;
  onAdjust: (line: HRSalaryRegisterLine) => void;
}

const money = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 22 stays "22"; 1.5 stays "1.5". Half-days are real and must not round away. */
const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const dmy = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
};

const HEAD = 'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-muted-foreground';
const NUM = 'whitespace-nowrap px-3 py-2 text-right tabular-nums';
const CTR = 'whitespace-nowrap px-3 py-2 text-center tabular-nums';

export function RegisterTable({ lines, canManage, isSuperseded, onAdjust }: RegisterTableProps) {
  const included = lines.filter((l) => l.is_included);
  const excluded = lines.filter((l) => !l.is_included);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[2060px] text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className={HEAD}>S.No</th>
              <th className={HEAD}>Employee Id</th>
              <th className={HEAD}>Employee Name</th>
              <th className={HEAD}>Designation</th>
              <th className={HEAD}>Department</th>
              <th className={HEAD}>Date Of Join</th>
              <th className={HEAD}>Bank Account</th>
              <th className={`${HEAD} text-center`}>Business Working Days</th>
              <th className={`${HEAD} text-center`}>Paid Leave</th>
              <th className={`${HEAD} text-center`}>Unpaid Leave</th>
              <th className={`${HEAD} text-center`}>On Duty</th>
              <th className={`${HEAD} text-center`}>Worked</th>
              <th className={`${HEAD} text-center`}>Paid Days</th>
              <th className={`${HEAD} text-right`}>Actual Gross</th>
              <th className={`${HEAD} text-right`}>Basic Pay</th>
              <th className={`${HEAD} text-right`}>Allowance</th>
              <th className={`${HEAD} text-right`}>Unpaid Leave ₹</th>
              <th className={`${HEAD} text-right`}>EPF</th>
              <th className={`${HEAD} text-right`}>ESI</th>
              <th className={`${HEAD} text-right`}>TDS</th>
              <th className={`${HEAD} text-right`}>Total Earnings</th>
              <th className={`${HEAD} text-right`}>Total Deductions</th>
              <th className={`${HEAD} text-right`}>Net Pay</th>
              <th className={HEAD}>Paid By</th>
              <th className={HEAD}>Remarks</th>
              <th className={HEAD} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {included.map((l, i) => (
              <tr key={l.id} className="hover:bg-muted/30">
                <td className={CTR}>{i + 1}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {l.employee_code ?? '—'}
                </td>
                <td className="px-3 py-2">{l.staff_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.designation ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.department_name ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">{dmy(l.date_of_joining)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {l.bank_account_number ?? (
                    <span className="text-amber-600 dark:text-amber-500">not recorded</span>
                  )}
                </td>
                <td className={CTR}>{days(l.business_working_days)}</td>
                <td className={CTR}>{days(l.paid_leave_days)}</td>
                <td className={CTR}>
                  {l.unpaid_leave_days > 0 ? (
                    <span className="font-medium text-destructive">
                      {days(l.unpaid_leave_days)}
                    </span>
                  ) : (
                    '0'
                  )}
                </td>
                <td className={CTR}>{days(l.on_duty_days)}</td>
                <td className={CTR}>{days(l.worked_days)}</td>
                <td className={CTR}>{days(l.paid_days)}</td>
                <td className={NUM}>{money(l.actual_gross)}</td>
                <td className={NUM}>{money(l.basic_pay)}</td>
                <td className={NUM}>{l.allowance > 0 ? money(l.allowance) : '—'}</td>
                <td className={NUM}>
                  {l.unpaid_leave_deduction > 0 ? money(l.unpaid_leave_deduction) : '—'}
                </td>
                <td className={NUM}>{l.epf_deduction > 0 ? money(l.epf_deduction) : '—'}</td>
                <td className={NUM}>{l.esi_deduction > 0 ? money(l.esi_deduction) : '—'}</td>
                <td className={NUM}>{l.tds_deduction > 0 ? money(l.tds_deduction) : '—'}</td>
                <td className={NUM}>{money(l.total_earnings)}</td>
                <td className={NUM}>{money(l.total_deductions)}</td>
                <td className={`${NUM} font-semibold`}>{money(l.net_pay)}</td>
                <td className="px-3 py-2 text-xs">
                  {l.paid_by_name ?? (
                    <span className="text-amber-600 dark:text-amber-500">not recorded</span>
                  )}
                </td>
                <td className="max-w-[18rem] px-3 py-2 text-xs text-muted-foreground">
                  {l.adjustment_amount !== 0 && (
                    <Badge variant="outline" className="mr-1 align-middle">
                      adj {money(l.adjustment_amount)}
                    </Badge>
                  )}
                  {l.remarks ?? ''}
                </td>
                <td className="px-3 py-2">
                  {canManage && !isSuperseded && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAdjust(l)}
                      aria-label={`Adjust ${l.staff_name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {included.length === 0 && (
              <tr>
                <td colSpan={26} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No payable rows in this register.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {excluded.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">
              {excluded.length} staff excluded from this register
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            These people work at this institution but produced no payable row. They are listed on
            their own sheet in the exported file. Fix the cause and regenerate.
          </p>
          <div className="overflow-x-auto rounded-md border border-amber-300/60 dark:border-amber-900/60">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-amber-50/60 dark:bg-amber-950/20">
                <tr>
                  <th className={HEAD}>Employee Id</th>
                  <th className={HEAD}>Employee Name</th>
                  <th className={HEAD}>Designation</th>
                  <th className={HEAD}>Department</th>
                  <th className={HEAD}>Paid By</th>
                  <th className={HEAD}>Reason not paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {excluded.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {l.employee_code ?? '—'}
                    </td>
                    <td className="px-3 py-2">{l.staff_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.designation ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.department_name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{l.paid_by_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">
                        {l.exclusion_reason ? EXCLUSION_LABELS[l.exclusion_reason] : 'Unknown'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
