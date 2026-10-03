'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCategories, useInstitutions } from '@/hooks/instasolver/use-instasolver';
import {
  ISSUE_STATUS_META,
  ISSUE_STATUS_VALUES,
  SEVERITY_META,
  SEVERITY_VALUES
} from '@/lib/instasolver/constants';
import type { InstaSolverAccess, IssueFilters, IssueScope, IssueStatus, Severity } from '@/types/instasolver';
import { hasActiveFilters } from './filter-state';

const ALL = 'all';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: T[] | undefined, v: T): T[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
}

export function IssueFilterBar({
  filters,
  access,
  onChange,
  onClear
}: {
  filters: IssueFilters;
  access: InstaSolverAccess;
  onChange: (patch: Partial<IssueFilters>) => void;
  onClear: () => void;
}) {
  const { data: institutions } = useInstitutions();
  const { data: categories } = useCategories('issue');

  // Typing is local; the URL (and the query) follow after a short pause.
  const [term, setTerm] = useState(filters.search ?? '');
  useEffect(() => setTerm(filters.search ?? ''), [filters.search]);
  useEffect(() => {
    if (term === (filters.search ?? '')) return;
    const t = setTimeout(() => onChange({ search: term.trim() || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="relative md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search reference, title or location"
            className="pl-8"
            aria-label="Search issues"
          />
        </div>

        <Select
          value={filters.scope ?? 'all'}
          onValueChange={(v) => onChange({ scope: v as IssueScope })}
        >
          <SelectTrigger className="md:w-[180px]" aria-label="Whose issues">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All I can see</SelectItem>
            <SelectItem value="mine">Reported by me</SelectItem>
            {access.is_maintenance && <SelectItem value="assigned_to_me">Assigned to me</SelectItem>}
            {access.is_maintenance && <SelectItem value="my_teams">My teams</SelectItem>}
          </SelectContent>
        </Select>

        <Select
          value={filters.institution_id ?? ALL}
          onValueChange={(v) => onChange({ institution_id: v === ALL ? undefined : v })}
        >
          <SelectTrigger className="md:w-[220px]" aria-label="Institution">
            <SelectValue placeholder="Institution" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All institutions</SelectItem>
            {institutions?.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.category_id ? String(filters.category_id) : ALL}
          onValueChange={(v) => onChange({ category_id: v === ALL ? undefined : Number(v) })}
        >
          <SelectTrigger className="md:w-[180px]" aria-label="Category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="mr-1 h-4 w-4" /> Clear filters
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
        {ISSUE_STATUS_VALUES.map((s: IssueStatus) => (
          <Chip
            key={s}
            active={!!filters.status?.includes(s)}
            onClick={() => onChange({ status: toggle(filters.status, s) })}
          >
            {ISSUE_STATUS_META[s].label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Severity">
          {SEVERITY_VALUES.map((s: Severity) => (
            <Chip
              key={s}
              active={!!filters.severity?.includes(s)}
              onClick={() => onChange({ severity: toggle(filters.severity, s) })}
            >
              {SEVERITY_META[s].label}
            </Chip>
          ))}
        </div>

        {access.is_manager && (
          <>
            <div className="flex items-center gap-2">
              <Switch
                id="flt-disputed"
                checked={!!filters.disputed}
                onCheckedChange={(c) => onChange({ disputed: c || undefined })}
              />
              <Label htmlFor="flt-disputed" className="text-sm font-normal">
                Disputed
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="flt-unassigned"
                checked={!!filters.unassigned}
                onCheckedChange={(c) => onChange({ unassigned: c || undefined })}
              />
              <Label htmlFor="flt-unassigned" className="text-sm font-normal">
                Unassigned
              </Label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
