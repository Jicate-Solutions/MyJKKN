'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Search,
  Plus,
  Kanban,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

import { useProspects, type ProspectFilters } from '@/hooks/solutions/use-prospects';
import { PipelineStageBadge } from '@/components/solutions/pipeline/pipeline-stage-badge';
import { PipelineStats } from '@/components/solutions/pipeline/pipeline-stats';
import type { PipelineStage } from '@/lib/services/solutions/types';
import { PIPELINE_STAGE_LABELS } from '@/lib/services/solutions/prospects-service';

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ProspectList() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);

  const filters: ProspectFilters = useMemo(() => {
    const f: ProspectFilters = { page, limit: 20 };
    if (search.trim()) f.search = search.trim();
    if (stageFilter !== 'all') f.pipeline_stage = stageFilter as PipelineStage;
    if (overdueOnly) f.overdue_only = true;
    return f;
  }, [search, stageFilter, overdueOnly, page]);

  const { data, isLoading } = useProspects(filters);
  const prospects = data?.data || [];
  const metadata = data?.metadata;

  const handleRowClick = (id: string) => {
    router.push(`/solutions/pipeline/${id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold py-1">Prospect List</h1>
          <p className="text-sm text-muted-foreground">
            All prospects with search, filter, and pagination
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/solutions/pipeline">
              <Kanban className="h-4 w-4 mr-1" />
              Board View
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/solutions/pipeline/new">
              <Plus className="h-4 w-4 mr-1" />
              Add Prospect
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <PipelineStats />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search company, contact, code..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>

            <Select
              value={stageFilter}
              onValueChange={(val) => {
                setStageFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {(Object.entries(PIPELINE_STAGE_LABELS) as [PipelineStage, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id="overdue-toggle"
                checked={overdueOnly}
                onCheckedChange={(checked) => {
                  setOverdueOnly(checked);
                  setPage(1);
                }}
              />
              <Label
                htmlFor="overdue-toggle"
                className="text-sm flex items-center gap-1 cursor-pointer"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                Overdue only
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : prospects.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No prospects found</p>
              {(search || stageFilter !== 'all' || overdueOnly) && (
                <p className="text-xs mt-1">Try adjusting your filters</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Code</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="hidden lg:table-cell">Next Action</TableHead>
                    <TableHead className="hidden md:table-cell">Assigned</TableHead>
                    <TableHead className="text-right">Last Contact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prospects.map((prospect) => {
                    const daysSince = prospect.last_contact_date
                      ? differenceInDays(
                          new Date(),
                          new Date(prospect.last_contact_date)
                        )
                      : null;
                    const isOverdue = daysSince !== null && daysSince > 7;

                    return (
                      <TableRow
                        key={prospect.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(prospect.id)}
                      >
                        <TableCell className="font-mono text-xs">
                          {prospect.prospect_code}
                        </TableCell>
                        <TableCell className="font-medium">
                          {prospect.company_name}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {prospect.contact_person}
                        </TableCell>
                        <TableCell>
                          <PipelineStageBadge stage={prospect.pipeline_stage} />
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(prospect.expected_deal_size)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                          {prospect.next_action || '-'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {prospect.assigned_user?.full_name || '-'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right text-sm',
                            isOverdue && 'text-red-600 font-medium'
                          )}
                        >
                          {prospect.last_contact_date
                            ? format(
                                new Date(prospect.last_contact_date),
                                'MMM d'
                              )
                            : '-'}
                          {isOverdue && (
                            <AlertTriangle className="h-3 w-3 inline ml-1" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {metadata && metadata.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(metadata.page - 1) * metadata.limit + 1}-
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {metadata.page} / {metadata.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= metadata.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
