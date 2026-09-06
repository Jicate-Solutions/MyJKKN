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
import { Plus, Pencil, Trash2, ShieldCheck, Loader2, AlertTriangle, FileUp } from 'lucide-react';
import { BulkImportDialog } from '@/components/hr/recruitment-need/bulk-import-dialog';
import {
  useApprovals,
  useCreateApproval,
  useUpdateApproval,
  useDeleteApproval,
  useInstitutions,
  usePrograms,
} from '@/hooks/hr/recruitment-need/use-data-entry';
import { useBodies } from '@/hooks/hr/recruitment-need/use-recruitment-admin';
import type { ApprovalWithJoins } from '@/lib/services/hr/recruitment-need/data-entry-service';

const ADMIN_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR];

type ApprovalFormData = {
  institution_id: string;
  program_id: string;
  body_id: string;
  sanctioned_faculty_count: number;
  approved_intake: number | '';
  approval_date: string;
  renewal_due_date: string;
  approval_reference: string;
  is_active: boolean;
};

const EMPTY_FORM: ApprovalFormData = {
  institution_id: '',
  program_id: '',
  body_id: '',
  sanctioned_faculty_count: 0,
  approved_intake: '',
  approval_date: '',
  renewal_due_date: '',
  approval_reference: '',
  is_active: true,
};

function isRenewalSoon(date: string | null): boolean {
  if (!date) return false;
  const diff = new Date(date).getTime() - Date.now();
  return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000;
}

function isRenewalOverdue(date: string | null): boolean {
  if (!date) return false;
  return new Date(date).getTime() < Date.now();
}

export default function ApprovalsAdminPage() {
  const [filterInstitution, setFilterInstitution] = useState<string>('');
  const [filterBody, setFilterBody] = useState<string>('');

  const filters = useMemo(() => ({
    institution_id: filterInstitution || undefined,
    body_id: filterBody || undefined,
  }), [filterInstitution, filterBody]);

  const { data: approvals, isLoading } = useApprovals(filters);
  const { data: institutions } = useInstitutions();
  const { data: bodies } = useBodies();
  const createMut = useCreateApproval();
  const updateMut = useUpdateApproval();
  const deleteMut = useDeleteApproval();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApprovalWithJoins | null>(null);
  const [form, setForm] = useState<ApprovalFormData>(EMPTY_FORM);

  // Programs depend on selected institution in form
  const { data: programs } = usePrograms(form.institution_id || undefined);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (a: ApprovalWithJoins) => {
    setEditing(a);
    setForm({
      institution_id: a.institution_id,
      program_id: a.program_id,
      body_id: a.body_id,
      sanctioned_faculty_count: a.sanctioned_faculty_count,
      approved_intake: a.approved_intake ?? '',
      approval_date: a.approval_date ?? '',
      renewal_due_date: a.renewal_due_date ?? '',
      approval_reference: a.approval_reference ?? '',
      is_active: a.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      institution_id: form.institution_id,
      program_id: form.program_id,
      body_id: form.body_id,
      sanctioned_faculty_count: form.sanctioned_faculty_count,
      approved_intake: form.approved_intake === '' ? null : Number(form.approved_intake),
      approval_date: form.approval_date || null,
      renewal_due_date: form.renewal_due_date || null,
      approval_reference: form.approval_reference.trim() || null,
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

  return (
    <AdminPermissionGuard adminRoles={ADMIN_ROLES}>
      <ContentLayout title="Program Approvals">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
              <h1 className="text-xl font-semibold">Institution Program Approvals</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                <FileUp className="mr-1 h-4 w-4" /> Import from Excel
              </Button>
              <Button onClick={openCreate} size="sm">
                <Plus className="mr-1 h-4 w-4" /> Add Approval
              </Button>
            </div>
          </div>

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
            <Select value={filterBody} onValueChange={(v) => setFilterBody(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All Bodies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Bodies</SelectItem>
                {bodies?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.abbreviation ?? b.name}</SelectItem>
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
                    <TableHead>Institution</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead>Body</TableHead>
                    <TableHead className="text-right">Sanctioned Faculty</TableHead>
                    <TableHead className="text-right">Approved Intake</TableHead>
                    <TableHead>Approval Date</TableHead>
                    <TableHead>Renewal Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!approvals || approvals.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No program approvals found.
                      </TableCell>
                    </TableRow>
                  )}
                  {approvals?.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.institution_name ?? a.institution_id}</TableCell>
                      <TableCell>{a.program_name ?? a.program_id}</TableCell>
                      <TableCell>{a.body_abbreviation ?? a.body_name ?? a.body_id}</TableCell>
                      <TableCell className="text-right">{a.sanctioned_faculty_count}</TableCell>
                      <TableCell className="text-right">{a.approved_intake ?? '-'}</TableCell>
                      <TableCell>{a.approval_date ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {a.renewal_due_date ?? '-'}
                          {isRenewalOverdue(a.renewal_due_date) && (
                            <Badge variant="destructive" className="text-xs ml-1">
                              <AlertTriangle className="h-3 w-3 mr-0.5" /> Overdue
                            </Badge>
                          )}
                          {isRenewalSoon(a.renewal_due_date) && !isRenewalOverdue(a.renewal_due_date) && (
                            <Badge variant="secondary" className="text-xs ml-1 bg-amber-100 text-amber-800">
                              <AlertTriangle className="h-3 w-3 mr-0.5" /> Due soon
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.is_active ? 'default' : 'secondary'}>
                          {a.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
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
              <DialogTitle>{editing ? 'Edit' : 'Add'} Program Approval</DialogTitle>
              <DialogDescription>
                Record regulatory body approval for an institution program.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Institution *</Label>
                <Select value={form.institution_id} onValueChange={(v) => setForm({ ...form, institution_id: v, program_id: '' })}>
                  <SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger>
                  <SelectContent>
                    {institutions?.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Program *</Label>
                <Select value={form.program_id} onValueChange={(v) => setForm({ ...form, program_id: v })} disabled={!form.institution_id}>
                  <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                  <SelectContent>
                    {programs?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Regulatory Body *</Label>
                <Select value={form.body_id} onValueChange={(v) => setForm({ ...form, body_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select body" /></SelectTrigger>
                  <SelectContent>
                    {bodies?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.abbreviation} - {b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Sanctioned Faculty Count *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.sanctioned_faculty_count}
                    onChange={(e) => setForm({ ...form, sanctioned_faculty_count: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Approved Intake</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.approved_intake}
                    onChange={(e) => setForm({ ...form, approved_intake: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Approval Date</Label>
                  <Input
                    type="date"
                    value={form.approval_date}
                    onChange={(e) => setForm({ ...form, approval_date: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Renewal Due Date</Label>
                  <Input
                    type="date"
                    value={form.renewal_due_date}
                    onChange={(e) => setForm({ ...form, renewal_due_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Approval Reference</Label>
                <Input
                  value={form.approval_reference}
                  onChange={(e) => setForm({ ...form, approval_reference: e.target.value })}
                  placeholder="e.g., DCI/2026/JKKNDC/001"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !form.institution_id || !form.program_id || !form.body_id}
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
              <AlertDialogTitle>Delete Approval?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this program approval record. This action cannot be undone.
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

        <BulkImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          title="Import Approvals from Excel"
          description="Upload a .xlsx file with institution program approval data. Download the template for proper formatting."
          templateUrl="/api/hr/recruitment-need/approvals/template"
          uploadUrl="/api/hr/recruitment-need/approvals/import"
          columns={['Institution Name', 'Program Name', 'Body Abbreviation', 'Sanctioned Faculty Count', 'Approved Intake', 'Approval Date', 'Renewal Due Date', 'Approval Reference']}
          templateFilename="approvals-template"
        />
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
