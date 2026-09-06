'use client';

import { useState, useMemo } from 'react';
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
import { Plus, Pencil, Trash2, Building2, Loader2 } from 'lucide-react';
import {
  useAllocations,
  useCreateAllocation,
  useUpdateAllocation,
  useDeleteAllocation,
  useInstitutions,
  useStaffList,
} from '@/hooks/hr/recruitment-need/use-data-entry';
import type { AllocationWithStaff } from '@/lib/services/hr/recruitment-need/data-entry-service';

const ADMIN_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR];

type AllocationFormData = {
  staff_id: string;
  institution_id: string;
  allocation_percentage: number;
  academic_year: string;
  effective_from: string;
  effective_until: string;
  notes: string;
};

const EMPTY_FORM: AllocationFormData = {
  staff_id: '',
  institution_id: '',
  allocation_percentage: 100,
  academic_year: '',
  effective_from: new Date().toISOString().split('T')[0],
  effective_until: '',
  notes: '',
};

// Group allocations by staff for a summary view
function groupByStaff(allocations: AllocationWithStaff[]): Map<string, AllocationWithStaff[]> {
  const map = new Map<string, AllocationWithStaff[]>();
  for (const a of allocations) {
    const key = a.staff_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return map;
}

export default function AllocationsAdminPage() {
  const [filterInstitution, setFilterInstitution] = useState<string>('');

  const filters = useMemo(() => ({
    institution_id: filterInstitution || undefined,
  }), [filterInstitution]);

  const { data: allocations, isLoading } = useAllocations(filters);
  const { data: institutions } = useInstitutions();
  const { data: staffList } = useStaffList();
  const createMut = useCreateAllocation();
  const updateMut = useUpdateAllocation();
  const deleteMut = useDeleteAllocation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AllocationWithStaff | null>(null);
  const [form, setForm] = useState<AllocationFormData>(EMPTY_FORM);

  const staffGroups = useMemo(() =>
    allocations ? groupByStaff(allocations) : new Map(),
    [allocations]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (a: AllocationWithStaff) => {
    setEditing(a);
    setForm({
      staff_id: a.staff_id,
      institution_id: a.institution_id,
      allocation_percentage: a.allocation_percentage,
      academic_year: a.academic_year ?? '',
      effective_from: a.effective_from,
      effective_until: a.effective_until ?? '',
      notes: a.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      staff_id: form.staff_id,
      institution_id: form.institution_id,
      allocation_percentage: form.allocation_percentage,
      academic_year: form.academic_year.trim() || null,
      effective_from: form.effective_from,
      effective_until: form.effective_until || null,
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

  // Flat view for the table
  const flatAllocations = allocations ?? [];

  return (
    <AdminPermissionGuard adminRoles={ADMIN_ROLES}>
      <ContentLayout title="Cross-Institution Allocations">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Cross-Institution Allocation</h1>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add Allocation
            </Button>
          </div>

          {/* Summary cards */}
          {staffGroups.size > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(staffGroups.entries()).map(([staffId, allocs]) => {
                const first = allocs[0];
                const totalPct = allocs.reduce((s, a) => s + a.allocation_percentage, 0);
                return (
                  <div key={staffId} className="rounded-md border p-3">
                    <p className="font-medium text-sm">
                      {first.staff_first_name} {first.staff_last_name}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {allocs.map((a) => (
                        <Badge key={a.id} variant="secondary" className="text-xs">
                          {a.institution_name ?? 'Unknown'} {a.allocation_percentage}%
                        </Badge>
                      ))}
                    </div>
                    <p className={`text-xs mt-1 ${totalPct > 100 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      Total: {totalPct}%{totalPct > 100 ? ' (exceeds 100%)' : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <Select value={filterInstitution} onValueChange={(v) => setFilterInstitution(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All Institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Institutions</SelectItem>
                {institutions?.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    <TableHead>Staff Name</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead className="text-right">Allocation %</TableHead>
                    <TableHead>Academic Year</TableHead>
                    <TableHead>Effective From</TableHead>
                    <TableHead>Effective Until</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flatAllocations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No allocations found.
                      </TableCell>
                    </TableRow>
                  )}
                  {flatAllocations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.staff_first_name} {a.staff_last_name}
                      </TableCell>
                      <TableCell>{a.institution_name ?? a.institution_id}</TableCell>
                      <TableCell className="text-right">{a.allocation_percentage}%</TableCell>
                      <TableCell>{a.academic_year ?? '-'}</TableCell>
                      <TableCell>{a.effective_from}</TableCell>
                      <TableCell>{a.effective_until ?? 'Ongoing'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{a.notes ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(a.id)}>
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

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit' : 'Add'} Allocation</DialogTitle>
              <DialogDescription>
                Define how a staff member&apos;s time is allocated across institutions.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Staff Member *</Label>
                <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {staffList?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Institution *</Label>
                <Select value={form.institution_id} onValueChange={(v) => setForm({ ...form, institution_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger>
                  <SelectContent>
                    {institutions?.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Allocation % *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={form.allocation_percentage}
                    onChange={(e) => setForm({ ...form, allocation_percentage: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Academic Year</Label>
                  <Input
                    value={form.academic_year}
                    onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                    placeholder="e.g., 2025-26"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Effective From *</Label>
                  <Input
                    type="date"
                    value={form.effective_from}
                    onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Effective Until</Label>
                  <Input
                    type="date"
                    value={form.effective_until}
                    onChange={(e) => setForm({ ...form, effective_until: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !form.staff_id || !form.institution_id || !form.effective_from}
              >
                {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Allocation?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this allocation record. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
