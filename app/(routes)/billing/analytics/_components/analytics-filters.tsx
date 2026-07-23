'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Download } from 'lucide-react';
import { DATE_PRESETS, type DatePreset } from './_utils';

export interface AnalyticsFilterChange {
  institution?: string | null;
  preset?: DatePreset;
  from?: string | null;
  to?: string | null;
}

interface Props {
  institutionId?: string;
  preset: DatePreset;
  from?: string;
  to?: string;
  institutions: Array<{ id: string; name: string }>;
  loadingInstitutions: boolean;
  multiInstitution: boolean;
  onChange: (change: AnalyticsFilterChange) => void;
  onRefresh: () => void;
  isFetching?: boolean;
  canExport?: boolean;
  onExport?: () => void;
  exporting?: boolean;
}

export function AnalyticsFilters({
  institutionId,
  preset,
  from,
  to,
  institutions,
  loadingInstitutions,
  multiInstitution,
  onChange,
  onRefresh,
  isFetching,
  canExport,
  onExport,
  exporting,
}: Props) {
  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'>
      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        {multiInstitution && (
          <Select
            value={institutionId || 'all'}
            onValueChange={(v) =>
              onChange({ institution: v === 'all' ? null : v })
            }
            disabled={loadingInstitutions}
          >
            <SelectTrigger className='w-full sm:w-[220px]'>
              <SelectValue placeholder='All Institutions' />
            </SelectTrigger>
            <SelectContent className='max-h-72 overflow-y-auto'>
              <SelectItem value='all'>All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={preset}
          onValueChange={(v) =>
            // Switching to a non-custom preset clears any custom dates in ONE
            // batched update (avoids the stale-searchParams multi-write clobber).
            onChange(
              v === 'custom'
                ? { preset: 'custom' }
                : { preset: v as DatePreset, from: null, to: null }
            )
          }
        >
          <SelectTrigger className='w-full sm:w-[160px]'>
            <SelectValue placeholder='This Month' />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === 'custom' && (
          <div className='flex items-center gap-2'>
            <Input
              type='date'
              value={from ?? ''}
              max={to || undefined}
              onChange={(e) => onChange({ from: e.target.value || null })}
              className='w-[150px]'
            />
            <span className='text-muted-foreground text-sm'>to</span>
            <Input
              type='date'
              value={to ?? ''}
              min={from || undefined}
              onChange={(e) => onChange({ to: e.target.value || null })}
              className='w-[150px]'
            />
          </div>
        )}
      </div>

      <div className='flex items-center gap-2'>
        {canExport && (
          <Button
            variant='outline'
            size='sm'
            onClick={onExport}
            disabled={exporting}
            className='shrink-0'
          >
            <Download className='mr-2 h-4 w-4' />
            Export
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          disabled={isFetching}
          className='shrink-0'
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>
    </div>
  );
}
