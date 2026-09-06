// ============================================================================
// HR — Training Programs (Admin) — T5.3
// Spec: specs/hr-module-decomposition-2026-05-09.md §T5.3
// Created: 2026-06-19
//
// Officer + super_admin surface. Lists all hr_training_programs with
// filters by status/category and a "+ New Program" CTA.
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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
import { Plus, ChevronRight } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  TrainingService,
  type HRTrainingSession,
  type TrainingCategory,
  type TrainingStatus,
} from '@/lib/services/hr/training-service';

const CATEGORY_LABELS: Record<TrainingCategory, string> = {
  induction: 'Induction',
  internal: 'Internal',
  specialised: 'Specialised',
  fdp: 'FDP',
};

const STATUS_LABELS: Record<TrainingStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<TrainingStatus, string> = {
  draft: 'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
  open: 'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  in_progress:
    'bg-amber-100 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200',
  completed:
    'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
};

export default function AdminTrainingPage() {
  const [programs, setPrograms] = useState<HRTrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TrainingStatus | 'all'>(
    'all',
  );
  const [categoryFilter, setCategoryFilter] = useState<
    TrainingCategory | 'all'
  >('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const res = await TrainingService.listSessions(supabase, {
          status: statusFilter === 'all' ? undefined : statusFilter,
          category: categoryFilter === 'all' ? undefined : categoryFilter,
          pageSize: 100,
        });
        if (!cancelled) setPrograms(res.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, categoryFilter]);

  return (
    <SuperAdminOnly>
    <ContentLayout title="HR — Training Programs">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Training Programs</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Training Programs</h1>
            <p className="text-sm text-muted-foreground">
              Induction, internal, specialised + FDP. Track enrollments and
              issue completion certificates.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/hr/admin/training/new">
              <Plus className="h-4 w-4 mr-1" /> New Program
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as TrainingStatus | 'all')
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {(Object.keys(STATUS_LABELS) as TrainingStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Category</div>
              <Select
                value={categoryFilter}
                onValueChange={(v) =>
                  setCategoryFilter(v as TrainingCategory | 'all')
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(Object.keys(CATEGORY_LABELS) as TrainingCategory[]).map(
                    (c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Programs ({programs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Failed to load: {error}
              </p>
            )}
            {!loading && !error && programs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No programs found. Click <strong>New Program</strong> to create
                one.
              </p>
            )}
            {programs.length > 0 && (
              <div className="space-y-2">
                {programs.map((p) => (
                  <Link
                    key={p.id}
                    href={`/hr/admin/training/${p.id}`}
                    className="border rounded-md p-3 hover:bg-muted/40 flex items-center justify-between gap-3 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{p.title}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal"
                        >
                          {CATEGORY_LABELS[p.category]}
                        </Badge>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded ${STATUS_COLOR[p.status]}`}
                        >
                          {STATUS_LABELS[p.status]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {p.start_date} → {p.end_date}
                        {p.location ? ` · ${p.location}` : ''}
                        {p.capacity ? ` · capacity ${p.capacity}` : ''}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
