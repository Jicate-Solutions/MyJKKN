'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, X, Minus, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import {
  ProcurementJourneyService,
  type JourneyAnchor,
  type RequestJourney,
} from '@/lib/services/procurement/journey-service';

/**
 * The same five-step tracker on every procurement screen of one request:
 *
 *   1 Request → 2 Request approval → 3 Quotations → 4 Super Admin approval → 5 Delivery
 *
 * It answers the two questions users kept asking — "where did my request go?" and
 * "who has to do something now?" — and the "Next step" box links straight to the
 * screen where that person acts, so nobody has to know which tab holds it.
 */

type StepState = 'done' | 'current' | 'blocked' | 'upcoming' | 'skipped';

interface Step {
  title: string;
  state: StepState;
  who?: string;
  note?: string;
  action?: { label: string; href: string };
}

const QUOTE_DECIDED = ['pending_award_approval', 'awarded', 'closed'];

function buildSteps(j: RequestJourney): Step[] {
  const req = j.request;
  const rfq = j.rfq;
  const quotesHref = rfq ? `/procurement/rfqs/${rfq.id}/quotations` : '';

  // 1 — Request
  const s1: Step = !req
    ? { title: 'Request', state: 'skipped', note: 'Quotation raised without a request' }
    : req.status === 'draft'
      ? {
          title: 'Request',
          state: 'current',
          who: 'Requester',
          note: 'Not submitted yet',
          action: { label: 'Open request', href: `/procurement/requests/${req.id}` },
        }
      : req.status === 'cancelled'
        ? { title: 'Request', state: 'blocked', note: 'Cancelled' }
        : { title: 'Request', state: 'done', note: displayRequestNumber(req.request_number) };

  // 2 — Request approval
  let s2: Step;
  if (!req) s2 = { title: 'Request approval', state: 'skipped' };
  else if (req.status === 'submitted')
    s2 = {
      title: 'Request approval',
      state: 'current',
      who: 'Approver',
      note: 'Approve or reject the request',
      action: { label: 'Open request', href: `/procurement/requests/${req.id}` },
    };
  else if (req.status === 'rejected')
    s2 = { title: 'Request approval', state: 'blocked', note: req.rejection_reason || 'Rejected' };
  else if (req.status === 'approved' || req.status === 'converted')
    s2 = { title: 'Request approval', state: 'done', note: 'Approved' };
  else s2 = { title: 'Request approval', state: 'upcoming' };

  // 3 — Quotations & comparison
  let s3: Step;
  if (rfq && QUOTE_DECIDED.includes(rfq.status))
    s3 = {
      title: 'Quotations',
      state: 'done',
      note: `${rfq.quotation_count} quotation${rfq.quotation_count === 1 ? '' : 's'} · vendor chosen`,
    };
  else if (rfq && rfq.status === 'cancelled') s3 = { title: 'Quotations', state: 'blocked', note: 'Cancelled' };
  else if (rfq)
    s3 = {
      title: 'Quotations',
      state: 'current',
      who: 'Store keeper',
      note: rfq.award_rejection_reason
        ? `Sent back by Super Admin: ${rfq.award_rejection_reason}`
        : rfq.quotation_count === 0
          ? 'Upload vendor quotations'
          : rfq.chosen_count === 0
            ? 'Compare quotations and choose vendors'
            : 'Send the chosen vendors to the Super Admin',
      action: { label: 'Open quotations', href: quotesHref },
    };
  else if (req && (req.status === 'approved' || req.status === 'converted'))
    s3 = {
      title: 'Quotations',
      state: 'current',
      who: 'Store keeper',
      note: 'Start collecting vendor quotations',
      action: { label: 'Start quotations', href: `/procurement/requests/${req.id}` },
    };
  else s3 = { title: 'Quotations', state: 'upcoming' };

  // 4 — Super Admin approval
  let s4: Step;
  if (rfq?.status === 'pending_award_approval')
    s4 = {
      title: 'Super Admin approval',
      state: 'current',
      who: 'Super Admin',
      note: 'Check the chosen vendors and prices, then approve',
      action: { label: 'Review & approve', href: quotesHref },
    };
  else if (rfq && (rfq.status === 'awarded' || rfq.status === 'closed'))
    s4 = {
      title: 'Super Admin approval',
      state: 'done',
      note: `${j.orders.length} order${j.orders.length === 1 ? '' : 's'} created`,
    };
  else s4 = { title: 'Super Admin approval', state: 'upcoming' };

  // 5 — Delivery & stock
  let s5: Step;
  const openOrders = j.orders.filter((o) => !['completed', 'closed'].includes(o.status));
  const toCheck = j.receipts.find((r) => r.status === 'pending_verification' || r.status === 'draft');
  if (s4.state !== 'done') s5 = { title: 'Delivery', state: 'upcoming' };
  else if (j.orders.length > 0 && openOrders.length === 0)
    s5 = { title: 'Delivery', state: 'done', note: 'Received and added to stock' };
  else if (toCheck)
    s5 = {
      title: 'Delivery',
      state: 'current',
      who: 'Store verifier',
      note: 'Check the delivered goods and add them to stock',
      action: { label: 'Check & add to stock', href: `/procurement/grn/${toCheck.id}` },
    };
  else if (openOrders.length > 0)
    s5 = {
      title: 'Delivery',
      state: 'current',
      who: 'Store keeper',
      note: 'Send the purchase order PDF to the vendor, then record the delivery when goods arrive',
      action: { label: 'Open purchase order', href: `/procurement/purchase-orders/${openOrders[0].id}` },
    };
  else s5 = { title: 'Delivery', state: 'upcoming' };

  return [s1, s2, s3, s4, s5];
}

export function useRequestJourney(anchor: JourneyAnchor, revision?: string) {
  return useQuery({
    // `revision` is the host page's own status, so the tracker refetches the moment
    // an action on that page moves the document on.
    queryKey: ['procurement-journey', anchor.requestId ?? null, anchor.rfqId ?? null, anchor.poId ?? null, revision ?? null],
    queryFn: () => ProcurementJourneyService.getJourney(anchor),
    enabled: !!(anchor.requestId || anchor.rfqId || anchor.poId),
    staleTime: 0,
  });
}

function StepIcon({ state, index }: { state: StepState; index: number }) {
  const base = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold';
  if (state === 'done') return <span className={cn(base, 'border-green-600 bg-green-600 text-white')}><Check className="h-4 w-4" /></span>;
  if (state === 'blocked') return <span className={cn(base, 'border-red-600 bg-red-600 text-white')}><X className="h-4 w-4" /></span>;
  if (state === 'skipped') return <span className={cn(base, 'border-dashed text-muted-foreground')}><Minus className="h-4 w-4" /></span>;
  if (state === 'current') return <span className={cn(base, 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/20')}>{index + 1}</span>;
  return <span className={cn(base, 'text-muted-foreground')}>{index + 1}</span>;
}

export function RequestJourney({ anchor, revision }: { anchor: JourneyAnchor; revision?: string }) {
  const pathname = usePathname();
  const { data, isLoading, isError } = useRequestJourney(anchor, revision);
  if (isLoading || isError || !data) return null;

  const steps = buildSteps(data);
  const current = steps.find((s) => s.state === 'current');
  const stopped = steps.find((s) => s.state === 'blocked');

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <ol className="grid gap-3 sm:grid-cols-5 sm:gap-2">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
              <StepIcon state={s.state} index={i} />
              <div className="min-w-0">
                <p className={cn('text-sm font-medium', s.state === 'upcoming' && 'text-muted-foreground')}>
                  {s.title}
                </p>
                {s.note && (s.state === 'done' || s.state === 'blocked' || s.state === 'skipped') && (
                  <p className={cn('text-xs', s.state === 'blocked' ? 'text-red-700' : 'text-muted-foreground')}>
                    {s.note}
                  </p>
                )}
                {s.state === 'current' && s.who && (
                  <p className="text-xs font-medium text-primary">Now: {s.who}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {current ? (
          <div className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium">
                Next step · {current.title}
                {current.who ? ` — ${current.who}` : ''}
              </p>
              {current.note && <p className="text-muted-foreground">{current.note}</p>}
            </div>
            {current.action && current.action.href !== pathname && (
              <Button asChild className="shrink-0">
                <Link href={current.action.href}>
                  {current.action.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        ) : stopped ? (
          <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Stopped at {stopped.title.toLowerCase()}
            {stopped.note ? ` — ${stopped.note}` : ''}.
          </p>
        ) : steps[4].state === 'done' ? (
          <p className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            Complete — the goods are in stock.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
