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
import { Plus, Pencil, Trash2, GraduationCap, Loader2 } from 'lucide-react';
import {
  useSpecializations,
  useCreateSpecialization,
  useUpdateSpecialization,
  useDeleteSpecialization,
  useBodies,
} from '@/hooks/hr/recruitment-need/use-recruitment-admin';
import type { HRSpecialization } from '@/types/hr-recruitment-need';

const ADMIN_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR];

type FormData = {
  name: string;
  body_id: string;
  is_active: boolean;
};

const EMPTY_FORM: FormData = { name: '', body_id: '', is_active: true };

export default function SpecializationsAdminPage() {
  const { data: bodies } = useBodies();
  const [filterBodyId, setFilterBodyId] = useState<string | undefined>(undefined);
  const { data: specializations, isLoading } = useSpecializations(filterBodyId);
  const createMut = useCreateSpecialization();
  const updateMut = useUpdateSpecialization();
  const deleteMut = useDeleteSpecialization();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<HRSpecialization | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (s: HRSpecialization) => {
    setEditing(s);
    setForm({
      name: s.name,
      body_id: s.body_id ?? '',
      is_active: s.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name.trim(),
      body_id: form.body_id || null,
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

  const bodyName = (bodyId: string | null) => {
    if (!bodyId) return '-';
    return bodies?.find((b) => b.id === bodyId)?.abbreviation ?? bodyId;
  };

  return (
    <AdminPermissionGuard adminRoles={ADMIN_ROLES}>
      <ContentLayout title="Specializations">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Specializations</h1>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add Specialization
            </Button>
          </div>

          {/* Body filter */}
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Filter by body:</Label>
            <Select
              value={filterBodyId ?? 'all'}
              onValueChange={(v) => setFilterBodyId(v === 'all' ? undefined : v)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All bodies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All bodies</SelectItem>
                {bodies?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.abbreviation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Regulatory Body</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!specializations || specializations.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No specializations found.
                      </TableCell>
                    </TableRow>
                  )}
                  {specializations?.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{bodyName(s.body_id)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.is_active ? 'default' : 'secondary'}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(s.id)}>
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit' : 'Add'} Specialization</DialogTitle>
              <DialogDescription>
                {editing ? 'Update specialization details.' : 'Define a new specialization.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="spec_name">Name</Label>
                <Input
                  id="spec_name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Orthodontics"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Regulatory Body (optional)</Label>
                <Select
                  value={form.body_id || 'none'}
                  onValueChange={(v) => setForm({ ...form, body_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {bodies?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.abbreviation} - {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Button onClick={handleSave} disabled={!form.name.trim() || isSaving}>
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
              <AlertDialogTitle>Delete Specialization?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this specialization.
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
