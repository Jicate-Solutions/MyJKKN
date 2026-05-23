'use client';

// ============================================================================
// AccountVerificationDialog
// ----------------------------------------------------------------------------
// The pre-account verification gate. Opens from enquiry-status-update.tsx
// when an admin clicks "Move to Account". The dialog is preview-only — the
// admin REVIEWS the dimensions + fee structure, then either:
//   • Confirms → atomic RPC: persists fee_items, flips lifecycle to 'account',
//                generates bills, stamps account_verified_* audit columns,
//                writes the activity log row.
//   • Cancels → closes the modal; admin goes back to edit the enquiry if
//                anything looks wrong.
//
// Confirm is enabled when:
//   • A fee structure has matched for the learner's current dims
//   • No pending admission_fee_change_events row exists
//   • Not currently submitting
//
// 2026-05-21 v3 — Removed per-row "Verified" checkboxes per product call.
// Preview is enough; the admin's responsibility is to read carefully, not
// click 8 boxes. Layout polished with gradients, responsive sizing, and a
// colour-coded fee summary card.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Loader2,
  Landmark,
  UserCircle2,
  Receipt,
  StickyNote,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';

import { AcademicDimensionsSummary } from './academic-dimensions-summary';
import { FeeStructureReadonlyPanel } from '../form-sections/_fee/fee-structure-readonly-panel';

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

  const confirmEnabled =
    matchedStructure !== null && !hasPendingFeeChange && !submitting;

  const subtotal = matchedStructure?.items.reduce(
    (sum, it) => sum + Number(it.amount),
    0,
  ) ?? 0;

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
      const msg = getErrorMessage(err);
      toast.error(msg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100vw-2rem)]
          max-w-4xl
          max-h-[92vh]
          overflow-y-auto
          p-0
          gap-0
          sm:rounded-xl
        "
      >
        {/* Gradient header strip */}
        <div className="rounded-t-xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-5 py-4 text-white">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <Landmark className="h-5 w-5 sm:h-6 sm:w-6" />
              Verify & Move to Account
            </DialogTitle>
            <DialogDescription className="text-sm text-white/90">
              Review the academic dimensions and fee structure below. Click
              <strong className="text-white"> Confirm </strong>
              to flip the lifecycle to <em>Account</em> and generate the
              bills. Cancel to go back and edit if anything looks off.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Student identity card */}
          <div className="flex items-center gap-3 rounded-lg border bg-gradient-to-r from-slate-50 to-slate-100 px-4 py-3 shadow-sm dark:from-slate-900 dark:to-slate-800">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow">
              <UserCircle2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Student
              </p>
              <p className="truncate text-base font-bold">{fullName || 'Unnamed Learner'}</p>
              {learner.application_id && (
                <p className="text-xs text-muted-foreground">
                  Application ID: <span className="font-mono">{learner.application_id}</span>
                </p>
              )}
            </div>
          </div>

          {/* Pending fee-change-event guard */}
          {hasPendingFeeChange && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Pending fee-change event blocks confirmation</AlertTitle>
              <AlertDescription>
                This learner has an unresolved fee-change event awaiting
                approval. Resolve the pending event in the admission fees
                reconciliation queue before transitioning to Account.
              </AlertDescription>
            </Alert>
          )}

          {/* Structure changed since open */}
          {structureChangedSinceOpen && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fee structure changed since you opened this dialog</AlertTitle>
              <AlertDescription>
                The matrix configuration was updated while this dialog was
                open. The preview below reflects the new values — please
                re-read carefully, then click Confirm again.
              </AlertDescription>
            </Alert>
          )}

          {/* Academic Dimensions */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-1 w-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
              <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
                Academic Dimensions
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Read each card. If any value is wrong, click <em>Cancel</em>
              and edit the enquiry before returning here.
            </p>
            <AcademicDimensionsSummary learner={learner} />
          </section>

          {/* Fee Structure */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-1 w-6 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" />
              <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
                Fee Structure to be Committed
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              These line items will be persisted on the learner and a bill
              row created for each on confirmation.
            </p>

            {/* Use the existing read-only matrix panel — it already does
                the fetch, renders the line-item table, and handles the
                "no match" empty state. We just wrap it in our own card. */}
            <div className="rounded-lg border bg-card shadow-sm">
              <FeeStructureReadonlyPanel
                dims={dims}
                onMatchChange={handleMatchChange}
              />
              {matchedStructure && (
                <div className="flex items-center justify-between border-t bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 dark:from-emerald-950/40 dark:to-teal-950/40">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    <Receipt className="h-4 w-4" />
                    Bills to be generated: {matchedStructure.items.length}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Total
                    </p>
                    <p className="text-lg font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
                      ₹{subtotal.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {!matchedStructure && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No fee structure configured</AlertTitle>
                <AlertDescription>
                  The matrix has no row for this learner's exact dimension
                  combination. Ask an admin to create the configuration at
                  <span className="font-mono"> /admission/settings/fees-structure </span>
                  before confirming.
                </AlertDescription>
              </Alert>
            )}
          </section>

          {/* Notes */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-1 w-6 rounded-full bg-gradient-to-r from-slate-400 to-slate-500" />
              <Label htmlFor="account-verify-notes" className="text-sm font-bold uppercase tracking-wide">
                <StickyNote className="mr-1 inline h-4 w-4" />
                Notes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
              </Label>
            </div>
            <Textarea
              id="account-verify-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context for this transition (e.g. 'Confirmed dims with parent over phone')…"
              rows={3}
              disabled={submitting}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Stored on the activity timeline alongside the verification record.
            </p>
          </section>
        </div>

        <DialogFooter className="border-t bg-muted/40 px-5 py-3 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Cancel — needs correction
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!confirmEnabled}
            className="
              w-full sm:w-auto
              bg-gradient-to-r from-amber-600 to-orange-600
              text-white shadow-md
              hover:from-amber-700 hover:to-orange-700
              disabled:from-muted disabled:to-muted disabled:text-muted-foreground
            "
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating bills…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm — Move to Account & Generate Bills
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
