'use client';

// app/(routes)/meetings/series/rules/_components/rules-editor.tsx
//
// The scheduling rules — piece 2 of the Monthly Slate spec. Two of them, both
// the EAO's to set:
//
//   BLOCKED PERIODS — public holidays and festivals ONLY. Travel is absent on
//   purpose: a travel week turns a series into an online meeting (the "may be
//   held online" switch on the series) rather than blocking it, so offering a
//   "travel" block here would let someone encode the opposite of the decision.
//
//   ROTATION ORDER — one order over the colleges. When two want the same slot,
//   whoever went first last cycle goes later this cycle.
//
// There is deliberately NO "maximum meetings per day" control: the Director
// decided there is no cap.
//
// Mobile-first: single column at 390px, controls full-width, the order list
// moved with explicit up/down buttons rather than drag (drag is unusable on a
// phone and unreachable by keyboard).

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, CalendarOff, Loader2, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { BLOCK_KIND_OPTIONS, type BlockKind } from '@/lib/services/meetings/recurring-series-config';
import type { InstitutionOption } from '../../actions';
import {
  createBlockedPeriod,
  deleteBlockedPeriod,
  listBlockedPeriods,
  saveRotationOrder,
  setBlockedPeriodActive,
  type BlockedPeriod,
} from '../actions';

/** Human date label from "YYYY-MM-DD" with no Date() timezone drift. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function RulesEditor({
  initialBlockedPeriods,
  initialRotation,
  institutions,
}: {
  initialBlockedPeriods: BlockedPeriod[];
  initialRotation: string[];
  institutions: InstitutionOption[];
}) {
  return (
    <div className="space-y-4">
      <BlockedPeriodsCard initial={initialBlockedPeriods} institutions={institutions} />
      <RotationOrderCard initial={initialRotation} institutions={institutions} />
    </div>
  );
}

function BlockedPeriodsCard({
  initial,
  institutions,
}: {
  initial: BlockedPeriod[];
  institutions: InstitutionOption[];
}) {
  const [periods, setPeriods] = useState<BlockedPeriod[]>(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BlockKind>('public_holiday');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [institutionId, setInstitutionId] = useState('all');
  const [isSaving, startSave] = useTransition();

  const institutionName = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of institutions) map.set(i.id, i.name);
    return map;
  }, [institutions]);

  async function reload() {
    const result = await listBlockedPeriods();
    if (result.success && result.data) setPeriods(result.data);
  }

  function add() {
    startSave(async () => {
      const result = await createBlockedPeriod({
        name,
        blockKind: kind,
        startsOn,
        // A single-day holiday is the common case; an empty end means "same day"
        // rather than an error the user has to work out.
        endsOn: endsOn || startsOn,
        institutionId: institutionId === 'all' ? null : institutionId,
      });
      if (!result.success) {
        toast.error(result.error ?? 'Could not add the blocked period.');
        return;
      }
      toast.success('Blocked period added.');
      setName('');
      setStartsOn('');
      setEndsOn('');
      setInstitutionId('all');
      setAdding(false);
      await reload();
    });
  }

  function toggle(p: BlockedPeriod) {
    startSave(async () => {
      const result = await setBlockedPeriodActive(p.id, !p.isActive);
      if (!result.success) {
        toast.error(result.error ?? 'Could not update the blocked period.');
        return;
      }
      await reload();
    });
  }

  function remove(p: BlockedPeriod) {
    startSave(async () => {
      const result = await deleteBlockedPeriod(p.id);
      if (!result.success) {
        toast.error(result.error ?? 'Could not remove the blocked period.');
        return;
      }
      toast.success(`"${p.name}" removed.`);
      await reload();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">Blocked periods</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Public holidays and festivals. Nothing is placed inside one. Travel is not here
            on purpose — a travel week turns a meeting online instead of blocking it.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)} className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Add
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {adding && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="block-name">Name</Label>
              <Input
                id="block-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Deepavali"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="block-kind">Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as BlockKind)}>
                  <SelectTrigger id="block-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOCK_KIND_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="block-institution">Applies to</Label>
                <Select value={institutionId} onValueChange={setInstitutionId}>
                  <SelectTrigger id="block-institution">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Every college</SelectItem>
                    {institutions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="block-start">First day</Label>
                <Input
                  id="block-start"
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="block-end">Last day</Label>
                <Input
                  id="block-end"
                  type="date"
                  value={endsOn}
                  min={startsOn || undefined}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave empty for a single day.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setAdding(false)}
                disabled={isSaving}
                className="sm:w-auto"
              >
                Cancel
              </Button>
              <Button onClick={add} disabled={isSaving} className="sm:w-auto">
                {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                Add period
              </Button>
            </div>
          </div>
        )}

        {periods.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CalendarOff className="h-7 w-7 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium">No blocked periods yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Until a holiday is added here, nothing stops a meeting landing on one.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {periods.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(p.startsOn)}
                    {p.endsOn !== p.startsOn && ` – ${formatDate(p.endsOn)}`}
                    {' · '}
                    {p.institutionId
                      ? institutionName.get(p.institutionId) ?? 'One college'
                      : 'Every college'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant={p.blockKind === 'festival' ? 'secondary' : 'outline'}>
                    {p.blockKind === 'festival' ? 'Festival' : 'Holiday'}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggle(p)}
                    disabled={isSaving}
                  >
                    {p.isActive ? 'Pause' : 'Resume'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(p)}
                    disabled={isSaving}
                    aria-label={`Remove ${p.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RotationOrderCard({
  initial,
  institutions,
}: {
  initial: string[];
  institutions: InstitutionOption[];
}) {
  // Start from the saved order, then append any college that has never been
  // ordered — a newly added college must appear rather than silently sit
  // outside the rotation.
  const [order, setOrder] = useState<string[]>(() => {
    const known = new Set(institutions.map((i) => i.id));
    const saved = initial.filter((id) => known.has(id));
    const savedSet = new Set(saved);
    return [...saved, ...institutions.filter((i) => !savedSet.has(i.id)).map((i) => i.id)];
  });
  const [isSaving, startSave] = useTransition();

  const institutionName = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of institutions) map.set(i.id, i.name);
    return map;
  }, [institutions]);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setOrder(next);
  }

  function save() {
    startSave(async () => {
      const result = await saveRotationOrder(order);
      if (!result.success) {
        toast.error(result.error ?? 'Could not save the rotation order.');
        return;
      }
      toast.success('Rotation order saved.');
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-base">Rotation order</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          When two colleges want the same slot, whoever went first last cycle goes later this
          cycle. This is the order that rotation walks — nobody stays permanently squeezed.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {order.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No active colleges found.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {order.map((id, index) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-border p-2"
              >
                <span className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {institutionName.get(id) ?? 'Unknown college'}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${institutionName.get(id) ?? 'college'} earlier`}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    aria-label={`Move ${institutionName.get(id) ?? 'college'} later`}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={isSaving || order.length === 0}>
            {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
            Save order
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
