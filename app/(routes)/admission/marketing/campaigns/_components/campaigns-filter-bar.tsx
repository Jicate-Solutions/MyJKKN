'use client';

// ════════════════════════════════════════════════════════════════════════════
// Campaigns Filter Bar
// Advanced multi-select filters for the campaigns list page. State is
// owned by the parent and applied client-side to the already-fetched
// campaign array — at admission scale (<~500 campaigns / institution)
// client-side filtering is faster than a refetch.
// ════════════════════════════════════════════════════════════════════════════

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Filter,
  Search,
  X,
  Globe2,
  MapPin,
  CircleSlash,
} from 'lucide-react';
import { FALLBACK_LEAD_SOURCE_LABELS } from '@/hooks/admission/use-active-lead-sources';
import type {
  CampaignStatus,
  CampaignScope,
} from '@/types/admission/campaign';
import type { LeadSource } from '@/types/admission';

const STATUS_OPTIONS: CampaignStatus[] = [
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
];

const STATUS_PILL: Record<CampaignStatus, string> = {
  draft:
    'data-[on=true]:bg-amber-50 data-[on=true]:text-amber-700 data-[on=true]:ring-amber-200 dark:data-[on=true]:bg-amber-950/40 dark:data-[on=true]:text-amber-300',
  active:
    'data-[on=true]:bg-emerald-50 data-[on=true]:text-emerald-700 data-[on=true]:ring-emerald-200 dark:data-[on=true]:bg-emerald-950/40 dark:data-[on=true]:text-emerald-300',
  paused:
    'data-[on=true]:bg-blue-50 data-[on=true]:text-blue-700 data-[on=true]:ring-blue-200 dark:data-[on=true]:bg-blue-950/40 dark:data-[on=true]:text-blue-300',
  completed:
    'data-[on=true]:bg-slate-100 data-[on=true]:text-slate-700 data-[on=true]:ring-slate-200',
  archived:
    'data-[on=true]:bg-zinc-100 data-[on=true]:text-zinc-700 data-[on=true]:ring-zinc-200',
};

export type ScopeFilter = 'all' | CampaignScope;

export interface CampaignsFilterState {
  search: string;
  statuses: CampaignStatus[];
  scope: ScopeFilter;
  sources: LeadSource[];
  includeArchived: boolean;
}

export const EMPTY_FILTERS: CampaignsFilterState = {
  search: '',
  statuses: [],
  scope: 'all',
  sources: [],
  includeArchived: false,
};

interface Props {
  value: CampaignsFilterState;
  onChange: (next: CampaignsFilterState) => void;
  /** All available sources (from useActiveLeadSources). */
  sourceOptions: Array<{ value: LeadSource; label: string }>;
}

export function CampaignsFilterBar({
  value,
  onChange,
  sourceOptions,
}: Props) {
  function toggleStatus(s: CampaignStatus) {
    onChange({
      ...value,
      statuses: value.statuses.includes(s)
        ? value.statuses.filter((x) => x !== s)
        : [...value.statuses, s],
    });
  }

  function toggleSource(src: LeadSource) {
    onChange({
      ...value,
      sources: value.sources.includes(src)
        ? value.sources.filter((x) => x !== src)
        : [...value.sources, src],
    });
  }

  function setScope(scope: ScopeFilter) {
    onChange({ ...value, scope });
  }

  function clearAll() {
    onChange(EMPTY_FILTERS);
  }

  const activeFilterCount =
    (value.search ? 1 : 0) +
    value.statuses.length +
    (value.scope !== 'all' ? 1 : 0) +
    value.sources.length +
    (value.includeArchived ? 1 : 0);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
      {/* Top row: search + scope + clear + active count */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or description…"
            value={value.search}
            onChange={(e) =>
              onChange({ ...value, search: e.target.value })
            }
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Scope pills */}
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setScope('all')}
              data-on={value.scope === 'all'}
              className="rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors data-[on=true]:bg-muted data-[on=true]:text-foreground"
            >
              All scopes
            </button>
            <button
              type="button"
              onClick={() => setScope('institution')}
              data-on={value.scope === 'institution'}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors data-[on=true]:bg-muted data-[on=true]:text-foreground"
            >
              <MapPin className="size-3" />
              Institution
            </button>
            <button
              type="button"
              onClick={() => setScope('global')}
              data-on={value.scope === 'global'}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors data-[on=true]:bg-muted data-[on=true]:text-foreground"
            >
              <Globe2 className="size-3" />
              Global
            </button>
          </div>

          {/* Source multi-select popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Filter className="size-3.5" />
                Source
                {value.sources.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-xs"
                  >
                    {value.sources.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-64 max-h-72 overflow-y-auto p-2"
            >
              <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">
                Filter by source
              </p>
              <div className="space-y-1">
                {sourceOptions.map((opt) => {
                  const checked = value.sources.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSource(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Include archived toggle */}
          <label className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Checkbox
              checked={value.includeArchived}
              onCheckedChange={(c) =>
                onChange({
                  ...value,
                  includeArchived: c === true,
                })
              }
              id="include-archived"
            />
            <Label
              htmlFor="include-archived"
              className="cursor-pointer text-xs"
            >
              Include archived
            </Label>
          </label>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="gap-1 text-xs text-muted-foreground"
            >
              <X className="size-3" />
              Clear ({activeFilterCount})
            </Button>
          )}
        </div>
      </div>

      {/* Status chip row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Status:</span>
        {STATUS_OPTIONS.map((s) => {
          const on = value.statuses.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              data-on={on}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-transparent transition-colors ${
                STATUS_PILL[s]
              } ${
                on
                  ? ''
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted'
              }`}
            >
              {s}
            </button>
          );
        })}
        {value.statuses.length === 0 && !value.includeArchived && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            (showing all non-archived)
          </span>
        )}
        {value.scope === 'global' && (
          <Badge
            variant="outline"
            className="ml-auto inline-flex items-center gap-1 text-[10px]"
          >
            <CircleSlash className="size-2.5" />
            Global campaigns only
          </Badge>
        )}
      </div>
    </div>
  );
}
