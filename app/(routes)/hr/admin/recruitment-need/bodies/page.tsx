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
import { Plus, Pencil, Trash2, Building2, Loader2 } from 'lucide-react';
import {
  useBodies,
  useCreateBody,
  useUpdateBody,
  useDeleteBody,
} from '@/hooks/hr/recruitment-need/use-recruitment-admin';
import type { HRRegulatoryBody } from '@/types/hr-recruitment-need';

const ADMIN_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR];

type FormData = {
  name: string;
  abbreviation: string;
  description: string;
  website_url: string;
  is_active: boolean;
  is_system: boolean;
};

const EMPTY_FORM: FormData = {
  name: '',
  abbreviation: '',
  description: '',
  website_url: '',
  is_active: true,
  is_system: false,
};

export default function BodiesAdminPage() {
  const { data: bodies, isLoading } = useBodies();
  const createMut = useCreateBody();
  const updateMut = useUpdateBody();
  const deleteMut = useDeleteBody();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<HRRegulatoryBody | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (b: HRRegulatoryBody) => {
    setEditing(b);
    setForm({
      name: b.name,
      abbreviation: b.abbreviation,
      description: b.description ?? '',
      website_url: b.website_url ?? '',
      is_active: b.is_active,
      is_system: b.is_system,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name.trim(),
      abbreviation: form.abbreviation.trim(),
      description: form.description.trim() || null,
      website_url: form.website_url.trim() || null,
      is_active: form.is_active,
      is_system: form.is_system,
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
      <ContentLayout title="Regulatory Bodies">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Regulatory Bodies</h1>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add Body
            </Button>
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
                    <TableHead>Abbreviation</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!bodies || bodies.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No regulatory bodies found. Click &quot;Add Body&quot; to create one.
                      </TableCell>
                    </TableRow>
                  )}
                  {bodies?.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>{b.abbreviation}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs">
                        {b.website_url ? (
                          <a
                            href={b.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {b.website_url}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={b.is_active ? 'default' : 'secondary'}>
                          {b.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {b.is_system && (
                          <Badge variant="outline" className="text-xs">System</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!b.is_system && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteId(b.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit' : 'Add'} Regulatory Body</DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Update the regulatory body details below.'
                  : 'Fill in the details for the new regulatory body.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. All India Council for Technical Education"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="abbreviation">Abbreviation</Label>
                <Input
                  id="abbreviation"
                  value={form.abbreviation}
                  onChange={(e) => setForm({ ...form, abbreviation: e.target.value })}
                  placeholder="e.g. AICTE"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  value={form.website_url}
                  onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Active
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.abbreviation.trim() || isSaving}
              >
                {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Regulatory Body?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the regulatory body and may affect
                related norms and specializations.
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
