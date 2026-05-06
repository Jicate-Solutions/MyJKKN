'use client';

// app/(routes)/admission/settings/seat-config/page.tsx
//
// Seat Configuration — admission-year driven (2026-04-21 rewrite).
// Before: pick academic_year → list all programs → upsert into intake_history.
// Now:    pick institution → list admission_years rows → update admission_years.sanctioned_intake directly.

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
import { QuotaSeatsDialog } from './_components/quota-seats-dialog';
import type { AdmissionYearRow } from './_components/seat-config-columns';
import toast from 'react-hot-toast';

const supabase = createClientSupabaseClient();

// Fetch admission-year rows (with their linked program info) for an institution.
async function fetchAdmissionYearsForInstitution(
  institutionId: string
): Promise<AdmissionYearRow[]> {
  const { data, error } = await (supabase as any)
    .from('admission_years')
    .select(
      `
        id,
        admission_year_name,
        program_start_year,
        program_end_year,
        sanctioned_intake,
        is_active,
        program:programs (
          id,
          program_id,
          program_name
        )
      `
    )
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('program_start_year', { ascending: false })
    .order('admission_year_name');
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    admission_year_name: r.admission_year_name,
    program_name: r.program?.program_name ?? '—',
    program_code: r.program?.program_id ?? '—',
    program_start_year: r.program_start_year,
    program_end_year: r.program_end_year,
    is_active: r.is_active,
    sanctioned_intake: r.sanctioned_intake ?? 0,
    originalSanctionedIntake: r.sanctioned_intake ?? 0,
    dirty: false,
    saving: false
  }));
}

async function updateSanctionedIntake(
  admissionYearId: string,
  sanctionedIntake: number
): Promise<void> {
  const { error } = await (supabase as any)
    .from('admission_years')
    .update({
      sanctioned_intake: sanctionedIntake,
      updated_at: new Date().toISOString()
    })
    .eq('id', admissionYearId);
  if (error) throw error;
}

export default function SeatConfigPage() {
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({ isActive: true });

  const [pickedInstitutionId, setPickedInstitutionId] = useState<string>('');
  const [rows, setRows] = useState<AdmissionYearRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [editRow, setEditRow] = useState<AdmissionYearRow | null>(null);
  const [quotaDialogRow, setQuotaDialogRow] = useState<AdmissionYearRow | null>(null);

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
      const data = await fetchAdmissionYearsForInstitution(pickedInstitutionId);
      setRows(data);
    } catch (err: any) {
      toast.error(
        'Failed to load admission years: ' + (err?.message ?? 'Unknown error')
      );
    } finally {
      setLoadingData(false);
    }
  }, [pickedInstitutionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateRow = useCallback((admissionYearId: string, value: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === admissionYearId
          ? {
              ...r,
              sanctioned_intake: value,
              dirty: value !== r.originalSanctionedIntake
            }
          : r
      )
    );
  }, []);

  const saveRow = useCallback(async (row: AdmissionYearRow) => {
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
      toast.success(`Saved: ${row.admission_year_name}`);
    } catch (err: any) {
      toast.error('Save failed: ' + (err?.message ?? 'Unknown error'));
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, saving: false } : r))
      );
    }
  }, []);

  const handleEditSave = useCallback(
    async (row: AdmissionYearRow, newValue: number) => {
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
        onEdit: setEditRow,
        onConfigureQuotas: setQuotaDialogRow
      }),
    [updateRow, saveRow]
  );

  const getRowId = useCallback((row: AdmissionYearRow) => row.id, []);

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

  return (
    <PermissionGuard module='admission' action='view'>
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
                  Set sanctioned seats per admission year — one row per program
                  cohort
                </p>
              </div>
            </div>
          </div>

          {/* Filter bar — just institution now */}
          <Card>
            <CardContent className='pt-4 pb-4'>
              <div className='flex flex-wrap gap-4 items-end'>
                <div className='space-y-1 min-w-[240px]'>
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
                      {rows.length} admission years
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
              Each row is one <strong>admission year</strong> (program cohort
              window). Seat counts are stored directly on the admission year.
              Add new admission years in{' '}
              <strong>Settings → Admission Years</strong>. Edit inline or click
              the <strong>✏</strong> pencil icon per row.
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
                No active admission years found for{' '}
                <strong>{selectedInstitutionName}</strong>. Add admission years
                in <strong>Settings → Admission Years</strong> first.
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              searchPlaceholder='Search admission years…'
              filterColumn='admission_year_name'
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

          <QuotaSeatsDialog
            row={quotaDialogRow}
            open={quotaDialogRow !== null}
            onOpenChange={(open) => {
              if (!open) setQuotaDialogRow(null);
            }}
            onSaved={loadData}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
