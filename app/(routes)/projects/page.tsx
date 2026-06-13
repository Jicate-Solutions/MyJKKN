'use client';

/**
 * Projects — Module Route Shell
 *
 * Single route `/projects` with URL-synced view tabs:
 *   List | Board | Timeline | Portfolio
 *
 * List + Board are live (Wave 3, F1 + F13). Timeline + Portfolio remain
 * placeholders owned by sibling agents.
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
import { List, LayoutGrid, GanttChartSquare, FolderKanban } from 'lucide-react';
import { ProjectList } from './_components/project-list';
import { BoardTab } from './_components/board-tab';

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
        {/* New Project lives inside the List view toolbar (ProjectFormDialog). */}
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
            <ProjectList />
          </TabsContent>
          <TabsContent value="board" className="mt-6">
            <BoardTab />
          </TabsContent>
          <TabsContent value="timeline" className="mt-6">
            <ComingSoonCard view="Timeline" />
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
                <Button asChild className="gap-1.5">
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
