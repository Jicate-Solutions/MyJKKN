'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Plus, ClipboardCheck, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useHostelInspections } from '@/hooks/campus-living/use-hostel-inspections';
import { BlockSelector } from '@/components/campus-living/block-selector';
import type { InspectionType } from '@/types/campus-living';

const INSPECTION_TYPES: Array<{ value: InspectionType | 'all'; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'routine', label: 'Routine' },
  { value: 'surprise', label: 'Surprise' },
  { value: 'fire_safety', label: 'Fire Safety' },
  { value: 'hygiene', label: 'Hygiene' },
  { value: 'anti_ragging', label: 'Anti-Ragging' },
  { value: 'cctv_check', label: 'CCTV Check' },
  { value: 'health', label: 'Health / FSSAI' },
];

export default function InspectionsPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [typeFilter, setTypeFilter] = useState<InspectionType | 'all'>('all');
  const [blockFilter, setBlockFilter] = useState<string>('all');

  const filters = useMemo(
    () => ({
      inspection_type: typeFilter !== 'all' ? typeFilter : undefined,
      block_id: blockFilter !== 'all' ? blockFilter : undefined,
    }),
    [typeFilter, blockFilter]
  );

  const { data, isLoading } = useHostelInspections(institutionId, filters);
  const inspections = data?.data ?? [];

  const stats = useMemo(() => {
    const withScore = inspections.filter((i) => i.score !== null);
    const followUpPending = inspections.filter(
      (i) => i.follow_up_required && !i.follow_up_completed
    ).length;
    const avgScore =
      withScore.length > 0
        ? Math.round(
            withScore.reduce((sum, i) => sum + (i.score ?? 0), 0) / withScore.length
          )
        : 0;
    return {
      total: inspections.length,
      followUpPending,
      avgScore,
    };
  }, [inspections]);

  return (
    <ContentLayout title="Inspections">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Safety Inspections</h1>
            <p className="text-muted-foreground">
              Schedule and track safety inspections and audits
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/safety/inspections/new">
              <Plus className="mr-2 h-4 w-4" />
              Schedule Inspection
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Inspections</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Follow-up Pending</p>
              <p className="text-2xl font-bold text-yellow-600">
                {stats.followUpPending}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Avg. Score</p>
              <p className="text-2xl font-bold">
                {stats.avgScore > 0 ? `${stats.avgScore}%` : '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                All Inspections
              </CardTitle>
              <div className="flex flex-wrap items-center gap-3">
                {institutionId && (
                  <BlockSelector
                    institutionId={institutionId}
                    value={blockFilter}
                    onValueChange={setBlockFilter}
                  />
                )}
                <Select
                  value={typeFilter}
                  onValueChange={(v) => setTypeFilter(v as InspectionType | 'all')}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter type" />
                  </SelectTrigger>
                  <SelectContent>
                    {INSPECTION_TYPES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading inspections…
              </div>
            ) : inspections.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No inspections found for the selected filters.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Block</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map((inspection) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const block = (inspection as any).hostel_blocks as
                      | { name?: string; code?: string }
                      | null;
                    return (
                      <TableRow key={inspection.id}>
                        <TableCell className="font-medium">
                          {block?.name ?? '—'}
                          {block?.code ? (
                            <span className="text-muted-foreground"> · {block.code}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {inspection.inspection_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{inspection.inspection_date}</TableCell>
                        <TableCell>
                          {inspection.score !== null ? (
                            <span
                              className={`font-medium ${
                                inspection.score >= 90
                                  ? 'text-green-600'
                                  : inspection.score >= 70
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {inspection.score}%
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {inspection.follow_up_required ? (
                            inspection.follow_up_completed ? (
                              <Badge variant="default">Completed</Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              href={`/campus-living/safety/inspections/${inspection.id}`}
                            >
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
