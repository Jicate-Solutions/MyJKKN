'use client';

// assign-learners-dialog.tsx
//
// Assign one scheme to many learners for ONE academic year.
//
// The year scoping is the point: a concession must be re-granted each year
// rather than rolling forward silently. A learner whose family circumstances
// changed should not keep a waiver because nobody remembered to remove it.

import { useMemo, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useEnrolledLearners, useSchoolClasses } from '@/hooks/school-fees/use-school-fee-plans';
import type { SchoolFeeConcessionScheme } from '@/types/school-fees';

interface AssignLearnersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheme: SchoolFeeConcessionScheme | null;
  institutionId: string;
  academicYearId: string;
  yearName: string;
  /** Learner ids already carrying this scheme for the year — pre-checked and locked. */
  alreadyAssigned: Set<string>;
  saving: boolean;
  onAssign: (learnerIds: string[]) => Promise<unknown>;
}

const ALL_CLASSES = '__all__';

export function AssignLearnersDialog({
  open,
  onOpenChange,
  scheme,
  institutionId,
  academicYearId,
  yearName,
  alreadyAssigned,
  saving,
  onAssign,
}: AssignLearnersDialogProps) {
  const [classFilter, setClassFilter] = useState(ALL_CLASSES);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { classes } = useSchoolClasses(open ? institutionId : undefined);
  const { learners, loading } = useEnrolledLearners(
    open ? institutionId : undefined,
    open ? academicYearId : undefined,
    classFilter === ALL_CLASSES ? undefined : classFilter,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return learners;
    return learners.filter((l) => {
      const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.toLowerCase();
      return name.includes(q) || (l.roll_number ?? '').toLowerCase().includes(q);
    });
  }, [learners, search]);

  // Only learners who don't already have the scheme can be picked, so the
  // "select all" checkbox never promises work it won't do.
  const selectable = useMemo(
    () => filtered.filter((l) => !alreadyAssigned.has(l.id)),
    [filtered, alreadyAssigned],
  );

  const allSelected = selectable.length > 0 && selectable.every((l) => selected.has(l.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        for (const l of selectable) next.delete(l.id);
        return next;
      }
      return new Set([...prev, ...selectable.map((l) => l.id)]);
    });
  }

  async function handleAssign() {
    if (selected.size === 0) return;
    await onAssign([...selected]);
    setSelected(new Set());
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelected(new Set());
          setSearch('');
          setClassFilter(ALL_CLASSES);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign &ldquo;{scheme?.name}&rdquo;</DialogTitle>
          <DialogDescription>
            {scheme?.mode === 'percent'
              ? `${scheme.value}% off`
              : `₹${scheme?.value ?? 0} off`}{' '}
            {scheme?.applies_to_all_heads ? 'every fee head' : 'the selected fee heads'} — for{' '}
            <strong>{yearName}</strong> only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-class">Class</Label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger id="assign-class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.program_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="assign-search"
                  className="pl-8"
                  placeholder="Name or roll number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={allSelected}
                disabled={selectable.length === 0}
                onCheckedChange={toggleAll}
              />
              Select all {selectable.length} available
            </label>
            <Badge variant={selected.size > 0 ? 'default' : 'outline'}>
              {selected.size} selected
            </Badge>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-[220px] rounded-md border">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading learners…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No enrolled learner matches. Only learners marked active for {yearName} appear here.
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((l) => {
                const has = alreadyAssigned.has(l.id);
                return (
                  <label
                    key={l.id}
                    htmlFor={`learner-${l.id}`}
                    className={`flex items-center gap-3 p-2.5 ${has ? 'opacity-60' : 'cursor-pointer'}`}
                  >
                    <Checkbox
                      id={`learner-${l.id}`}
                      checked={has || selected.has(l.id)}
                      disabled={has}
                      onCheckedChange={() => toggle(l.id)}
                    />
                    <span className="text-sm tabular-nums w-32 shrink-0">
                      {l.roll_number ?? '—'}
                    </span>
                    <span className="text-sm flex-1">
                      {`${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || '—'}
                    </span>
                    {has ? <Badge variant="secondary">Already assigned</Badge> : null}
                  </label>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <Alert>
          <AlertDescription className="text-xs">
            Assignments apply to <strong>{yearName}</strong> only and do not roll forward. Re-running
            this is safe — learners who already have the scheme are skipped, not duplicated.
          </AlertDescription>
        </Alert>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={selected.size === 0 || saving}>
            <UserPlus className="h-4 w-4 mr-1" />
            {saving ? 'Assigning…' : `Assign ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
