'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface FbInsightsPageRow {
  id: string;
  name: string;
  institution_name: string;
  fans: number;
  fans_gained: number;
  impressions_unique: number;
  post_engagements: number;
  posts_in_window: number;
}

type SortKey =
  | 'name'
  | 'institution_name'
  | 'fans'
  | 'fans_gained'
  | 'impressions_unique'
  | 'post_engagements'
  | 'posts_in_window';

type SortDirection = 'asc' | 'desc';

interface FbSummaryTableProps {
  pages: FbInsightsPageRow[];
  isLoading: boolean;
}

const ALL_INSTITUTIONS = 'all';

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  numeric: boolean;
  className?: string;
}> = [
  { key: 'name', label: 'Page', numeric: false },
  { key: 'institution_name', label: 'Institution', numeric: false },
  { key: 'fans', label: 'Fans', numeric: true, className: 'w-[110px]' },
  { key: 'fans_gained', label: 'Gained', numeric: true, className: 'w-[100px]' },
  { key: 'impressions_unique', label: 'Impressions', numeric: true, className: 'w-[120px]' },
  { key: 'post_engagements', label: 'Engagements', numeric: true, className: 'w-[120px]' },
  { key: 'posts_in_window', label: 'Posts', numeric: true, className: 'w-[90px]' },
];

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
}

function FansGained({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
        <ArrowUp className="h-3 w-3" />
        {value.toLocaleString()}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400">
        <ArrowDown className="h-3 w-3" />
        {Math.abs(value).toLocaleString()}
      </span>
    );
  }
  return <span className="text-muted-foreground">0</span>;
}

/**
 * Per-Page Facebook summary table (F4 `pages`). Client-side column sorting,
 * institution dropdown filter (options derived from the rows themselves —
 * deliberately NOT useUserInstitutionAccess, which is unreliable for admin
 * pickers per production memory), and row click navigation to the per-Page
 * detail (/admission/social/facebook/{id}). Mirrors the Instagram SummaryTable.
 */
export function FbSummaryTable({ pages, isLoading }: FbSummaryTableProps) {
  const router = useRouter();
  const [institution, setInstitution] = useState<string>(ALL_INSTITUTIONS);
  const [sortKey, setSortKey] = useState<SortKey>('fans');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const institutionOptions = useMemo(() => {
    const names = new Set<string>();
    for (const page of pages) {
      if (page.institution_name) names.add(page.institution_name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [pages]);

  const rows = useMemo(() => {
    const filtered =
      institution === ALL_INSTITUTIONS
        ? pages
        : pages.filter((page) => page.institution_name === institution);

    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Defensive null ordering (contract values are non-null numbers/strings).
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * direction;
      }
      return ((av as number) - (bv as number)) * direction;
    });
  }, [pages, institution, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'name' || key === 'institution_name' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (key !== sortKey) {
      return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Pages</CardTitle>
            <CardDescription>
              {isLoading
                ? 'Loading…'
                : `${rows.length} of ${pages.length} page${pages.length === 1 ? '' : 's'}`}
            </CardDescription>
          </div>
          <Select value={institution} onValueChange={setInstitution}>
            <SelectTrigger className="w-full sm:w-[260px]" aria-label="Filter by institution">
              <SelectValue placeholder="All institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_INSTITUTIONS}>All institutions</SelectItem>
              {institutionOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`${col.className ?? ''} ${col.numeric ? 'text-right' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground ${
                        col.numeric ? 'justify-end w-full' : ''
                      }`}
                    >
                      {col.label}
                      {sortIcon(col.key)}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {COLUMNS.map((col) => (
                      <TableCell key={col.key}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length} className="text-center py-12">
                    <p className="text-muted-foreground text-sm">
                      {pages.length === 0
                        ? 'No Facebook Pages connected yet.'
                        : 'No pages match the selected institution.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((page) => (
                  <TableRow
                    key={page.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admission/social/facebook/${page.id}`)}
                  >
                    <TableCell className="font-medium">{page.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {page.institution_name || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(page.fans)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <FansGained value={page.fans_gained ?? 0} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(page.impressions_unique)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(page.post_engagements)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(page.posts_in_window)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
