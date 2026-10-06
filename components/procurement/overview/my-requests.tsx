'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { usePurchaseRequest, usePurchaseRequests } from '@/hooks/procurement/use-purchase-requests';
import { useRequestJourney, journeySteps, type StepState } from '@/components/procurement/request-journey';
import { daysSince } from '@/hooks/procurement/use-overview-waiting';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { stageOf } from '@/lib/procurement/purchase-stage';
import { formatDateDMY } from '@/lib/utils/date-format';
import { cn } from '@/lib/utils';
import { AlertBox } from '@/components/ui/alert-box';
import type { ProcurementPurchaseRequest } from '@/types/procurement';
import { Segmented } from './segmented';
import { packOrUnit } from '@/lib/procurement/pack-size';

/**
 * "My requests" — the Overview for people who raise purchases. A short list on the
 * left (who has each one now, and since when), the selected one on the right: its
 * five steps with who signed and when, what was asked for, and the notes. Actions
 * stay on the purchase page, so there is one place to act on a purchase.
 */

type Tab = 'todo' | 'moving' | 'finished';

const WHO: Record<string, string> = {
  draft: 'Not sent yet',
  returned: 'With you — changes asked',
  submitted: 'With the approver',
  approved: 'With the store — starting quotes',
  getting_quotes: 'With the store — collecting quotes',
  with_super_admin: 'With the Super Admin',
  ordered: 'Ordered — waiting for the goods',
  received: 'In stock at the store',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};
const PILL: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-secondary/20 text-foreground' },
  returned: { label: 'Sent back', cls: 'bg-secondary/20 text-foreground' },
  submitted: { label: 'Item approval', cls: 'bg-primary/10 text-primary' },
  approved: { label: 'Quotes', cls: 'bg-primary/10 text-primary' },
  getting_quotes: { label: 'Quotes', cls: 'bg-primary/10 text-primary' },
  with_super_admin: { label: 'Final approval', cls: 'bg-primary/10 text-primary' },
  ordered: { label: 'Ordered', cls: 'bg-primary/10 text-primary' },
  received: { label: 'Delivered', cls: 'bg-primary/10 text-primary' },
  rejected: { label: 'Rejected', cls: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground' },
};

const tabOf = (stage: string): Tab =>
  stage === 'draft' || stage === 'returned'
    ? 'todo'
    : stage === 'received' || stage === 'rejected' || stage === 'cancelled'
      ? 'finished'
      : 'moving';

/** "Keyboard × 5" · "Keyboard × 5 + 3 more" — most requests have no title. */
function nameOf(req: ProcurementPurchaseRequest): string {
  if (req.title?.trim()) return req.title.trim();
  const items = req.item_preview ?? [];
  if (!items.length) return displayRequestNumber(req.request_number);
  const first = `${items[0].item_name} × ${Number(items[0].required_quantity)}`;
  return items.length > 1 ? `${first} + ${items.length - 1} more` : first;
}

export function MyRequests() {
  const { profile } = useAuth();
  const { data, isLoading, isError } = usePurchaseRequests({
    requested_by: profile?.id,
    all_institutions: true,
    limit: 100,
  });
  const rows = (profile?.id ? data?.data ?? [] : []).map((r) => {
    const stage = stageOf(r);
    return { req: r, stage, tab: tabOf(stage), age: daysSince(r.updated_at) };
  });
  const count = (t: Tab) => rows.filter((r) => r.tab === t).length;

  const [tabChoice, setTab] = useState<Tab | null>(null);
  // Open on what needs the requester, else what is on the way.
  const tab: Tab = tabChoice ?? (count('todo') > 0 ? 'todo' : 'moving');
  const visible = rows.filter((r) => r.tab === tab);
  const [selChoice, setSel] = useState<string | null>(null);
  const selId = visible.find((r) => r.req.id === selChoice)?.req.id ?? visible[0]?.req.id ?? null;

  const drafts = rows.filter((r) => r.stage === 'draft');
  const sentBack = rows.filter((r) => r.stage === 'returned');

  return (
    <div className="space-y-5">
      {isError && <AlertBox type="error" message="Your requests could not be loaded. Refresh the page to try again." />}

      <p className="text-sm text-muted-foreground">
        {sentBack.length > 0 && (
          <b className="text-foreground">
            {sentBack.length} sent back to you ·{' '}
          </b>
        )}
        {drafts.length > 0 && (
          <b className="text-foreground">
            {drafts.length} draft{drafts.length === 1 ? '' : 's'} not submitted ·{' '}
          </b>
        )}
        {count('moving')} on the way · {count('finished')} finished
      </p>

      <section
        aria-label="My requests"
        className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(16,24,40,.06),0_4px_14px_rgba(16,24,40,.07)]"
      >
        <div className="border-b px-4 py-3">
          <Segmented
            label="Show"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setSel(null);
            }}
            options={[
              { value: 'todo', label: 'To do', count: count('todo'), warn: true },
              { value: 'moving', label: 'On the way', count: count('moving') },
              { value: 'finished', label: 'Finished', count: count('finished') },
            ]}
          />
        </div>

        <div className="flex flex-wrap">
          {/* List */}
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1 bg-muted/30 p-2.5 md:border-r">
            {isLoading ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : visible.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {tab === 'todo' ? 'Nothing for you to do.' : tab === 'moving' ? 'Nothing on the way.' : 'Nothing finished yet.'}
              </p>
            ) : (
              visible.map(({ req, stage, age }) => {
                const on = req.id === selId;
                const pill = PILL[stage] ?? PILL.submitted;
                const warn = stage === 'returned' || (stage === 'draft' && age >= 7) || (tabOf(stage) === 'moving' && age >= 30);
                return (
                  <button
                    key={req.id}
                    type="button"
                    aria-current={on}
                    onClick={() => setSel(req.id)}
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl px-3.5 py-3 text-left transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on && 'bg-card shadow-[0_0_0_1.5px_hsl(var(--primary)),0_6px_16px_rgba(11,107,90,.14)]'
                    )}
                  >
                    <span className="truncate text-sm font-bold">{nameOf(req)}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', pill.cls)}>{pill.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {req.status === 'draft' ? 'Draft' : displayRequestNumber(req.request_number)}
                      {req.created_at ? ` · ${formatDateDMY(req.created_at)}` : ''}
                    </span>
                    <span />
                    <span className="min-w-0 text-xs text-foreground/80">{WHO[stage] ?? ''}</span>
                    <span className={cn('text-right text-xs font-semibold', warn ? 'text-foreground' : 'text-muted-foreground')}>
                      {age === 0 ? 'today' : `${age}d`}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Detail */}
          <div className="min-w-0 flex-[999_1_460px]">
            {selId ? <RequestDetail id={selId} /> : <div className="hidden md:block" />}
          </div>
        </div>
      </section>
    </div>
  );
}

const DOT: Record<StepState, string> = {
  done: 'bg-primary text-white',
  current: 'border-2 border-primary bg-background text-primary ring-4 ring-primary/30',
  blocked: 'bg-destructive text-white',
  upcoming: 'border-2 border-border bg-background text-muted-foreground',
};

function RequestDetail({ id }: { id: string }) {
  const { data: pr } = usePurchaseRequest(id);
  const { data: journey } = useRequestJourney({ requestId: id }, pr?.status);
  const [section, setSection] = useState<'progress' | 'items' | 'notes'>('progress');

  if (!pr) return <p className="px-6 py-10 text-sm text-muted-foreground">Loading…</p>;

  const steps = journey ? journeySteps(journey).steps : [];
  const notes = [
    ...(pr.status === 'returned' && pr.returned_reason ? [{ kind: 'What to change', text: pr.returned_reason, tone: 'amber' }] : []),
    ...(pr.status === 'rejected' && pr.rejection_reason ? [{ kind: 'Reason for rejection', text: pr.rejection_reason, tone: 'red' }] : []),
    ...(pr.notes ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((text) => ({ kind: 'Note', text, tone: 'muted' })),
  ];
  const vendor = journey?.orders.length ? `${journey.orders.length} order${journey.orders.length === 1 ? '' : 's'}` : null;

  const action =
    pr.status === 'returned'
      ? { label: 'Make the changes', cls: 'bg-secondary text-secondary-foreground hover:bg-secondary' }
      : pr.status === 'draft'
        ? { label: 'Continue and submit', cls: 'bg-primary text-primary-foreground hover:bg-primary/90' }
        : { label: 'Open purchase', cls: 'border bg-background hover:bg-muted' };
  const now =
    pr.status === 'returned'
      ? `Sent back to you: ${pr.returned_reason ?? 'changes needed'}`
      : pr.status === 'draft'
        ? 'Not submitted — nobody has seen this yet.'
        : journey
          ? journeySteps(journey).now
          : null;

  return (
    <article className="flex h-full flex-col">
      <div className="space-y-3.5 px-6 pt-5">
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold">{pr.title || nameOf({ ...pr, item_preview: pr.items })}</h2>
          <p className="text-[13px] text-muted-foreground">
            {pr.status === 'draft' ? 'Draft' : displayRequestNumber(pr.request_number)} · raised {formatDateDMY(pr.created_at)}
            {vendor ? ` · ${vendor}` : ''}
          </p>
        </div>
        {now && (
          <p
            className={cn(
              'rounded-xl px-3.5 py-2.5 text-[13px]',
              pr.status === 'returned' || pr.status === 'draft'
                ? 'bg-secondary/20 text-foreground ring-1 ring-secondary'
                : pr.status === 'rejected'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-primary/10 text-primary'
            )}
          >
            <b>Now: </b>
            {now}
          </p>
        )}
        <div role="group" aria-label="Request details" className="flex gap-5 border-b">
          {(
            [
              ['progress', 'Progress', null],
              ['items', 'Items', pr.items.length],
              ['notes', 'Notes', notes.length || null],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              aria-pressed={section === key}
              onClick={() => setSection(key)}
              className={cn(
                '-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 border-transparent text-[13px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                section === key && 'border-primary text-foreground'
              )}
            >
              {label}
              {n != null && <span className="text-xs font-normal text-muted-foreground">{n}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[300px] flex-1 px-6 py-4">
        {section === 'progress' && (
          <ol aria-label="Progress" className="flex flex-col">
            {steps.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3.5">
                <span className="flex flex-col items-center">
                  <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold', DOT[s.state])}>
                    {s.state === 'done' ? '✓' : s.state === 'blocked' ? '✕' : i + 1}
                  </span>
                  {i < steps.length - 1 && (
                    <span className={cn('min-h-4 w-0.5 flex-1', s.state === 'done' ? 'bg-primary' : 'bg-border')} />
                  )}
                </span>
                <span className="flex flex-col gap-0.5 pb-3.5">
                  <span
                    className={cn(
                      'text-sm',
                      s.state === 'current' && 'font-extrabold',
                      s.state === 'done' && 'font-semibold',
                      s.state === 'blocked' && 'font-extrabold text-destructive',
                      s.state === 'upcoming' && 'text-muted-foreground'
                    )}
                  >
                    {s.title}
                  </span>
                  {s.note && <span className="text-xs text-muted-foreground">{s.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}

        {section === 'items' && (
          <ul>
            {pr.items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-4 border-t py-2.5 first:border-t-0">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{it.item_name}</span>
                  {it.item_spec && <span className="block text-xs text-muted-foreground">{it.item_spec}</span>}
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  {it.original_quantity != null && Number(it.original_quantity) !== Number(it.required_quantity) && (
                    <span className="block text-xs text-muted-foreground line-through">{Number(it.original_quantity)}</span>
                  )}
                  <b>{Number(it.required_quantity)}</b>
                  {packOrUnit(it) ? ` ${packOrUnit(it)}` : ''}
                  {it.original_quantity != null && Number(it.original_quantity) !== Number(it.required_quantity) && (
                    <span className="block text-[11px] font-bold text-foreground">changed by approver</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {section === 'notes' &&
          (notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes on this request.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n, i) => (
                <li
                  key={i}
                  className={cn(
                    'rounded-lg px-3 py-2 text-[13px]',
                    n.tone === 'amber' && 'bg-secondary/20',
                    n.tone === 'red' && 'bg-destructive/10',
                    n.tone === 'muted' && 'bg-muted/60'
                  )}
                >
                  <span className="block text-xs font-bold">{n.kind}</span>
                  {n.text}
                </li>
              ))}
            </ul>
          ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t bg-muted/30 px-6 py-3">
        <span className="text-xs text-muted-foreground">
          {pr.status === 'rejected'
            ? 'A rejected request cannot be reopened — raise a new one if it is still needed.'
            : pr.status === 'returned' || pr.status === 'draft'
              ? 'Your move.'
              : 'Nothing for you to do.'}
        </span>
        <Link
          href={`/procurement/requests/${pr.id}`}
          className={cn(
            'inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            action.cls
          )}
        >
          {action.label}
        </Link>
      </div>
    </article>
  );
}
