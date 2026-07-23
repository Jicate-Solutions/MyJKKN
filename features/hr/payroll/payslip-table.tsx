'use client';

/**
 * PayslipTable — DataTable showing payslips for a payroll period.
 *
 * Columns: Employee ID | Employee Name | Basic Pay | Allowances (gross-basic) |
 *          Gross | Deductions | Net Pay | Payment Mode
 *
 * Features:
 *   - Sort by name or net pay (client-side on the loaded set)
 *   - Export CSV button (downloads all visible rows)
 *   - Skeleton loading state
 *   - Empty state when no payslips exist yet
 *   - Summary row with totals
 */

import { useMemo, useState } from 'react';
import { Download, ArrowUpDown, FileSpreadsheet, Pencil } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { PayslipWithStaff } from '@/hooks/hr/payroll/use-payroll-payslips';

// =====================================================================================
// Helpers
// =====================================================================================

type SortField = 'name' | 'net_amount' | 'gross_amount' | 'basic_pay';
type SortDir = 'asc' | 'desc';

function staffName(slip: PayslipWithStaff): string {
  if (!slip.staff) return '';
  return `${slip.staff.first_name ?? ''} ${slip.staff.last_name ?? ''}`.trim();
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  neft: 'NEFT',
  cheque: 'Cheque',
  cash: 'Cash',
};

function sortPayslips(
  payslips: PayslipWithStaff[],
  field: SortField,
  dir: SortDir,
): PayslipWithStaff[] {
  const sorted = [...payslips];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'name':
        cmp = (staffName(a)).localeCompare(staffName(b));
        break;
      case 'net_amount':
        cmp = a.net_amount - b.net_amount;
        break;
      case 'gross_amount':
        cmp = a.gross_amount - b.gross_amount;
        break;
      case 'basic_pay':
        cmp = a.basic_pay - b.basic_pay;
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

// =====================================================================================
// CSV Export
// =====================================================================================

function exportPayslipsCSV(payslips: PayslipWithStaff[], periodLabel: string) {
  const headers = [
    'Employee Name',
    'Designation',
    'Basic Pay',
    'Allowances',
    'Gross Amount',
    'Total Deductions',
    'Net Amount',
    'LOP Days',
    'Working Days',
    'Payment Mode',
    'Correction Type',
  ];

  const rows = payslips.map((slip) => [
    staffName(slip),
    slip.staff?.designation ?? '',
    slip.basic_pay.toString(),
    (slip.gross_amount - slip.basic_pay).toString(),
    slip.gross_amount.toString(),
    slip.total_deductions.toString(),
    slip.net_amount.toString(),
    slip.lop_days.toString(),
    slip.working_days_attended.toString(),
    slip.payment_mode,
    slip.correction_type,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => {
        // Escape cells with commas or quotes
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(','),
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `payslips-${periodLabel.replace(/\s+/g, '-').toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// =====================================================================================
// Skeleton
// =====================================================================================

export function PayslipTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
          <div className="h-8 w-28 rounded bg-muted animate-pulse" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 7 }).map((_, i) => (
                  <TableHead key={i}>
                    <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: rows }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================================
// Sortable header cell
// =====================================================================================

function SortableHead({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = currentField === field;
  return (
    <TableHead className={cn('cursor-pointer select-none', className)}>
      <button
        className="flex items-center gap-1 text-xs font-medium"
        onClick={() => onSort(field)}
      >
        {label}
        <ArrowUpDown
          className={cn(
            'h-3 w-3',
            isActive ? 'text-primary' : 'text-muted-foreground/50',
          )}
        />
        {isActive && (
          <span className="text-[10px] text-muted-foreground">
            {currentDir === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </button>
    </TableHead>
  );
}

// =====================================================================================
// Main component
// =====================================================================================

export function PayslipTable({
  payslips,
  periodLabel,
  isLoading,
  onOverride,
}: {
  payslips: PayslipWithStaff[];
  periodLabel: string;
  isLoading?: boolean;
  onOverride?: (slip: PayslipWithStaff) => void;
}) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(
    () => sortPayslips(payslips, sortField, sortDir),
    [payslips, sortField, sortDir],
  );

  // Totals
  const totals = useMemo(() => {
    let totalBasic = 0;
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    for (const slip of payslips) {
      totalBasic += slip.basic_pay;
      totalGross += slip.gross_amount;
      totalDeductions += slip.total_deductions;
      totalNet += slip.net_amount;
    }
    return { totalBasic, totalGross, totalDeductions, totalNet };
  }, [payslips]);

  if (isLoading) {
    return <PayslipTableSkeleton />;
  }

  if (payslips.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payslips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground text-sm">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p>No payslips generated for this period yet.</p>
            <p className="text-xs mt-1">
              Use the &ldquo;Generate Payslips&rdquo; button after preparing the period.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Payslips ({payslips.length} staff)
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportPayslipsCSV(sorted, periodLabel)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Desktop table */}
        <div className="hidden md:block border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Employee Name"
                  field="name"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Basic Pay"
                  field="basic_pay"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="text-right"
                />
                <TableHead className="text-right text-xs">Allowances</TableHead>
                <SortableHead
                  label="Gross"
                  field="gross_amount"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="text-right"
                />
                <TableHead className="text-right text-xs">Deductions</TableHead>
                <SortableHead
                  label="Net Pay"
                  field="net_amount"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="text-right"
                />
                <TableHead className="text-xs">Mode</TableHead>
                {onOverride && <TableHead className="text-xs w-16">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((slip) => {
                const allowances = slip.gross_amount - slip.basic_pay;
                return (
                  <TableRow key={slip.id}>
                    <TableCell className="font-medium text-sm">
                      {staffName(slip) || '—'}
                      {slip.staff?.designation && (
                        <span className="block text-xs text-muted-foreground font-normal">
                          {slip.staff.designation}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatINR(slip.basic_pay)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatINR(allowances)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {formatINR(slip.gross_amount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-red-700">
                      {formatINR(slip.total_deductions)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-semibold">
                      {formatINR(slip.net_amount)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {PAYMENT_MODE_LABELS[slip.payment_mode] ?? slip.payment_mode}
                    </TableCell>
                    {onOverride && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onOverride(slip)}
                          title="Override deductions"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell className="text-sm">
                  Totals
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatINR(totals.totalBasic)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatINR(totals.totalGross - totals.totalBasic)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatINR(totals.totalGross)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-red-700">
                  {formatINR(totals.totalDeductions)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatINR(totals.totalNet)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {sorted.map((slip) => (
            <Card key={slip.id} className="border">
              <CardContent className="py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">
                    {staffName(slip) || '—'}
                  </span>
                  {slip.staff?.designation && (
                    <span className="text-xs text-muted-foreground">
                      {slip.staff.designation}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Gross</span>
                    <p className="font-medium tabular-nums">
                      {formatINR(slip.gross_amount)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Deductions</span>
                    <p className="font-medium tabular-nums text-red-700">
                      {formatINR(slip.total_deductions)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Net</span>
                    <p className="font-semibold tabular-nums">
                      {formatINR(slip.net_amount)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {PAYMENT_MODE_LABELS[slip.payment_mode] ?? slip.payment_mode}
                  </span>
                  {slip.lop_days > 0 && (
                    <span className="text-amber-700">
                      {slip.lop_days} LOP day{slip.lop_days !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Mobile totals card */}
          <Card className="border-2 border-primary/20">
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">
                Totals ({payslips.length} staff)
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Gross</span>
                  <p className="font-semibold tabular-nums">
                    {formatINR(totals.totalGross)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Deductions</span>
                  <p className="font-semibold tabular-nums text-red-700">
                    {formatINR(totals.totalDeductions)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Net</span>
                  <p className="font-bold tabular-nums">
                    {formatINR(totals.totalNet)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
