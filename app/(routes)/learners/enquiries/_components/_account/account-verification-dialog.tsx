'use client';

// ============================================================================
// AccountVerificationDialog
// ----------------------------------------------------------------------------
// The pre-account verification gate. Opens from enquiry-status-update.tsx
// when an admin clicks "Move to Account".
//
// TWO STEPS (2026-08-21). It used to be one screen ending in Confirm. The
// admission team asked to separate the two questions they are actually being
// asked, because they are answered by different people looking for different
// things:
//
//   Step 1 — Is the learner's data right?  Identity, entered details, and the
//            eight academic dimensions that select the fee structure. Getting
//            a dimension wrong here silently selects the WRONG fees.
//   Step 2 — Are the money and the dates right?  The exact bills that will be
//            raised: every instalment, its share, its real due date, and the
//            lifecycle status settling it promotes to. Read from
//            admission_preview_account_bills, which runs the same engine as
//            generation — so this cannot promise what generation will not do.
//
// Only step 2 has a Confirm. Step 1 has Continue, which is not a commitment.
//
// The dialog is preview-only — the admin REVIEWS, then either:
//   • Confirms → atomic RPC: persists fee_items, flips lifecycle to 'account',
//                generates bills, stamps account_verified_* audit columns,
//                writes the activity log row.
//   • Cancels → closes the modal; admin goes back to edit the enquiry if
//                anything looks wrong.
//
// Confirm is enabled when:
//   • A fee structure has matched for the learner's current dims
//   • No pending admission_fee_change_events row exists
//   • The preview resolved AT LEAST ONE billable row — the RPC refuses to move
//     a learner to Account with no bills and rolls the status back, so a
//     Confirm that could only fail must not be clickable
//   • Not currently submitting
//
// 2026-05-21 v3 — Removed per-row "Verified" checkboxes per product call.
// Preview is enough; the admin's responsibility is to read carefully, not
// click 8 boxes.
//
// 2026-08-21 layout — rebuilt as a DOCUMENT, not a card stack. Numbered
// sections with rule lines, label/value rows, one calm slate masthead. The
// previous amber→orange→rose gradient chrome and per-section gradient bars
// were competing with the figures they framed; on a verification surface the
// data has to be the loudest thing on screen. Palette is slate + a single blue
// accent, chosen for a dense back-office document rather than a promo panel.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Landmark,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';

import { AcademicDimensionsSummary } from './academic-dimensions-summary';
import { FeeStructureReadonlyPanel } from '../form-sections/_fee/fee-structure-readonly-panel';
import { AccountBillPreview, useAccountBillPreview } from './account-bill-preview';

import { AccountTransitionService } from '@/lib/services/admission/account-transition-service';
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
import { getErrorMessage } from '@/lib/utils';
import { useActivityMutations } from '@/hooks/admission/use-activities';
import { useAuth } from '@/hooks/use-auth';

import type { LearnerProfile } from '@/types/learner-profile';
import type {
  AdmissionFeeStructureWithItems,
  FeeStructureMatrixDimensions,
} from '@/types/admission';

interface Props {
  learner: LearnerProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function dimsFromLearner(learner: LearnerProfile): Partial<FeeStructureMatrixDimensions> {
  return {
    institution_id:        learner.institution_id ?? undefined,
    degree_id:             learner.degree_id ?? undefined,
    department_id:         learner.department_id ?? undefined,
    programme_id:          (learner as { program_id?: string }).program_id ?? undefined,
    quota_id:              (learner as { quota_id?: string }).quota_id ?? undefined,
    community_category_id: (learner as { community_category_id?: string }).community_category_id ?? undefined,
    accommodation_type_id: (learner as { accommodation_type_id?: string }).accommodation_type_id ?? undefined,
    admission_year_id:     learner.admission_year_id ?? undefined,
    gender:                (learner as { gender?: string }).gender?.toUpperCase() || undefined,
  };
}

/**
 * Translate the raw `admission_account_transition_with_bills` RPC error codes
 * into plain-English, actionable messages.
 *
 * The RPC raises exceptions like
 *   "invalid_status_for_account_transition: current=reserved, allowed=…"
 *   "fee_structure_not_resolvable: no matching matrix combo"
 * which Supabase surfaces verbatim on `error.message`. Staff filing
 * "won't move to account" tickets were seeing these raw codes as a toast and
 * (understandably) reading them as an unexplained failure. Per the repo rule
 * that gate failures must be EXPLICIT and human-readable, we map each known
 * signature to a clear next step.
 *
 * Returns `null` when nothing matches, so the caller can fall back to the raw
 * message at the DEFAULT toast duration — mapped messages are long and get the
 * extended duration instead.
 *
 * Concrete cases this addresses (auto-triage BUG-004352 / BUG-004394):
 *   • `no_bills_generated` — the RPC refuses to leave a learner in 'account'
 *     with no bills and rolls the status back with it, so the learner did NOT
 *     move. Without this the admin reads a raw `no_bills_generated:` and cannot
 *     tell whether the learner moved.
 *   • `invalid_status_for_account_transition` — the application is ALREADY at
 *     a later lifecycle stage (Reserved / Admitted). The transition already
 *     happened; the RPC correctly refuses to move it backward.
 *   • `fee_structure_not_resolvable` / `fee_items_empty` — no fee structure is
 *     configured for the learner's exact programme (defensive: the dialog also
 *     disables Confirm up-front when no structure matches).
 */
function friendlyTransitionError(err: unknown): string | null {
  const raw = getErrorMessage(err);
  const m = raw.toLowerCase();

  if (m.includes('no_bills_generated')) {
    return 'No bills could be generated, so the learner has NOT been moved to Account. Check the fee structure has at least one billable item above zero.';
  }
  if (m.includes('invalid_status_for_account_transition')) {
    return 'This application is already at a later stage (e.g. Reserved or Admitted) — it has already been moved to Account. No further action is needed.';
  }
  if (
    m.includes('fee_structure_not_resolvable') ||
    m.includes('fee_items_empty') ||
    m.includes('no matching matrix combo')
  ) {
    return 'No fee structure matches this learner’s dimensions — nothing was changed. Configure one under Admission → Settings → Fee Structures.';
  }
  if (m.includes('pending_fee_change_event')) {
    return 'A fee-change event is pending review for this learner. Resolve it in the admission fees reconciliation queue before moving to Account.';
  }
  if (m.includes('required_documents_missing')) {
    const list = raw.split(':').slice(1).join(':').trim();
    return list
      ? `Cannot move to Account — required documents are missing: ${list}.`
      : 'Cannot move to Account — some required documents are missing.';
  }
  if (m.includes('permission_denied') || m.includes('admission_documents.manage')) {
    return 'You don’t have permission to move applications to Account (this needs the “Manage Admission Documents” permission). Please contact your administrator.';
  }
  if (m.includes('learner_not_found')) {
    return 'This learner record could not be found. Refresh the page and try again.';
  }
  return null;
}

export function AccountVerificationDialog({
  learner,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const [leadId, setLeadId] = useState<string | null>(null);
  const { createActivity } = useActivityMutations(leadId ?? undefined);

  const [matchedStructure, setMatchedStructure] =
    useState<AdmissionFeeStructureWithItems | null>(null);
  const [notes, setNotes] = useState('');
  // 1 = review the learner's data, 2 = review the money. Confirm lives only on 2.
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [hasPendingFeeChange, setHasPendingFeeChange] = useState(false);
  const [structureChangedSinceOpen, setStructureChangedSinceOpen] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );

  const structureSnapshotIdRef = useRef<string | null>(null);
  const structureSnapshotItemsHashRef = useRef<string | null>(null);

  const dims = useMemo(() => dimsFromLearner(learner), [learner]);

  const fullName = `${learner.first_name} ${learner.last_name || ''}`.trim();

  useEffect(() => {
    if (open) {
      setMatchedStructure(null);
      setNotes('');
      setStep(1);
      setSubmitting(false);
      submittingRef.current = false;
      setHasPendingFeeChange(false);
      setStructureChangedSinceOpen(false);
      structureSnapshotIdRef.current = null;
      structureSnapshotItemsHashRef.current = null;
      setIdempotencyKey(
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      );
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { createClientSupabaseClient } = await import('@/lib/supabase/client');
        const supabase = createClientSupabaseClient();
        const { data } = await (supabase as any)
          .from('admission_leads')
          .select('id')
          .eq('learner_profile_id', learner.id)
          .maybeSingle();
        if (!cancelled) setLeadId(data?.id ?? null);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, learner.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    FeeChangeEventService.hasPendingForLearner(learner.id)
      .then((pending) => {
        if (!cancelled) setHasPendingFeeChange(pending);
      })
      .catch(() => {
        if (!cancelled) setHasPendingFeeChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, learner.id]);

  const handleMatchChange = useCallback(
    (m: AdmissionFeeStructureWithItems | null) => {
      setMatchedStructure(m);
      if (m && structureSnapshotIdRef.current === null) {
        structureSnapshotIdRef.current = m.id;
        structureSnapshotItemsHashRef.current = JSON.stringify(
          m.items.map((it) => ({ c: it.billing_category_id, a: it.amount })),
        );
      }
    },
    [],
  );

  // Fetched when (and only when) the admin reaches step 2, so opening the
  // dialog to glance at dimensions does not run a bill computation.
  const preview = useAccountBillPreview(learner.id, open && step === 2);

  // Step 1 -> 2 is gated only on things knowable on step 1. It deliberately
  // does NOT require matchedStructure: the panel that resolves it lives on
  // step 2, so requiring it here would leave Continue permanently disabled —
  // and conceptually, "the learner's data looks right" is answerable without
  // knowing which fee structure it selects. A missing structure is step 2's
  // problem and step 2 says so, in place, with the reason.
  const canContinue = !hasPendingFeeChange && !submitting;

  // Confirm additionally requires a matched structure AND a preview that
  // actually produced billable rows. The RPC now REFUSES to move a learner to
  // Account with no bills and rolls the status back, so a Confirm that could
  // only fail must not be clickable — the admin should see why here, not in a
  // toast after the fact.
  const confirmEnabled =
    canContinue &&
    matchedStructure !== null &&
    !preview.loading &&
    preview.error === null &&
    preview.billableCount > 0;

  // (No `subtotal` here any more. It summed the structure's ITEM amounts, which
  // stopped being the payable total once a fee could split — the billing
  // schedule's own totals band computes it from the engine's rows instead.)

  const handleConfirm = async () => {
    if (submittingRef.current || !confirmEnabled || !matchedStructure) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const currentHash = JSON.stringify(
        matchedStructure.items.map((it) => ({ c: it.billing_category_id, a: it.amount })),
      );
      if (
        structureSnapshotIdRef.current !== matchedStructure.id ||
        structureSnapshotItemsHashRef.current !== currentHash
      ) {
        setStructureChangedSinceOpen(true);
        structureSnapshotIdRef.current = matchedStructure.id;
        structureSnapshotItemsHashRef.current = currentHash;
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }

      await AccountTransitionService.transitionToAccount({
        learner_id: learner.id,
        required_documents: [],
        received_documents: [],
        ...({ idempotency_key: idempotencyKey, notes: notes || undefined } as any),
      });

      if (leadId) {
        try {
          const performerName =
            (profile as { full_name?: string } | null | undefined)?.full_name ??
            profile?.email ??
            'Unknown user';
          const performerEmail = profile?.email ?? '—';
          const lines = [
            `Verified by: ${performerName}`,
            `Email: ${performerEmail}`,
            `Fee structure: ${matchedStructure.name}`,
            `Bills generated: ${matchedStructure.items.length} line items`,
          ];
          if (notes.trim()) lines.push(`Notes: ${notes.trim()}`);
          await createActivity.mutateAsync({
            lead_id: leadId,
            activity_type: 'moved_to_account_verified',
            title: 'Moved to Account (verified)',
            description: lines.join(' · '),
          });
        } catch (logErr) {
          console.warn('[account-verification-dialog] activity log failed:', logErr);
        }
      }

      toast.success('Moved to Account — bills generated');
      onSuccess?.();
      onOpenChange(false);
      setTimeout(() => router.refresh(), 300);
    } catch (err) {
      console.error('[account-verification-dialog] transition failed:', err);
      // Mapped messages are long and explanatory — keep them on screen longer.
      // An unrecognised error falls through to the raw text at the default
      // duration, exactly as before.
      const friendly = friendlyTransitionError(err);
      if (friendly) {
        toast.error(friendly, { duration: 9000 });
      } else {
        toast.error(getErrorMessage(err));
      }
      // Stay on step 2 rather than closing: the admin needs to see the preview
      // that explains the failure, and closing would hide it.
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl
          flex-col gap-0 overflow-hidden p-0 sm:rounded-lg
        "
      >
        {/* ── Document masthead ────────────────────────────────────────
            Calm slate, not a gradient. This is an audit surface: chrome
            that competes with the data it frames is chrome that makes the
            data harder to check. Fixed (not scrolled) so the learner's name
            and the step never leave the screen while reading a long form. */}
        <div className="shrink-0 border-b bg-slate-50 px-6 py-4 dark:bg-slate-900/60">
          <DialogHeader className="space-y-0 text-left">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Admission · Account Transition
                </p>
                <DialogTitle className="mt-0.5 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
                  <Landmark className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  Verification Form
                </DialogTitle>
              </div>

              {/* Identity block, right-aligned like the reference box on a
                  printed application. */}
              <div className="min-w-0 text-left sm:text-right">
                <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">
                  {fullName || 'Unnamed Learner'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {learner.application_id ? (
                    <>
                      Application No.{' '}
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                        {learner.application_id}
                      </span>
                    </>
                  ) : (
                    'No application number'
                  )}
                </p>
              </div>
            </div>

            {/* Step rail — numbered, labelled, and stateful. A bare progress
                bar tells you how far along you are but not what either step
                is for, which is the thing an admin needs before clicking. */}
            <nav aria-label="Verification steps" className="mt-4">
              <ol className="flex items-stretch gap-2">
                {[
                  { n: 1, label: 'Learner details', hint: 'Check the data' },
                  { n: 2, label: 'Fees & schedule', hint: 'Check the money' },
                ].map((s) => {
                  const active = step === s.n;
                  const done = step > s.n;
                  return (
                    <li key={s.n} className="min-w-0 flex-1">
                      <div
                        aria-current={active ? 'step' : undefined}
                        className={[
                          'flex items-center gap-2.5 rounded-md border px-3 py-2 transition-colors',
                          active
                            ? 'border-blue-600 bg-white shadow-sm dark:bg-slate-950'
                            : 'border-transparent bg-slate-100/70 dark:bg-slate-800/50',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                            done
                              ? 'bg-blue-600 text-white'
                              : active
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
                          ].join(' ')}
                        >
                          {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : s.n}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={[
                              'block truncate text-sm font-semibold leading-tight',
                              active
                                ? 'text-slate-900 dark:text-slate-50'
                                : 'text-slate-500 dark:text-slate-400',
                            ].join(' ')}
                          >
                            {s.label}
                          </span>
                          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {s.hint}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <DialogDescription className="sr-only">
              {step === 1
                ? 'Step 1 of 2. Check the learner details and academic dimensions.'
                : 'Step 2 of 2. Check the fees and billing schedule, then confirm.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* ── The form sheet ─────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-5 dark:bg-transparent">
          <div className="space-y-6">
            {/* Blocking conditions come first: an admin should not read two
                screens of detail before learning they cannot proceed. */}
            {hasPendingFeeChange && (
              <Alert variant="destructive" role="alert">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>A pending fee-change event blocks this transition</AlertTitle>
                <AlertDescription>
                  Resolve the event in the admission fees reconciliation queue
                  before moving this learner to Account.
                </AlertDescription>
              </Alert>
            )}

            {structureChangedSinceOpen && (
              <Alert
                role="alert"
                className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>The fee structure changed while this was open</AlertTitle>
                <AlertDescription>
                  Someone edited the matrix. The figures below are the new ones —
                  re-read them, then confirm again.
                </AlertDescription>
              </Alert>
            )}

            {/* ══ STEP 1 ══════════════════════════════════════════════ */}
            {step === 1 && (
              <>
                <FormSection
                  n={1}
                  title="Learner Particulars"
                  hint="As entered on the enquiry. Correct any mistake before continuing."
                >
                  <EnteredDetails learner={learner} />
                </FormSection>

                <FormSection
                  n={2}
                  title="Academic Dimensions"
                  hint="These eight values select the fee structure. A wrong one silently selects the wrong fees."
                >
                  <AcademicDimensionsSummary learner={learner} />
                </FormSection>
              </>
            )}

            {/* ══ STEP 2 ══════════════════════════════════════════════ */}
            {step === 2 && (
              <>
                <FormSection
                  n={3}
                  title="Fee Structure Applied"
                  hint="Matched from the learner's dimensions. These are the configured amounts."
                >
                  <div className="overflow-hidden rounded-md border">
                    <FeeStructureReadonlyPanel dims={dims} onMatchChange={handleMatchChange} />
                  </div>

                  {!matchedStructure && (
                    <Alert
                      role="alert"
                      className="mt-3 border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      <AlertTitle>No fee structure configured</AlertTitle>
                      <AlertDescription>
                        The matrix has no row for this learner&apos;s exact
                        dimension combination. Ask an admin to create it under
                        Admission → Settings → Fee Structures before confirming.
                      </AlertDescription>
                    </Alert>
                  )}
                </FormSection>

                <FormSection
                  n={4}
                  title="Billing Schedule"
                  hint="Exactly what will be raised — one row per instalment, with its real due date."
                >
                  <AccountBillPreview state={preview} />
                </FormSection>

                <FormSection n={5} title="Verification Note" hint="Optional. Kept on the activity timeline.">
                  <Label htmlFor="account-verify-notes" className="sr-only">
                    Verification note
                  </Label>
                  <Textarea
                    id="account-verify-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Confirmed programme and quota with the parent by phone."
                    rows={2}
                    disabled={submitting}
                    className="resize-none"
                  />
                </FormSection>
              </>
            )}
          </div>
        </div>

        {/* ── Action bar ─────────────────────────────────────────────
            Fixed, so the primary action is reachable without scrolling to
            the bottom of a long form. */}
        <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-slate-50 px-6 py-3 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between">
          <p className="order-2 text-xs text-muted-foreground sm:order-1">
            {step === 1
              ? 'Nothing is saved on this step.'
              : preview.billableCount > 0
                ? `Confirming raises ${preview.billableCount} bill${preview.billableCount === 1 ? '' : 's'}${
                    preview.instalmentCount > preview.billableCount
                      ? ` (${preview.instalmentCount} instalments)`
                      : ''
                  } and moves the learner to Account.`
                : 'Confirming is blocked until at least one bill can be raised.'}
          </p>

          <div className="order-1 flex w-full flex-col gap-2 sm:order-2 sm:w-auto sm:flex-row">
            {step === 1 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!canContinue}
                  className="w-full sm:w-auto"
                >
                  Continue to fees
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={!confirmEnabled}
                  title={
                    preview.billableCount === 0 && !preview.loading
                      ? 'No bills would be generated, so the transition would be rejected.'
                      : undefined
                  }
                  className="w-full sm:w-auto"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Generating bills…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Confirm &amp; move to Account
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A numbered section of the verification form.
 *
 * The numbering is the point: it turns a scrolling modal into a document with
 * a table of contents an admin can hold in their head ("I'm on 4 of 5"), and
 * it gives every section a stable name to refer to out loud. The rule line
 * after the heading is what makes it read as a form rather than a stack of
 * cards — cards would add three borders and two shadows between the reader and
 * every value.
 */
function FormSection({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-900 text-[11px] font-bold text-white dark:bg-slate-100 dark:text-slate-900">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          {hint && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
          )}
        </div>
      </div>
      <div className="border-t pt-3">{children}</div>
    </section>
  );
}

/**
 * Step 1's "everything that was entered" panel, laid out as an application
 * form: label on the left, value on the right, one ruled row each.
 *
 * A MISSING value matters as much as a wrong one, so blanks render as a
 * visible "Not provided" in muted text and are counted in the section header —
 * never omitted, which would let a hole pass as absence of a field.
 */
function EnteredDetails({ learner }: { learner: LearnerProfile }) {
  const l = learner as unknown as Record<string, unknown>;
  const val = (k: string) => {
    const v = l[k];
    return v === null || v === undefined || v === '' ? null : String(v);
  };

  const groups: Array<{ title: string; fields: Array<[string, string | null]> }> = [
    {
      title: 'Personal',
      fields: [
        ['Full name', [val('first_name'), val('last_name')].filter(Boolean).join(' ') || null],
        ['Date of birth', val('date_of_birth')],
        ['Gender', val('gender')],
        ['Religion', val('religion')],
        ['Blood group', val('blood_group')],
        ['Entry type', val('entry_type')],
      ],
    },
    {
      title: 'Contact & Guardians',
      fields: [
        ['Mobile', val('student_mobile')],
        ['Email', val('student_email')],
        ['Father', val('father_name')],
        ['Father mobile', val('father_mobile')],
        ['Mother', val('mother_name')],
        ['Mother mobile', val('mother_mobile')],
      ],
    },
    {
      title: 'Schooling & Address',
      fields: [
        ['Last school', val('last_school')],
        ['Board of study', val('board_of_study')],
        ['Street', val('permanent_address_street')],
        ['District', val('permanent_address_district')],
        ['State', val('permanent_address_state')],
        ['PIN code', val('permanent_address_pin_code')],
      ],
    },
  ];

  const missing = groups.flatMap((g) => g.fields).filter(([, v]) => !v).length;

  return (
    <div className="space-y-4">
      {missing > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {missing} field{missing === 1 ? '' : 's'} not filled in. That does not
          block the transition — check whether any of them matter.
        </p>
      )}

      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title} className="min-w-0">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {g.title}
            </p>
            <dl className="divide-y">
              {g.fields.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-3 py-1.5"
                >
                  <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                  <dd
                    className={
                      value
                        ? 'min-w-0 truncate text-right text-sm font-medium text-slate-900 dark:text-slate-100'
                        : 'min-w-0 truncate text-right text-xs italic text-muted-foreground'
                    }
                    title={value ?? undefined}
                  >
                    {value ?? 'Not provided'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
