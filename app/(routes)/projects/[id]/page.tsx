'use client';

/**
 * Project Detail Page (Features F1 + F13)
 *
 * Header (title, status, RAG, dates, % complete) + tabs:
 *   Tasks  — the Kanban board scoped to this project
 *   Overview — description + key facts + edit entry point
 *
 * Pattern: app/(routes)/projects/page.tsx shell + pipeline-board detail style.
 * Spec: specs/pm-projects-module-2026-05-26.md (F1, F13).
 */

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useProject } from '@/hooks/projects/use-projects';
import { BoardView } from '@/components/projects/board/board-view';
import { ProjectFormDialog } from '../_components/project-form-dialog';
import type { RagStatus } from '@/types/projects';

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

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: project, isLoading, isError, error } = useProject(id);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <ContentLayout title={project?.title ?? 'Project'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/projects">Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{project?.title ?? 'Detail'}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Button variant="outline" size="sm" asChild>
          <Link href="/projects">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to projects
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading project…
        </div>
      ) : isError ? (
        <p className="mt-8 text-sm text-destructive">
          Failed to load project: {(error as Error)?.message ?? 'unknown error'}
        </p>
      ) : !project ? (
        <Card className="mt-8">
          <CardContent className="p-12 text-center">
            <p className="text-sm text-muted-foreground">
              This project does not exist or you do not have access to it.
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/projects">Back to projects</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Header card */}
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl">{project.title}</CardTitle>
                  {project.status && <Badge variant="secondary">{project.status.name}</Badge>}
                  <Badge
                    variant="outline"
                    className={(RAG_BADGE[(project.rag_status as RagStatus) ?? 'green'] ?? RAG_BADGE.green).className}
                  >
                    {(RAG_BADGE[(project.rag_status as RagStatus) ?? 'green'] ?? RAG_BADGE.green).label}
                  </Badge>
                  {project.project_type && (
                    <Badge variant="outline">{project.project_type.name}</Badge>
                  )}
                  {project.priority && <Badge variant="outline">{project.priority.name}</Badge>}
                </div>
                {project.code && (
                  <p className="text-xs text-muted-foreground">{project.code}</p>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  <span>Start: {formatDate(project.start_date)}</span>
                  <span>Due: {formatDate(project.due_date)}</span>
                  <span>{project.percent_complete ?? 0}% complete</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </CardHeader>
          </Card>

          {/* Tabs */}
          <div className="mt-6">
            <Tabs defaultValue="tasks">
              <TabsList>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="overview">Overview</TabsTrigger>
              </TabsList>

              <TabsContent value="tasks" className="mt-6">
                <BoardView projectId={project.id} />
              </TabsContent>

              <TabsContent value="overview" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Description</p>
                      <p className="mt-1 text-sm">
                        {project.description?.trim() || 'No description yet.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Scope</p>
                        <p className="mt-1 text-sm capitalize">
                          {String(project.scope_model).replace(/_/g, ' ')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Visibility</p>
                        <p className="mt-1 text-sm capitalize">
                          {String(project.visibility).replace(/_/g, ' ')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Financial year</p>
                        <p className="mt-1 text-sm">{project.financial_year ?? '—'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
        </>
      )}
    </ContentLayout>
  );
}
