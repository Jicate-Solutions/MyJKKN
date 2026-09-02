'use client';

// collect-view.tsx — the counter itself.
//
// Flow: pick school + year → find learner → select bills → choose mode →
// confirm → receipt. Each step only appears once the one before it has an
// answer, so the screen never asks for something it cannot yet use.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { History, Info, Printer, Download, Loader2, ReceiptIndianRupee } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { useSchoolYearSelection } from '@/hooks/school-fees/use-school-year-selection';
import { useSchoolBillPayment } from '@/hooks/school-fees/use-school-bill-payment';
import { useInitiatePayment } from '@/hooks/billing/use-payment-gateway';
import { usePermissions } from '@/hooks/use-permissions';
import { SchoolBillPaymentService } from '@/lib/services/school-fees/school-bill-payment-service';
import {
  downloadSchoolReceiptPdf,
  printSchoolReceiptPdf,
  fetchLogoDataUrl,
  type SchoolReceiptLine,
  type SchoolReceiptPayload,
} from '@/lib/utils/billing/school-receipt-pdf';
import { SCHOOL_PAYMENT_MODES } from '@/types/school-fees';
import type { SchoolLearnerForPayment } from '@/types/school-fees';
import type { BillingReceipt } from '@/types/billing-schedule';

import { SchoolYearPicker } from '../../_components/school-year-picker';
import { LearnerSearch } from './learner-search';
import { LearnerCard } from './learner-card';
import { OutstandingBills } from './outstanding-bills';
import { PaymentPanel } from './payment-panel';
import { ConfirmPaymentDialog, PaymentSuccessDialog } from './payment-dialogs';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const money = (n: number) => `₹${inr.format(Number(n) || 0)}`;

const modeLabel = (value: string) =>
  SCHOOL_PAYMENT_MODES.find((m) => m.value === value)?.label ?? value;

/**
 * Where the counter parks its context before handing off to the gateway.
 *
 * sessionStorage, not React state: the browser LEAVES this origin for the
 * bank's page, so every scrap of in-memory state is gone by the time the payer
 * comes back. Session-scoped rather than local so an abandoned payment cannot
 * haunt a different clerk's shift on the same machine.
 */
const PENDING_KEY = 'school-fee-pending-payment';

interface PendingPayment {
  transactionId: string;
  learner: SchoolLearnerForPayment;
  academicYearId: string;
}

/** What the success dialog is currently showing. */
interface IssuedReceipt {
  receipt: BillingReceipt;
  lines: SchoolReceiptLine[];
  /** Stamps DUPLICATE on the PDF so a re-issue cannot pass as the original. */
  isReprint: boolean;
  /** Captured at payment time; a reprint may have no learner on screen. */
  learner: SchoolLearnerForPayment | null;
  /**
   * Year balance remaining after this payment, captured at payment time.
   * null on a reprint — balances have moved on and back-dating them would
   * print a figure that was never true.
   */
  balanceAfter: number | null;
}

/** Institution branding for the receipt letterhead. */
function useInstitutionBranding(institutionId: string) {
  return useQuery({
    queryKey: ['school-fee-collect', 'branding', institutionId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name, address_line1, address_line2, address_line3, phone, email, website, logo_url')
        .eq('id', institutionId)
        .single();
      if (error) throw new Error(error.message);
      return data as Record<string, string | null>;
    },
    enabled: Boolean(institutionId),
    // Branding changes about never; no reason to refetch it per payment.
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function CollectView() {
  const { userProfile } = usePermissions();
  const searchParams = useSearchParams();
  const {
    institutions,
    institutionId,
    setInstitutionChoice,
    yearOptions,
    academicYearId,
    setYearChoice,
    loadingInstitutions,
    loadingYears,
    ready,
  } = useSchoolYearSelection();

  const [learner, setLearner] = useState<SchoolLearnerForPayment | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedReceipt | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  const payment = useSchoolBillPayment(learner, academicYearId);
  const branding = useInstitutionBranding(institutionId);
  const initiatePayment = useInitiatePayment();

  const yearName =
    yearOptions.find((y) => y.id === academicYearId)?.academic_year_name ?? '';

  const selectLearner = useCallback(
    (next: SchoolLearnerForPayment) => {
      payment.reset();
      setLearner(next);
    },
    [payment],
  );

  const clearLearner = useCallback(() => {
    payment.reset();
    setLearner(null);
  }, [payment]);

  /** Build the receipt payload from the issued receipt, never from live state. */
  const buildReceiptPayload = useCallback(
    async (source: IssuedReceipt): Promise<SchoolReceiptPayload> => {
      const b = branding.data ?? {};
      const logoDataUrl = await fetchLogoDataUrl(b.logo_url as string | undefined);
      const r = source.receipt;

      // Prefer the learner captured with the payment. On a reprint opened from
      // a cold page there may be none, so fall back to the receipt's own embed
      // — that carries name and roll number, though not class or register no.
      const who = source.learner;
      const embedded = r.student;
      const name =
        who
          ? `${who.first_name} ${who.last_name}`.trim()
          : `${embedded?.first_name ?? ''} ${embedded?.last_name ?? ''}`.trim();

      return {
        receiptNumber: r.receipt_number,
        receiptDate: r.receipt_date,
        academicYearName: yearName,
        paymentModeLabel: modeLabel(r.payment_mode),
        referenceNumber: r.payment_reference_number ?? null,
        transactionDate: r.payment_paid_date ?? null,
        dateOfCredit: r.date_of_credit ?? null,
        ddBankName: r.dd_bank_name ?? null,
        ddBranch: r.dd_branch ?? null,
        remitterName: r.remitter_name ?? null,
        amountPaid: Number(r.payment_amount) || 0,
        payerName: r.payer_name ?? null,
        balanceAfter: source.balanceAfter,
        collectedBy: userProfile?.full_name ?? null,
        remarks: r.payment_remarks ?? null,
        isReprint: source.isReprint,
        learner: {
          name,
          rollNumber: who?.roll_number ?? embedded?.roll_number ?? null,
          registerNumber: who?.register_number ?? null,
          className: who?.class_name ?? null,
          sectionName: who?.section_name ?? null,
          fatherName: who?.father_name ?? null,
          mobile: who?.student_mobile ?? null,
        },
        lines: source.lines,
        branding: {
          name: (b.name as string) || 'School',
          addressLines: [b.address_line1, b.address_line2, b.address_line3].filter(
            Boolean,
          ) as string[],
          phone: (b.phone as string) ?? null,
          email: (b.email as string) ?? null,
          website: (b.website as string) ?? null,
          logoDataUrl,
        },
      };
    },
    [branding.data, userProfile, yearName],
  );

  /**
   * `source` is passed explicitly by the auto-download that fires the moment a
   * payment succeeds: at that point setIssued() has been called but the state
   * has not re-rendered yet, so reading `issued` would still see the previous
   * receipt — or null on the first payment of a session.
   */
  const runPdf = useCallback(
    async (action: 'print' | 'download', source?: IssuedReceipt) => {
      const target = source ?? issued;
      if (!target) return;
      setPdfBusy(true);
      try {
        const payload = await buildReceiptPayload(target);
        if (action === 'print') printSchoolReceiptPdf(payload);
        else downloadSchoolReceiptPdf(payload);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not build the receipt PDF');
      } finally {
        setPdfBusy(false);
      }
    },
    [issued, buildReceiptPayload],
  );

  /** Open an already-issued receipt — used by reprint and by gateway resume. */
  const openIssuedReceipt = useCallback(
    async (receiptId: string, opts: { isReprint: boolean; learner: SchoolLearnerForPayment | null }) => {
      const { receipt, lines } = await SchoolBillPaymentService.getReceiptForReprint(receiptId);
      setIssued({
        receipt,
        lines,
        isReprint: opts.isReprint,
        learner: opts.learner,
        balanceAfter: null,
      });
      setSuccessOpen(true);
    },
    [],
  );

  /**
   * Re-issue a receipt straight from the history row.
   *
   * Goes directly to the PDF rather than through the success dialog: the clerk
   * already knows which receipt they clicked, so a confirmation step between
   * them and the file is pure friction. Lines are read back from
   * billing_receipt_items, so this reproduces what was actually charged rather
   * than reconstructing it from today's balances. Creates nothing — the PDF is
   * stamped DUPLICATE.
   */
  const handleReissue = useCallback(
    async (receiptId: string, action: 'print' | 'download') => {
      setReprintingId(receiptId);
      try {
        const { receipt, lines } = await SchoolBillPaymentService.getReceiptForReprint(receiptId);
        await runPdf(action, {
          receipt,
          lines,
          isReprint: true,
          learner,
          // Unknowable after the fact: balances have moved on since.
          balanceAfter: null,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load the receipt');
      } finally {
        setReprintingId(null);
      }
    },
    [runPdf, learner],
  );

  // ── Resume after the gateway ─────────────────────────────────────────────
  // The HDFC callback verifies server-side and lands the payer on
  // /billing/payment/success, NOT here — so the counter picks the thread back
  // up from the marker it parked before redirecting, or from an explicit
  // ?receipt_id= on the URL.
  const resumedRef = useRef(false);

  useEffect(() => {
    if (resumedRef.current) return;

    const receiptIdParam = searchParams.get('receipt_id');
    const rawPending = typeof window === 'undefined' ? null : sessionStorage.getItem(PENDING_KEY);
    if (!receiptIdParam && !rawPending) return;

    resumedRef.current = true;
    setResuming(true);

    (async () => {
      try {
        if (receiptIdParam) {
          await openIssuedReceipt(receiptIdParam, { isReprint: false, learner: null });
          return;
        }

        const pending = JSON.parse(rawPending as string) as PendingPayment;
        // Ask the SERVER what happened. The browser's return is not evidence
        // of payment — only the verified transaction record is.
        const response = await fetch(`/api/billing/payment/status/${pending.transactionId}`);
        if (!response.ok) throw new Error('Could not check the payment status');
        const { data } = await response.json();

        if (data?.status === 'success' && data?.receipt_id) {
          setLearner(pending.learner);
          await openIssuedReceipt(data.receipt_id, {
            isReprint: false,
            learner: pending.learner,
          });
        } else if (data?.status === 'success') {
          toast.success('Payment succeeded. The receipt is still being written — refresh shortly.');
          setLearner(pending.learner);
        } else {
          toast.error(`Online payment did not complete (${data?.status ?? 'unknown'}).`);
          setLearner(pending.learner);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not resume the payment');
      } finally {
        // Clear either way: a marker that survives a check would re-fire on
        // every visit for the rest of the session.
        sessionStorage.removeItem(PENDING_KEY);
        setResuming(false);
      }
    })();
  }, [searchParams, openIssuedReceipt]);

  const handleConfirm = useCallback(async () => {
    // Online is a different transaction entirely: no receipt is written here.
    // The gateway callback verifies server-side and creates the receipt, so
    // the counter's job ends at the redirect.
    if (payment.form.mode === 'online') {
      if (!learner) return;
      try {
        const session = await initiatePayment.mutateAsync({
          student_id: learner.id,
          bill_ids: payment.selectedBills.map((b) => b.id),
          bill_amounts: Object.fromEntries(
            payment.selectedBills.map((b) => [b.id, payment.amounts[b.id] ?? 0]),
          ),
          // NO return_url / cancel_url. Those are handed straight to HDFC as
          // the gateway's return target, REPLACING the default
          // /api/billing/payment/callback — which is what performs the
          // server-side verification and creates the receipt. Setting them
          // here would land the payer back on this page with the payment
          // unverified and no receipt ever written.
        });

        const pending: PendingPayment = {
          transactionId: session.transaction_id,
          learner,
          academicYearId,
        };
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

        setConfirmOpen(false);
        window.location.href = session.payment_url;
      } catch {
        // useInitiatePayment already toasts the failure.
      }
      return;
    }

    // Snapshot BEFORE the write: the bills list refetches to zero balances
    // straight after, and the receipt must print what was actually collected.
    const lines: SchoolReceiptLine[] = payment.selectedBills.map((bill) => ({
      category: bill.category_name || bill.bill_description || 'Fee',
      termLabel: bill.term_number ? `Term ${bill.term_number}` : null,
      billReference: bill.id.slice(0, 8).toUpperCase(),
      dueDate: bill.due_date,
      amount: payment.amounts[bill.id] ?? 0,
    }));
    // Whole-year outstanding minus what is being collected now. Read before
    // the write, for the same reason as `lines`.
    const balanceAfter = Math.max(
      payment.summary.yearOutstanding - payment.summary.payingNow,
      0,
    );

    try {
      const receipt = await payment.pay();
      const next: IssuedReceipt = { receipt, lines, isReprint: false, learner, balanceAfter };
      setIssued(next);
      setConfirmOpen(false);
      setSuccessOpen(true);

      // Hand the clerk the PDF without a second click — the receipt has to be
      // printed for the payer either way, so making them ask for it is pure
      // friction. Deliberately NOT awaited: a failed PDF must not make a
      // recorded payment look like it failed. The dialog's own Print and
      // Download buttons remain as the retry.
      void runPdf('download', next);
    } catch {
      // useSchoolBillPayment already toasts the failure; keep the dialog open
      // so the operator can correct and retry without re-entering everything.
    }
  }, [payment, learner, initiatePayment, academicYearId, runPdf]);

  const startNewPayment = useCallback(() => {
    setSuccessOpen(false);
    setIssued(null);
    clearLearner();
  }, [clearLearner]);

  const canSubmit = payment.validation.ok && !payment.submitting && !initiatePayment.isPending;

  const historyRows = useMemo(() => payment.history, [payment.history]);

  return (
    <div className="space-y-4">
      <SchoolYearPicker
        title="Collect for"
        institutions={institutions}
        institutionId={institutionId}
        onInstitutionChange={(id) => {
          setInstitutionChoice(id);
          clearLearner();
        }}
        yearOptions={yearOptions}
        academicYearId={academicYearId}
        onYearChange={(id) => {
          setYearChoice(id);
          clearLearner();
        }}
        loadingInstitutions={loadingInstitutions}
        loadingYears={loadingYears}
      />

      {resuming ? (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Checking the online payment</AlertTitle>
          <AlertDescription>
            Confirming the result with the gateway before showing a receipt.
          </AlertDescription>
        </Alert>
      ) : null}

      {!ready ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Choose a school and academic year</AlertTitle>
          <AlertDescription>
            Payments are recorded against the bills raised for that school and year.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Find learner</CardTitle>
            </CardHeader>
            <CardContent>
              <LearnerSearch
                institutionId={institutionId}
                academicYearId={academicYearId}
                onSelect={selectLearner}
              />
            </CardContent>
          </Card>

          {learner ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              {/* ── Left: learner + bills ─────────────────────────────── */}
              <div className="space-y-4 min-w-0">
                <LearnerCard
                  learner={learner}
                  academicYearName={yearName}
                  onClear={clearLearner}
                />

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        <ReceiptIndianRupee className="h-3.5 w-3.5" />
                      </span>
                      Outstanding bills
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {yearName}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OutstandingBills
                      bills={payment.bills}
                      loading={payment.loadingBills}
                      error={payment.billsError}
                      selected={payment.selected}
                      amounts={payment.amounts}
                      onToggle={payment.toggleBill}
                      onToggleAll={payment.selectAll}
                      onAmountChange={payment.setBillAmount}
                      disabled={payment.submitting}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <History className="h-3.5 w-3.5" />
                      </span>
                      Payment history
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {yearName}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {payment.loadingHistory ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : payment.historyError ? (
                      <Alert variant="destructive">
                        <AlertTitle>Could not load payment history</AlertTitle>
                        <AlertDescription>
                          {payment.historyError} — past receipts may exist but cannot be listed
                          right now.
                        </AlertDescription>
                      </Alert>
                    ) : historyRows.length === 0 ? (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>No payments yet</AlertTitle>
                        <AlertDescription>
                          Nothing has been collected from this learner for {yearName}. Receipts
                          appear here once a payment is recorded, and can be re-downloaded any
                          time.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          {/* Emerald = money RECEIVED, against the amber
                              "owed" table above. See the note there. */}
                          <TableHeader className="bg-emerald-50 dark:bg-emerald-950/30 [&_th]:text-emerald-900 dark:[&_th]:text-emerald-200 [&_th]:font-semibold">
                            <TableRow className="hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                              <TableHead className="min-w-[150px]">Receipt No</TableHead>
                              <TableHead className="w-[120px]">Date</TableHead>
                              <TableHead className="w-[110px]">Mode</TableHead>
                              <TableHead className="min-w-[130px]">Reference</TableHead>
                              <TableHead className="text-right w-[120px]">Amount</TableHead>
                              <TableHead className="w-[150px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {historyRows.map((row) => (
                              <TableRow key={row.receipt_id}>
                                <TableCell className="font-mono text-xs">
                                  {row.receipt_number}
                                </TableCell>
                                <TableCell>
                                  {row.receipt_date
                                    ? new Date(row.receipt_date).toLocaleDateString('en-IN')
                                    : '—'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{modeLabel(row.payment_mode)}</Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {row.payment_reference_number || '—'}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {money(row.amount_allocated)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Download this receipt as a PDF"
                                      onClick={() => handleReissue(row.receipt_id, 'download')}
                                      disabled={reprintingId === row.receipt_id}
                                    >
                                      {reprintingId === row.receipt_id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Download className="h-4 w-4" />
                                      )}
                                      <span className="ml-1">PDF</span>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Print this receipt"
                                      onClick={() => handleReissue(row.receipt_id, 'print')}
                                      disabled={reprintingId === row.receipt_id}
                                    >
                                      <Printer className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── Right: summary + mode ─────────────────────────────── */}
              <div className="min-w-0">
                <PaymentPanel
                  form={payment.form}
                  setForm={payment.setForm}
                  summary={payment.summary}
                  errors={payment.validation.errors}
                  canSubmit={canSubmit}
                  submitting={payment.submitting || initiatePayment.isPending}
                  onSubmit={() => setConfirmOpen(true)}
                />
              </div>
            </div>
          ) : null}
        </>
      )}

      <ConfirmPaymentDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        learner={learner}
        bills={payment.selectedBills}
        amounts={payment.amounts}
        total={payment.summary.payingNow}
        modeLabel={modeLabel(payment.form.mode)}
        referenceNumber={payment.form.referenceNumber || null}
        submitting={payment.submitting || initiatePayment.isPending}
        onConfirm={handleConfirm}
      />

      <PaymentSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        receiptNumber={issued?.receipt.receipt_number ?? ''}
        amount={Number(issued?.receipt.payment_amount) || 0}
        modeLabel={modeLabel(issued?.receipt.payment_mode ?? '')}
        learnerName={
          issued?.learner
            ? `${issued.learner.first_name} ${issued.learner.last_name}`.trim()
            : `${issued?.receipt.student?.first_name ?? ''} ${issued?.receipt.student?.last_name ?? ''}`.trim()
        }
        isReprint={issued?.isReprint ?? false}
        generatingPdf={pdfBusy}
        onPrint={() => runPdf('print')}
        onDownload={() => runPdf('download')}
        onNewPayment={startNewPayment}
      />
    </div>
  );
}
