'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Briefcase, CheckCircle2, Clock, Filter, FileUp, Pencil, Plus, Trash2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { useWorkloads, useCreateWorkload, useUpdateWorkload, useDeleteWorkload, useVerifyWorkload } from '@/hooks/hr/recruitment-need/use-workload';
import { BulkImportDialog } from '@/components/hr/recruitment-need/bulk-import-dialog';
import type { HRFacultyWorkload, WorkloadSource } from '@/types/hr-recruitment-need';
import type { WorkloadInsert, WorkloadUpdate } from '@/lib/services/hr/recruitment-need/workload-service';

const currentYear = new Date().getFullYear();
const ACADEMIC_YEARS = Array.from({ length: 4 }, (_, i) => { const y = currentYear - i; return `${y}-${y + 1}`; });

const SOURCE_LABELS: Record<WorkloadSource, string> = {
  manual: 'Manual',
  timetable_import: 'Timetable Import',
  self_report: 'Self Report',
};

interface FormState {
  staff_id: string;
  academic_year: string;
  semester: '1' | '2';
  weekly_contact_hours: string;
  weekly_admin_hours: string;
  weekly_research_hours: string;
  source: WorkloadSource;
  notes: string;
}

const EMPTY_FORM: FormState = {
  staff_id: '', academic_year: ACADEMIC_YEARS[0], semester: '1',
  weekly_contact_hours: '', weekly_admin_hours: '', weekly_research_hours: '',
  source: 'manual', notes: '',
};

export default function WorkloadPage() {
  const [filterYear, setFilterYear] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [filterVerified, setFilterVerified] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: workloads = [], isLoading, error } = useWorkloads({
    academic_year: filterYear || undefined,
    semester: filterSemester ? (Number(filterSemester) as 1 | 2) : undefined,
    verified: filterVerified === 'verified' ? true : filterVerified === 'unverified' ? false : undefined,
  });

  const createMut = useCreateWorkload();
  const updateMut = useUpdateWorkload();
  const deleteMut = useDeleteWorkload();
  const verifyMut = useVerifyWorkload();
  const isMutating = createMut.isPending || updateMut.isPending || deleteMut.isPending || verifyMut.isPending;

  function handleAdd() { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true); }

  function handleEdit(row: HRFacultyWorkload) {
    setEditingId(row.id);
    setForm({
      staff_id: row.staff_id,
      academic_year: row.academic_year,
      semester: String(row.semester) as '1' | '2',
      weekly_contact_hours: String(row.weekly_contact_hours),
      weekly_admin_hours: row.weekly_admin_hours != null ? String(row.weekly_admin_hours) : '',
      weekly_research_hours: row.weekly_research_hours != null ? String(row.weekly_research_hours) : '',
      source: row.source,
      notes: row.notes ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (editingId) {
      const update: WorkloadUpdate = {
        weekly_contact_hours: Number(form.weekly_contact_hours),
        weekly_admin_hours: form.weekly_admin_hours ? Number(form.weekly_admin_hours) : null,
        weekly_research_hours: form.weekly_research_hours ? Number(form.weekly_research_hours) : null,
        source: form.source, notes: form.notes || null,
      };
      await updateMut.mutateAsync({ id: editingId, update });
    } else {
      if (!form.staff_id) return;
      const insert: WorkloadInsert = {
        staff_id: form.staff_id, institution_id: '',
        academic_year: form.academic_year, semester: Number(form.semester) as 1 | 2,
        weekly_contact_hours: Number(form.weekly_contact_hours),
        weekly_admin_hours: form.weekly_admin_hours ? Number(form.weekly_admin_hours) : null,
        weekly_research_hours: form.weekly_research_hours ? Number(form.weekly_research_hours) : null,
        source: form.source, notes: form.notes || null,
      };
      await createMut.mutateAsync(insert);
    }
    setDialogOpen(false);
  }

  const stats = useMemo(() => {
    const total = workloads.length;
    const verified = workloads.filter((w) => w.verified_at).length;
    const avgContact = total > 0 ? (workloads.reduce((s, w) => s + w.weekly_contact_hours, 0) / total).toFixed(1) : '-';
    return { total, verified, avgContact };
  }, [workloads]);

  return (
    <ContentLayout title="Faculty Workload">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Workload</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-primary" /> Faculty Workload Data
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Track weekly contact, admin, and research hours per faculty member.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}><FileUp className="h-4 w-4 mr-2" />Import from Excel</Button>
            <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-2" />Add Workload</Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Verified</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{stats.verified}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Contact Hrs/Week</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats.avgContact}</p></CardContent></Card>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Filter className="h-3 w-3" /> Academic Year</Label>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger><SelectValue placeholder="All years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Label className="text-xs text-muted-foreground mb-1 block">Semester</Label>
            <Select value={filterSemester} onValueChange={setFilterSemester}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="1">Semester 1</SelectItem>
                <SelectItem value="2">Semester 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="text-xs text-muted-foreground mb-1 block">Verification</Label>
            <Select value={filterVerified} onValueChange={setFilterVerified}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading workload data...</div>
            ) : error ? (
              <div className="p-8 text-center text-destructive">Failed to load: {error instanceof Error ? error.message : 'Unknown error'}</div>
            ) : workloads.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No workload records found. Click &quot;Add Workload&quot; to get started.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff ID</TableHead><TableHead>Year</TableHead><TableHead>Sem</TableHead>
                    <TableHead className="text-right">Contact Hrs</TableHead><TableHead className="text-right">Admin Hrs</TableHead>
                    <TableHead className="text-right">Research Hrs</TableHead><TableHead>Source</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workloads.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono text-xs">{w.staff_id.slice(0, 8)}...</TableCell>
                      <TableCell>{w.academic_year}</TableCell>
                      <TableCell>{w.semester}</TableCell>
                      <TableCell className="text-right font-medium">{w.weekly_contact_hours}</TableCell>
                      <TableCell className="text-right">{w.weekly_admin_hours ?? '-'}</TableCell>
                      <TableCell className="text-right">{w.weekly_research_hours ?? '-'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{SOURCE_LABELS[w.source]}</Badge></TableCell>
                      <TableCell>
                        {w.verified_at
                          ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>
                          : <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!w.verified_at && (
                            <Button variant="ghost" size="icon" title="Verify" disabled={isMutating} onClick={() => verifyMut.mutate(w.id)}>
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Edit" disabled={isMutating} onClick={() => handleEdit(w)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete" disabled={isMutating} onClick={() => { if (confirm('Delete this workload record?')) deleteMut.mutate(w.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Workload' : 'Add Workload'}</DialogTitle>
            <DialogDescription>{editingId ? 'Update the workload hours for this faculty member.' : 'Enter workload data for a faculty member.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {!editingId && (
              <div>
                <Label htmlFor="staff_id">Staff ID (UUID)</Label>
                <Input id="staff_id" value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} placeholder="Paste staff UUID" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="academic_year">Academic Year</Label>
                <Select value={form.academic_year} onValueChange={(v) => setForm({ ...form, academic_year: v })}>
                  <SelectTrigger id="academic_year"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="semester">Semester</Label>
                <Select value={form.semester} onValueChange={(v) => setForm({ ...form, semester: v as '1' | '2' })}>
                  <SelectTrigger id="semester"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Semester 1</SelectItem><SelectItem value="2">Semester 2</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label htmlFor="contact_hours">Contact Hrs/Wk</Label><Input id="contact_hours" type="number" min={0} step={0.5} value={form.weekly_contact_hours} onChange={(e) => setForm({ ...form, weekly_contact_hours: e.target.value })} placeholder="0" /></div>
              <div><Label htmlFor="admin_hours">Admin Hrs/Wk</Label><Input id="admin_hours" type="number" min={0} step={0.5} value={form.weekly_admin_hours} onChange={(e) => setForm({ ...form, weekly_admin_hours: e.target.value })} placeholder="0" /></div>
              <div><Label htmlFor="research_hours">Research Hrs/Wk</Label><Input id="research_hours" type="number" min={0} step={0.5} value={form.weekly_research_hours} onChange={(e) => setForm({ ...form, weekly_research_hours: e.target.value })} placeholder="0" /></div>
            </div>
            <div>
              <Label htmlFor="source">Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v as WorkloadSource })}>
                <SelectTrigger id="source"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="manual">Manual Entry</SelectItem><SelectItem value="timetable_import">Timetable Import</SelectItem><SelectItem value="self_report">Self Report</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isMutating || !form.weekly_contact_hours || (!editingId && !form.staff_id)}>{editingId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        title="Import Workload from Excel"
        description="Upload a .xlsx file with faculty workload data. Download the template for proper formatting."
        templateUrl="/api/hr/workload/template"
        uploadUrl="/api/hr/workload/import"
        columns={['Staff Email', 'Academic Year', 'Semester', 'Weekly Contact Hours', 'Weekly Admin Hours', 'Weekly Research Hours', 'Notes']}
        templateFilename="workload-template"
      />
    </ContentLayout>
  );
}
