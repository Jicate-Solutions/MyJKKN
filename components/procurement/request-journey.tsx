'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { formatDateDMY } from '@/lib/utils/date-format';
import { latestRound } from '@/lib/procurement/approval-chain';
import type { RequestApproval } from '@/types/procurement';
import {
  ProcurementJourneyService,
  type JourneyAnchor,
  type RequestJourney,
} from '@/lib/services/procurement/journey-service';

/**
 * The slim progress line at the top of the purchase page:
 *
 *   Asked → Item approval → Quotes → Final approval → Delivered
 *
 * The two sign-offs are named checkpoints with who signed and when, so nobody has to
 * wonder whether a purchase was approved. One line underneath says who acts now.
 * Everything happens on the same page, so there are no "go to" links here.
 */

export type StepState = 'done' | 'current' | 'blocked' | 'upcoming';

export interface Step {
  title: string;
  state: StepState;
  /** Under the dot: who signed / what happened, or who it waits for. */
  note?: string;
}

const QUOTE_DECIDED = ['pending_award_approval', 'awarded', 'closed'];

/** One set approver as a dot on the line. */
function chainStep(a: RequestApproval): Step {
  if (a.status === 'approved') return { title: a.label, state: 'done', note: signed(a.acted_by_profile?.full_name ?? null, a.acted_at) };
  if (a.status === 'pending') return { title: a.label, state: 'current', note: 'Waiting for approval' };
  if (a.status === 'returned') return { title: a.label, state: 'blocked', note: `Sent back: ${a.remarks ?? ''}` };
  if (a.status === 'rejected') return { title: a.label, state: 'blocked', note: `Rejected: ${a.remarks ?? ''}` };
  return { title: a.label, state: 'upcoming' };
}
const signed = (who: string | null, at: string | null) =>
  [who, at ? formatDateDMY(at) : null].filter(Boolean).join(' · ') || 'Approved';

function buildSteps(j: RequestJourney): { steps: Step[]; now: string | null } {
  const req = j.request;
  const rfq = j.rfq;
  let now: string | null = null;

  const s1: Step =
    req?.status === 'cancelled'
      ? { title: 'Asked', state: 'blocked', note: 'Cancelled' }
      : req?.status === 'draft'
        ? { title: 'Asked', state: 'current', note: 'Not submitted' }
        : { title: 'Asked', state: 'done' };
  if (req?.status === 'draft') now = 'Requester — submit the request';

  // Sign-off 1
  let s2: Step;
  if (req?.status === 'submitted') {
    s2 = { title: 'Item approval', state: 'current', note: 'Waiting for approver' };
    now = 'Approver — approve or reject the items';
  } else if (req?.status === 'returned') {
    s2 = { title: 'Item approval', state: 'current', note: `Sent back: ${req.returned_reason ?? 'changes needed'}` };
    now = 'Requester — make the changes and send it again';
  } else if (req?.status === 'rejected') {
    s2 = { title: 'Item approval', state: 'blocked', note: req.rejection_reason || 'Rejected' };
  } else if (req && (req.status === 'approved' || req.status === 'converted')) {
    s2 = { title: 'Item approval', state: 'done', note: signed(req.approved_by_name, req.approved_at) };
  } else s2 = { title: 'Item approval', state: 'upcoming' };

  let s3: Step;
  if (rfq && QUOTE_DECIDED.includes(rfq.status)) {
    s3 = { title: 'Quotes', state: 'done', note: `${rfq.quotation_count} vendor${rfq.quotation_count === 1 ? '' : 's'}` };
  } else if (rfq?.status === 'cancelled') {
    s3 = { title: 'Quotes', state: 'blocked', note: 'Cancelled' };
  } else if (rfq || s2.state === 'done') {
    const count = rfq?.quotation_count ?? 0;
    s3 = { title: 'Quotes', state: 'current', note: count ? `${count} vendor${count === 1 ? '' : 's'} so far` : 'Collecting' };
    now = rfq?.award_rejection_reason
      ? `Store — sent back by the Super Admin: ${rfq.award_rejection_reason}`
      : count === 0
        ? 'Store — upload the vendors’ quotes'
        : (rfq?.chosen_count ?? 0) === 0
          ? 'Store — choose a vendor for each item'
          : 'Store — send the choice for final approval';
  } else s3 = { title: 'Quotes', state: 'upcoming' };

  // Sign-off 2
  let s4: Step;
  if (rfq?.status === 'pending_award_approval') {
    s4 = { title: 'Final approval', state: 'current', note: 'Waiting for Super Admin' };
    now = 'Super Admin — approve the chosen vendors and prices';
  } else if (rfq && (rfq.status === 'awarded' || rfq.status === 'closed')) {
    s4 = { title: 'Final approval', state: 'done', note: signed(rfq.award_approved_by_name, rfq.award_approved_at) };
  } else s4 = { title: 'Final approval', state: 'upcoming' };

  let s5: Step;
  const openOrders = j.orders.filter((o) => !['completed', 'closed'].includes(o.status));
  const toCheck = j.receipts.some((r) => r.status === 'pending_verification' || r.status === 'draft');
  if (s4.state !== 'done') s5 = { title: 'Delivered', state: 'upcoming' };
  else if (j.orders.length > 0 && openOrders.length === 0) s5 = { title: 'Delivered', state: 'done', note: 'In stock' };
  else {
    s5 = { title: 'Delivered', state: 'current', note: toCheck ? 'Check delivery' : 'Waiting for goods' };
    now = toCheck
      ? 'Store verifier — check the delivery and add it to stock'
      : 'Store — send the order PDF to the vendor, record the delivery when goods arrive';
  }

  return { steps: [s1, s2, s3, s4, s5], now };
}

export function useRequestJourney(anchor: JourneyAnchor, revision?: string) {
  return useQuery({
    // `revision` is the host page's own status, so the line refetches the moment an
    // action on that page moves the purchase on.
    queryKey: ['procurement-journey', anchor.requestId ?? null, anchor.rfqId ?? null, anchor.poId ?? null, revision ?? null],
    queryFn: () => ProcurementJourneyService.getJourney(anchor),
    enabled: !!(anchor.requestId || anchor.rfqId || anchor.poId),
    staleTime: 0,
  });
}

/** Who has to act now, in one line — the purchase page puts it in its action bar. */
export function journeyNow(journey: RequestJourney): string | null {
  return buildSteps(journey).now;
}

const DOT: Record<StepState, string> = {
  done: 'bg-primary',
  current: 'bg-secondary ring-4 ring-secondary/30',
  blocked: 'bg-destructive',
  upcoming: 'border border-muted-foreground/50',
};

/**
 * One short line of dots: Asked — Item approval — Quotes — Final approval — Delivered.
 * The current step is bold; a signed-off approval shows who and when on hover and
 * as small text under the line (`signedOff`).
 */
export function PurchaseProgress({ journey, approvals = [] }: { journey: RequestJourney; approvals?: RequestApproval[] }) {
  const base = buildSteps(journey).steps; // Asked · Item approval · Quotes · Final approval · Delivered
  // A request with category approvers: one dot per set approver in place of
  // "Item approval" (request list) and "Final approval" (final list).
  const reqChain = latestRound(approvals, 'request').map(chainStep);
  const finalChain = latestRound(approvals, 'final').map(chainStep);
  const steps = [
    base[0],
    ...(reqChain.length ? reqChain : [base[1]]),
    base[2],
    ...(finalChain.length ? finalChain : [base[3]]),
    base[4],
  ];
  const approvalTitles = new Set(['Item approval', 'Final approval', ...reqChain.map((s) => s.title), ...finalChain.map((s) => s.title)]);
  const signed = steps.filter((s) => s.state === 'done' && approvalTitles.has(s.title) && s.note);
  const current = steps.find((s) => s.state === 'current' || s.state === 'blocked');
  return (
    <div className="space-y-1">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={`${i}-${s.title}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="h-px w-4 bg-border" />}
            <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', DOT[s.state])} />
            <span
              className={cn(
                s.state === 'current' && 'font-semibold text-foreground',
                s.state === 'blocked' && 'font-semibold text-destructive',
                s.state === 'done' && 'text-foreground'
              )}
              title={s.note}
            >
              {s.title}
            </span>
            <span className="sr-only"> — {s.state}</span>
          </li>
        ))}
      </ol>
      {/* Only who signed off — the current step is already bold on the line above. */}
      {signed.length > 0 && (
        <p className="text-xs text-muted-foreground">{signed.map((s) => `${s.title} ✓ ${s.note}`).join(' · ')}</p>
      )}
      {current?.state === 'blocked' && current.note && <p className="text-xs text-destructive">{current.note}</p>}
    </div>
  );
}

/** The five steps with who signed / what is awaited — for a vertical timeline view. */
export function journeySteps(journey: RequestJourney): { steps: Step[]; now: string | null } {
  return buildSteps(journey);
}
