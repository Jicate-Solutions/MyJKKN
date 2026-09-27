'use client';
/**
 * Export the WHOLE filtered Awaiting Payment tab — every page, current filters,
 * reason chip and sort — as an Excel workbook or a PDF report.
 *
 * Rows come from a server action that re-runs the tab's own loader, so the file
 * always matches what the user can see. The writers (exceljs / jsPDF) are
 * dynamic-imported: they are large and only needed on click.
 */

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { getErrorMessage } from '@/lib/utils';
import { reportFileStem } from '@/lib/learners/onboarding/awaiting-payment-report';
import { exportAwaitingPaymentReport } from '../_actions/export-awaiting-payment';

type Format = 'xlsx' | 'pdf';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AwaitingPaymentExportButton() {
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState<Format | null>(null);

  const run = async (format: Format) => {
    if (busy) return;
    setBusy(format);
    try {
      const report = await exportAwaitingPaymentReport(Object.fromEntries(searchParams.entries()));
      if (report.rows.length === 0) {
        toast.error('No learners to export for the current filters.');
        return;
      }

      const stem = reportFileStem(report.generatedAt);
      if (format === 'xlsx') {
        const { buildAwaitingPaymentWorkbook } = await import(
          '@/lib/learners/onboarding/awaiting-payment-excel'
        );
        download(await buildAwaitingPaymentWorkbook(report), `${stem}.xlsx`);
      } else {
        const { buildAwaitingPaymentPdf } = await import(
          '@/lib/learners/onboarding/awaiting-payment-pdf'
        );
        download(buildAwaitingPaymentPdf(report), `${stem}.pdf`);
      }
      toast.success(`Exported ${report.rows.length} learner${report.rows.length === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error('[awaiting-payment-export] failed:', err);
      toast.error(`Export failed: ${getErrorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs" disabled={!!busy}>
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuItem onSelect={() => void run('xlsx')}>
          <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
          Excel report (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('pdf')}>
          <FileText className="mr-2 h-4 w-4 text-red-600" />
          PDF report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
