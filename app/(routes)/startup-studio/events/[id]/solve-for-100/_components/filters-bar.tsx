'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { PROGRESSION_LEVELS } from '@/lib/constants/startup-studio/progression';
import { APP_STATUS_OPTIONS } from '@/lib/constants/startup-studio/solve100';
import type { AppStatus, ProgressionLevelNumber } from '@/types/startup-studio';

export interface FiltersState {
  institutionId: string; // 'all' or UUID
  level: string; // 'all' or '1'-'5'
  appStatus: string; // 'all' or AppStatus value
  search: string;
}

export const INITIAL_FILTERS: FiltersState = {
  institutionId: 'all',
  level: 'all',
  appStatus: 'all',
  search: '',
};

interface FiltersBarProps {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}

function useInstitutionsList() {
  return useQuery({
    queryKey: ['solve100-institutions-list'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await supabase.from('institutions').select('id, name').order('name');
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    staleTime: 60 * 1000,
  });
}

function appStatusLabel(status: string): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'needs_fixes':
      return 'Needs Fixes';
    case 'building':
      return 'Building';
    case 'pivoting':
      return 'Pivoting';
    default:
      return status;
  }
}

export function FiltersBar({ value, onChange }: FiltersBarProps) {
  const { data: institutions = [] } = useInstitutionsList();

  // Debounce search input locally, notify parent after a short delay.
  const [searchLocal, setSearchLocal] = useState(value.search);
  useEffect(() => {
    setSearchLocal(value.search);
  }, [value.search]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchLocal !== value.search) {
        onChange({ ...value, search: searchLocal.trim() });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchLocal]);

  const activeCount = [
    value.institutionId !== 'all',
    value.level !== 'all',
    value.appStatus !== 'all',
    value.search !== '',
  ].filter(Boolean).length;

  const reset = () => {
    setSearchLocal('');
    onChange({ ...INITIAL_FILTERS });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search team name..."
            value={searchLocal}
            onChange={(e) => setSearchLocal(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Institution */}
        <Select
          value={value.institutionId}
          onValueChange={(v) => onChange({ ...value, institutionId: v })}
        >
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="All Institutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Institutions</SelectItem>
            {institutions.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Level */}
        <Select
          value={value.level}
          onValueChange={(v) => onChange({ ...value, level: v })}
        >
          <SelectTrigger className="w-full md:w-[170px]">
            <SelectValue placeholder="All Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {PROGRESSION_LEVELS.map((p) => (
              <SelectItem key={p.level} value={String(p.level)}>
                L{p.level} · {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* App Status */}
        <Select
          value={value.appStatus}
          onValueChange={(v) => onChange({ ...value, appStatus: v })}
        >
          <SelectTrigger className="w-full md:w-[160px]">
            <SelectValue placeholder="All App Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All App Status</SelectItem>
            {APP_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {appStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active filter pills */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
            <SlidersHorizontal className="h-3 w-3" />
            {activeCount} active
          </Badge>

          {value.search && (
            <Badge variant="secondary" className="gap-1 text-xs pr-1">
              Search: {value.search}
              <button
                onClick={() => onChange({ ...value, search: '' })}
                className="ml-0.5 hover:text-destructive"
                aria-label="Clear search filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {value.institutionId !== 'all' && (
            <Badge variant="secondary" className="gap-1 text-xs pr-1">
              {institutions.find((i) => i.id === value.institutionId)?.name ?? 'Institution'}
              <button
                onClick={() => onChange({ ...value, institutionId: 'all' })}
                className="ml-0.5 hover:text-destructive"
                aria-label="Clear institution filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {value.level !== 'all' && (
            <Badge variant="secondary" className="gap-1 text-xs pr-1">
              Level{' '}
              {PROGRESSION_LEVELS.find((p) => String(p.level) === value.level)?.name ??
                value.level}
              <button
                onClick={() => onChange({ ...value, level: 'all' })}
                className="ml-0.5 hover:text-destructive"
                aria-label="Clear level filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {value.appStatus !== 'all' && (
            <Badge variant="secondary" className="gap-1 text-xs pr-1">
              {appStatusLabel(value.appStatus)}
              <button
                onClick={() => onChange({ ...value, appStatus: 'all' })}
                className="ml-0.5 hover:text-destructive"
                aria-label="Clear app status filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs ml-auto"
            onClick={reset}
          >
            <X className="h-3 w-3" /> Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
