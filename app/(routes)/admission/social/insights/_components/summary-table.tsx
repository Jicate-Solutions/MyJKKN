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

export interface InsightsAccountRow {
  id: string;
  username: string;
  institution_name: string;
  followers: number;
  followers_gained: number;
  reach: number;
  impressions: number;
  engagement_rate: number | null;
}

type SortKey =
  | 'username'
  | 'institution_name'
  | 'followers'
  | 'followers_gained'
  | 'reach'
  | 'impressions'
  | 'engagement_rate';

type SortDirection = 'asc' | 'desc';

interface SummaryTableProps {
  accounts: InsightsAccountRow[];
  isLoading: boolean;
}

const ALL_INSTITUTIONS = 'all';

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  numeric: boolean;
  className?: string;
}> = [
  { key: 'username', label: 'Account', numeric: false },
  { key: 'institution_name', label: 'Institution', numeric: false },
  { key: 'followers', label: 'Followers', numeric: true, className: 'w-[110px]' },
  { key: 'followers_gained', label: 'Gained', numeric: true, className: 'w-[100px]' },
  { key: 'reach', label: 'Reach', numeric: true, className: 'w-[110px]' },
  { key: 'impressions', label: 'Impressions', numeric: true, className: 'w-[120px]' },
  { key: 'engagement_rate', label: 'Eng. Rate', numeric: true, className: 'w-[100px]' },
];

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
}

function FollowersGained({ value }: { value: number }) {
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
 * Per-account Instagram summary table (C7 `accounts`). Client-side column
 * sorting, institution dropdown filter (options derived from the rows
 * themselves — deliberately NOT useUserInstitutionAccess, which is
 * unreliable for admin pickers per production memory), and row click
 * navigation to the per-account detail page.
 */
export function SummaryTable({ accounts, isLoading }: SummaryTableProps) {
  const router = useRouter();
  const [institution, setInstitution] = useState<string>(ALL_INSTITUTIONS);
  const [sortKey, setSortKey] = useState<SortKey>('followers');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const institutionOptions = useMemo(() => {
    const names = new Set<string>();
    for (const acc of accounts) {
      if (acc.institution_name) names.add(acc.institution_name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [accounts]);

  const rows = useMemo(() => {
    const filtered =
      institution === ALL_INSTITUTIONS
        ? accounts
        : accounts.filter((acc) => acc.institution_name === institution);

    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Nulls (engagement_rate) always sort last regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * direction;
      }
      return ((av as number) - (bv as number)) * direction;
    });
  }, [accounts, institution, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'username' || key === 'institution_name' ? 'asc' : 'desc');
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
            <CardTitle className="text-base">Accounts</CardTitle>
            <CardDescription>
              {isLoading
                ? 'Loading…'
                : `${rows.length} of ${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
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
                      {accounts.length === 0
                        ? 'No Instagram accounts connected yet.'
                        : 'No accounts match the selected institution.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((acc) => (
                  <TableRow
                    key={acc.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admission/social/instagram/${acc.id}`)}
                  >
                    <TableCell className="font-medium">@{acc.username}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {acc.institution_name || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(acc.followers)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <FollowersGained value={acc.followers_gained ?? 0} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(acc.reach)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(acc.impressions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {acc.engagement_rate === null || acc.engagement_rate === undefined
                        ? '—'
                        : `${acc.engagement_rate.toFixed(2)}%`}
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
