'use client';

// Requirements list. Filters live in the URL so a dashboard link such as
// ?status=pending lands on the right view and a filtered view can be shared.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, Loader2, PackagePlus, PackageSearch, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  useCategories,
  useInstaSolverAccess,
  useInstitutions,
  useRequirements
} from '@/hooks/instasolver/use-instasolver';
import { InstaSolverRequirementService } from '@/lib/services/instasolver/requirement-service';
import { PAGE_SIZE, REQUIREMENT_STATUS_META, REQUIREMENT_STATUS_VALUES } from '@/lib/instasolver/constants';
import { cn } from '@/lib/utils';
import type { RequirementFilters, RequirementStatus } from '@/types/instasolver';
import { downloadCsv, requirementsToCsv } from './export-csv';
import { RequirementsTable } from './requirements-table';

const ALL = 'all';

function parseStatuses(raw: string | null): RequirementStatus[] {
  if (!raw) return [];
  return raw
    .split(',')
    .filter((s): s is RequirementStatus => (REQUIREMENT_STATUS_VALUES as string[]).includes(s));
}

export function RequirementsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const search = params.get('q') ?? '';
  const statuses = useMemo(() => parseStatuses(params.get('status')), [params]);
  const institution = params.get('institution') ?? '';
  const category = params.get('category') ?? '';
  const mine = params.get('mine') === '1';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [searchText, setSearchText] = useState(search);
  const [exporting, setExporting] = useState(false);

  const { data: access } = useInstaSolverAccess();
  const { data: institutions } = useInstitutions();
  const { data: categories } = useCategories('requirement', true);

  const setParams = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (resetPage) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  // Debounce the search box into the URL.
  useEffect(() => {
    if (searchText === search) return;
    const t = setTimeout(() => setParams({ q: searchText.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [searchText, search, setParams]);

  const filters: RequirementFilters = useMemo(
    () => ({
      search: search || undefined,
      status: statuses.length ? statuses : undefined,
      institution_id: institution || undefined,
      category_id: category ? Number(category) : undefined,
      mine: mine || undefined
    }),
    [search, statuses, institution, category, mine]
  );

  const { data, isLoading, isFetching, error } = useRequirements({ ...filters, page, limit: PAGE_SIZE });
  const rows = data?.data ?? [];
  const meta = data?.metadata;

  const toggleStatus = (s: RequirementStatus) => {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
    setParams({ status: next.length ? next.join(',') : null });
  };

  const hasFilters = !!(search || statuses.length || institution || category || mine);

  async function exportCsv() {
    try {
      setExporting(true);
      const res = await InstaSolverRequirementService.list({ ...filters, page: 1, limit: 500 });
      if (!res.data.length) {
        toast.error('Nothing to export for these filters');
        return;
      }
      downloadCsv(`instasolver-requirements-${new Date().toISOString().slice(0, 10)}.csv`, requirementsToCsv(res.data));
      toast.success(
        res.metadata.total > res.data.length
          ? `Exported the first ${res.data.length} of ${res.metadata.total}. Narrow the filters to export the rest.`
          : `Exported ${res.data.length} requirement${res.data.length === 1 ? '' : 's'}`
      );
    } catch (e) {
      toast.error((e as Error).message || 'The export did not go through');
    } finally {
      setExporting(false);
    }
  }

  const actions = (
    <>
      {access?.is_manager && (
        <Button variant="outline" onClick={exportCsv} disabled={exporting}>
          {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
          Export CSV
        </Button>
      )}
      {access?.can_report && (
        <Button asChild>
          <Link href="/instasolver/requirements/new">
            <PackagePlus className="mr-1.5 h-4 w-4" /> Request an item
          </Link>
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <PageBreadcrumb
        items={[{ label: 'InstaSolver', href: '/instasolver/dashboard' }, { label: 'Requirements', isCurrent: true }]}
      />
      <PageHeader
        title="Requirements"
        description="Items requested for learning studios, the learning auditorium, the learning commons and offices"
        actions={actions}
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by item or reference"
                className="pl-9"
                aria-label="Search requirements"
              />
            </div>
            <Select
              value={institution || ALL}
              onValueChange={(v) => setParams({ institution: v === ALL ? null : v })}
            >
              <SelectTrigger aria-label="Institution">
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
            <Select value={category || ALL} onValueChange={(v) => setParams({ category: v === ALL ? null : v })}>
              <SelectTrigger aria-label="Category">
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
              {REQUIREMENT_STATUS_VALUES.map((s) => {
                const on = statuses.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleStatus(s)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                    )}
                  >
                    {REQUIREMENT_STATUS_META[s].label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Switch id="only-mine" checked={mine} onCheckedChange={(v) => setParams({ mine: v ? '1' : null })} />
              <Label htmlFor="only-mine" className="text-sm font-normal">
                Only mine
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            The requirements could not be loaded. Refresh the page to try again.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <PackageSearch className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">{hasFilters ? 'No requirements match these filters' : 'No requirements yet'}</p>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'Try removing a filter or searching for something else.'
                : access?.can_report
                  ? 'Request an item and it will appear here.'
                  : 'Requirements you are allowed to see will appear here.'}
            </p>
            {hasFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchText('');
                  router.replace(pathname, { scroll: false });
                }}
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className={cn('space-y-3', isFetching && 'opacity-70 transition-opacity')}>
          <RequirementsTable rows={rows} />
          {meta && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                Showing {(meta.page - 1) * meta.limit + 1}–{(meta.page - 1) * meta.limit + rows.length} of {meta.total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => setParams({ page: String(meta.page - 1) }, false)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                </Button>
                <span>
                  Page {meta.page} of {meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setParams({ page: String(meta.page + 1) }, false)}
                >
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
