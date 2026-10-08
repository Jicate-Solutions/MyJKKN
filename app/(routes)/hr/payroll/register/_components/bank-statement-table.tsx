'use client';

/**
 * The bank statement for one tab — S.No / Name / Account / Net Pay and a TOTAL —
 * the same rows the workbook's BANK STATEMENT sheets and the Bank Letter's
 * salary list carry, so HR can check accounts on screen before printing.
 *
 * Paid lines only: an excluded person has no net pay to transfer.
 *
 * A missing account is shown, not hidden — on a list a bank credits from, a
 * blank account is the row most likely to bounce. Wide enough to scroll
 * sideways at 375px rather than squeeze the account column.
 */

import { AlertTriangle } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatINR, hasBankAccount } from '@/lib/services/hr/payroll/salary-register-document-model';
import type { HRSalaryRegisterLine } from '@/types/hr-payroll';

interface BankStatementTableProps {
  /** Paid lines of the selected tab, in register order. */
  lines: HRSalaryRegisterLine[];
  total: number;
}

export function BankStatementTable({ lines, total }: BankStatementTableProps) {
  if (lines.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nobody in this group is paid on this register.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 text-center">S.No</TableHead>
            <TableHead>Employee name</TableHead>
            <TableHead className="w-28">Employee ID</TableHead>
            <TableHead className="w-48">Bank account number</TableHead>
            <TableHead className="w-32 text-right">Net pay</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l, i) => (
            <TableRow key={l.id}>
              <TableCell className="text-center tabular-nums text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="font-medium">{l.staff_name}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{l.employee_code ?? '—'}</TableCell>
              <TableCell>
                {hasBankAccount(l) ? (
                  <span className="font-mono text-sm">{l.bank_account_number}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-500">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    No account
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">₹{formatINR(l.net_pay)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4} className="text-right font-semibold">TOTAL</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">₹{formatINR(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
