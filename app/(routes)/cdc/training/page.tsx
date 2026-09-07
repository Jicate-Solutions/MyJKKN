'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCdcProgrammes, useCdcTrainingTypes } from '@/hooks/cdc/use-cdc-training';
import { Plus, Search, BookOpen, Calendar, Users, Pencil } from 'lucide-react';
import type { TrainingProgrammeFilters, TrainingProgrammeStatus } from '@/types/cdc/training';

const STATUS_LABELS: Record<TrainingProgrammeStatus, string> = {
  planned: 'Planned',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<TrainingProgrammeStatus, string> = {
  planned: 'bg-blue-100 text-blue-800',
  ongoing: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function CdcTrainingPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filters: TrainingProgrammeFilters = useMemo(() => ({
    search: search || undefined,
    training_type_id: typeFilter !== 'all' ? typeFilter : undefined,
    status: statusFilter !== 'all' ? (statusFilter as TrainingProgrammeStatus) : undefined,
  }), [search, typeFilter, statusFilter]);

  const { data: programmes, isLoading, isError, error, refetch } = useCdcProgrammes(filters);
  const { data: trainingTypes } = useCdcTrainingTypes();

  return (
    <PermissionGuard module="cdc.training" action="view">
    <ContentLayout title="CDC — Training Programmes">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'CDC' },
        { label: 'Training Programmes' },
      ]} />

      <div className="space-y-4 mt-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Training Programmes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Unnati, MRB, Springboard and other training initiatives
            </p>
          </div>
          <PermissionGuard module="cdc.training" action="create" fallback={null}>
            <Button asChild>
              <Link href="/cdc/training/new">
                <Plus className="w-4 h-4 mr-2" />
                New Programme
              </Link>
            </Button>
          </PermissionGuard>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search programmes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(trainingTypes ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABELS) as TrainingProgrammeStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <BookOpen className="w-12 h-12 text-destructive/40" />
              <p className="text-lg font-medium text-destructive">Failed to load training programmes</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (programmes ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No training programmes found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Check back later or create one if you have access.
            </p>
            <PermissionGuard module="cdc.training" action="create" fallback={null}>
              <Button asChild className="mt-4">
                <Link href="/cdc/training/new">
                  <Plus className="w-4 h-4 mr-2" /> New Programme
                </Link>
              </Button>
            </PermissionGuard>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(programmes ?? []).map((prog) => (
              <div key={prog.id} className="relative group">
                <PermissionGuard module="cdc.training" action="update" fallback={null}>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 z-10 h-8 w-8 bg-background/80"
                    title="Edit programme"
                  >
                    <Link href={`/cdc/training/${prog.id}/edit`} aria-label={`Edit ${prog.name}`}>
                      <Pencil className="w-4 h-4" />
                    </Link>
                  </Button>
                </PermissionGuard>
                <Link href={`/cdc/training/${prog.id}`} className="block">
                  <Card className="h-full transition-shadow group-hover:shadow-md">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2 pr-9">
                        <CardTitle className="text-base line-clamp-2">{prog.name}</CardTitle>
                        <Badge className={`shrink-0 text-xs ${STATUS_COLORS[prog.status as TrainingProgrammeStatus] ?? ''}`}>
                          {STATUS_LABELS[prog.status as TrainingProgrammeStatus] ?? prog.status}
                        </Badge>
                      </div>
                    {prog.training_type && (
                      <CardDescription className="text-xs uppercase tracking-wide font-medium text-primary">
                        {prog.training_type.display_name}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    {prog.institution ? (
                      <p>{prog.institution.name}</p>
                    ) : (
                      <p className="italic">Cross-college</p>
                    )}
                    {(prog.start_date || prog.end_date) && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {prog.start_date ?? '—'} → {prog.end_date ?? '—'}
                        </span>
                      </div>
                    )}
                    {prog.total_hours != null && (
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        <span>{prog.total_hours} hours</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
