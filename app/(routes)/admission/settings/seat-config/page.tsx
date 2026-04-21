'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { DataTable } from '@/components/ui/data-table';
import { Loader2, Save, GraduationCap, Building2, Info } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { createSeatConfigColumns } from './_components/seat-config-columns';
import { EditSeatDialog } from './_components/edit-seat-dialog';
import type { ProgramRow } from './_components/seat-config-columns';
import toast from 'react-hot-toast';

const supabase = createClientSupabaseClient();

async function fetchProgramsWithIntake(institutionId: string): Promise<
  Array<{ id: string; program_name: string; sanctioned_intake: number; degree: any; department: any }>
> {
  const { data, error } = await (supabase as any)
    .from('programs')
    .select(`
      id,
      program_name,
      sanctioned_intake,
      degree:degrees(degree_name),
      department:departments(department_name)
    `)
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('degree_id')
    .order('department_id')
    .order('program_name');
  if (error) throw error;
  return data ?? [];
}

async function fetchIntakeHistory(
  institutionId: string,
  academicYearId: string
): Promise<Array<{ id: string; program_id: string; sanctioned_intake: number }>> {
  const { data, error } = await (supabase as any)
    .from('intake_history')
    .select('id, program_id, sanctioned_intake')
    .eq('institution_id', institutionId)
    .eq('academic_year_id', academicYearId);
  if (error) throw error;
  return data ?? [];
}

async function upsertIntakeHistory(
  institutionId: string,
  programId: string,
  academicYearId: string,
  sanctionedIntake: number,
  existingId: string | null
): Promise<string> {
  const payload = {
    institution_id: institutionId,
    program_id: programId,
    academic_year_id: academicYearId,
    sanctioned_intake: sanctionedIntake,
    updated_at: new Date().toISOString(),
  };
  if (existingId) {
    const { error } = await (supabase as any)
      .from('intake_history')
      .update(payload)
      .eq('id', existingId);
    if (error) throw error;
    return existingId;
  } else {
    const { data, error } = await (supabase as any)
      .from('intake_history')
      .insert({ ...payload, actual_intake: 0, waitlist_count: 0, dropout_count: 0 })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  }
}

export default function SeatConfigPage() {
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({ isActive: true });

  const [pickedInstitutionId, setPickedInstitutionId] = useState<string>('');
  const [pickedAcademicYearId, setPickedAcademicYearId] = useState<string>('');
  const [rows, setRows] = useState<ProgramRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [editRow, setEditRow] = useState<ProgramRow | null>(null);

  const { data: academicYearsResult } = useAcademicYears(pickedInstitutionId || undefined);
  const academicYears = academicYearsResult?.data ?? [];

  // Auto-pick first institution once list loads
  useEffect(() => {
    if (!pickedInstitutionId && institutions.length > 0) {
      setPickedInstitutionId(institutions[0].id);
    }
  }, [institutions, pickedInstitutionId]);

  // Reset academic year when institution changes
  useEffect(() => {
    setPickedAcademicYearId('');
  }, [pickedInstitutionId]);

  // Auto-select current academic year — re-runs whenever academicYears changes
  // (covers institution switch where stale cache data may set a year from the old institution)
  useEffect(() => {
    if (!academicYears.length) return;
    const yearInList = academicYears.some((ay: any) => ay.id === pickedAcademicYearId);
    if (yearInList) return; // valid selection already — don't override user's choice
    const today = new Date().toISOString().slice(0, 10);
    const current = academicYears.find(
      (ay: any) => ay.start_date <= today && ay.end_date >= today
    );
    setPickedAcademicYearId((current ?? academicYears[0])?.id ?? '');
  }, [academicYears, pickedAcademicYearId]);

  const loadData = useCallback(async () => {
    if (!pickedInstitutionId || !pickedAcademicYearId) return;
    setLoadingData(true);
    try {
      const [programs, history] = await Promise.all([
        fetchProgramsWithIntake(pickedInstitutionId),
        fetchIntakeHistory(pickedInstitutionId, pickedAcademicYearId),
      ]);
      const historyMap = new Map(history.map((h) => [h.program_id, h]));
      setRows(
        programs.map((p) => {
          const h = historyMap.get(p.id);
          return {
            id: p.id,
            program_name: p.program_name,
            degree_name: p.degree?.degree_name ?? '—',
            department_name: p.department?.department_name ?? '—',
            default_intake: p.sanctioned_intake ?? 0,
            intake_history_id: h?.id ?? null,
            sanctioned_intake: h?.sanctioned_intake ?? p.sanctioned_intake ?? 0,
            dirty: false,
            saving: false,
          };
        })
      );
    } catch (err: any) {
      toast.error('Failed to load programs: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setLoadingData(false);
    }
  }, [pickedInstitutionId, pickedAcademicYearId]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateRow = useCallback((programId: string, value: number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === programId ? { ...r, sanctioned_intake: value, dirty: true } : r))
    );
  }, []);

  const saveRow = useCallback(async (row: ProgramRow) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saving: true } : r)));
    try {
      const newId = await upsertIntakeHistory(
        pickedInstitutionId,
        row.id,
        pickedAcademicYearId,
        row.sanctioned_intake,
        row.intake_history_id
      );
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, saving: false, dirty: false, intake_history_id: newId } : r
        )
      );
      toast.success(`Saved: ${row.program_name}`);
    } catch (err: any) {
      toast.error('Save failed: ' + (err?.message ?? 'Unknown error'));
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saving: false } : r)));
    }
  }, [pickedInstitutionId, pickedAcademicYearId]);

  // Edit dialog save — updates value then saves immediately
  const handleEditSave = useCallback(async (row: ProgramRow, newValue: number) => {
    const updated = { ...row, sanctioned_intake: newValue, dirty: true };
    setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    await saveRow(updated);
  }, [saveRow]);

  const saveAll = async () => {
    const dirty = rows.filter((r) => r.dirty);
    if (!dirty.length) return;
    setSavingAll(true);
    try {
      await Promise.all(dirty.map((r) => saveRow(r)));
    } finally {
      setSavingAll(false);
    }
  };

  // Columns — memoized so they don't recreate on every keystroke
  const columns = useMemo(
    () => createSeatConfigColumns({ onUpdate: updateRow, onSave: saveRow, onEdit: setEditRow }),
    [updateRow, saveRow]
  );

  const getRowId = useCallback((row: ProgramRow) => row.id, []);

  const dirtyCount = rows.filter((r) => r.dirty).length;
  const configuredCount = rows.filter((r) => r.intake_history_id).length;
  const totalSeats = rows.reduce((s, r) => s + (r.sanctioned_intake || 0), 0);
  const selectedInstitutionName = institutions.find((i) => i.id === pickedInstitutionId)?.name ?? '';

  const tableTools = dirtyCount > 0 ? (
    <Button size="sm" onClick={saveAll} disabled={savingAll}>
      {savingAll
        ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        : <Save className="h-4 w-4 mr-1" />}
      Save All ({dirtyCount})
    </Button>
  ) : undefined;

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Seat Configuration">
        <div className="p-4 sm:p-6 space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/settings">Settings</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Seat Configuration</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              <div>
                <h1 className="text-xl font-bold">Seat Configuration</h1>
                <p className="text-xs text-muted-foreground">
                  Set sanctioned seats per program per academic year — institution by institution
                </p>
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1 min-w-[240px]">
                  <p className="text-xs font-medium flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> Institution
                  </p>
                  <Select
                    value={pickedInstitutionId}
                    onValueChange={(v) => setPickedInstitutionId(v)}
                    disabled={institutionsLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={institutionsLoading ? 'Loading…' : 'Select institution'} />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 min-w-[180px]">
                  <p className="text-xs font-medium">Academic Year</p>
                  <Select
                    value={pickedAcademicYearId}
                    onValueChange={setPickedAcademicYearId}
                    disabled={!pickedInstitutionId || academicYears.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map((ay: any) => (
                        <SelectItem key={ay.id} value={ay.id}>{ay.academic_year_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {rows.length > 0 && (
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{rows.length} programs</Badge>
                    <Badge variant="outline" className="text-xs">{configuredCount}/{rows.length} configured</Badge>
                    <Badge className="text-xs">Total: {totalSeats.toLocaleString()} seats</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Info banner */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <span>
              <strong>Default</strong> is the program&apos;s master intake (used as fallback).
              <strong> Seats (this year)</strong> overrides it for the selected year only — a green <em>Configured</em> badge confirms a year-specific record is saved.
              Edit inline or click the <strong>✏</strong> pencil icon per row.
            </span>
          </div>

          {/* Data Table */}
          {loadingData ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !pickedInstitutionId || !pickedAcademicYearId ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select an institution and academic year above to configure seats.
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No active programs found for <strong>{selectedInstitutionName}</strong>.
                Add programs in the Organization module first.
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              searchPlaceholder="Search programs…"
              filterColumn="program_name"
              getRowId={getRowId}
              tableTools={tableTools}
              onRefresh={loadData}
              showRefresh={true}
              permissions={{
                module: 'admission.settings.seats',
                actions: { view: true },
              }}
            />
          )}

          {/* Edit dialog */}
          <EditSeatDialog
            row={editRow}
            open={editRow !== null}
            onOpenChange={(open) => { if (!open) setEditRow(null); }}
            onSave={handleEditSave}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
