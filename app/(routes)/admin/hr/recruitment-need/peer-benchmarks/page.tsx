'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { SYSTEM_ROLES } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, Pencil, Trash2, BarChart3, Loader2 } from 'lucide-react';
import {
  useBenchmarks,
  useCreateBenchmark,
  useUpdateBenchmark,
  useDeleteBenchmark,
} from '@/hooks/hr/recruitment-need/use-recruitment-admin';
import type { HRPeerBenchmark } from '@/types/hr-recruitment-need';

const ADMIN_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR];

type FormData = {
  institution_name: string;
  naac_grade: string;
  program_type: string;
  faculty_count: string;
  student_count: string;
  sfr_ratio: string;
  data_year: string;
  source_url: string;
  notes: string;
};

const EMPTY_FORM: FormData = {
  institution_name: '',
  naac_grade: '',
  program_type: '',
  faculty_count: '',
  student_count: '',
  sfr_ratio: '',
  data_year: '',
  source_url: '',
  notes: '',
};

export default function PeerBenchmarksAdminPage() {
  const { data: benchmarks, isLoading } = useBenchmarks();
  const createMut = useCreateBenchmark();
  const updateMut = useUpdateBenchmark();
  const deleteMut = useDeleteBenchmark();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<HRPeerBenchmark | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (b: HRPeerBenchmark) => {
    setEditing(b);
    setForm({
      institution_name: b.institution_name,
      naac_grade: b.naac_grade ?? '',
      program_type: b.program_type,
      faculty_count: b.faculty_count?.toString() ?? '',
      student_count: b.student_count?.toString() ?? '',
      sfr_ratio: b.sfr_ratio?.toString() ?? '',
      data_year: b.data_year?.toString() ?? '',
      source_url: b.source_url ?? '',
      notes: b.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      institution_name: form.institution_name.trim(),
      naac_grade: form.naac_grade.trim() || null,
      program_type: form.program_type.trim(),
      faculty_count: form.faculty_count ? Number(form.faculty_count) : null,
      student_count: form.student_count ? Number(form.student_count) : null,
      sfr_ratio: form.sfr_ratio ? Number(form.sfr_ratio) : null,
      data_year: form.data_year ? Number(form.data_year) : null,
      source_url: form.source_url.trim() || null,
      notes: form.notes.trim() || null,
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

  return (
    <AdminPermissionGuard adminRoles={ADMIN_ROLES}>
      <ContentLayout title="Peer Benchmarks">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Peer Benchmarks</h1>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add Benchmark
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
                    <TableHead>Institution</TableHead>
                    <TableHead>NAAC</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead className="text-right">Faculty</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">SFR</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!benchmarks || benchmarks.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No peer benchmarks found. Click &quot;Add Benchmark&quot; to create one.
                      </TableCell>
                    </TableRow>
                  )}
                  {benchmarks?.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium max-w-48 truncate">
                        {b.institution_name}
                      </TableCell>
                      <TableCell>{b.naac_grade ?? '-'}</TableCell>
                      <TableCell>{b.program_type}</TableCell>
                      <TableCell className="text-right">{b.faculty_count ?? '-'}</TableCell>
                      <TableCell className="text-right">{b.student_count ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        {b.sfr_ratio != null ? `${b.sfr_ratio}:1` : '-'}
                      </TableCell>
                      <TableCell>{b.data_year ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(b.id)}>
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

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit' : 'Add'} Peer Benchmark</DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Update benchmark data.'
                  : 'Enter SFR data from a peer institution.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="institution_name">Institution Name</Label>
                <Input
                  id="institution_name"
                  value={form.institution_name}
                  onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
                  placeholder="e.g. SRM Institute of Science and Technology"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="naac_grade">NAAC Grade</Label>
                  <Input
                    id="naac_grade"
                    value={form.naac_grade}
                    onChange={(e) => setForm({ ...form, naac_grade: e.target.value })}
                    placeholder="e.g. A++"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="program_type">Program Type</Label>
                  <Input
                    id="program_type"
                    value={form.program_type}
                    onChange={(e) => setForm({ ...form, program_type: e.target.value })}
                    placeholder="e.g. B.Tech"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="faculty_count">Faculty Count</Label>
                  <Input
                    id="faculty_count"
                    type="number"
                    value={form.faculty_count}
                    onChange={(e) => setForm({ ...form, faculty_count: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="student_count">Student Count</Label>
                  <Input
                    id="student_count"
                    type="number"
                    value={form.student_count}
                    onChange={(e) => setForm({ ...form, student_count: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sfr_ratio">SFR Ratio</Label>
                  <Input
                    id="sfr_ratio"
                    type="number"
                    step="0.1"
                    value={form.sfr_ratio}
                    onChange={(e) => setForm({ ...form, sfr_ratio: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="data_year">Data Year</Label>
                  <Input
                    id="data_year"
                    type="number"
                    value={form.data_year}
                    onChange={(e) => setForm({ ...form, data_year: e.target.value })}
                    placeholder="e.g. 2025"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="source_url">Source URL</Label>
                  <Input
                    id="source_url"
                    value={form.source_url}
                    onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                    placeholder="https://..."
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={!form.institution_name.trim() || !form.program_type.trim() || isSaving}
              >
                {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Peer Benchmark?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this benchmark entry.
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
