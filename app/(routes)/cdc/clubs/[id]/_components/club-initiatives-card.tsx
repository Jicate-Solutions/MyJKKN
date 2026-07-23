'use client';

// Initiatives run by a CDC club (BUG-004299).
// Self-contained card: list + add/edit dialog + delete confirm.
// Writes are RLS-gated to CDC staff, institution-scoped
// (cdc_club_initiatives policies). Mirrors the training semester-schedule-card.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useClubInitiatives, useAddClubInitiative, useUpdateClubInitiative, useDeleteClubInitiative,
} from '@/hooks/cdc/use-club-initiatives';
import {
  CDC_CLUB_INITIATIVE_STATUSES,
  CDC_CLUB_INITIATIVE_STATUS_LABELS,
} from '@/types/cdc/clubs-initiatives';
import type { CdcClubInitiative, CdcClubInitiativeStatus } from '@/types/cdc/clubs-initiatives';
import { CalendarRange, Loader2, Pencil, Plus, Rocket, Trash2 } from 'lucide-react';

interface Props {
  clubId: string;
  /** The parent club's institution — stamped onto new initiatives so RLS
   *  institution-scoping matches the club. Null → system-wide/unscoped. */
  institutionId?: string | null;
}

type FormState = {
  title: string;
  status: CdcClubInitiativeStatus;
  start_date: string;
  notes: string;
};

const EMPTY: FormState = { title: '', status: 'planned', start_date: '', notes: '' };

const STATUS_BADGE_CLASS: Record<CdcClubInitiativeStatus, string> = {
  planned: 'bg-gray-100 text-gray-700 hover:bg-gray-100',
  wip: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  launched: 'bg-green-100 text-green-800 hover:bg-green-100',
};

function fmtDate(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ClubInitiativesCard({ clubId, institutionId }: Props) {
  const { data: rows, isLoading } = useClubInitiatives(clubId);
  const addMutation = useAddClubInitiative(clubId);
  const updateMutation = useUpdateClubInitiative(clubId);
  const deleteMutation = useDeleteClubInitiative(clubId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CdcClubInitiative | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<CdcClubInitiative | null>(null);

  const saving = addMutation.isPending || updateMutation.isPending;

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  }

  function openEdit(row: CdcClubInitiative) {
    setEditing(row);
    setForm({
      title: row.title ?? '',
      status: row.status,
      start_date: row.start_date ?? '',
      notes: row.notes ?? '',
    });
    setDialogOpen(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (editing) {
      await updateMutation.mutateAsync({
        id: editing.id,
        dto: {
          title: form.title.trim(),
          status: form.status,
          start_date: form.start_date || null,
          notes: form.notes.trim() || null,
        },
      });
    } else {
      await addMutation.mutateAsync({
        club_id: clubId,
        institution_id: institutionId ?? null,
        title: form.title.trim(),
        status: form.status,
        start_date: form.start_date || null,
        notes: form.notes.trim() || null,
      });
    }
    setDialogOpen(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="w-4 h-4" /> Initiatives
        </CardTitle>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1.5" /> Add initiative
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : !rows || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No initiatives yet. Add one to track an event, drive or project this club is running.
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{row.title}</p>
                    <Badge variant="secondary" className={STATUS_BADGE_CLASS[row.status]}>
                      {CDC_CLUB_INITIATIVE_STATUS_LABELS[row.status]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {row.start_date && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarRange className="w-3.5 h-3.5" />
                        {fmtDate(row.start_date)}
                      </span>
                    )}
                  </div>
                  {row.notes && <p className="text-sm text-muted-foreground">{row.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Edit initiative">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(row)} aria-label="Delete initiative">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit initiative' : 'Add initiative'}</DialogTitle>
            <DialogDescription>Track an event, drive or project this club is running.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="initiative_title">Title *</Label>
              <Input
                id="initiative_title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Annual coding hackathon"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="initiative_status">Status</Label>
                <Select value={form.status} onValueChange={(v) => set('status', v as CdcClubInitiativeStatus)}>
                  <SelectTrigger id="initiative_status" className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {CDC_CLUB_INITIATIVE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{CDC_CLUB_INITIATIVE_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="initiative_start">Start Date</Label>
                <Input
                  id="initiative_start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set('start_date', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="initiative_notes">Notes</Label>
              <Textarea
                id="initiative_notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Goal, scope, outcome, etc."
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !form.title.trim()}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing ? 'Save changes' : 'Add initiative'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this initiative?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `"${deleteTarget.title}" will be removed. This cannot be undone.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
