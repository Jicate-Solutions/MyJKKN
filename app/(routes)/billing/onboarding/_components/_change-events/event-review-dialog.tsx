'use client';
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import toast from 'react-hot-toast';
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import type {
  AdmissionFeeChangeEventWithLines,
  AdmissionFeeChangeEventLineDecision,
} from '@/types/admission';
import { EventLineDecisionRow } from './event-line-decision-row';

interface Props {
  eventId: string;
  onOpenChange: (open: boolean) => void;
}

export function EventReviewDialog({ eventId, onOpenChange }: Props) {
  const [event, setEvent] = useState<AdmissionFeeChangeEventWithLines | null>(null);
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(new Map());
  const [decisions, setDecisions] = useState<Record<string, AdmissionFeeChangeEventLineDecision>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refundExcess, setRefundExcess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    FeeChangeEventService.getWithLines(eventId).then(setEvent);
    BillingCategoryService.getActiveBillingCategories().then((cats) => {
      const m = new Map<string, string>();
      cats.forEach((c) => m.set(c.id, c.category_name));
      setCategoryNames(m);
    });
  }, [eventId]);

  const allDecided = !!event && event.lines.every((l) => decisions[l.billing_category_id]);

  const handleApprove = async () => {
    if (!event) return;
    setSubmitting(true);
    try {
      const decisionInputs = event.lines.map((l) => ({
        billing_category_id: l.billing_category_id,
        decision: decisions[l.billing_category_id],
        decision_notes: notes[l.billing_category_id],
      }));
      const res = await FeeChangeEventService.approve(event.id, decisionInputs, refundExcess);
      toast.success(
        `Approved — ${res.summary.new_bills} new bills, ${res.summary.superseded_bills} superseded, ${res.summary.credit_balances} credit balances`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!event || !rejectReason.trim()) return;
    setSubmitting(true);
    try {
      await FeeChangeEventService.reject(event.id, rejectReason);
      toast.success('Event rejected');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Fee Change Review</DialogTitle>
        </DialogHeader>
        {!event && <p>Loading…</p>}
        {event && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Trigger: {event.trigger_field} • Requested {new Date(event.requested_at).toLocaleString()}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th>Category</th>
                  <th className="text-right">Old</th>
                  <th className="text-right">Paid so far</th>
                  <th className="text-right">New</th>
                  <th className="text-right">Δ</th>
                  <th>Decision</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {event.lines.map((l) => (
                  <EventLineDecisionRow
                    key={l.id}
                    line={l}
                    categoryName={categoryNames.get(l.billing_category_id) ?? l.billing_category_id}
                    decision={decisions[l.billing_category_id] ?? null}
                    notes={notes[l.billing_category_id] ?? ''}
                    onDecisionChange={(d) => setDecisions((s) => ({ ...s, [l.billing_category_id]: d }))}
                    onNotesChange={(n) => setNotes((s) => ({ ...s, [l.billing_category_id]: n }))}
                  />
                ))}
              </tbody>
            </table>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={refundExcess} onCheckedChange={(c) => setRefundExcess(!!c)} />
              Refund excess instead of holding as credit balance
            </label>
            {rejecting && (
              <Textarea
                placeholder="Reason for rejection (required)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            )}
          </div>
        )}
        <DialogFooter>
          {!rejecting && (
            <>
              <Button variant="ghost" onClick={() => setRejecting(true)} disabled={submitting}>Reject…</Button>
              <Button onClick={handleApprove} disabled={!allDecided || submitting}>
                {submitting ? 'Approving…' : 'Approve'}
              </Button>
            </>
          )}
          {rejecting && (
            <>
              <Button variant="ghost" onClick={() => setRejecting(false)} disabled={submitting}>Back</Button>
              <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || submitting}>
                {submitting ? 'Rejecting…' : 'Confirm Reject'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
