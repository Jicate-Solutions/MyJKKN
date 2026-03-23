'use client';

import { useCallback, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import {
  Building2, FileSpreadsheet, FileText, Loader2,
  MapPin, RotateCw, ShieldCheck, ShieldX, Sparkles, Users,
} from 'lucide-react';
import {
  useAllRegistrations,
  useBulkSetApprovalStatus,
  useSarvamGalattaStats,
  useSetApprovalStatus,
} from '@/hooks/startup-studio/use-sarvam-galatta';
import { SarvamGalattaRegistrationService } from '@/lib/services/startup-studio/sarvam-galatta-registration-service';
import type { SarvamGalattaRegistration } from '@/types/sarvam-galatta';
import { getSarvamGalattaColumns } from './sarvam-galatta-columns';
import { RegistrationDetailSheet } from './registration-detail-sheet';

// ── KPI stat card ────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub,
}: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Excel export ─────────────────────────────────────────────────

async function exportExcel(
  eventId: string,
  activeFilters: { search?: string; institution_id?: string },
  eventName: string
): Promise<void> {
  const rows = await SarvamGalattaRegistrationService.getAllForExport({
    event_id: eventId,
    ...activeFilters,
  });

  if (rows.length === 0) return;

  const sheetData = rows.map((r: SarvamGalattaRegistration) => ({
    'Name':                [r.snap_first_name, r.snap_last_name].filter(Boolean).join(' '),
    'Email':               r.owner_email          ?? '',
    'Team Name':           r.team_name            ?? '',
    'Team Code':           r.team_code            ?? '',
    'Institution':         r.institution_name     ?? '',
    'Department':          r.department_name      ?? '',
    'Program':             r.program_name         ?? '',
    'Semester':            r.semester_name        ?? '',
    'Project URL':         r.project_url          ?? '',
    'GitHub URL':          r.github_url           ?? '',
    'Supabase Project URL':r.supabase_project_url ?? '',
    'Gemini Page URL':     r.gemini_page_url      ?? '',
    'Maps Page URL':       r.maps_page_url        ?? '',
    'Approval Status':     r.approval_status,
    'Submitted At':        r.submitted_at ? format(new Date(r.submitted_at), 'dd MMM yyyy HH:mm') : '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');

  // Auto-fit column widths
  const colWidths = Object.keys(sheetData[0]).map((key) => ({
    wch: Math.max(key.length, ...sheetData.map((row: any) => String(row[key] ?? '').length)) + 2,
  }));
  worksheet['!cols'] = colWidths;

  const safe = eventName.replace(/[^a-z0-9_-]/gi, '_');
  XLSX.writeFile(workbook, `sarvam_galatta_${safe}.xlsx`);
}

// ── main component ───────────────────────────────────────────────

interface SarvamGalattaTableProps {
  eventId: string;
  eventName?: string;
}

export function SarvamGalattaTable({ eventId, eventName = 'Sarvam Galatta' }: SarvamGalattaTableProps) {
  const LIMIT = 25;

  // Filters & pagination state
  const [search, setSearch] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');
  const [page, setPage] = useState(1);

  // Export loading state
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Detail sheet
  const [detailRow, setDetailRow] = useState<SarvamGalattaRegistration | null>(null);

  // Data hooks
  const { data: stats, isPending: statsPending } = useSarvamGalattaStats();
  const approvalMutation = useSetApprovalStatus();
  const bulkApprovalMutation = useBulkSetApprovalStatus();
  const {
    data: result,
    isPending: tablePending,
    refetch,
  } = useAllRegistrations({
    search: search || undefined,
    institution_id: institutionFilter || undefined,
    page,
    limit: LIMIT,
  });

  const rows: SarvamGalattaRegistration[] = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  // Stable search callback — prevents DataTable's useEffect resetting page
  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(1);
  }, []);

  const handleApprove = useCallback(
    (id: string, status: 'shortlisted' | 'rejected' | 'waitlisted') => {
      approvalMutation.mutate({ sarvamGalattaId: id, status });
    },
    [approvalMutation],
  );

  // Export handlers — respects active filters so exported set matches what admin sees
  const handleExportExcel = useCallback(async () => {
    setExportingExcel(true);
    try {
      await exportExcel(
        eventId,
        { search: search || undefined, institution_id: institutionFilter || undefined },
        eventName
      );
    } finally {
      setExportingExcel(false);
    }
  }, [eventId, search, institutionFilter, eventName]);

  const handleExportPdf = useCallback(async () => {
    setExportingPdf(true);
    try {
      const allRows = await SarvamGalattaRegistrationService.getAllForExport({
        event_id: eventId,
        search: search || undefined,
        institution_id: institutionFilter || undefined,
      });
      // Dynamic import — jsPDF accesses browser globals at module init,
      // so it must be loaded client-side only (never during SSR).
      const { exportSarvamGalattaPDF } = await import('@/lib/utils/pdf-export/sarvam-galatta-pdf');
      await exportSarvamGalattaPDF(allRows, eventName);
    } finally {
      setExportingPdf(false);
    }
  }, [eventId, search, institutionFilter, eventName]);

  // Columns — recreated only when callbacks change (which is never)
  const columns = useMemo(
    () =>
      getSarvamGalattaColumns({
        onViewDetails: setDetailRow,
        onApprove: handleApprove,
        approvePending: approvalMutation.isPending,
      }),
    [handleApprove, approvalMutation.isPending],
  );

  // Institution filter badges — shown as toolbar tools
  const institutionTools = useMemo(() => {
    if (statsPending || !stats?.by_institution.length) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {stats.by_institution.map((inst) => (
          <Badge
            key={inst.institution_id}
            variant={institutionFilter === inst.institution_id ? 'default' : 'secondary'}
            className="cursor-pointer gap-1"
            onClick={() =>
              setInstitutionFilter(
                institutionFilter === inst.institution_id ? '' : inst.institution_id,
              )
            }
          >
            {inst.institution_name}
            <span className="ml-1 rounded-full bg-background/60 px-1.5 py-0.5 text-xs font-semibold">
              {inst.count}
            </span>
          </Badge>
        ))}
        {institutionFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => { setInstitutionFilter(''); setPage(1); }}
          >
            Clear
          </Button>
        )}
      </div>
    );
  }, [stats, statsPending, institutionFilter]);

  return (
    <div className="space-y-6">

      {/* KPI stats */}
      {!statsPending && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Total Registrations"
            value={stats.total}
          />
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="Programs"
            value={stats.by_program.length}
            sub="Unique programs"
          />
          <StatCard
            icon={<MapPin className="h-4 w-4" />}
            label="Semesters"
            value={stats.by_semester.length}
            sub="Unique semesters"
          />
          <StatCard
            icon={<Building2 className="h-4 w-4" />}
            label="Institutions"
            value={stats.by_institution.length}
            sub="Unique institutions"
          />
        </div>
      )}

      {/* Institution filter strip */}
      {institutionTools && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Filter by Institution</CardTitle>
          </CardHeader>
          <CardContent>{institutionTools}</CardContent>
        </Card>
      )}

      {/* Main TanStack DataTable */}
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search by name, email or URL…"
        onSearch={handleSearch}
        onRefresh={() => refetch()}
        showRefresh
        tableTools={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExportExcel}
              disabled={exportingExcel || exportingPdf}
            >
              {exportingExcel
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
              }
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExportPdf}
              disabled={exportingExcel || exportingPdf}
            >
              {exportingPdf
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileText className="h-3.5 w-3.5 text-red-500" />
              }
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => refetch()}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
        // ── Bulk shortlist (primary) ──────────────────────────────
        onBulkAction={async (selectedRows) => {
          const ids = selectedRows.map((r) => r.id);
          await bulkApprovalMutation.mutateAsync({ ids, status: 'shortlisted' });
        }}
        bulkActionConfig={{
          label: 'Shortlist Selected',
          icon: ShieldCheck,
          variant: 'default',
          confirmTitle: 'Shortlist selected registrations?',
          confirmDescription:
            'This will mark all selected registrations as shortlisted. You can change this later.',
          successMessage: 'Shortlisted {count} registration{plural}',
          errorMessage: 'Failed to shortlist selected registrations.',
          loadingText: 'Shortlisting…',
        }}
        // ── Bulk reject (secondary) ───────────────────────────────
        secondaryBulkAction={{
          label: 'Reject Selected',
          icon: ShieldX,
          variant: 'destructive',
          onClick: (selectedRows) => {
            const ids = selectedRows.map((r) => r.id);
            bulkApprovalMutation.mutate({ ids, status: 'rejected' });
          },
        }}
        serverSidePagination={{
          currentPage: page,
          totalPages,
          pageSize: LIMIT,
          totalItems: total,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          onPageChange: setPage,
          isLoading: tablePending,
        }}
      />

      {/* Detail sheet */}
      <RegistrationDetailSheet
        registration={detailRow}
        open={!!detailRow}
        onOpenChange={(open) => { if (!open) setDetailRow(null); }}
      />
    </div>
  );
}
