'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { SYSTEM_ROLES } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, BookOpen, Loader2 } from 'lucide-react';
import {
  useNorms,
  useCreateNorm,
  useUpdateNorm,
  useDeleteNorm,
  useBodies,
} from '@/hooks/hr/recruitment-need/use-recruitment-admin';
import type { HRRegulatoryNorm, HRRegulatoryBody } from '@/types/hr-recruitment-need';

const ADMIN_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR];

type NormFormData = {
  body_id: string;
  program_type: string;
  sfr_norm_ratio: number;
  sfr_denominator_type: 'student' | 'bed' | 'custom';
  count_adjunct: boolean;
  adjunct_weight: number;
  count_visiting: boolean;
  visiting_weight: number;
  threshold_amber_pct: number;
  threshold_red_pct: number;
  effective_from: string;
  effective_until: string;
  notes: string;
  is_active: boolean;
};

const EMPTY_FORM: NormFormData = {
  body_id: '',
  program_type: '',
  sfr_norm_ratio: 15,
  sfr_denominator_type: 'student',
  count_adjunct: false,
  adjunct_weight: 0.5,
  count_visiting: false,
  visiting_weight: 0.25,
  threshold_amber_pct: 80,
  threshold_red_pct: 60,
  effective_from: '',
  effective_until: '',
  notes: '',
  is_active: true,
};

export default function NormsAdminPage() {
  const { data: norms, isLoading } = useNorms();
  const { data: bodies } = useBodies();
  const createMut = useCreateNorm();
  const updateMut = useUpdateNorm();
  const deleteMut = useDeleteNorm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<(HRRegulatoryNorm & { body?: HRRegulatoryBody }) | null>(null);
  const [form, setForm] = useState<NormFormData>(EMPTY_FORM);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (n: HRRegulatoryNorm & { body?: HRRegulatoryBody }) => {
    setEditing(n);
    setForm({
      body_id: n.body_id,
      program_type: n.program_type,
      sfr_norm_ratio: n.sfr_norm_ratio,
      sfr_denominator_type: n.sfr_denominator_type,
      count_adjunct: n.count_adjunct,
      adjunct_weight: n.adjunct_weight,
      count_visiting: n.count_visiting,
      visiting_weight: n.visiting_weight,
      threshold_amber_pct: n.threshold_amber_pct,
      threshold_red_pct: n.threshold_red_pct,
      effective_from: n.effective_from ?? '',
      effective_until: n.effective_until ?? '',
      notes: n.notes ?? '',
      is_active: n.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      body_id: form.body_id,
      program_type: form.program_type.trim(),
      sfr_norm_ratio: form.sfr_norm_ratio,
      sfr_denominator_type: form.sfr_denominator_type,
      count_adjunct: form.count_adjunct,
      adjunct_weight: form.adjunct_weight,
      count_visiting: form.count_visiting,
      visiting_weight: form.visiting_weight,
      threshold_amber_pct: form.threshold_amber_pct,
      threshold_red_pct: form.threshold_red_pct,
      effective_from: form.effective_from || null,
      effective_until: form.effective_until || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteMut.mutateAsync(deleteId);
    setDeleteId(null);
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  const bodyName = (bodyId: string) =>
    bodies?.find((b) => b.id === bodyId)?.abbreviation ?? bodyId;

  return (
    <AdminPermissionGuard adminRoles={ADMIN_ROLES}>
      <ContentLayout title="Regulatory Norms">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Regulatory Norms</h1>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add Norm
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Body</TableHead>
                    <TableHead>Program Type</TableHead>
                    <TableHead className="text-right">SFR Norm</TableHead>
                    <TableHead>Denom.</TableHead>
                    <TableHead className="text-right">Adjunct Wt.</TableHead>
                    <TableHead className="text-right">Visiting Wt.</TableHead>
                    <TableHead className="text-right">Amber %</TableHead>
                    <TableHead className="text-right">Red %</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!norms || norms.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No regulatory norms found.
                      </TableCell>
                    </TableRow>
                  )}
                  {norms?.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {n.body?.abbreviation ?? bodyName(n.body_id)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{n.program_type}</TableCell>
                      <TableCell className="text-right">{n.sfr_norm_ratio}:1</TableCell>
                      <TableCell className="text-xs">{n.sfr_denominator_type}</TableCell>
                      <TableCell className="text-right">
                        {n.count_adjunct ? n.adjunct_weight : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {n.count_visiting ? n.visiting_weight : '-'}
                      </TableCell>
                      <TableCell className="text-right">{n.threshold_amber_pct}%</TableCell>
                      <TableCell className="text-right">{n.threshold_red_pct}%</TableCell>
                      <TableCell>
                        <Badge variant={n.is_active ? 'default' : 'secondary'}>
                          {n.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(n)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(n.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Add / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit' : 'Add'} Regulatory Norm</DialogTitle>
              <DialogDescription>
                {editing ? 'Update the norm configuration.' : 'Define a new SFR norm.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              {/* Body select */}
              <div className="grid gap-1.5">
                <Label>Regulatory Body</Label>
                <Select
                  value={form.body_id}
                  onValueChange={(v) => setForm({ ...form, body_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select body" />
                  </SelectTrigger>
                  <SelectContent>
                    {bodies?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.abbreviation} - {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="program_type">Program Type</Label>
                <Input
                  id="program_type"
                  value={form.program_type}
                  onChange={(e) => setForm({ ...form, program_type: e.target.value })}
                  placeholder="e.g. B.Tech, BDS, M.Pharm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="sfr_norm_ratio">SFR Norm Ratio</Label>
                  <Input
                    id="sfr_norm_ratio"
                    type="number"
                    step="0.1"
                    value={form.sfr_norm_ratio}
                    onChange={(e) => setForm({ ...form, sfr_norm_ratio: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Denominator Type</Label>
                  <Select
                    value={form.sfr_denominator_type}
                    onValueChange={(v) =>
                      setForm({ ...form, sfr_denominator_type: v as NormFormData['sfr_denominator_type'] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="bed">Bed</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Counting rules */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Counting Rules</p>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.count_adjunct}
                      onChange={(e) => setForm({ ...form, count_adjunct: e.target.checked })}
                    />
                    Count Adjunct
                  </label>
                  {form.count_adjunct && (
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="adjunct_weight" className="text-xs">Weight:</Label>
                      <Input
                        id="adjunct_weight"
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        className="w-20 h-8"
                        value={form.adjunct_weight}
                        onChange={(e) => setForm({ ...form, adjunct_weight: Number(e.target.value) })}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.count_visiting}
                      onChange={(e) => setForm({ ...form, count_visiting: e.target.checked })}
                    />
                    Count Visiting
                  </label>
                  {form.count_visiting && (
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="visiting_weight" className="text-xs">Weight:</Label>
                      <Input
                        id="visiting_weight"
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        className="w-20 h-8"
                        value={form.visiting_weight}
                        onChange={(e) => setForm({ ...form, visiting_weight: Number(e.target.value) })}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Thresholds */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="threshold_amber_pct">Amber Threshold (%)</Label>
                  <Input
                    id="threshold_amber_pct"
                    type="number"
                    min="0"
                    max="100"
                    value={form.threshold_amber_pct}
                    onChange={(e) => setForm({ ...form, threshold_amber_pct: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="threshold_red_pct">Red Threshold (%)</Label>
                  <Input
                    id="threshold_red_pct"
                    type="number"
                    min="0"
                    max="100"
                    value={form.threshold_red_pct}
                    onChange={(e) => setForm({ ...form, threshold_red_pct: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="effective_from">Effective From</Label>
                  <Input
                    id="effective_from"
                    type="date"
                    value={form.effective_from}
                    onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="effective_until">Effective Until</Label>
                  <Input
                    id="effective_until"
                    type="date"
                    value={form.effective_until}
                    onChange={(e) => setForm({ ...form, effective_until: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={!form.body_id || !form.program_type.trim() || isSaving}
              >
                {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Regulatory Norm?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this norm definition.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
