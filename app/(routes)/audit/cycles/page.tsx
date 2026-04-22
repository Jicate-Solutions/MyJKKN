// app/(routes)/audit/cycles/page.tsx
// List of audit cycles: active by default, toggle for archive (phase=closed).
// Thrash T6: closed cycles hidden by default with "Show archive" toggle.

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Layers,
  Plus,
  Search,
  Inbox,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { useAuditCycles } from '@/hooks/audit';
import { CyclePhaseBadge } from '../_components/cycle-phase-badge';
import type { AuditCycle } from '@/lib/types/audit';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function AuditCyclesPage() {
  const [includeClosed, setIncludeClosed] = useState(false);
  const [search, setSearch] = useState('');

  const {
    data: cycles,
    isLoading,
    error,
    refetch,
  } = useAuditCycles({ includeClosed });

  const filtered = useMemo<AuditCycle[]>(() => {
    if (!cycles) return [];
    const q = search.trim().toLowerCase();
    if (!q) return cycles;
    return cycles.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        c.frameworks.join(' ').toLowerCase().includes(q)
      );
    });
  }, [cycles, search]);

  const activeCount = (cycles ?? []).filter((c) => c.phase !== 'closed').length;
  const closedCount = (cycles ?? []).filter((c) => c.phase === 'closed').length;

  return (
    <ContentLayout title="Audit Cycles">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: 'Cycles', href: '/audit/cycles' },
        ]}
      />

      <div className="space-y-6">
        {/* Header card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  Audit Cycles
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Time-boxed institutional audit runs. Each cycle freezes a parameter
                  snapshot on its first draft→in-progress transition so that changes
                  to the master catalog don&apos;t retro-contaminate past attestations.
                </p>
              </div>
              <Link href="/audit/cycles/new">
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Create cycle
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant="outline">
                  Active: <span className="ml-1 font-bold">{activeCount}</span>
                </Badge>
                <Badge variant="outline">
                  Closed: <span className="ml-1 font-bold">{closedCount}</span>
                </Badge>
                <div className="flex items-center gap-2">
                  <Switch
                    id="archive-toggle"
                    checked={includeClosed}
                    onCheckedChange={setIncludeClosed}
                  />
                  <label
                    htmlFor="archive-toggle"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Show archive
                  </label>
                </div>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cycles…"
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cycles table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-sm text-destructive">
                  Failed to load audit cycles
                </p>
                <p className="text-xs text-muted-foreground">
                  {(error as Error)?.message ?? 'Unknown error'}
                </p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center text-sm text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2" />
                {search ? (
                  <>
                    <p>No cycles match &ldquo;{search}&rdquo;.</p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setSearch('')}
                    >
                      Clear search
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-medium">No audit cycles yet.</p>
                    <p className="text-xs">
                      Create the first one to kick off institution-wide auditing.
                    </p>
                    <Link href="/audit/cycles/new" className="mt-3 inline-block">
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Create cycle
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cycle</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Frameworks</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        {c.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1 max-w-md">
                            {c.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <CyclePhaseBadge phase={c.phase} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.frameworks.map((f) => (
                            <Badge
                              key={f}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {f}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(c.start_date)} — {formatDate(c.end_date)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/audit/cycles/${c.id}`}>
                          <Button variant="ghost" size="sm">
                            Open
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
