'use client';

/**
 * Per-project Documents & Decisions page — /projects/[id]/documents
 *
 * Two tabs: Documents | Decisions.
 *  - Documents: project_task_attachments scoped to project_id — list, version
 *    history, metadata upload (storage deferred — see PR notes).
 *  - Decisions: project_activity_feed with entity_type='decision' — feed + add.
 *
 * Pattern: app/(routes)/projects/[id]/risks/page.tsx
 * (ContentLayout + Breadcrumb + Tabs).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F7.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
import { FolderOpen, Gavel, Loader2 } from 'lucide-react';
import { useProject } from '@/hooks/projects/use-projects';
import { useTabParam } from '@/hooks/use-tab-param';
import { DocumentList } from '@/components/projects/documents/document-list';
import { UploadDialog } from '@/components/projects/documents/upload-dialog';
import { DecisionLog } from '@/components/projects/documents/decision-log';

type DocsTab = 'documents' | 'decisions';

const DOCS_TABS = ['documents', 'decisions'] as const;

function ProjectDocumentsPageInner() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading } = useProject(projectId);
  const [tab, setTab] = useTabParam<DocsTab>('documents', DOCS_TABS);

  const projectTitle = project?.title ?? 'Project';

  return (
    <ContentLayout title="Documents & Decisions">
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
              <BreadcrumbLink asChild>
                <Link href="/projects">Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/projects/${projectId}`}>
                  {isLoading ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                    </span>
                  ) : (
                    projectTitle
                  )}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Documents &amp; Decisions</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Upload button shown only on documents tab */}
        {tab === 'documents' && projectId && (
          <UploadDialog projectId={projectId} />
        )}
      </div>

      <div className="mt-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as DocsTab)}>
          <TabsList className={TAP_TARGET_TABS_LIST}>
            <TabsTrigger value="documents" className={`gap-1.5 ${TAP_TARGET}`}>
              <FolderOpen className="h-4 w-4" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="decisions" className={`gap-1.5 ${TAP_TARGET}`}>
              <Gavel className="h-4 w-4" />
              Decisions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-6">
            {projectId ? (
              <DocumentList projectId={projectId} />
            ) : (
              <p className="text-sm text-muted-foreground">No project selected.</p>
            )}
          </TabsContent>

          <TabsContent value="decisions" className="mt-6">
            {projectId ? (
              <DecisionLog projectId={projectId} />
            ) : (
              <p className="text-sm text-muted-foreground">No project selected.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function ProjectDocumentsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <ProjectDocumentsPageInner />
    </Suspense>
  );
}
