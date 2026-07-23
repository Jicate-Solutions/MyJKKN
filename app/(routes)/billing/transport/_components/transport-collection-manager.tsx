'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/data-table';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useTransportCollectables, type TransportCollectable } from '@/hooks/billing/use-transport-collectables';
import { TransportStatsCards } from './transport-stats-cards';
import { getTransportColumns, paymentStatus } from './transport-columns';

const ALL = '__all__';

// Multi-field search for the DataTable's built-in search box.
function transportGlobalFilter(row: any, _columnId: string, value: string): boolean {
  const r = (row?.original ?? row) as TransportCollectable;
  const q = String(value || '').trim().toLowerCase();
  if (!q) return true;
  return [r.first_name, r.last_name, r.roll_number, r.route_number, r.route_name, r.stop_name,
    r.degree_name, r.department_name, r.program_name, r.semester_name]
    .filter(Boolean).join(' ').toLowerCase().includes(q);
}

// Distinct, sorted, non-null values of one field across the rows — used to build
// the advanced-filter dropdown options straight from the loaded data so a filter
// never offers a value that isn't present for the current institution / year.
function distinctValues(rows: TransportCollectable[], pick: (r: TransportCollectable) => string | null): string[] {
  return Array.from(new Set(rows.map(pick).filter((v): v is string => !!v)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const BILL_STATUSES = ['Paid', 'Partial', 'Unpaid'] as const;

export function TransportCollectionManager() {
  const { can } = usePermissions();
  const canCollect = can('billing.transport.collect');
  const canReceipt = can('billing.receipts.create');
  const { institutions } = useInstitutionsWithAccess();

  const [fInstitution, setFInstitution] = useState(ALL);
  const [fYear, setFYear] = useState(ALL);
  // Client-side advanced filters (refine the rows returned for the institution / year).
  const [fDegree, setFDegree] = useState(ALL);
  const [fDepartment, setFDepartment] = useState(ALL);
  const [fProgram, setFProgram] = useState(ALL);
  const [fSemester, setFSemester] = useState(ALL);
  const [fBillStatus, setFBillStatus] = useState(ALL);

  const institutionId = fInstitution === ALL ? null : fInstitution;
  const academicYearId = fYear === ALL ? null : fYear;

  // Academic years are institution-scoped — only offer the filter once an institution is picked.
  const { data: ayData } = useAcademicYears(institutionId ?? undefined);
  const academicYears: Array<{ id: string; academic_year_name: string }> = institutionId
    ? (ayData?.data ?? [])
    : [];

  const { data, isLoading, error, refetch } = useTransportCollectables({ institutionId, academicYearId });
  const rows = useMemo(() => data ?? [], [data]);

  // Dropdown options derived from the loaded rows.
  const degreeOptions = useMemo(() => distinctValues(rows, (r) => r.degree_name), [rows]);
  const departmentOptions = useMemo(() => distinctValues(rows, (r) => r.department_name), [rows]);
  const programOptions = useMemo(() => distinctValues(rows, (r) => r.program_name), [rows]);
  const semesterOptions = useMemo(() => distinctValues(rows, (r) => r.semester_name), [rows]);

  // Apply the advanced filters in-memory.
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (fDegree !== ALL && (r.degree_name ?? '') !== fDegree) return false;
      if (fDepartment !== ALL && (r.department_name ?? '') !== fDepartment) return false;
      if (fProgram !== ALL && (r.program_name ?? '') !== fProgram) return false;
      if (fSemester !== ALL && (r.semester_name ?? '') !== fSemester) return false;
      if (fBillStatus !== ALL) {
        const label = paymentStatus(Number(r.total_billed) || 0, Number(r.outstanding_amount) || 0).label;
        if (label !== fBillStatus) return false;
      }
      return true;
    });
  }, [rows, fDegree, fDepartment, fProgram, fSemester, fBillStatus]);

  const instName = useMemo(() => {
    const map = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string | null) => (id == null ? '—' : map.get(id) ?? id);
  }, [institutions]);

  const columns = useMemo(
    () => getTransportColumns({ instName, canCollect, canReceipt }),
    [instName, canCollect, canReceipt],
  );

  function resetClientFilters() {
    setFDegree(ALL);
    setFDepartment(ALL);
    setFProgram(ALL);
    setFSemester(ALL);
    setFBillStatus(ALL);
  }

  function onInstitutionChange(v: string) {
    setFInstitution(v);
    setFYear(ALL); // AY list depends on the institution
    resetClientFilters(); // available degree/dept/program/semester change with the institution
  }

  function onYearChange(v: string) {
    setFYear(v);
    resetClientFilters();
  }

  const hasActiveClientFilters =
    fDegree !== ALL || fDepartment !== ALL || fProgram !== ALL ||
    fSemester !== ALL || fBillStatus !== ALL;

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Bus (transport) fees for learners who use college transport — paid online to the dedicated
        transport account, or collect manually. Stats reflect the active filters.
      </p>

      {/* Advanced, filter-aware stats — recomputes as the filters change. */}
      <TransportStatsCards rows={filteredRows} />

      <Card>
        <CardContent className='flex flex-wrap items-end gap-3 p-4'>
          <div className='space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Institution</label>
            <Select value={fInstitution} onValueChange={onInstitutionChange}>
              <SelectTrigger className='w-[220px]'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All institutions</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Academic year</label>
            <Select value={fYear} onValueChange={onYearChange} disabled={!institutionId}>
              <SelectTrigger className='w-[180px]'>
                <SelectValue placeholder={institutionId ? 'All years' : 'Pick an institution'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All years</SelectItem>
                {academicYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.academic_year_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Degree</label>
            <Select value={fDegree} onValueChange={setFDegree} disabled={degreeOptions.length === 0}>
              <SelectTrigger className='w-[180px]'><SelectValue placeholder='All degrees' /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All degrees</SelectItem>
                {degreeOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Department</label>
            <Select value={fDepartment} onValueChange={setFDepartment} disabled={departmentOptions.length === 0}>
              <SelectTrigger className='w-[180px]'><SelectValue placeholder='All departments' /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All departments</SelectItem>
                {departmentOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Program</label>
            <Select value={fProgram} onValueChange={setFProgram} disabled={programOptions.length === 0}>
              <SelectTrigger className='w-[180px]'><SelectValue placeholder='All programs' /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All programs</SelectItem>
                {programOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Semester</label>
            <Select value={fSemester} onValueChange={setFSemester} disabled={semesterOptions.length === 0}>
              <SelectTrigger className='w-[160px]'><SelectValue placeholder='All semesters' /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All semesters</SelectItem>
                {semesterOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Bill status</label>
            <Select value={fBillStatus} onValueChange={setFBillStatus}>
              <SelectTrigger className='w-[150px]'><SelectValue placeholder='All statuses' /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {BILL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {hasActiveClientFilters && (
            <Button variant='ghost' size='sm' className='h-9' onClick={resetClientFilters}>
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className='space-y-2 p-4'>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className='h-10 w-full' />)}
        </CardContent></Card>
      ) : error ? (
        <Card><CardContent className='py-8 text-center text-sm text-destructive'>
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </CardContent></Card>
      ) : rows.length === 0 ? (
        <Card><CardContent className='text-muted-foreground py-10 text-center text-sm'>
          No transport bills to collect. Bills appear here once transport fees are generated for
          learners who use college transport.
        </CardContent></Card>
      ) : filteredRows.length === 0 ? (
        <Card><CardContent className='text-muted-foreground py-10 text-center text-sm'>
          No learners match the selected filters.
        </CardContent></Card>
      ) : (
        <DataTable
          columns={columns}
          data={filteredRows}
          getRowId={(r) => r.student_id}
          globalFilterFn={transportGlobalFilter}
          searchPlaceholder='Search name, roll number, route, stop…'
          onRefresh={() => refetch()}
        />
      )}
    </div>
  );
}
