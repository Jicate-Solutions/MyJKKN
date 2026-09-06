'use client';

/**
 * Projects — Module Route Shell
 *
 * Single route `/projects` with URL-synced view tabs:
 *   List | Board | Timeline | Portfolio
 *
 * All four tabs are live. List (F1) and Board (F13) render inline; Timeline
 * (F2) renders the same Gantt as `/projects/[id]/timeline` once a project is
 * picked; Portfolio links to its own dashboard route.
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
import {
  TAP_TARGET,
  TAP_TARGET_BREADCRUMB,
  TAP_TARGET_TABS_LIST,
} from '@/app/(routes)/projects/_lib/tap-targets';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { List, LayoutGrid, GanttChartSquare, FolderKanban } from 'lucide-react';
import { ProjectList } from './_components/project-list';
import { BoardTab } from './_components/board-tab';
import { TimelineTab } from './_components/timeline-tab';

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
        <Breadcrumb className={TAP_TARGET_BREADCRUMB}>
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
        {/* New Project lives inside the List view toolbar (ProjectFormDialog). */}
      </div>

      <div className="mt-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList
            className={`flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0 ${TAP_TARGET_TABS_LIST}`}
          >
            {PROJECT_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className={`gap-1.5 ${TAP_TARGET}`}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="list" className="mt-6">
            <ProjectList />
          </TabsContent>
          <TabsContent value="board" className="mt-6">
            <BoardTab />
          </TabsContent>
          <TabsContent value="timeline" className="mt-6">
            <TimelineTab />
          </TabsContent>
          <TabsContent value="portfolio" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Portfolio dashboard</CardTitle>
                <CardDescription>
                  Cross-institution command center — grid, status board, and the
                  institution heatmap.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className={`gap-1.5 ${TAP_TARGET}`}>
                  <Link href="/projects/portfolio">
                    <FolderKanban className="h-4 w-4" />
                    Open Portfolio
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
