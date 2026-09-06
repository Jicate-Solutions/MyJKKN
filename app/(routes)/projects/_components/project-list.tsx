'use client';

/**
 * Project List View (Feature F1)
 *
 * DataTable of projects with status/type/institution filters + name search,
 * all persisted to URL searchParams. Row click navigates to /projects/[id].
 *
 * Pattern: app/(routes)/hr/workload/page.tsx (Table + manual filters + Dialog).
 * Spec: specs/pm-projects-module-2026-05-26.md (F1).
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

import {
  useProjects,
  useProjectStatuses,
  useProjectTypes,
} from '@/hooks/projects/use-projects';
import { useInstitutions } from '@/hooks/hr/recruitment-need/use-data-entry';
import type { ProjectFilters, ProjectWithRelations, RagStatus } from '@/types/projects';
import { TAP_TARGET } from '@/app/(routes)/projects/_lib/tap-targets';
import { ProjectFormDialog } from './project-form-dialog';

const ALL = 'all';

const RAG_BADGE: Record<RagStatus, { label: string; className: string }> = {
  green: { label: 'On track', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  amber: { label: 'At risk', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  red: { label: 'Off track', className: 'bg-red-100 text-red-800 border-red-200' },
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ProjectList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-persisted filter state (read on every render).
  const statusId = searchParams.get('status') ?? ALL;
  const typeId = searchParams.get('type') ?? ALL;
  const institutionId = searchParams.get('institution') ?? ALL;
  const search = searchParams.get('q') ?? '';

  const [searchInput, setSearchInput] = useState(search);
  const [createOpen, setCreateOpen] = useState(false);

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === ALL) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const filters: ProjectFilters = useMemo(
    () => ({
      statusId: statusId === ALL ? null : statusId,
      projectTypeId: typeId === ALL ? null : typeId,
      institutionId: institutionId === ALL ? null : institutionId,
      search: search || null,
    }),
    [statusId, typeId, institutionId, search]
  );

  const { data: projects = [], isLoading, isError, error } = useProjects(filters);
  const { data: statuses = [] } = useProjectStatuses();
  const { data: types = [] } = useProjectTypes();
  const { data: institutions = [] } = useInstitutions();

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setParam('q', searchInput.trim());
    },
    [searchInput, setParam]
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearchSubmit} className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or code…"
              className={`w-full pl-8 sm:w-64 ${TAP_TARGET}`}
            />
          </div>
          <Button type="submit" variant="secondary" className={TAP_TARGET}>
            Search
          </Button>
        </form>

        <Select value={statusId} onValueChange={(v) => setParam('status', v)}>
          <SelectTrigger className={`w-44 ${TAP_TARGET}`}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeId} onValueChange={(v) => setParam('type', v)}>
          <SelectTrigger className={`w-44 ${TAP_TARGET}`}>
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={institutionId} onValueChange={(v) => setParam('institution', v)}>
          <SelectTrigger className={`w-52 ${TAP_TARGET}`}>
            <SelectValue placeholder="Institution" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All institutions</SelectItem>
            {institutions.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button className={`ml-auto gap-1.5 ${TAP_TARGET}`} onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading projects…
            </div>
          ) : isError ? (
            <p className="p-8 text-sm text-destructive">
              Failed to load projects: {(error as Error)?.message ?? 'unknown error'}
            </p>
          ) : projects.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted-foreground">No projects match your filters.</p>
              <Button variant="outline" className={`mt-4 gap-1.5 ${TAP_TARGET}`} onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create your first project
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">% Complete</TableHead>
                  <TableHead>Due date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p: ProjectWithRelations) => {
                  const rag = RAG_BADGE[(p.rag_status as RagStatus) ?? 'green'] ?? RAG_BADGE.green;
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/projects/${p.id}`)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{p.title}</span>
                          {p.code && (
                            <span className="text-xs text-muted-foreground">{p.code}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.project_type ? (
                          <Badge variant="outline">{p.project_type.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {p.status ? (
                            <Badge variant="secondary">{p.status.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          <Badge variant="outline" className={rag.className}>
                            {rag.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.priority ? (
                          <Badge variant="outline">{p.priority.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.percent_complete ?? 0}%
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(p.due_date)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
