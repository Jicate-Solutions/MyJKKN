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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Filter,
  Search,
  X,
  Globe2,
  MapPin,
  ListFilter,
} from 'lucide-react';
import { FALLBACK_LEAD_SOURCE_LABELS } from '@/hooks/admission/use-active-lead-sources';
import type {
  CampaignStatus,
  CampaignScope,
} from '@/types/admission/campaign';
import type { LeadSource } from '@/types/admission';

const STATUS_OPTIONS: { value: CampaignStatus; label: string; dot: string }[] = [
  { value: 'draft', label: 'Draft', dot: 'bg-amber-500' },
  { value: 'active', label: 'Active', dot: 'bg-emerald-500' },
  { value: 'paused', label: 'Paused', dot: 'bg-blue-500' },
  { value: 'completed', label: 'Completed', dot: 'bg-slate-500' },
  { value: 'archived', label: 'Archived', dot: 'bg-zinc-400' },
];

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
          {/* Scope dropdown — single-select Select */}
          <Select
            value={value.scope}
            onValueChange={(v) => setScope(v as ScopeFilter)}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="institution">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3" />
                  Institution
                </span>
              </SelectItem>
              <SelectItem value="global">
                <span className="inline-flex items-center gap-1.5">
                  <Globe2 className="size-3" />
                  Global
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Status multi-select popover (was chip-row tabs) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <ListFilter className="size-3.5" />
                Status
                {value.statuses.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-xs"
                  >
                    {value.statuses.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-56 p-2"
            >
              <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">
                Filter by status
              </p>
              <div className="space-y-1">
                {STATUS_OPTIONS.map((opt) => {
                  const checked = value.statuses.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleStatus(opt.value)}
                      />
                      <span
                        className={`inline-block size-1.5 rounded-full ${opt.dot}`}
                        aria-hidden
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

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

      {/* Selected-filter chips row — shows the user what's currently
          applied without opening each popover again. Each chip has an
          x button to remove that single filter. */}
      {(value.statuses.length > 0 ||
        value.sources.length > 0 ||
        value.scope !== 'all' ||
        value.includeArchived) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Active:</span>
          {value.scope !== 'all' && (
            <Badge
              variant="secondary"
              className="gap-1 text-[11px]"
            >
              Scope: {value.scope}
              <button
                type="button"
                onClick={() => setScope('all')}
                className="ml-0.5 rounded hover:bg-muted-foreground/20"
                aria-label="Remove scope filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {value.statuses.map((s) => (
            <Badge
              key={s}
              variant="secondary"
              className="gap-1 text-[11px]"
            >
              {s}
              <button
                type="button"
                onClick={() => toggleStatus(s)}
                className="ml-0.5 rounded hover:bg-muted-foreground/20"
                aria-label={`Remove ${s} filter`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {value.sources.map((src) => (
            <Badge
              key={src}
              variant="secondary"
              className="gap-1 text-[11px]"
            >
              {src}
              <button
                type="button"
                onClick={() => toggleSource(src)}
                className="ml-0.5 rounded hover:bg-muted-foreground/20"
                aria-label={`Remove ${src} source filter`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {value.includeArchived && (
            <Badge
              variant="secondary"
              className="gap-1 text-[11px]"
            >
              Including archived
              <button
                type="button"
                onClick={() =>
                  onChange({ ...value, includeArchived: false })
                }
                className="ml-0.5 rounded hover:bg-muted-foreground/20"
                aria-label="Stop including archived"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
