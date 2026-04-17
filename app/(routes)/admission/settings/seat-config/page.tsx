'use client';

import { useState, useEffect, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Loader2, Save, Info, GraduationCap, CheckCircle, Building2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import toast from 'react-hot-toast';

interface ProgramRow {
  id: string;
  program_name: string;
  degree_name: string;
  department_name: string;
  default_intake: number;
  intake_history_id: string | null;
  sanctioned_intake: number;
  dirty: boolean;
  saving: boolean;
}

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
  // Organization module: all institutions the current user can access
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({ isActive: true });

  const [pickedInstitutionId, setPickedInstitutionId] = useState<string>('');
  const [pickedAcademicYearId, setPickedAcademicYearId] = useState<string>('');
  const [rows, setRows] = useState<ProgramRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  // Academic years scoped to the picked institution
  const { data: academicYearsResult } = useAcademicYears(pickedInstitutionId || undefined);
  const academicYears = academicYearsResult?.data ?? [];

  // Auto-pick first institution once list loads
  useEffect(() => {
    if (!pickedInstitutionId && institutions.length > 0) {
      setPickedInstitutionId(institutions[0].id);
    }
  }, [institutions, pickedInstitutionId]);

  // Auto-select current academic year when institution changes (reset year first)
  useEffect(() => {
    setPickedAcademicYearId('');
  }, [pickedInstitutionId]);

  useEffect(() => {
    if (!academicYears.length || pickedAcademicYearId) return;
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateRow = (programId: string, value: number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === programId ? { ...r, sanctioned_intake: value, dirty: true } : r))
    );
  };

  const saveRow = async (row: ProgramRow) => {
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
  };

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

  const dirtyCount = rows.filter((r) => r.dirty).length;
  const configuredCount = rows.filter((r) => r.intake_history_id).length;
  const totalSeats = rows.reduce((s, r) => s + (r.sanctioned_intake || 0), 0);

  const selectedInstitutionName =
    institutions.find((i) => i.id === pickedInstitutionId)?.name ?? '';

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Seat Configuration">
        <div className="p-4 sm:p-6 space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/settings">Settings</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Seat Configuration</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
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
            {dirtyCount > 0 && (
              <Button size="sm" onClick={saveAll} disabled={savingAll}>
                {savingAll
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <Save className="h-4 w-4 mr-1" />}
                Save All ({dirtyCount} unsaved)
              </Button>
            )}
          </div>

          {/* Filter bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-4 items-end">
                {/* Institution — always shown, uses org module */}
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
                      <SelectValue
                        placeholder={institutionsLoading ? 'Loading institutions…' : 'Select institution'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Academic year — scoped to the picked institution */}
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
                        <SelectItem key={ay.id} value={ay.id}>
                          {ay.academic_year_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Summary stats */}
                {rows.length > 0 && (
                  <div className="ml-auto flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {rows.length} programs
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {configuredCount}/{rows.length} configured
                    </Badge>
                    <Badge className="text-xs">
                      Total: {totalSeats.toLocaleString()} seats
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Info banner */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <span>
              Seats configured here feed the <strong>Seat Analytics</strong> dashboard fill-rate calculations.
              The <strong>Default</strong> column shows the program&apos;s master intake — values here override
              it for the selected academic year only. A green ✓ means a year-specific record is saved.
            </span>
          </div>

          {/* Content */}
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
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">
                      {selectedInstitutionName} — Program Seats
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Edit the Seats column inline. Press Enter or click Save per row, or use Save All above.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Degree</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead className="text-right text-xs w-[80px]">Default</TableHead>
                        <TableHead className="text-right w-[150px]">Seats (this year)</TableHead>
                        <TableHead className="w-[64px] text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className={row.dirty ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}
                        >
                          <TableCell className="text-xs">{row.degree_name}</TableCell>
                          <TableCell className="text-xs">{row.department_name}</TableCell>
                          <TableCell className="text-xs font-medium">{row.program_name}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            [{row.default_intake}]
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min={0}
                                max={9999}
                                value={row.sanctioned_intake}
                                onChange={(e) =>
                                  updateRow(row.id, Number(e.target.value) || 0)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveRow(row);
                                }}
                                className="h-7 w-24 text-right text-xs"
                                disabled={row.saving}
                              />
                              {row.dirty && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  onClick={() => saveRow(row)}
                                  disabled={row.saving}
                                >
                                  {row.saving
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Save className="h-3 w-3" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {row.dirty ? (
                              <span className="text-xs text-amber-600 font-medium">unsaved</span>
                            ) : row.intake_history_id ? (
                              <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
