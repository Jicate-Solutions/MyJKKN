'use client';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Download } from 'lucide-react';
import { DATE_PRESETS, SCHEME_OPTIONS, type DatePreset } from './_utils';
import type { ReportScheme, ReportAcademicYear } from '@/types/billing-accountant-reports';

export interface ReportFilterChange {
  institution?: string | null;
  academicYear?: string | null;
  preset?: DatePreset;
  from?: string | null;
  to?: string | null;
  scheme?: ReportScheme;
}

interface Props {
  institutionId?: string;
  academicYearId?: string;
  preset: DatePreset;
  from?: string;
  to?: string;
  scheme: ReportScheme;
  institutions: Array<{ id: string; name: string }>;
  academicYears: ReportAcademicYear[];
  multiInstitution: boolean;
  loading?: boolean;
  onChange: (c: ReportFilterChange) => void;
  onRefresh: () => void;
  isFetching?: boolean;
  canExport?: boolean;
  onExport?: () => void;
  exporting?: boolean;
}

export function ReportFilterBar({
  institutionId, academicYearId, preset, from, to, scheme,
  institutions, academicYears, multiInstitution, loading,
  onChange, onRefresh, isFetching, canExport, onExport, exporting,
}: Props) {
  return (
    <div className='bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex flex-col gap-3 rounded-lg border p-3 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'>
      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        {multiInstitution && (
          <Select
            value={institutionId || 'all'}
            onValueChange={(v) => onChange({ institution: v === 'all' ? null : v })}
            disabled={loading}
          >
            <SelectTrigger className='w-full sm:w-[210px]'>
              <SelectValue placeholder='All Colleges' />
            </SelectTrigger>
            <SelectContent className='max-h-72 overflow-y-auto'>
              <SelectItem value='all'>All Colleges</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={academicYearId || 'all'}
          onValueChange={(v) => onChange({ academicYear: v === 'all' ? null : v })}
        >
          <SelectTrigger className='w-full sm:w-[170px]'>
            <SelectValue placeholder='All Years' />
          </SelectTrigger>
          <SelectContent className='max-h-72 overflow-y-auto'>
            <SelectItem value='all'>All Academic Years</SelectItem>
            {academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>{y.academic_year_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={preset}
          onValueChange={(v) =>
            onChange(v === 'custom'
              ? { preset: 'custom' }
              : { preset: v as DatePreset, from: null, to: null })
          }
        >
          <SelectTrigger className='w-full sm:w-[150px]'>
            <SelectValue placeholder='This Month' />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === 'custom' && (
          <div className='flex items-center gap-2'>
            <Input type='date' value={from ?? ''} max={to || undefined}
              onChange={(e) => onChange({ from: e.target.value || null })} className='w-[150px]' />
            <span className='text-muted-foreground text-sm'>to</span>
            <Input type='date' value={to ?? ''} min={from || undefined}
              onChange={(e) => onChange({ to: e.target.value || null })} className='w-[150px]' />
          </div>
        )}

        <Select value={scheme} onValueChange={(v) => onChange({ scheme: v as ReportScheme })}>
          <SelectTrigger className='w-full sm:w-[170px]'>
            <SelectValue placeholder='All Students' />
          </SelectTrigger>
          <SelectContent>
            {SCHEME_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='flex items-center gap-2'>
        {canExport && (
          <Button variant='outline' size='sm' onClick={onExport} disabled={exporting} className='shrink-0'>
            <Download className='mr-2 h-4 w-4' /> Export
          </Button>
        )}
        <Button variant='outline' size='sm' onClick={onRefresh} disabled={isFetching} className='shrink-0'>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>
    </div>
  );
}
