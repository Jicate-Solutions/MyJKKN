// app/(routes)/hr/admin/sanctioned-posts/page.tsx
// ============================================================================
// Sanctioned faculty posts register (Wave 2A) — CRUD UI for sanctioned_posts.
// One row per institution × academic year × cadre (department optional).
// The nightly hr-naac-evidence refresh compares filled strength against these
// rows to emit NAAC 2.2.1 evidence — the metric only lights up for
// institution + academic-year combinations that have rows here.
// Modeled on accreditation/manage/collaborations (PR #2407 CRUD pattern).
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import {
  SanctionedPostsService,
  CADRE_LABELS,
  ayLabel,
  ayOptions,
  type SanctionedPostRow,
  type SanctionedPostInput,
  type SanctionedCadre,
} from '@/lib/services/hr/sanctioned-posts-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

const CADRES = Object.keys(CADRE_LABELS) as SanctionedCadre[];

interface DepartmentOption {
  id: string;
  department_name: string;
}

async function fetchDepartments(institutionId: string): Promise<DepartmentOption[]> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await (supabase as any)
    .from('departments')
    .select('id, department_name')
    .eq('institution_id', institutionId)
    .order('department_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DepartmentOption[];
}

function SanctionedPostFormDialog({
  open, onOpenChange, mode, entity, institutionId, departments,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'create' | 'edit';
  entity?: SanctionedPostRow;
  institutionId: string;
  departments: DepartmentOption[];
}) {
  const qc = useQueryClient();
  const [cadre, setCadre] = useState<SanctionedCadre>(entity?.cadre ?? 'assistant_professor');
  const [academicYear, setAcademicYear] = useState<string>(entity?.academic_year ?? ayLabel());
  const [sanctionedCount, setSanctionedCount] = useState<string>(
    entity?.sanctioned_count != null ? String(entity.sanctioned_count) : ''
  );
  const [departmentId, setDepartmentId] = useState<string>(entity?.department_id ?? 'none');
  const [notes, setNotes] = useState(entity?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  const yearChoices = useMemo(() => {
    const opts = ayOptions();
    if (entity?.academic_year && !opts.includes(entity.academic_year)) {
      opts.unshift(entity.academic_year);
    }
    return opts;
  }, [entity?.academic_year]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const countNum = Number(sanctionedCount);
    if (sanctionedCount.trim() === '' || isNaN(countNum) || countNum < 0 || !Number.isInteger(countNum)) {
      toast.error('Sanctioned count must be a whole number (0 or more).');
      return;
    }

    const payload: SanctionedPostInput = {
      institution_id: institutionId,
      department_id: departmentId === 'none' ? null : departmentId,
      cadre,
      sanctioned_count: countNum,
      academic_year: academicYear,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      if (mode === 'edit' && entity) {
        await SanctionedPostsService.update(entity.id, payload);
        toast.success('Sanctioned posts updated — next evidence refresh will pick this up.');
      } else {
        await SanctionedPostsService.create(payload);
        toast.success('Sanctioned posts saved — NAAC 2.2.1 evidence activates on the next refresh.');
      }
      qc.invalidateQueries({ queryKey: ['sanctioned-posts', institutionId] });
      onOpenChange(false);
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(
        msg.includes('uq_sanctioned_posts_scope') || msg.includes('duplicate key')
          ? 'A row for this cadre, year and department already exists — edit it instead.'
          : msg
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Edit sanctioned posts' : 'New sanctioned posts entry'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Cadre *</Label>
              <Select value={cadre} onValueChange={(v) => setCadre(v as SanctionedCadre)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CADRES.map(c => (
                    <SelectItem key={c} value={c}>{CADRE_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Academic year *</Label>
              <Select value={academicYear} onValueChange={setAcademicYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearChoices.map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Sanctioned count *</Label>
              <Input
                type="number" min={0} step={1} value={sanctionedCount}
                onChange={e => setSanctionedCount(e.target.value)}
                placeholder="e.g. 12"
              />
            </div>
            <div>
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Institution-wide</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Leave as institution-wide unless posts are sanctioned per department.
              </p>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="e.g. sanction order reference" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'edit' ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Institution row shape for the super-admin picker — all active institutions
// (sanctioned posts apply to the schools too, so no iqac_code filter here).
interface InstitutionOption {
  id: string;
  name: string;
}

async function fetchInstitutions(): Promise<InstitutionOption[]> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await (supabase as any)
    .from('institutions')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as InstitutionOption[];
}

export default function SanctionedPostsPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const canManage = isSuperAdmin || canAccess('hr.sanctioned_posts', 'manage');

  const { data: pickableInstitutions = [] } = useQuery({
    queryKey: ['sanctioned-posts', 'institutions'],
    queryFn: fetchInstitutions,
    enabled: isSuperAdmin,
  });

  const [pickedInstId, setPickedInstId] = useState<string>('');

  useEffect(() => {
    if (isSuperAdmin && !pickedInstId && pickableInstitutions.length > 0) {
      setPickedInstId(pickableInstitutions[0].id);
    }
  }, [isSuperAdmin, pickedInstId, pickableInstitutions]);

  const effectiveInstitutionId = useMemo(
    () => (isSuperAdmin ? pickedInstId : profile?.institution_id ?? ''),
    [isSuperAdmin, pickedInstId, profile?.institution_id]
  );

  const { data: items = [], isLoading, error, refetch } = useQuery({
    queryKey: ['sanctioned-posts', effectiveInstitutionId],
    queryFn: () => SanctionedPostsService.list(effectiveInstitutionId),
    enabled: !!effectiveInstitutionId,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['sanctioned-posts', 'departments', effectiveInstitutionId],
    queryFn: () => fetchDepartments(effectiveInstitutionId),
    enabled: !!effectiveInstitutionId,
  });

  const deptName = useMemo(() => {
    const m = new Map<string, string>();
    departments.forEach(d => m.set(d.id, d.department_name));
    return m;
  }, [departments]);

  const columns: ColumnDef<SanctionedPostRow>[] = [
    {
      accessorKey: 'cadre',
      header: 'Cadre',
      cell: ({ row }) => (
        <Badge variant="outline">{CADRE_LABELS[row.original.cadre]}</Badge>
      ),
    },
    {
      accessorKey: 'department_id',
      header: 'Department',
      cell: ({ row }) =>
        row.original.department_id
          ? deptName.get(row.original.department_id) ?? '—'
          : <span className="text-xs text-muted-foreground">Institution-wide</span>,
    },
    { accessorKey: 'sanctioned_count', header: 'Sanctioned posts' },
    { accessorKey: 'academic_year', header: 'Academic year' },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ row }) => row.original.notes ?? '—',
    },
    ...(canManage
      ? [{
          id: 'actions',
          cell: ({ row }: { row: { original: SanctionedPostRow } }) => (
            <CrudRowActions<SanctionedPostRow>
              entity={row.original}
              entityLabel="entry"
              entityDisplayName={(e) => `${CADRE_LABELS[e.cadre]} · ${e.academic_year}`}
              canDelete={() => canManage}
              onDelete={async (id) => {
                await SanctionedPostsService.delete(id);
                qc.invalidateQueries({ queryKey: ['sanctioned-posts', effectiveInstitutionId] });
              }}
              EditDialog={({ open, onOpenChange, entity }) => (
                <SanctionedPostFormDialog
                  open={open}
                  onOpenChange={onOpenChange}
                  mode="edit"
                  entity={entity}
                  institutionId={effectiveInstitutionId}
                  departments={departments}
                />
              )}
            />
          ),
        } as ColumnDef<SanctionedPostRow>]
      : []),
  ];

  return (
    <PermissionGuard module="hr.sanctioned_posts" action="view">
      <ContentLayout title="Sanctioned Senior Learner Posts">
        <PageBreadcrumb
          items={[
            { label: 'HR', href: '/hr' },
            { label: 'Admin', href: '/hr/admin' },
            { label: 'Sanctioned Posts' },
          ]}
        />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Sanctioned Senior Learner Posts</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Sanctioned Senior Learner posts per cadre and academic year. The nightly
                  accreditation refresh compares filled strength against this register
                  to compute NAAC 2.2.1 evidence — institutions without entries for the
                  current year are skipped, not reported as zero. Rarely changes; update
                  once per academic year.
                </p>
              </div>
              <div className="flex items-end gap-2">
                {isSuperAdmin && (
                  <div className="w-64">
                    <Label className="text-xs">Institution</Label>
                    <Select
                      value={pickedInstId}
                      onValueChange={setPickedInstId}
                      disabled={pickableInstitutions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick an institution…" />
                      </SelectTrigger>
                      <SelectContent>
                        {pickableInstitutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {canManage && (
                  <Button
                    onClick={() => setShowCreate(true)}
                    disabled={!effectiveInstitutionId}
                  >
                    <Plus className="mr-2 h-4 w-4" /> New Entry
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CrudDataTable<SanctionedPostRow>
              items={items}
              loading={isLoading}
              error={error ? (error as Error).message : null}
              onRefresh={() => { void refetch(); }}
              onBulkDelete={(ids) => SanctionedPostsService.bulkDelete(ids)}
              columns={columns}
              entityLabel="entry"
              entityLabelPlural="entries"
            />
          </CardContent>
        </Card>

        <SanctionedPostFormDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          mode="create"
          institutionId={effectiveInstitutionId}
          departments={departments}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
