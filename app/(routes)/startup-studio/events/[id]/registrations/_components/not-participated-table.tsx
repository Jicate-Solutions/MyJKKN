'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  GraduationCap,
  Loader2,
  Search,
  SlidersHorizontal,
  UserCheck,
  UserX,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useNotParticipatedLearners, useNotParticipatedByInstitution } from '@/hooks/startup-studio/use-events';
import { useStudentSearchFilterOptions } from '@/hooks/startup-studio/use-event-registrations';
import { EventService } from '@/lib/services/startup-studio/event-service';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { NotParticipatedLearner, LearnerParticipationFilters } from '@/types/startup-studio';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

// Re-used institution list helper (same as registrations-table)
function useInstitutions() {
  return useQuery({
    queryKey: ['institutions-list'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await supabase.from('institutions').select('id, name').order('name');
      return (data || []) as Array<{ id: string; name: string }>;
    },
    staleTime: 60 * 1000,
  });
}

async function exportExcel(
  eventId: string,
  filters: LearnerParticipationFilters & { search?: string },
  eventName?: string
): Promise<void> {
  // Fetch ALL matching records — no pagination limit for export
  const result = await EventService.getNotParticipatedLearners(eventId, {
    ...filters,
    page: 1,
    limit: 99999,
  });

  const allRows = result?.data ?? [];
  if (allRows.length === 0) return;

  const sheetData = allRows.map((r: NotParticipatedLearner) => ({
    'Roll Number':      r.roll_number          ?? '',
    'First Name':       r.first_name           ?? '',
    'Last Name':        r.last_name            ?? '',
    'College Email':    r.college_email        ?? '',
    'Student Email':    r.student_email        ?? '',
    'Institution':      r.institution_name     ?? '',
    'Degree':           r.degree_name          ?? '',
    'Department':       r.department_name      ?? '',
    'Program':          r.program_name         ?? '',
    'Semester':         r.semester_name        ?? '',
    'Section':          r.section_name         ?? '',
    'Class Incharge(s)': r.class_incharge_names ?? 'Not Assigned',
  }));

  const worksheet  = XLSX.utils.json_to_sheet(sheetData);
  const workbook   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Not Participated');

  // Auto-fit column widths based on content
  const colWidths = Object.keys(sheetData[0]).map((key) => ({
    wch: Math.max(
      key.length,
      ...sheetData.map((row: any) => String(row[key] ?? '').length)
    ) + 2,
  }));
  worksheet['!cols'] = colWidths;

  const safeName = (eventName ?? 'event').replace(/[^a-z0-9_-]/gi, '_');
  XLSX.writeFile(workbook, `not-participated-${safeName}.xlsx`);
}

export function NotParticipatedTable({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName?: string;
}) {
  const [search,         setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchTimer,    setSearchTimer]    = useState<ReturnType<typeof setTimeout> | null>(null);

  const [showFilters,      setShowFilters]      = useState(false);
  const [instFilter,       setInstFilter]       = useState('');
  const [degreeFilter,     setDegreeFilter]     = useState('');
  const [deptFilter,       setDeptFilter]       = useState('');
  const [programFilter,    setProgramFilter]    = useState('');
  const [semesterFilter,   setSemesterFilter]   = useState('');

  const [page,        setPage]        = useState(1);
  const [pageSize,    setPageSize]    = useState(25);
  const [isExporting, setIsExporting] = useState(false);

  const { data: institutions = [] } = useInstitutions();

  const filterOptions = {
    institution_id: instFilter   || undefined,
    degree_id:      degreeFilter || undefined,
    department_id:  deptFilter   || undefined,
    program_id:     programFilter|| undefined,
  };

  const { data: filterDropdowns } = useStudentSearchFilterOptions(filterOptions);

  const hasFilters = !!(instFilter || degreeFilter || deptFilter || programFilter || semesterFilter);

  const queryFilters = {
    institution_id: instFilter    || undefined,
    degree_id:      degreeFilter  || undefined,
    department_id:  deptFilter    || undefined,
    program_id:     programFilter || undefined,
    semester_id:    semesterFilter|| undefined,
    search:         debouncedSearch || undefined,
    page,
    limit: pageSize,
  };

  const { data: result, isLoading } = useNotParticipatedLearners(eventId, queryFilters);

  // Institution-wise breakdown — uses the same hierarchy filters but NOT search/pagination
  // so the stats always reflect the full filtered set, not just the current page
  const institutionStatsFilters: LearnerParticipationFilters = {
    institution_id: instFilter    || undefined,
    degree_id:      degreeFilter  || undefined,
    department_id:  deptFilter    || undefined,
    program_id:     programFilter || undefined,
    semester_id:    semesterFilter|| undefined,
  };
  const { data: institutionStats = [], isLoading: instStatsLoading } =
    useNotParticipatedByInstitution(eventId, institutionStatsFilters);

  const rows       = result?.data  ?? [];
  const totalCount = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimer) clearTimeout(searchTimer);
    const t = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
    setSearchTimer(t);
  }, [searchTimer]);

  const resetFilters = () => {
    setInstFilter('');
    setDegreeFilter('');
    setDeptFilter('');
    setProgramFilter('');
    setSemesterFilter('');
    setPage(1);
  };

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-orange-500" />
            <CardTitle className="text-base">Not Participated Learners</CardTitle>
            {totalCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalCount.toLocaleString()}
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={totalCount === 0 || isExporting}
            onClick={async () => {
              setIsExporting(true);
              try {
                await exportExcel(
                  eventId,
                  {
                    institution_id: instFilter    || undefined,
                    degree_id:      degreeFilter  || undefined,
                    department_id:  deptFilter    || undefined,
                    program_id:     programFilter || undefined,
                    semester_id:    semesterFilter|| undefined,
                    search:         debouncedSearch || undefined,
                  },
                  eventName
                );
              } finally {
                setIsExporting(false);
              }
            }}
          >
            {isExporting
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
              : <><Download className="h-3.5 w-3.5" /> Export Excel</>
            }
          </Button>
        </div>

        {/* Institution-wise Stats */}
        {(instStatsLoading || institutionStats.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              Institution-wise Breakdown
            </div>
            {instStatsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading breakdown...
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {institutionStats.map((inst) => (
                  <button
                    key={inst.institution_id ?? 'unknown'}
                    type="button"
                    onClick={() => {
                      if (inst.institution_id) {
                        setInstFilter(inst.institution_id);
                        setDegreeFilter(''); setDeptFilter('');
                        setProgramFilter(''); setSemesterFilter('');
                        setPage(1);
                      }
                    }}
                    className={cn(
                      'text-left rounded-lg border p-2.5 space-y-1 transition-colors',
                      'hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20',
                      instFilter === inst.institution_id
                        ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                        : 'bg-background',
                      !inst.institution_id && 'cursor-default'
                    )}
                  >
                    <p className="text-xs font-medium leading-tight line-clamp-2">
                      {inst.institution_name ?? 'Unknown Institution'}
                    </p>
                    <p className="text-lg font-bold text-orange-600 dark:text-orange-400 leading-none">
                      {inst.not_participated_count.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">not participated</p>
                  </button>
                ))}
              </div>
            )}
            {instFilter && (
              <button
                type="button"
                onClick={() => { setInstFilter(''); setPage(1); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Show all institutions
              </button>
            )}
          </div>
        )}

        {/* Filter Controls */}
        <div className="space-y-3">
          {/* Search + Filter Toggle Row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, roll number, or email..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 h-9"
              />
              {search && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1 text-xs text-muted-foreground hover:text-destructive"
                  onClick={resetFilters}
                >
                  <X className="h-3 w-3" /> Reset
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className={cn('h-9 gap-1.5 text-xs', hasFilters && 'border-primary text-primary')}
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {hasFilters ? 'Filters Active' : 'Filter by Class'}
                {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Cascading Dropdowns */}
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 p-3 rounded-lg border bg-muted/30">
              {/* Institution */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Institution</label>
                <Select
                  value={instFilter || 'all'}
                  onValueChange={(v) => {
                    setInstFilter(v === 'all' ? '' : v);
                    setDegreeFilter(''); setDeptFilter('');
                    setProgramFilter(''); setSemesterFilter('');
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Institutions" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Institutions</SelectItem>
                    {(filterDropdowns?.institutions || institutions).map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Degree */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Degree</label>
                <Select
                  value={degreeFilter || 'all'}
                  disabled={!instFilter}
                  onValueChange={(v) => {
                    setDegreeFilter(v === 'all' ? '' : v);
                    setDeptFilter(''); setProgramFilter(''); setSemesterFilter('');
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Degrees" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Degrees</SelectItem>
                    {(filterDropdowns?.degrees || []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.degree_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Department */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Department</label>
                <Select
                  value={deptFilter || 'all'}
                  disabled={!degreeFilter}
                  onValueChange={(v) => {
                    setDeptFilter(v === 'all' ? '' : v);
                    setProgramFilter(''); setSemesterFilter('');
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {(filterDropdowns?.departments || []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Program */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Program</label>
                <Select
                  value={programFilter || 'all'}
                  disabled={!deptFilter}
                  onValueChange={(v) => {
                    setProgramFilter(v === 'all' ? '' : v);
                    setSemesterFilter('');
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Programs" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Programs</SelectItem>
                    {(filterDropdowns?.programs || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Semester */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Semester</label>
                <Select
                  value={semesterFilter || 'all'}
                  disabled={!programFilter}
                  onValueChange={(v) => { setSemesterFilter(v === 'all' ? '' : v); setPage(1); }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Semesters" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Semesters</SelectItem>
                    {(filterDropdowns?.semesters || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.semester_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="min-w-[110px]">Roll No.</TableHead>
                  <TableHead className="min-w-[160px]">Name</TableHead>
                  <TableHead className="min-w-[200px]">Email</TableHead>
                  <TableHead className="min-w-[140px]">Institution</TableHead>
                  <TableHead className="min-w-[130px]">Department</TableHead>
                  <TableHead className="min-w-[130px]">Program</TableHead>
                  <TableHead className="min-w-[100px]">Semester</TableHead>
                  <TableHead className="min-w-[90px]">Section</TableHead>
                  <TableHead className="min-w-[180px]">Class Incharge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <GraduationCap className="h-8 w-8 opacity-30" />
                        <p className="text-sm">
                          {debouncedSearch || hasFilters
                            ? 'No learners match the current filters.'
                            : 'All eligible learners have participated!'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((learner) => (
                    <TableRow key={learner.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {learner.roll_number ?? '—'}
                      </TableCell>
                      <TableCell className="font-medium">
                        {learner.first_name} {learner.last_name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {learner.college_email ?? learner.student_email ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {learner.institution_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {learner.department_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {learner.program_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {learner.semester_name ? (
                          <Badge variant="outline" className="text-xs font-normal">
                            {learner.semester_name}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {learner.section_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {learner.class_incharge_count > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            <span className="text-foreground leading-tight">
                              {learner.class_incharge_names}
                            </span>
                          </div>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs font-normal border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400"
                          >
                            Not Assigned
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()} learners
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
              >
                <SelectTrigger className="h-7 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(1)} disabled={page === 1}>
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs px-2 text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
