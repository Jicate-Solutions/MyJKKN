// ============================================================================
// HR — Shift Swap Approvals (T1.6 Phase 2b from specs/hr-module-decomposition-2026-05-09.md)
// Created: 2026-05-10.
//
// HR officer / admin queue of swap requests awaiting review. Shows requests
// in 'pending' (waiting on counterparty consent) AND 'counterparty_accepted'
// (queued for HR action). Approve writes status='approved' (per-day override
// source-of-truth on swap_date — no cascading writes to assignments). Reject
// requires a notes field.
//
// Permission gate: admin_or_super_admin.
// ============================================================================

'use client';

import { useState } from 'react';
import {
  LookupTable,
  PolicyPageShell,
  type LookupConfig,
  type PolicyHandlers,
} from '@/lib/admin/policy-shell';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ShiftService } from '@/lib/services/hr/shift-service';
import { useAuth } from '@/hooks/use-auth';
import {
  SWAP_STATUS_LABEL,
  type HRShiftSwapRequestWithStaff,
} from '@/types/hr-shifts';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Status badge variants. counterparty_accepted = the row HR should act on;
// pending = still gathering counterparty consent (HR can still approve
// directly for "open swap" cases).
// ---------------------------------------------------------------------------
function statusVariant(status: HRShiftSwapRequestWithStaff['status']):
  'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'counterparty_accepted':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'approved':
      return 'outline';
    case 'rejected':
    case 'expired':
    case 'cancelled':
      return 'destructive';
    default:
      return 'secondary';
  }
}

// ---------------------------------------------------------------------------
// Lookup config
// ---------------------------------------------------------------------------
function buildConfig(
  onApprove: (row: HRShiftSwapRequestWithStaff) => void,
  onReject: (row: HRShiftSwapRequestWithStaff) => void,
): LookupConfig<HRShiftSwapRequestWithStaff> {
  return {
    title: 'HR — Shift Swap Approvals',
    explainer: (
      <>
        <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
        <p>
          Employees file shift-swap requests; this is your review queue. Rows
          marked <strong>Awaiting HR review</strong> have already had
          counterparty consent — those are ready to approve. Rows still{' '}
          <strong>Pending counterparty</strong> can be approved directly only
          for "open swap" cases (no named counterparty, e.g. swap to a day
          off).
        </p>
        <p className="mt-2">
          Approving does NOT rewrite the underlying shift assignments. The
          approved swap row IS the per-day override on its swap_date — any
          schedule view or attendance check-in must read this table first
          before falling back to assignments. Reason for that design: cleaner
          audit trail, no schema churn, no race conditions on undo.
        </p>
      </>
    ),
    columns: [
      {
        header: 'Requester',
        widthClass: 'w-44',
        cell: (row) => (
          <div className="space-y-0.5">
            <div className="text-sm font-medium">
              {row.requester_name ?? '—'}
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {row.requester_staff_no ?? row.requester_staff_id.slice(0, 8) + '…'}
            </div>
          </div>
        ),
      },
      {
        header: 'Counterparty',
        widthClass: 'w-44',
        cell: (row) => {
          if (!row.counterparty_staff_id) {
            return <span className="italic text-muted-foreground">Open swap</span>;
          }
          return (
            <div className="space-y-0.5">
              <div className="text-sm font-medium">
                {row.counterparty_name ?? '—'}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {row.counterparty_staff_no ?? row.counterparty_staff_id.slice(0, 8) + '…'}
              </div>
            </div>
          );
        },
      },
      {
        header: 'Swap date',
        widthClass: 'w-28',
        cell: (row) => <span className="text-sm">{row.swap_date}</span>,
      },
      {
        header: 'Reason',
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.reason ? (
              row.reason.length > 80 ? row.reason.slice(0, 80) + '…' : row.reason
            ) : (
              <span className="italic">No reason given</span>
            )}
          </span>
        ),
      },
      {
        header: 'Status',
        widthClass: 'w-44',
        cell: (row) => (
          <Badge variant={statusVariant(row.status)} className="capitalize">
            {SWAP_STATUS_LABEL[row.status]}
          </Badge>
        ),
      },
      {
        header: 'Filed',
        widthClass: 'w-28',
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.requested_at.slice(0, 10)}
          </span>
        ),
      },
      {
        header: 'Actions',
        widthClass: 'w-44',
        cell: (row) => {
          // Only pending / counterparty_accepted are actionable.
          const actionable =
            row.status === 'pending' || row.status === 'counterparty_accepted';
          if (!actionable) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => onApprove(row)}
                title="Approve this swap"
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject(row)}
                title="Reject this swap (a reason is required)"
              >
                Reject
              </Button>
            </div>
          );
        },
      },
    ],
    emptyMessage:
      'No swap requests awaiting review. Approved / rejected / cancelled requests are kept in history; this view shows the active queue only.',
    entityNoun: 'Swap Request',
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HRShiftApprovalsPage() {
  const supabase = createClientSupabaseClient();
  const { profile } = useAuth();
  const [reload, setReload] = useState(0);
  const [reviewing, setReviewing] = useState<HRShiftSwapRequestWithStaff | null>(null);
  const [reviewMode, setReviewMode] = useState<'approve' | 'reject' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handlers: PolicyHandlers<HRShiftSwapRequestWithStaff> = {
    onLoad: async () => {
      // HR queue: pending + counterparty_accepted, ordered by swap_date asc.
      void reload;
      const rows = await ShiftService.listSwapRequests(supabase, {
        hrReviewQueue: true,
      });
      return rows;
    },
    // No create/edit/delete from this page — actions are inline buttons.
    // We satisfy the PolicyHandlers contract with a no-op onSave.
    onSave: async () => {
      throw new Error('Not supported on this page.');
    },
  };

  const openApprove = (row: HRShiftSwapRequestWithStaff) => {
    setReviewing(row);
    setReviewMode('approve');
    setReviewNotes('');
  };
  const openReject = (row: HRShiftSwapRequestWithStaff) => {
    setReviewing(row);
    setReviewMode('reject');
    setReviewNotes('');
  };
  const closeReview = () => {
    setReviewing(null);
    setReviewMode(null);
    setReviewNotes('');
  };

  const submitReview = async () => {
    if (!reviewing || !reviewMode || !profile?.id) return;
    setSubmitting(true);
    try {
      if (reviewMode === 'approve') {
        await ShiftService.approveSwapRequest(
          supabase,
          reviewing.id,
          profile.id,
          reviewNotes.trim() || undefined,
        );
        toast.success('Swap approved.');
      } else {
        const trimmed = reviewNotes.trim();
        if (!trimmed) {
          toast.error('A rejection reason is required.');
          setSubmitting(false);
          return;
        }
        await ShiftService.rejectSwapRequest(supabase, reviewing.id, profile.id, trimmed);
        toast.success('Swap rejected.');
      }
      closeReview();
      setReload((n) => n + 1);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const config = buildConfig(openApprove, openReject);

  return (
    <PolicyPageShell
      title={config.title}
      explainer={config.explainer}
      permission="admin_or_super_admin"
    >
      <LookupTable<HRShiftSwapRequestWithStaff>
        config={config}
        handlers={handlers}
      />

      <Dialog open={reviewing !== null} onOpenChange={(open) => !open && closeReview()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewMode === 'approve' ? 'Approve swap request' : 'Reject swap request'}
            </DialogTitle>
            <DialogDescription>
              {reviewing && (
                <span className="text-xs">
                  {reviewing.requester_name ?? 'Requester'} → {' '}
                  {reviewing.counterparty_name ?? 'Open swap'} on {reviewing.swap_date}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="font-medium">
                {reviewMode === 'approve'
                  ? 'Notes (optional)'
                  : 'Reason for rejection (required)'}
              </span>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewMode === 'approve'
                    ? 'Anything the requester / counterparty should know about this approval.'
                    : 'Tell the requester why this swap cannot proceed.'
                }
                rows={4}
                className="mt-1"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReview} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant={reviewMode === 'reject' ? 'destructive' : 'default'}
              onClick={submitReview}
              disabled={submitting}
            >
              {submitting
                ? 'Saving…'
                : reviewMode === 'approve'
                ? 'Approve swap'
                : 'Reject swap'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PolicyPageShell>
  );
}
