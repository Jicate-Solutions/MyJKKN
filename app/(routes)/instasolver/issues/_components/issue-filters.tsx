'use client';

// The issue list's search and filters — laid out as the standalone InstaSolver
// list (app/(app)/issues/_components/issue-filters-client.tsx): a rounded
// search box, then one pill per filter (Status, Severity, Priority,
// Institution, Category, and Show for staff). A reporter's list is their own
// handful of reports, so only Status is offered to them; the rest are the
// office's tools. Filters that arrive from a dashboard link (several statuses,
// "Unassigned", "Fix disputed") show as pinned pills with their own ✕.
//
// Severity and priority stay separate: "how bad is it" and "how urgently are
// we acting" are different questions.

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ANY, FilterBar, type FilterDef, type PinnedFilter } from '@/components/instasolver/filter-bar';
import { useCategories, useInstitutions } from '@/hooks/instasolver/use-instasolver';
import {
  ISSUE_STATUS_META,
  ISSUE_STATUS_VALUES,
  PRIORITY_META,
  PRIORITY_VALUES,
  SEVERITY_META,
  SEVERITY_VALUES
} from '@/lib/instasolver/constants';
import type { InstaSolverAccess, IssueFilters, IssueScope, IssueStatus, Priority, Severity } from '@/types/instasolver';
import { hasActiveFilters } from './filter-state';

/** One pill holds one value; a list of several (from a link) is pinned instead. */
const single = <T extends string>(list: T[] | undefined): string => (list?.length === 1 ? list[0] : ANY);

const SCOPE_LABEL: Record<Exclude<IssueScope, 'all'>, string> = {
  mine: 'Reported by me',
  assigned_to_me: 'Assigned to me',
  my_teams: 'My teams'
};

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

  // Local mirror so typing feels immediate; the URL follows on a debounce.
  const [term, setTerm] = useState(filters.search ?? '');

  // Re-sync when the URL changes from outside (Back, Clear all) — adjusted
  // during render, so there is no flash of the stale term.
  const urlTerm = filters.search ?? '';
  const [syncedTerm, setSyncedTerm] = useState(urlTerm);
  if (syncedTerm !== urlTerm) {
    setSyncedTerm(urlTerm);
    setTerm(urlTerm);
  }

  useEffect(() => {
    if (term.trim() === (filters.search ?? '')) return;
    const t = setTimeout(() => onChange({ search: term.trim() || undefined }), 350);
    return () => clearTimeout(t);
  }, [term, filters.search, onChange]);

  const officeView = access.is_manager || access.is_maintenance || access.is_principal;

  const pinned: PinnedFilter[] = [
    ...((filters.status?.length ?? 0) > 1
      ? [
          {
            key: 'status-many',
            label: `Status: ${filters.status!.map((s) => ISSUE_STATUS_META[s].label).join(', ')}`,
            onClear: () => onChange({ status: undefined })
          }
        ]
      : []),
    ...((filters.severity?.length ?? 0) > 1
      ? [
          {
            key: 'severity-many',
            label: `Severity: ${filters.severity!.map((s) => SEVERITY_META[s].label).join(', ')}`,
            onClear: () => onChange({ severity: undefined })
          }
        ]
      : []),
    ...(filters.unassigned ? [{ key: 'unassigned', label: 'Unassigned', onClear: () => onChange({ unassigned: undefined }) }] : []),
    ...(filters.disputed ? [{ key: 'disputed', label: 'Fix disputed', onClear: () => onChange({ disputed: undefined }) }] : []),
    // A reporter has no Show pill, so a "Reported by me" from a link is pinned.
    ...(!officeView && filters.scope && filters.scope !== 'all'
      ? [{ key: 'scope', label: SCOPE_LABEL[filters.scope], onClear: () => onChange({ scope: undefined }) }]
      : [])
  ];

  const all: FilterDef[] = [
    {
      key: 'status',
      label: 'Status',
      value: single(filters.status),
      onChange: (v) => onChange({ status: v === ANY ? undefined : [v as IssueStatus] }),
      options: ISSUE_STATUS_VALUES.map((v) => ({ value: v, label: ISSUE_STATUS_META[v].label })),
      anyLabel: 'Any status'
    },
    {
      key: 'severity',
      label: 'Severity',
      value: single(filters.severity),
      onChange: (v) => onChange({ severity: v === ANY ? undefined : [v as Severity] }),
      options: SEVERITY_VALUES.map((v) => ({ value: v, label: SEVERITY_META[v].label })),
      anyLabel: 'Any severity'
    },
    {
      key: 'priority',
      label: 'Priority',
      value: single(filters.priority),
      onChange: (v) => onChange({ priority: v === ANY ? undefined : [v as Priority] }),
      options: PRIORITY_VALUES.map((v) => ({ value: v, label: PRIORITY_META[v].label })),
      anyLabel: 'Any priority'
    },
    {
      key: 'institution',
      label: 'Institution',
      value: filters.institution_id ?? ANY,
      onChange: (v) => onChange({ institution_id: v === ANY ? undefined : v }),
      options: (institutions ?? []).map((i) => ({ value: i.id, label: i.name })),
      anyLabel: 'Any institution'
    },
    {
      key: 'category',
      label: 'Category',
      value: filters.category_id ? String(filters.category_id) : ANY,
      onChange: (v) => onChange({ category_id: v === ANY ? undefined : Number(v) }),
      options: (categories ?? []).map((c) => ({ value: String(c.id), label: c.name })),
      anyLabel: 'Any category'
    },
    {
      key: 'scope',
      label: 'Show',
      value: filters.scope && filters.scope !== 'all' ? filters.scope : ANY,
      onChange: (v) => onChange({ scope: v === ANY ? undefined : (v as IssueScope) }),
      options: [
        { value: 'mine', label: SCOPE_LABEL.mine },
        ...(access.is_maintenance
          ? [
              { value: 'assigned_to_me', label: SCOPE_LABEL.assigned_to_me },
              { value: 'my_teams', label: SCOPE_LABEL.my_teams }
            ]
          : [])
      ],
      anyLabel: 'Everything I can see'
    }
  ];

  return (
    <FilterBar
      filters={officeView ? all : all.filter((f) => f.key === 'status')}
      hasActive={hasActiveFilters(filters)}
      pinned={pinned}
      onClearAll={() => {
        setTerm('');
        onClear();
      }}
      search={
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Label htmlFor="issue-search" className="sr-only">
            Search issues
          </Label>
          <Input
            id="issue-search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search issues…"
            title="Search by title, location or reference number"
            className="rounded-full pl-9"
          />
        </div>
      }
    />
  );
}
