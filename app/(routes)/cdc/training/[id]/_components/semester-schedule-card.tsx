'use client';

// Per-semester schedule/hours for a training programme (BUG-004200).
// Self-contained card: list + add/edit dialog + delete confirm.
// Writes are RLS-gated to CDC staff (cdc_training_semester_schedules policies).

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useCdcSemesterSchedules, useAddSemesterSchedule, useUpdateSemesterSchedule, useDeleteSemesterSchedule,
} from '@/hooks/cdc/use-cdc-training';
import type { CdcTrainingSemesterSchedule } from '@/types/cdc/training';
import { CalendarRange, Clock, Loader2, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useSemestersForDepartmentPicker } from '@/hooks/cdc/use-cdc-pickers';
import { TrainerPicker } from '../../_components/trainer-picker';

interface Props {
  programmeId: string;
  /** The programme's target department — scopes the Semester picker to that
   *  department's real semesters. Null/undefined → institution-wide fallback. */
  targetDepartmentId?: string | null;
}

type FormState = {
  semester_label: string;
  total_hours: string;
  start_date: string;
  end_date: string;
  trainer_name: string;
  trainer_staff_id: string;
  notes: string;
};

const EMPTY: FormState = {
  semester_label: '', total_hours: '', start_date: '', end_date: '', trainer_name: '', trainer_staff_id: '', notes: '',
};

function fmtDate(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function SemesterScheduleCard({ programmeId, targetDepartmentId }: Props) {
  const { data: rows, isLoading } = useCdcSemesterSchedules(programmeId);
  const { data: semesterOptions = [], isLoading: semestersLoading } =
    useSemestersForDepartmentPicker(targetDepartmentId);
  const addMutation = useAddSemesterSchedule();
  const updateMutation = useUpdateSemesterSchedule();
  const deleteMutation = useDeleteSemesterSchedule(programmeId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CdcTrainingSemesterSchedule | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<CdcTrainingSemesterSchedule | null>(null);

  const dateRangeInvalid = !!form.start_date && !!form.end_date && form.end_date < form.start_date;
  const saving = addMutation.isPending || updateMutation.isPending;

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  }

  function openEdit(row: CdcTrainingSemesterSchedule) {
    setEditing(row);
    setForm({
      semester_label: row.semester_label ?? '',
      total_hours: row.total_hours != null ? String(row.total_hours) : '',
      start_date: row.start_date ?? '',
      end_date: row.end_date ?? '',
      trainer_name: row.trainer_name ?? '',
      trainer_staff_id: row.trainer_staff_id ?? '',
      notes: row.notes ?? '',
    });
    setDialogOpen(true);
  }

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.semester_label.trim() || dateRangeInvalid) return;
    const payload = {
      semester_label: form.semester_label.trim(),
      total_hours: form.total_hours ? Number(form.total_hours) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      trainer_name: form.trainer_name.trim() || null,
      trainer_staff_id: form.trainer_staff_id || null,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, dto: payload });
    } else {
      await addMutation.mutateAsync({ programme_id: programmeId, ...payload });
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
        <CardTitle className="text-base">Semester Schedule</CardTitle>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1.5" /> Add semester
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : !rows || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No per-semester schedule yet. Add a semester to record its own hours, dates and trainer.
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div className="space-y-1">
                  <p className="font-medium">{row.semester_label}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {row.total_hours != null && (
                      <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{row.total_hours} hrs</span>
                    )}
                    {(row.start_date || row.end_date) && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarRange className="w-3.5 h-3.5" />
                        {fmtDate(row.start_date)}{row.end_date ? ` – ${fmtDate(row.end_date)}` : ''}
                      </span>
                    )}
                    {row.trainer_name && (
                      <span className="inline-flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{row.trainer_name}</span>
                    )}
                  </div>
                  {row.notes && <p className="text-sm text-muted-foreground">{row.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Edit semester">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(row)} aria-label="Delete semester">
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
            <DialogTitle>{editing ? 'Edit semester' : 'Add semester'}</DialogTitle>
            <DialogDescription>Each semester keeps its own hours, dates and trainer.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="semester_label">Semester *</Label>
              {semesterOptions.length > 0 || semestersLoading ? (
                <SearchableSelect
                  value={form.semester_label}
                  onValueChange={(v) => set('semester_label', v)}
                  options={semesterOptions}
                  placeholder="Select semester…"
                  searchPlaceholder="Search semesters…"
                  emptyMessage="No semesters for this department"
                  loading={semestersLoading}
                  modal
                  className="w-full"
                />
              ) : (
                // Fallback: target department has no semesters in MyJKKN (or the
                // programme targets all departments) — let the user type a label
                // so the field is never unusable.
                <Input
                  id="semester_label"
                  value={form.semester_label}
                  onChange={(e) => set('semester_label', e.target.value)}
                  placeholder="e.g. Semester 1"
                  required
                />
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="total_hours">Total Hours</Label>
                <Input
                  id="total_hours"
                  type="number"
                  min={1}
                  value={form.total_hours}
                  onChange={(e) => set('total_hours', e.target.value)}
                  placeholder="e.g. 40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sem_trainer">Trainer</Label>
                <TrainerPicker
                  id="sem_trainer"
                  modal
                  value={{ trainerStaffId: form.trainer_staff_id || null, trainerName: form.trainer_name || null }}
                  onChange={(next) =>
                    setForm((prev) => ({
                      ...prev,
                      trainer_staff_id: next.trainerStaffId ?? '',
                      trainer_name: next.trainerName ?? '',
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sem_start">Start Date</Label>
                <Input
                  id="sem_start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set('start_date', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sem_end">End Date</Label>
                <Input
                  id="sem_end"
                  type="date"
                  value={form.end_date}
                  min={form.start_date || undefined}
                  aria-invalid={dateRangeInvalid}
                  onChange={(e) => set('end_date', e.target.value)}
                />
              </div>
            </div>
            {dateRangeInvalid && (
              <p className="text-sm text-destructive" role="alert">End Date cannot be earlier than Start Date.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="sem_notes">Notes</Label>
              <Textarea
                id="sem_notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Syllabus focus, venue, etc."
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !form.semester_label.trim() || dateRangeInvalid}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing ? 'Save changes' : 'Add semester'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this semester?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `"${deleteTarget.semester_label}" and its schedule will be removed. This cannot be undone.` : ''}
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
