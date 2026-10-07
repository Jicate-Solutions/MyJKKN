'use client';

/**
 * Download one payroll document — Bank Letter or Chairperson Approval — for one
 * staff category of one register.
 *
 * Shows what the letter will print BEFORE it is downloaded: the reference, the
 * amount in figures and in words, the head-count, and any paid person with no
 * bank account (who will appear on the salary list as "(not recorded)"). The
 * preview and the document are computed by the same module
 * (salary-register-document-model.ts), so they cannot disagree.
 *
 * The letter date defaults to today; the cheque number is optional and, left
 * empty, is printed as a blank line to fill in by hand — as the originals are.
 */

import { useState } from 'react';
import { AlertTriangle, Download, Loader2, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/utils';
import { useDownloadPayrollDocument } from '@/hooks/hr/payroll/use-salary-register';
import {
  PAYROLL_DOCUMENT_LABEL,
  STAFF_CATEGORY_LABEL,
  formatLetterDate,
  payrollDocumentSummary,
  todayIso,
} from '@/lib/services/hr/payroll/salary-register-document-model';
import type {
  HRPayrollDocumentSettings,
  HRSalaryRegisterLine,
  PayrollDocumentKind,
  StaffCategoryKey,
} from '@/types/hr-payroll';

export interface DocumentRequestTarget {
  doc: PayrollDocumentKind;
  category: StaffCategoryKey;
}

interface DocumentDownloadDialogProps {
  target: DocumentRequestTarget | null;
  onOpenChange: (open: boolean) => void;
  runId: string;
  periodYear: number;
  periodMonth: number;
  lines: HRSalaryRegisterLine[];
  settings: HRPayrollDocumentSettings | undefined;
  /** False until someone has saved the college's details. */
  settingsSaved: boolean;
  settingsLoading: boolean;
  canManage: boolean;
  onEditSettings: () => void;
}

export function DocumentDownloadDialog(props: DocumentDownloadDialogProps) {
  return (
    <Dialog open={Boolean(props.target)} onOpenChange={props.onOpenChange}>
      {props.target && <DownloadForm key={`${props.target.doc}-${props.target.category}`} {...props} target={props.target} />}
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-words ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function DownloadForm({
  target,
  onOpenChange,
  runId,
  periodYear,
  periodMonth,
  lines,
  settings,
  settingsSaved,
  settingsLoading,
  canManage,
  onEditSettings,
}: DocumentDownloadDialogProps & { target: DocumentRequestTarget }) {
  const [date, setDate] = useState(todayIso());
  const [cheque, setCheque] = useState('');
  const download = useDownloadPayrollDocument();

  const summary = settings
    ? payrollDocumentSummary({ lines, category: target.category, settings, periodYear, periodMonth })
    : null;

  const title = `${PAYROLL_DOCUMENT_LABEL[target.doc]} — ${STAFF_CATEGORY_LABEL[target.category]}`;
  const ready = settingsSaved && summary && summary.staffCount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const handleDownload = () => {
    download.mutate(
      { runId, doc: target.doc, category: target.category, date, cheque },
      {
        onSuccess: () => {
          toast.success(`${title} downloaded.`);
          onOpenChange(false);
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  };

  return (
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
      <DialogHeader className="shrink-0">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          A Word document laid out for the college letterhead — the top of the page is left blank.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-2">
        {settingsLoading && <p className="text-sm text-muted-foreground">Loading the college details…</p>}

        {!settingsLoading && !settingsSaved && (
          <Alert>
            <Settings2 className="h-4 w-4" />
            <AlertTitle>College details needed first</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                The reference code, the college&apos;s bank, branch and account number have not been
                saved for this institution yet.
              </p>
              {canManage ? (
                <Button size="sm" variant="outline" onClick={onEditSettings}>
                  Enter college details
                </Button>
              ) : (
                <p>Ask the HR Head to fill them in from this page.</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {summary && (
          <dl className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Row label="Reference" value={summary.reference} mono />
            <Row label="Staff paid" value={String(summary.staffCount)} />
            <Row label="Amount" value={`₹${summary.amountFigures}/-`} />
            <Row label="In words" value={summary.amountWords} />
            {target.doc === 'bank_letter' && (
              <Row
                label="Salary list"
                value={`${summary.salaryListPages} ${summary.salaryListPages === 1 ? 'page' : 'pages'}`}
              />
            )}
          </dl>
        )}

        {summary && summary.missingAccounts > 0 && target.doc === 'bank_letter' && (
          <Alert className="border-amber-300 text-amber-900 dark:border-amber-700 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {summary.missingAccounts} {summary.missingAccounts === 1 ? 'person has' : 'people have'} no bank account
            </AlertTitle>
            <AlertDescription>
              They are listed as &ldquo;(not recorded)&rdquo; on the salary list. Record the account in
              their staff payroll details and regenerate the register, or correct the list by hand.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="letter-date">Letter date</Label>
            <Input id="letter-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Prints as {formatLetterDate(date)}.</p>
          </div>
          {target.doc === 'bank_letter' && (
            <div className="space-y-2">
              <Label htmlFor="cheque-no">Cheque number</Label>
              <Input
                id="cheque-no"
                value={cheque}
                maxLength={30}
                onChange={(e) => setCheque(e.target.value)}
                placeholder="Optional"
              />
              <p className="text-xs text-muted-foreground">Left blank, it prints a line to write on.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border pt-4">
        {canManage && settingsSaved && (
          <Button variant="ghost" className="mr-auto" onClick={onEditSettings}>
            <Settings2 className="mr-2 h-4 w-4" />
            College details
          </Button>
        )}
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={download.isPending}>
          Cancel
        </Button>
        <Button onClick={handleDownload} disabled={!ready || download.isPending}>
          {download.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download .docx
            </>
          )}
        </Button>
      </div>
    </DialogContent>
  );
}
