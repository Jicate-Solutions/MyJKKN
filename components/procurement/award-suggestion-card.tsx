'use client';

import { useState } from 'react';
import { Award, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAwardLine } from '@/hooks/procurement/use-quotations';
import { errorMessage } from '@/lib/utils/supabase-error';
import type { ValidatedSuggestion } from '@/lib/procurement/quotation-compare-agent';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

interface AwardSuggestionCardProps {
  rfqId: string;
  suggestion: ValidatedSuggestion;
  /** null while the answer is still streaming (not saved yet). */
  messageId: string | null;
  appliedAt: string | null;
  appliedBy: string | null;
  canApply: boolean;
  /** Why applying is not possible right now (RFQ already awarded, etc.). */
  lockedReason: string | null;
  /** quotation_item_id → current unit_price, to spot quotes edited since. */
  livePrices: Record<string, number | null>;
  /** quotation_item_ids currently awarded. */
  awardedIds: Set<string>;
  onApplied: (messageId: string) => Promise<void>;
}

/**
 * An award plan proposed by the AI. Nothing changes until someone with award
 * rights clicks Apply — then each line goes through the same award action as
 * the table's own Award buttons.
 */
export function AwardSuggestionCard({
  rfqId,
  suggestion,
  messageId,
  appliedAt,
  appliedBy,
  canApply,
  lockedReason,
  livePrices,
  awardedIds,
  onApplied,
}: AwardSuggestionCardProps) {
  const awardLine = useAwardLine(rfqId);
  const [applying, setApplying] = useState(false);

  const stale = suggestion.lines.some(
    (l) => livePrices[l.quotation_item_id] !== suggestion.price_snapshot[l.quotation_item_id],
  );
  const alreadyInPlace =
    suggestion.lines.length > 0 && suggestion.lines.every((l) => awardedIds.has(l.quotation_item_id));
  const diff = Math.round((suggestion.total - suggestion.current_total) * 100) / 100;

  const apply = async () => {
    if (!messageId) return;
    setApplying(true);
    let done = 0;
    for (const line of suggestion.lines) {
      try {
        await awardLine.mutateAsync({ rfqItemId: line.rfq_item_id, quotationItemId: line.quotation_item_id });
        done += 1;
      } catch (e) {
        toast.error(`${line.item_name}: ${errorMessage(e, 'could not be awarded')}`);
      }
    }
    if (done === suggestion.lines.length) {
      toast.success(`Applied ${done} of ${suggestion.lines.length} awards`);
      await onApplied(messageId);
    } else {
      toast.warning(`Applied ${done} of ${suggestion.lines.length} awards — check the table`);
    }
    setApplying(false);
  };

  if (!suggestion.lines.length) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        The AI proposed an award plan, but none of its lines matched a usable quote.
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="mb-2 flex items-start gap-2">
        <Award className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-medium">Suggested award</p>
          {suggestion.summary && <p className="text-xs text-muted-foreground">{suggestion.summary}</p>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {suggestion.lines.map((l) => (
              <tr key={l.quotation_item_id} className="border-t border-primary/10 align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-medium">{l.item_name}</div>
                  {l.reason && <div className="text-muted-foreground">{l.reason}</div>}
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap">{l.vendor}</td>
                <td className="py-1.5 text-right whitespace-nowrap tabular-nums">
                  {inr(l.line_total)}
                  <div className="text-muted-foreground">
                    {l.quantity} × {inr(l.unit_price)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-primary/20 font-medium">
              <td className="py-1.5" colSpan={2}>
                Plan total
                {suggestion.current_total > 0 && diff !== 0 && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({diff < 0 ? `${inr(-diff)} less` : `${inr(diff)} more`} than the awards at the time)
                  </span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums">{inr(suggestion.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {suggestion.dropped.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Left out: {suggestion.dropped.map((d) => `${d.item_ref} (${d.why})`).join(', ')}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {appliedAt ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Applied{appliedBy ? ` by ${appliedBy}` : ''} on {new Date(appliedAt).toLocaleString('en-IN')}
          </span>
        ) : stale ? (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            Quotations changed since this was suggested — ask again for a fresh plan.
          </span>
        ) : alreadyInPlace ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            These awards are already in place.
          </span>
        ) : !canApply ? (
          <span className="text-xs text-muted-foreground">
            Someone with award rights can apply this plan.
          </span>
        ) : lockedReason ? (
          <span className="text-xs text-muted-foreground">{lockedReason}</span>
        ) : (
          <Button size="sm" onClick={apply} disabled={applying || !messageId}>
            {applying ? 'Applying…' : messageId ? 'Apply these awards' : 'Saving…'}
          </Button>
        )}
      </div>
    </div>
  );
}
