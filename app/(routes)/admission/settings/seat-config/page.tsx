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
import { Loader2, Save, Info, GraduationCap, CheckCircle } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import toast from 'react-hot-toast';

interface ProgramRow {
  id: string;
  program_name: string;
  degree_name: string;
  department_name: string;
  default_intake: number;
  intake_history_id: string | null;
  // editable value
  sanctioned_intake: number;
  dirty: boolean;
  saving: boolean;
}

const supabase = createClientSupabaseClient();

async function fetchPrograms(institutionId: string): Promise<
  Array<{ id: string; program_name: string; sanctioned_intake: number; degree: any; department: any }>
> {
  const { data, error } = await (supabase as any)
    .from('programs')
    .select('id, program_name, sanctioned_intake, degree:degrees(degree_name), department:departments(department_name)')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
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
) {
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
  const { institutions: accessibleInstitutions, canAccessAllInstitutions, selectedInstitutionId } =
    useUserInstitutionAccess();

  const [pickedInstitutionId, setPickedInstitutionId] = useState<string>('');
  const [pickedAcademicYearId, setPickedAcademicYearId] = useState<string>('');
  const [rows, setRows] = useState<ProgramRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const { data: academicYearsResult } = useAcademicYears(pickedInstitutionId || undefined);
  const academicYears = academicYearsResult?.data ?? [];

  // Available institutions
  const institutions = canAccessAllInstitutions
    ? [] // will rely on a separate fetch if needed — but selectedInstitutionId covers most cases
    : accessibleInstitutions;

  // Default institution
  useEffect(() => {
    if (!pickedInstitutionId && selectedInstitutionId) {
      setPickedInstitutionId(selectedInstitutionId);
    }
  }, [selectedInstitutionId, pickedInstitutionId]);

  // Auto-select current academic year
  useEffect(() => {
    if (!academicYears.length || pickedAcademicYearId) return;
    const today = new Date().toISOString().slice(0, 10);
    const current = academicYears.find((ay: any) => ay.start_date <= today && ay.end_date >= today);
    setPickedAcademicYearId((current ?? academicYears[0])?.id ?? '');
  }, [academicYears, pickedAcademicYearId]);

  const loadData = useCallback(async () => {
    if (!pickedInstitutionId || !pickedAcademicYearId) return;
    setLoading(true);
    try {
      const [programs, history] = await Promise.all([
        fetchPrograms(pickedInstitutionId),
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
      setLoading(false);
    }
  }, [pickedInstitutionId, pickedAcademicYearId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateRow = (programId: string, value: number) => {
    setRows((prev) =>
      prev.map((r) => r.id === programId ? { ...r, sanctioned_intake: value, dirty: true } : r)
    );
  };

  const saveRow = async (row: ProgramRow) => {
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, saving: true } : r));
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
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, saving: false } : r));
    }
  };

  const saveAll = async () => {
    const dirty = rows.filter((r) => r.dirty);
    if (!dirty.length) return;
    setSavingAll(true);
    try {
      await Promise.all(dirty.map((r) => saveRow(r)));
      toast.success(`Saved ${dirty.length} programs`);
    } finally {
      setSavingAll(false);
    }
  };

  const dirtyCount = rows.filter((r) => r.dirty).length;
  const totalSeats = rows.reduce((s, r) => s + (r.sanctioned_intake || 0), 0);

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

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              <div>
                <h1 className="text-xl font-bold">Seat Configuration</h1>
                <p className="text-xs text-muted-foreground">
                  Set sanctioned intake per program per academic year
                </p>
              </div>
            </div>
            {dirtyCount > 0 && (
              <Button size="sm" onClick={saveAll} disabled={savingAll}>
                {savingAll ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save All ({dirtyCount})
              </Button>
            )}
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-3 items-end">
                {/* Institution selector — only shown for multi-institution users */}
                {!canAccessAllInstitutions && institutions.length > 1 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Institution</p>
                    <Select
                      value={pickedInstitutionId}
                      onValueChange={(v) => { setPickedInstitutionId(v); setPickedAcademicYearId(''); }}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Select institution" />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map((i: any) => (
                          <SelectItem key={i.institution_id} value={i.institution_id}>
                            {i.institution_name ?? i.institution_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Academic year */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Academic Year</p>
                  <Select
                    value={pickedAcademicYearId}
                    onValueChange={setPickedAcademicYearId}
                    disabled={!pickedInstitutionId}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map((ay: any) => (
                        <SelectItem key={ay.id} value={ay.id}>{ay.academic_year_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Summary */}
                {rows.length > 0 && (
                  <div className="ml-auto flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{rows.length} programs</span>
                    <Badge variant="outline">Total seats: {totalSeats.toLocaleString()}</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Info banner */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <span>
              Seats set here are used by the Seat Analytics dashboard to calculate fill rates.
              Each row saves to <code className="font-mono">intake_history</code> — the program's default intake shown in brackets is the fallback if no year-specific value is set.
            </span>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !pickedInstitutionId || !pickedAcademicYearId ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select an institution and academic year to configure seats.
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No active programs found for this institution.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Program Seats</CardTitle>
                <CardDescription className="text-xs">
                  Edit the Seats column and press Enter or click Save to persist.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Degree</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead className="text-right w-[80px]">Default</TableHead>
                        <TableHead className="text-right w-[140px]">Seats (this year)</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id} className={row.dirty ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}>
                          <TableCell className="text-xs">{row.degree_name}</TableCell>
                          <TableCell className="text-xs">{row.department_name}</TableCell>
                          <TableCell className="text-xs font-medium">{row.program_name}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            [{row.default_intake}]
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={9999}
                              value={row.sanctioned_intake}
                              onChange={(e) => updateRow(row.id, Number(e.target.value) || 0)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveRow(row); }}
                              className="h-7 w-24 text-right ml-auto text-xs"
                              disabled={row.saving}
                            />
                          </TableCell>
                          <TableCell>
                            {row.dirty ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => saveRow(row)}
                                disabled={row.saving}
                              >
                                {row.saving
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Save className="h-3 w-3" />}
                              </Button>
                            ) : row.intake_history_id ? (
                              <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <span className="text-xs text-muted-foreground text-center block">—</span>
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
