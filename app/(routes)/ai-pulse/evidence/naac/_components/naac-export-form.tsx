// app/(routes)/ai-pulse/evidence/naac/_components/naac-export-form.tsx
// ============================================================================
// NAAC Evidence Export — filter + preview client component.
//
// IQAC user picks a date range + (optional) institution, sees a live preview
// of Gold Standard AI Pulse publications, and clicks Export to download the
// CSV that matches the same filter set.
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FilterX, Layers, Award, Building2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  NaacEvidenceService,
  defaultLastQuarter,
  useNaacEvidence,
  type NaacEvidenceFilters,
} from '@/lib/services/ai-pulse/naac-evidence-service';

import { NaacPreviewTable } from './naac-preview-table';

interface InstitutionOption {
  id: string;
  name: string;
}

function useInstitutionOptions() {
  return useQuery<InstitutionOption[], Error>({
    queryKey: ['institutions', 'naac-evidence-filter'],
    queryFn: async () => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as InstitutionOption[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

function isoDate(d: Date | undefined): string | undefined {
  if (!d) return undefined;
  return d.toISOString().slice(0, 10);
}

export function NaacExportForm() {
  const defaults = defaultLastQuarter();
  const initialRange: DateRange = {
    from: new Date(defaults.from),
    to: new Date(defaults.to),
  };

  const [range, setRange] = useState<DateRange | undefined>(initialRange);
  const [institutionId, setInstitutionId] = useState<string>('all');

  const { data: institutions, isLoading: institutionsLoading } =
    useInstitutionOptions();

  const filters: NaacEvidenceFilters = useMemo(
    () => ({
      from: isoDate(range?.from),
      to: isoDate(range?.to),
      institution_id: institutionId === 'all' ? undefined : institutionId,
    }),
    [range, institutionId],
  );

  const {
    data: evidence,
    isLoading: evidenceLoading,
    error,
    refetch,
    isFetching,
  } = useNaacEvidence(filters);

  const handleExport = () => {
    const url = NaacEvidenceService.getCsvDownloadUrl(filters);
    // Plain navigation triggers the Content-Disposition: attachment header.
    window.location.assign(url);
  };

  const handleResetFilters = () => {
    setRange(initialRange);
    setInstitutionId('all');
  };

  const summary = evidence?.summary;
  const rows = evidence?.rows ?? [];

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
            Filter Gold Standard publications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Cycle date range
              </Label>
              <DatePickerWithRange value={range} onChange={setRange} />
              <p className="text-[11px] text-muted-foreground">
                Default: last 90 days. Picks any cycle whose start date falls
                in the range.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Institution
              </Label>
              <Select
                value={institutionId}
                onValueChange={setInstitutionId}
                disabled={institutionsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All institutions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All institutions</SelectItem>
                  {(institutions ?? []).map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Optional. Defaults to all institutions in your access scope.
              </p>
            </div>

            <div className="flex flex-col gap-2 md:items-end md:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="w-full md:w-auto"
              >
                <FilterX className="mr-2 h-4 w-4" />
                Reset filters
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                disabled={evidenceLoading || rows.length === 0}
                className="w-full md:w-auto"
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV ({rows.length})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary strip */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Gold Standards
              </div>
              <div className="text-2xl font-bold">
                {evidenceLoading && !evidence ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  summary?.gold_standard_count ?? 0
                )}
              </div>
            </div>
            <Award className="h-8 w-8 text-amber-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Departments
              </div>
              <div className="text-2xl font-bold">
                {evidenceLoading && !evidence ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  summary?.department_count ?? 0
                )}
              </div>
            </div>
            <Building2 className="h-8 w-8 text-indigo-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Cycles in range
              </div>
              <div className="text-2xl font-bold">
                {evidenceLoading && !evidence ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  summary?.cycle_count ?? 0
                )}
              </div>
            </div>
            <Layers className="h-8 w-8 text-emerald-500" />
          </CardContent>
        </Card>
      </div>

      {summary && rows.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <strong>{summary.gold_standard_count}</strong> Gold Standards across{' '}
          <strong>{summary.department_count}</strong> department
          {summary.department_count === 1 ? '' : 's'} ×{' '}
          <strong>{summary.cycle_count}</strong> cycle
          {summary.cycle_count === 1 ? '' : 's'} in selected range.
        </p>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">
            Could not load NAAC evidence rows.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error.message}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Preview table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <NaacPreviewTable rows={rows} isLoading={evidenceLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
