'use client';

/**
 * Projects — Module Route Shell
 *
 * Single route `/projects` with URL-synced view tabs:
 *   List | Board | Timeline | Portfolio
 *
 * Tabs render placeholders for now; the real views land in Wave 3.
 * The List tab wires useProjects() to prove the data layer (PR 2) works.
 *
 * Pattern: app/(routes)/hr/intelligence/page.tsx
 *   (ContentLayout + Breadcrumb + Tabs + searchParams-synced active tab).
 * Spec: specs/pm-projects-module-2026-05-26.md
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { List, LayoutGrid, GanttChartSquare, FolderKanban, Plus, Loader2 } from 'lucide-react';
import { useProjects } from '@/hooks/projects/use-projects';

const PROJECT_TABS = [
  { id: 'list', label: 'List', icon: List },
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'timeline', label: 'Timeline', icon: GanttChartSquare },
  { id: 'portfolio', label: 'Portfolio', icon: FolderKanban },
] as const;

type ProjectTabId = (typeof PROJECT_TABS)[number]['id'];

const DEFAULT_TAB: ProjectTabId = 'list';

function isValidTab(value: string | null): value is ProjectTabId {
  return PROJECT_TABS.some((t) => t.id === value);
}

/** Generic placeholder for tabs whose UI ships in Wave 3. */
function ComingSoonCard({ view }: { view: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{view} view</CardTitle>
        <CardDescription>Coming in the next PR (Wave 3).</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This view is not built yet. The data layer (services + hooks) is wired
          and ready for it.
        </p>
      </CardContent>
    </Card>
  );
}

/** List tab — proves the data layer by showing a live count/loading state. */
function ListViewPlaceholder() {
  const { data: projects, isLoading, isError, error } = useProjects();

  return (
    <Card>
      <CardHeader>
        <CardTitle>List view</CardTitle>
        <CardDescription>
          Full table UI comes in the next PR. Below is a live data-layer probe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading projects…
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive">
            Failed to load projects: {(error as Error)?.message ?? 'unknown error'}
          </p>
        )}
        {!isLoading && !isError && (
          <p className="text-sm text-muted-foreground">
            {projects?.length ?? 0} project
            {(projects?.length ?? 0) === 1 ? '' : 's'} loaded.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get('view');
  const [activeTab, setActiveTab] = useState<ProjectTabId>(
    isValidTab(tabParam) ? tabParam : DEFAULT_TAB
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      if (!isValidTab(tab)) return;
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', tab);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  return (
    <ContentLayout title="Projects">
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
              <BreadcrumbPage>Projects</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* New Project — wired in a later PR (create dialog). */}
        <Button disabled className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="mt-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            {PROJECT_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="list" className="mt-6">
            <ListViewPlaceholder />
          </TabsContent>
          <TabsContent value="board" className="mt-6">
            <ComingSoonCard view="Board" />
          </TabsContent>
          <TabsContent value="timeline" className="mt-6">
            <ComingSoonCard view="Timeline" />
          </TabsContent>
          <TabsContent value="portfolio" className="mt-6">
            <ComingSoonCard view="Portfolio" />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
