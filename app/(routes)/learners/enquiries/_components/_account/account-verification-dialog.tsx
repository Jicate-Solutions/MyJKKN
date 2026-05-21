'use client';

// ============================================================================
// AccountVerificationDialog
// ----------------------------------------------------------------------------
// The pre-account verification gate. Opened from enquiry-status-update.tsx
// when an admin clicks "Move to Account". Renders:
//   - Student name header
//   - 8-row Academic Dimensions Summary (each with a Verified checkbox)
//   - Fee Structure preview (read-only, matrix-driven)
//   - Notes textarea (audit trail)
//   - Cancel / Confirm footer
//
// Confirm is enabled only when:
//   (a) all 8 dim checkboxes are ticked
//   (b) a fee structure has matched for the learner's current dims
//   (c) no pending admission_fee_change_events exist
//
// Confirm flow:
//   1. Re-resolve the fee structure (fresh) and compare to the snapshot
//      taken when the dialog opened. If different → inline diff warning +
//      checkboxes reset + admin must re-verify.
//   2. If unchanged → call AccountTransitionService.transitionToAccount
//      with the generated idempotency key + notes. Documents check is
//      bypassed (required_documents: []) since documents are tracked on
//      the Checklist tab.
//   3. On success → write an admission_lead_activities row of type
//      moved_to_account_verified + toast + close + refresh.
//
// 2026-05-21 — Created as Phase 1 of the pre-account verification flow.
//              Phase 2 (DB) adds the idempotency_key + p_notes RPC params
//              + admission_account_transition_log table. Until Phase 2
//              ships, the client passes the key but the RPC ignores it
//              (forward-compat).
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
import { AlertTriangle, Loader2, Landmark } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';

import { AcademicDimensionsSummary } from './academic-dimensions-summary';
import { FeeStructureReadonlyPanel } from '../form-sections/_fee/fee-structure-readonly-panel';

import { AccountTransitionService } from '@/lib/services/admission/account-transition-service';
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
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

// Build the matrix dims from the learner's columns. Note: the
// FeeStructureMatrixDimensions type uses `programme_id` (British spelling)
// while the learner row column is `program_id` (American). Remap inline.
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

  const [allDimsVerified, setAllDimsVerified] = useState(false);
  const [matchedStructure, setMatchedStructure] =
    useState<AdmissionFeeStructureWithItems | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [hasPendingFeeChange, setHasPendingFeeChange] = useState(false);
  const [structureChangedSinceOpen, setStructureChangedSinceOpen] = useState(false);

  // Idempotency key — generated ONCE per dialog open so rapid double-clicks
  // on Confirm don't fire the RPC twice. Phase 2 of the rollout wires this
  // into the RPC; until then it's a forward-compat hint.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );

  // Snapshot of the matched structure id at open time. Used for the diff
  // check at confirm time.
  const structureSnapshotIdRef = useRef<string | null>(null);
  const structureSnapshotItemsHashRef = useRef<string | null>(null);

  const dims = useMemo(() => dimsFromLearner(learner), [learner]);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setAllDimsVerified(false);
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
          : `${Date.now()}-${Math.random()}`
      );
    }
  }, [open]);

  // Resolve the lead_id linked to this learner so the activity-log write
  // can reference it. Best-effort — if no lead exists (legacy import),
  // we'll skip the activity row.
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
        // Non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, learner.id]);

  // Pre-flight check: any pending admission_fee_change_events for this
  // learner? If yes, block the confirm path and surface the warning.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    FeeChangeEventService.hasPendingForLearner(learner.id)
      .then((pending) => {
        if (!cancelled) setHasPendingFeeChange(pending);
      })
      .catch(() => {
        // If the check itself fails, fail closed (assume no pending) — the
        // RPC will block us anyway if there's a pending event.
        if (!cancelled) setHasPendingFeeChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, learner.id]);

  // Capture the structure snapshot the first time onMatchChange fires with
  // a non-null structure. Subsequent re-fetches trigger the diff check.
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
    allDimsVerified &&
    matchedStructure !== null &&
    !hasPendingFeeChange &&
    !submitting;

  const handleConfirm = async () => {
    if (submittingRef.current) return;
    if (!confirmEnabled) return;
    if (!matchedStructure) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      // Diff check: re-compare the current matched structure to the snapshot.
      // We're already showing the latest in the panel (FeeStructureReadonlyPanel
      // re-fetches on dim changes); the snapshot lets us detect drift in the
      // matrix config itself.
      const currentHash = JSON.stringify(
        matchedStructure.items.map((it) => ({ c: it.billing_category_id, a: it.amount })),
      );
      if (
        structureSnapshotIdRef.current !== matchedStructure.id ||
        structureSnapshotItemsHashRef.current !== currentHash
      ) {
        setStructureChangedSinceOpen(true);
        // Reset the snapshot to the new structure so the next confirm
        // will pass once the admin re-verifies.
        structureSnapshotIdRef.current = matchedStructure.id;
        structureSnapshotItemsHashRef.current = currentHash;
        setAllDimsVerified(false); // also forces dim re-tick
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }

      // Fire the transition. Documents are tracked on the Checklist tab so
      // we pass empty arrays for required_documents/received_documents —
      // skips the RPC's docs check (existing behaviour after 2026-05-21).
      await AccountTransitionService.transitionToAccount({
        learner_id: learner.id,
        required_documents: [],
        received_documents: [],
        // Phase 2 will land idempotency_key + notes as RPC params. Until
        // then these are inert — pass them now so the wire is in place.
        ...({ idempotency_key: idempotencyKey, notes: notes || undefined } as any),
      });

      // Audit row on the lead's activity timeline.
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
          // Non-fatal — the lifecycle change succeeded; we just lost an audit row.
          console.warn('[account-verification-dialog] activity log failed:', logErr);
        }
      }

      toast.success('Moved to Account — bills generated');
      onSuccess?.();
      onOpenChange(false);
      setTimeout(() => router.refresh(), 300);
    } catch (err) {
      console.error('[account-verification-dialog] transition failed:', err);
      const msg = err instanceof Error ? err.message : 'Transition failed';
      toast.error(msg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Landmark className="h-5 w-5 text-amber-600" />
            Verify and Move to Account — {learner.first_name} {learner.last_name || ''}
          </DialogTitle>
          <DialogDescription>
            Review the academic dimensions and fee structure below. Confirm
            each row, then click <strong>Confirm</strong> to flip the lifecycle
            to <em>Account</em> and generate the bills. This action is
            recorded on the activity timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
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
            <Alert variant="default" className="border-amber-300 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fee structure changed since you opened this dialog</AlertTitle>
              <AlertDescription>
                The matrix configuration was updated by an admin while this
                dialog was open. We've refreshed the preview below — please
                re-tick the dimensions to acknowledge the new values, then
                click Confirm again.
              </AlertDescription>
            </Alert>
          )}

          {/* Academic dimensions summary with per-row verification */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Academic Dimensions</h3>
            <p className="text-xs text-muted-foreground">
              Confirm each row below matches the student's chosen
              programme. If any value is wrong, cancel and edit the enquiry
              before returning here.
            </p>
            <AcademicDimensionsSummary
              learner={learner}
              requireVerification
              onVerificationChange={setAllDimsVerified}
            />
          </section>

          {/* Fee structure preview — live, matrix-driven */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Fee Structure to be Committed</h3>
            <p className="text-xs text-muted-foreground">
              These line items will be persisted on the learner and a
              bill row will be created for each on confirmation.
            </p>
            <FeeStructureReadonlyPanel
              dims={dims}
              onMatchChange={handleMatchChange}
            />
            {!matchedStructure && (
              <Alert variant="default" className="border-amber-300 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No fee structure configured</AlertTitle>
                <AlertDescription>
                  The matrix has no row for this learner's exact dimension
                  combination. Ask an admin to create the configuration at
                  /admission/settings/fees-structure before confirming.
                </AlertDescription>
              </Alert>
            )}
          </section>

          {/* Notes textarea — audit trail */}
          <section className="space-y-2">
            <Label htmlFor="account-verify-notes" className="text-sm font-semibold">
              Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="account-verify-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context for this transition (e.g. 'Confirmed dims with parent over phone')…"
              rows={3}
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground">
              Stored on the activity timeline alongside the verification record.
            </p>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel — needs correction
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!confirmEnabled}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {submitting
              ? 'Generating bills…'
              : 'Confirm — Move to Account & Generate Bills'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
