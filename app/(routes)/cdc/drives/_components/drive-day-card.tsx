'use client';

/**
 * DriveDayCard — the drive page's entry to the drive-day chain:
 * finalize participants → assign coordinators → mark attendance.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Award, ClipboardCheck, Files, Loader2, UserCheck, UserCog, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  useCdcDriveCoordinatorOptions,
  useCdcDriveCoordinators,
  useSetCdcDriveCoordinators,
} from '@/hooks/cdc/use-cdc-drive-day';
import type { CdcDrive } from '@/types/cdc';

const STAGE_STATUSES = new Set(['willingness_open', 'eligibility_locked', 'attendance_day', 'results_announced', 'closed']);

export function DriveDayCard({ drive, canEdit }: { drive: CdcDrive; canEdit: boolean }) {
  const { data } = useCdcDriveCoordinators(drive.id);
  const [open, setOpen] = useState(false);
  const finalized = !!drive.participants_finalized_at;
  const editable = drive.status !== 'closed' && drive.status !== 'cancelled';

  if (!STAGE_STATUSES.has(drive.status)) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          Drive day
        </CardTitle>
        <CardDescription>
          {finalized
            ? `Participants finalized ${new Date(drive.participants_finalized_at!).toLocaleDateString()}`
            : 'Finalize participants to create the attendance list.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2">
          <Button asChild variant={finalized ? 'outline' : 'default'} size="sm" className="justify-start">
            <Link href={`/cdc/drives/${drive.id}/participants`}>
              <UserCheck className="h-4 w-4 mr-2" /> {finalized ? 'Participants' : 'Finalize participants'}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link href={`/cdc/drives/${drive.id}/attendance`}>
              <ClipboardCheck className="h-4 w-4 mr-2" /> Attendance
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link href={`/cdc/drives/${drive.id}/selected`}>
              <Award className="h-4 w-4 mr-2" /> Selected learners
            </Link>
          </Button>
          {canEdit ? (
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href={`/cdc/drives/${drive.id}/documents/bulk-upload`}>
                <Files className="h-4 w-4 mr-2" /> Bulk upload offer letters
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
              Coordinators
            </p>
            {canEdit && editable ? (
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setOpen(true)}>
                Assign
              </Button>
            ) : null}
          </div>
          {(data?.coordinators ?? []).length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Nobody assigned yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {data!.coordinators.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">
                    {c.name}
                    {c.designation ? <span className="text-muted-foreground"> · {c.designation}</span> : null}
                  </span>
                  {!c.has_login ? <Badge variant="outline" className="font-normal shrink-0">No login</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      {open ? (
        <AssignDialog
          driveId={drive.id}
          initial={(data?.coordinators ?? []).map((c) => c.staff_id)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </Card>
  );
}

function AssignDialog({
  driveId,
  initial,
  onClose,
}: {
  driveId: string;
  initial: string[];
  onClose: () => void;
}) {
  const save = useSetCdcDriveCoordinators(driveId);
  const { data: optionData, isLoading: optionsLoading } = useCdcDriveCoordinatorOptions(driveId, true);
  const options = useMemo(() => optionData ?? [], [optionData]);
  const [chosen, setChosen] = useState<string[]>(initial);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return list.slice(0, 100);
  }, [options, search]);
  const labelOf = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);

  function toggle(id: string) {
    setChosen((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function handleSave() {
    try {
      const res = await save.mutateAsync(chosen);
      toast.success(
        `Coordinators saved` +
          (res.added ? ` · ${res.added} added` : '') +
          (res.removed ? ` · ${res.removed} removed` : '') +
          (res.notified ? ` · ${res.notified} notified` : '')
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save coordinators');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign drive coordinators</DialogTitle>
          <DialogDescription>
            Assigned team members see only this drive and can mark its attendance. They are notified once.
          </DialogDescription>
        </DialogHeader>

        {chosen.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {chosen.map((id) => (
              <Badge key={id} variant="secondary" className="font-normal gap-1">
                {labelOf.get(id) ?? id}
                <button type="button" onClick={() => toggle(id)} aria-label="Remove">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}

        <Input placeholder="Search by name, code or designation" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
          {optionsLoading ? (
            <p className="p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading team members…
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No team members match.</p>
          ) : (
            filtered.map((o) => (
              <label key={o.value} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                <Checkbox checked={chosen.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                <span className="flex-1 min-w-0 truncate">{o.label}</span>
                {!o.has_login ? <Badge variant="outline" className="font-normal shrink-0">No login</Badge> : null}
              </label>
            ))
          )}
        </div>
        {options.length > 100 && !search ? (
          <p className="text-xs text-muted-foreground">Showing the first 100. Search to find others.</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
