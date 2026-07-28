'use client';

// app/(routes)/admission/settings/seat-config/page.tsx
//
// Seat Configuration — program driven.
// Pick institution → list that institution's active programs → update
// programs.sanctioned_intake directly. No admission-year dimension, no quota
// breakdown (admission_years is now institution-wide; per-program sanctioned
// seats live on programs.sanctioned_intake).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { DataTable } from '@/components/ui/data-table';
import { Loader2, Save, GraduationCap, Building2, Info } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { createSeatConfigColumns } from './_components/seat-config-columns';
import { EditSeatDialog } from './_components/edit-seat-dialog';
import type { ProgramSeatRow } from './_components/seat-config-columns';
import toast from 'react-hot-toast';

const supabase = createClientSupabaseClient();

// Fetch the institution's active programs. Sanctioned seats live directly on
// programs.sanctioned_intake.
async function fetchProgramsForInstitution(
  institutionId: string
): Promise<ProgramSeatRow[]> {
  const { data, error } = await (supabase as any)
    .from('programs')
    .select('id, program_id, program_name, sanctioned_intake, actual_intake, is_active')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('program_name');
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    program_name: p.program_name ?? '—',
    program_code: p.program_id ?? '—',
    sanctioned_intake: p.sanctioned_intake ?? 0,
    originalSanctionedIntake: p.sanctioned_intake ?? 0,
    dirty: false,
    saving: false,
  }));
}

async function updateSanctionedIntake(
  programId: string,
  sanctionedIntake: number
): Promise<void> {
  const { error } = await (supabase as any)
    .from('programs')
    .update({
      sanctioned_intake: sanctionedIntake,
      updated_at: new Date().toISOString()
    })
    .eq('id', programId);
  if (error) throw error;
}

export default function SeatConfigPage() {
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({ isActive: true });

  const [pickedInstitutionId, setPickedInstitutionId] = useState<string>('');
  const [rows, setRows] = useState<ProgramSeatRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [editRow, setEditRow] = useState<ProgramSeatRow | null>(null);

  // Auto-pick first institution once list loads
  useEffect(() => {
    if (!pickedInstitutionId && institutions.length > 0) {
      setPickedInstitutionId(institutions[0].id);
    }
  }, [institutions, pickedInstitutionId]);

  const loadData = useCallback(async () => {
    if (!pickedInstitutionId) return;
    setLoadingData(true);
    try {
      const data = await fetchProgramsForInstitution(pickedInstitutionId);
      setRows(data);
    } catch (err: any) {
      toast.error(
        'Failed to load programs: ' + (err?.message ?? 'Unknown error')
      );
    } finally {
      setLoadingData(false);
    }
  }, [pickedInstitutionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateRow = useCallback((programId: string, value: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === programId
          ? {
              ...r,
              sanctioned_intake: value,
              dirty: value !== r.originalSanctionedIntake
            }
          : r
      )
    );
  }, []);

  const saveRow = useCallback(async (row: ProgramSeatRow) => {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, saving: true } : r))
    );
    try {
      await updateSanctionedIntake(row.id, row.sanctioned_intake);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                saving: false,
                dirty: false,
                originalSanctionedIntake: r.sanctioned_intake
              }
            : r
        )
      );
      toast.success(`Saved: ${row.program_name}`);
    } catch (err: any) {
      toast.error('Save failed: ' + (err?.message ?? 'Unknown error'));
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, saving: false } : r))
      );
    }
  }, []);

  const handleEditSave = useCallback(
    async (row: ProgramSeatRow, newValue: number) => {
      const updated = {
        ...row,
        sanctioned_intake: newValue,
        dirty: newValue !== row.originalSanctionedIntake
      };
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      await saveRow(updated);
    },
    [saveRow]
  );

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

  const columns = useMemo(
    () =>
      createSeatConfigColumns({
        onUpdate: updateRow,
        onSave: saveRow,
        onEdit: setEditRow
      }),
    [updateRow, saveRow]
  );

  const getRowId = useCallback((row: ProgramSeatRow) => row.id, []);

  const dirtyCount = rows.filter((r) => r.dirty).length;
  const configuredCount = rows.filter((r) => r.sanctioned_intake > 0).length;
  const totalSeats = rows.reduce(
    (s, r) => s + (r.sanctioned_intake || 0),
    0
  );
  const selectedInstitutionName =
    institutions.find((i) => i.id === pickedInstitutionId)?.name ?? '';

  const tableTools =
    dirtyCount > 0 ? (
      <Button size='sm' onClick={saveAll} disabled={savingAll}>
        {savingAll ? (
          <Loader2 className='h-4 w-4 mr-1 animate-spin' />
        ) : (
          <Save className='h-4 w-4 mr-1' />
        )}
        Save All ({dirtyCount})
      </Button>
    ) : undefined;

  // Outer guard was previously module='admission' / action='view' (= permission
  // key 'admission.view'). No role holds that bare key — admission/admission_staff/
  // administrator only have admission.settings.seats.view (verified in
  // custom_roles.permissions). super_admins got past via the is_super_admin
  // bypass; isAdmissionGlobalUser bypassed legacy admission* role-keys. Custom
  // roles granted only the per-page key were silently blocked here even though
  // the inner DataTable would have let them through. The matching key per the
  // catalog (lib/constants/permissions.ts) and route manifest
  // (lib/sidebarMenuLink.ts:586) is admission.settings.seats.view.
  return (
    <PermissionGuard module='admission.settings.seats' action='view'>
      <ContentLayout title='Seat Configuration'>
        <div className='p-4 sm:p-6 space-y-4'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/admission/dashboard'>
                  Admission
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/admission/settings'>
                  Settings
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Seat Configuration</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className='flex items-start justify-between gap-4 flex-wrap'>
            <div className='flex items-center gap-2'>
              <GraduationCap className='h-5 w-5' />
              <div>
                <h1 className='text-xl font-bold'>Seat Configuration</h1>
                <p className='text-xs text-muted-foreground'>
                  Set sanctioned seats per program — one row per program
                </p>
              </div>
            </div>
          </div>

          {/* Filter bar — just institution now */}
          <Card>
            <CardContent className='pt-4 pb-4'>
              <div className='flex flex-wrap gap-4 items-end'>
                <div className='space-y-1 w-full sm:w-auto sm:min-w-[240px]'>
                  <p className='text-xs font-medium flex items-center gap-1'>
                    <Building2 className='h-3 w-3' /> Institution
                  </p>
                  <Select
                    value={pickedInstitutionId}
                    onValueChange={(v) => setPickedInstitutionId(v)}
                    disabled={institutionsLoading}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue
                        placeholder={
                          institutionsLoading
                            ? 'Loading…'
                            : 'Select institution'
                        }
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

                {rows.length > 0 && (
                  <div className='ml-auto flex items-center gap-2 flex-wrap'>
                    <Badge variant='outline' className='text-xs'>
                      {rows.length} programs
                    </Badge>
                    <Badge variant='outline' className='text-xs'>
                      {configuredCount}/{rows.length} configured
                    </Badge>
                    <Badge className='text-xs'>
                      Total: {totalSeats.toLocaleString()} seats
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Info banner */}
          <div className='flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2'>
            <Info className='h-4 w-4 text-blue-500 shrink-0 mt-0.5' />
            <span>
              Each row is one <strong>program</strong>. Sanctioned seats are
              stored directly on the program. Add new programs in the{' '}
              <strong>program master</strong>. Edit inline or click the{' '}
              <strong>✏</strong> pencil icon per row.
            </span>
          </div>

          {/* Data Table */}
          {loadingData ? (
            <div className='flex items-center justify-center py-16'>
              <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
            </div>
          ) : !pickedInstitutionId ? (
            <Card>
              <CardContent className='py-10 text-center text-sm text-muted-foreground'>
                Select an institution above to configure seats.
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className='py-10 text-center text-sm text-muted-foreground'>
                No active programs found for{' '}
                <strong>{selectedInstitutionName}</strong>. Add programs in the{' '}
                <strong>program master</strong> first.
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              searchPlaceholder='Search programs…'
              filterColumn='program_name'
              getRowId={getRowId}
              tableTools={tableTools}
              onRefresh={loadData}
              showRefresh={true}
              permissions={{
                module: 'admission.settings.seats',
                actions: { view: true }
              }}
            />
          )}

          <EditSeatDialog
            row={editRow}
            open={editRow !== null}
            onOpenChange={(open) => {
              if (!open) setEditRow(null);
            }}
            onSave={handleEditSave}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
