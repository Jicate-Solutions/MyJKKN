'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { HRMemo } from '@/lib/services/hr/memo-service';

const TYPE_LABEL: Record<string, string> = {
  leave_before_approval: 'Leave taken before approval',
  monthly_lop_threshold: 'Monthly LOP threshold breached',
  unscheduled_absence: 'Unscheduled absence',
  manual: 'Manual memo',
};

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  issued: 'destructive',
  acknowledged: 'secondary',
  disputed: 'outline',
  resolved: 'default',
};

export function MyMemoCard({
  memo,
  readOnly = false,
}: {
  memo: HRMemo;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [showDispute, setShowDispute] = useState(false);
  const [disputeText, setDisputeText] = useState('');
  const [pending, startTransition] = useTransition();

  const acknowledge = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/hr/memos/${memo.id}/acknowledge`, {
          method: 'POST',
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        toast.success('Memo acknowledged.');
        router.refresh();
      } catch (e) {
        toast.error(
          `Acknowledge failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };

  const submitDispute = () => {
    if (disputeText.trim().length < 10) {
      toast.error('Dispute reason must be at least 10 characters.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/hr/memos/${memo.id}/dispute`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dispute_text: disputeText }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        toast.success('Dispute submitted. HR will review.');
        setShowDispute(false);
        router.refresh();
      } catch (e) {
        toast.error(
          `Dispute failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    });
  };

  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {TYPE_LABEL[memo.memo_type] ?? memo.memo_type}
          </div>
          <div className="text-xs text-muted-foreground">
            Issued {new Date(memo.issued_at).toLocaleDateString()}
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[memo.status] ?? 'outline'}>
          {memo.status}
        </Badge>
      </div>

      <p className="whitespace-pre-line text-sm text-foreground/90">
        {memo.reason}
      </p>

      {memo.dispute_text && (
        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="font-medium">Your dispute</div>
          <p className="whitespace-pre-line">{memo.dispute_text}</p>
        </div>
      )}

      {memo.resolution_note && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div className="font-medium">HR resolution</div>
          <p className="whitespace-pre-line">{memo.resolution_note}</p>
          <div className="mt-1 text-muted-foreground">
            {memo.counts_toward_termination
              ? 'Memo upheld — counts toward termination.'
              : 'Memo invalidated — excluded from count.'}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!readOnly && memo.status === 'issued' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={acknowledge} disabled={pending} size="sm">
            Acknowledge
          </Button>
          <Button
            onClick={() => setShowDispute((v) => !v)}
            disabled={pending}
            size="sm"
            variant="outline"
          >
            {showDispute ? 'Cancel dispute' : 'Dispute this memo'}
          </Button>
        </div>
      )}

      {showDispute && memo.status === 'issued' && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`dispute-${memo.id}`} className="text-sm">
            Why are you disputing this memo?
          </Label>
          <Textarea
            id={`dispute-${memo.id}`}
            value={disputeText}
            onChange={(e) => setDisputeText(e.target.value)}
            rows={3}
            placeholder="HR will review. Be specific about why the memo is incorrect."
          />
          <Button onClick={submitDispute} disabled={pending} size="sm">
            {pending ? 'Submitting...' : 'Submit dispute'}
          </Button>
        </div>
      )}
    </div>
  );
}
