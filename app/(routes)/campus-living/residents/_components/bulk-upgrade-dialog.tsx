'use client';

// Office-side bulk (and single, via a one-learner array) category upgrade.
// Flow: pick target room/mess category -> Preview (dry-run, per-learner
// eligibility) -> Confirm (commit). Mirrors the self-service lifecycle:
// eligible learners get the optimistic flip + upgrade bill; the existing cron +
// receipt trigger auto-revert/auto-confirm them. Manual (Premium) room targets
// are intentionally absent from the catalog — those stay per-learner.

import { useMemo, useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowRight, Building2, UtensilsCrossed, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useBulkUpgradeTargetCatalog,
  useBulkUpgradePreview,
  useBulkUpgradeCommit,
} from '@/hooks/campus-living/use-admin-category-upgrade';
import type { LearnerHostelite } from '@/types/campus-living';
import type {
  BulkUpgradeResultRow, BulkUpgradeTarget, UpgradeDimensionResult,
} from '@/types/campus-living/admin-category-upgrade';

const NONE = '__none__';
const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learners: LearnerHostelite[];
  /** Called after a successful commit (refresh table + clear selection). */
  onCommitted: () => void;
}

type Step = 'pick' | 'review' | 'done';

export function BulkUpgradeDialog({ open, onOpenChange, learners, onCommitted }: Props) {
  const { data: catalog, isLoading: catalogLoading } = useBulkUpgradeTargetCatalog(open);
  const preview = useBulkUpgradePreview();
  const commit = useBulkUpgradeCommit();

  const [step, setStep] = useState<Step>('pick');
  const [roomTarget, setRoomTarget] = useState<string>(NONE);
  const [messTarget, setMessTarget] = useState<string>(NONE);
  const [rows, setRows] = useState<BulkUpgradeResultRow[]>([]);

  const learnerIds = useMemo(() => learners.map((l) => l.id), [learners]);

  // Reset whenever the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setStep('pick');
      setRoomTarget(NONE);
      setMessTarget(NONE);
      setRows([]);
    }
  }, [open]);

  const roomOpts = catalog?.room ?? [];
  const messOpts = catalog?.mess ?? [];
  const hasTarget = roomTarget !== NONE || messTarget !== NONE;

  const input = useMemo(
    () => ({
      learnerIds,
      roomCategoryId: roomTarget === NONE ? null : roomTarget,
      messCategoryId: messTarget === NONE ? null : messTarget,
    }),
    [learnerIds, roomTarget, messTarget],
  );

  async function runPreview() {
    if (!hasTarget || preview.isPending) return;
    try {
      const res = await preview.mutateAsync(input);
      setRows(res);
      setStep('review');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed');
    }
  }

  async function runCommit() {
    if (commit.isPending) return;
    try {
      const res = await commit.mutateAsync(input);
      setRows(res);
      setStep('done');
      const upgraded = res.filter((r) => isApplied(r.room) || isApplied(r.mess)).length;
      toast.success(
        `${upgraded} learner${upgraded === 1 ? '' : 's'} upgraded`,
      );
      onCommitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upgrade failed');
    }
  }

  // ── Counts ────────────────────────────────────────────────────────────
  const counts = useMemo(() => tally(rows, step), [rows, step]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[860px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {step === 'done' ? 'Upgrade results' : 'Upgrade categories'}
          </DialogTitle>
          <DialogDescription>
            {step === 'pick'
              ? `Pick a target room and/or mess category to apply to ${learners.length} selected learner${learners.length === 1 ? '' : 's'}. Learners get the same pay-to-confirm flow as a self-upgrade.`
              : step === 'review'
                ? 'Review who will be upgraded. Only eligible learners are changed on confirm; the rest are skipped with a reason.'
                : 'Done. Eligible learners now show the new category (provisional until the upgrade fee is paid).'}
          </DialogDescription>
        </DialogHeader>

        {step === 'pick' && (
          <div className='space-y-4'>
            {catalogLoading ? (
              <div className='flex items-center text-sm text-muted-foreground py-6'>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading targets…
              </div>
            ) : (
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <TargetSelect
                  icon={<Building2 className='h-4 w-4' />}
                  label='Room category (auto-allocated only)'
                  value={roomTarget}
                  onChange={setRoomTarget}
                  options={roomOpts}
                  emptyHint='No auto room categories with a published fee.'
                />
                <TargetSelect
                  icon={<UtensilsCrossed className='h-4 w-4' />}
                  label='Mess category'
                  value={messTarget}
                  onChange={setMessTarget}
                  options={messOpts}
                  emptyHint='No mess categories with a published fee.'
                />
              </div>
            )}
            <p className='text-xs text-muted-foreground'>
              Manual room categories (e.g. Premium) need a specific room per learner and are not
              offered in bulk — upgrade those from the learner&apos;s own My Hostel page.
            </p>
          </div>
        )}

        {(step === 'review' || step === 'done') && (
          <div className='space-y-3'>
            <div className='flex flex-wrap gap-2 text-xs'>
              {step === 'review' ? (
                <>
                  <Badge variant='outline' className='border-emerald-400 text-emerald-700 dark:text-emerald-400'>
                    {counts.eligible} eligible
                  </Badge>
                  <Badge variant='outline' className='text-muted-foreground'>
                    {counts.skipped} skipped
                  </Badge>
                </>
              ) : (
                <>
                  <Badge variant='outline' className='border-emerald-400 text-emerald-700 dark:text-emerald-400'>
                    {counts.applied} upgraded
                  </Badge>
                  <Badge variant='outline' className='text-muted-foreground'>
                    {counts.skipped} skipped
                  </Badge>
                  {counts.errored > 0 && (
                    <Badge variant='outline' className='border-red-400 text-red-700 dark:text-red-400'>
                      {counts.errored} failed
                    </Badge>
                  )}
                </>
              )}
            </div>

            <div className='rounded-md border overflow-x-auto max-h-[46vh] overflow-y-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner</TableHead>
                    {roomTarget !== NONE && <TableHead>Room</TableHead>}
                    {messTarget !== NONE && <TableHead>Mess</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.learner_id}>
                      <TableCell>
                        <div className='font-medium'>{r.name ?? '(unnamed)'}</div>
                        <div className='font-mono text-xs text-muted-foreground'>{r.roll_number ?? '—'}</div>
                      </TableCell>
                      {roomTarget !== NONE && (
                        <TableCell><DimensionCell dim={r.room} /></TableCell>
                      )}
                      {messTarget !== NONE && (
                        <TableCell><DimensionCell dim={r.mess} /></TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'pick' && (
            <>
              <Button variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={runPreview} disabled={!hasTarget || preview.isPending}>
                {preview.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                Preview <ArrowRight className='ml-1.5 h-4 w-4' />
              </Button>
            </>
          )}
          {step === 'review' && (
            <>
              <Button variant='outline' onClick={() => setStep('pick')} disabled={commit.isPending}>
                Back
              </Button>
              <Button onClick={runCommit} disabled={counts.eligible === 0 || commit.isPending}>
                {commit.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                Upgrade {counts.eligible} learner{counts.eligible === 1 ? '' : 's'}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function TargetSelect({
  icon, label, value, onChange, options, emptyHint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: BulkUpgradeTarget[];
  emptyHint: string;
}) {
  const girls = options.filter((o) => o.type === 'girls');
  const boys = options.filter((o) => o.type === 'boys');
  const other = options.filter((o) => o.type !== 'girls' && o.type !== 'boys');
  return (
    <div className='space-y-1.5'>
      <label className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
        {icon} {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder='— No change —' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— No change —</SelectItem>
          {options.length === 0 && (
            <div className='px-2 py-1.5 text-xs text-muted-foreground'>{emptyHint}</div>
          )}
          {girls.length > 0 && (
            <SelectGroup>
              <SelectLabel>Girls</SelectLabel>
              {girls.map((o) => <TargetItem key={o.category_id} o={o} />)}
            </SelectGroup>
          )}
          {boys.length > 0 && (
            <SelectGroup>
              <SelectLabel>Boys</SelectLabel>
              {boys.map((o) => <TargetItem key={o.category_id} o={o} />)}
            </SelectGroup>
          )}
          {other.map((o) => <TargetItem key={o.category_id} o={o} />)}
        </SelectContent>
      </Select>
    </div>
  );
}

function TargetItem({ o }: { o: BulkUpgradeTarget }) {
  return (
    <SelectItem value={o.category_id}>
      {o.name} · {inr(o.current_year_fee)}
    </SelectItem>
  );
}

function DimensionCell({ dim }: { dim: UpgradeDimensionResult | null }) {
  if (!dim) return <span className='text-muted-foreground'>—</span>;

  if (dim.status === 'skipped') {
    return (
      <div className='space-y-0.5'>
        <Badge variant='outline' className='text-muted-foreground'>Skipped</Badge>
        {dim.reason && <div className='text-[11px] text-muted-foreground'>{dim.reason}</div>}
      </div>
    );
  }
  if (dim.status === 'error') {
    return (
      <div className='space-y-0.5'>
        <Badge variant='outline' className='border-red-400 text-red-700 dark:text-red-400'>
          <AlertTriangle className='mr-1 h-3 w-3' /> Failed
        </Badge>
        {dim.reason && <div className='text-[11px] text-red-700 dark:text-red-400'>{dim.reason}</div>}
      </div>
    );
  }

  // eligible (preview) | upgraded | pending_payment (commit)
  const transition = (
    <span className='text-sm'>
      {dim.current_category_name ?? '—'}{' '}
      <ArrowRight className='inline h-3 w-3 text-muted-foreground' />{' '}
      <span className='font-medium'>{dim.target_category_name ?? '—'}</span>
    </span>
  );

  return (
    <div className='space-y-0.5'>
      {transition}
      <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
        <span>Fee {inr(dim.upgrade_fee)}</span>
        {dim.status === 'eligible' && dim.meets_threshold === false && (
          <span className='text-amber-700 dark:text-amber-400'>
            · paid {dim.paid_pct ?? 0}% of {dim.threshold_pct}% — reserves, pay to confirm
          </span>
        )}
        {dim.status === 'upgraded' && (
          <span className='flex items-center gap-1 text-emerald-700 dark:text-emerald-400'>
            <CheckCircle2 className='h-3 w-3' /> Upgraded
          </span>
        )}
        {dim.status === 'pending_payment' && (
          <span className='text-amber-700 dark:text-amber-400'>· Provisional — pay to confirm</span>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isApplied(dim: UpgradeDimensionResult | null): boolean {
  return dim?.status === 'upgraded' || dim?.status === 'pending_payment';
}

function tally(rows: BulkUpgradeResultRow[], step: Step) {
  let eligible = 0, applied = 0, skipped = 0, errored = 0;
  for (const r of rows) {
    const dims = [r.room, r.mess].filter(Boolean) as UpgradeDimensionResult[];
    // A learner counts as eligible/applied if ANY chosen dimension is.
    if (dims.some((d) => d.status === 'eligible')) eligible++;
    if (dims.some((d) => isApplied(d))) applied++;
    if (dims.length > 0 && dims.every((d) => d.status === 'skipped')) skipped++;
    if (dims.some((d) => d.status === 'error')) errored++;
  }
  return { eligible, applied, skipped, errored };
}
