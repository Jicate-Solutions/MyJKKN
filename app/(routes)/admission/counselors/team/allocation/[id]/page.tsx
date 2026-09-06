'use client';

// /admission/counselors/team/allocation/[id]
// Per-source assignment workspace — moved from /admission/settings/sources/[id].
// Renders source info card + status cards + distribute panel + Counselors /
// Lead Distribution tabs. The outer shell (ContentLayout + breadcrumb +
// PermissionGuard + TeamNav) is owned by ../../layout.tsx; this page renders
// only the body so it nests cleanly under the Team Management layout.

import { Suspense, use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { useTabParam } from '@/hooks/use-tab-param';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Building2,
  Globe,
  KeyRound,
  Send,
  ListOrdered,
  ShieldCheck,
  Sparkles,
  FileText,
} from 'lucide-react';

import { SourceMasterService } from '@/lib/services/admission/source-master-service';
import { CounselorsTab } from './_components/counselors-tab';
import { DistributionTab } from './_components/distribution-tab';
import { SourceStatusCards } from './_components/source-status-cards';
import { DistributePanel } from './_components/distribute/distribute-panel';

interface SourceAssignmentPageProps {
  params: Promise<{ id: string }>;
}

const SOURCE_ALLOCATION_TABS = ['counselors', 'distribution'] as const;

export default function SourceAssignmentPage({ params }: SourceAssignmentPageProps) {
  const { id } = use(params);
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <SourceAssignmentContent id={id} />
    </Suspense>
  );
}

function SourceAssignmentContent({ id }: { id: string }) {
  const { data: source, isLoading, error } = useQuery({
    queryKey: ['admission-sources-master', id],
    queryFn: () => SourceMasterService.getById(id),
  });
  const [activeTab, setActiveTab] = useTabParam('counselors', SOURCE_ALLOCATION_TABS);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admission/counselors/team/allocation">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to sources
          </Button>
        </Link>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="pt-6 text-destructive">
            Failed to load source. {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {source && (
        <>
          <Card className="overflow-hidden border-blue-200/60">
            <div className="border-b bg-gradient-to-r from-blue-50/70 via-background to-background px-6 pb-5 pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                    <Send className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold leading-tight text-foreground">
                      {source.label}
                    </h2>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <KeyRound className="h-3 w-3" />
                      <code className="font-mono">{source.key}</code>
                      <span className="opacity-50">·</span>
                      <span>routes to</span>
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                        {source.enum_value}
                      </code>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {source.is_active ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                  {source.is_system ? (
                    <Badge
                      variant="outline"
                      className="border-blue-200 bg-blue-50 text-blue-700 gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      System
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-purple-200 bg-purple-50 text-purple-700"
                    >
                      Custom
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-4 sm:grid-cols-4">
              <FactCell
                icon={<KeyRound className="h-3.5 w-3.5" />}
                label="Source key"
                value={<code className="font-mono text-sm">{source.key}</code>}
              />
              <FactCell
                icon={<Send className="h-3.5 w-3.5" />}
                label="Routes to"
                value={
                  <Badge variant="outline" className="font-mono">
                    {source.enum_value}
                  </Badge>
                }
              />
              <FactCell
                icon={
                  source.institution_id === null ? (
                    <Globe className="h-3.5 w-3.5" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5" />
                  )
                }
                label="Scope"
                value={
                  source.institution_id === null
                    ? 'Global (all institutions)'
                    : 'Institution-scoped'
                }
              />
              <FactCell
                icon={<ListOrdered className="h-3.5 w-3.5" />}
                label="Display order"
                value={
                  <span className="font-semibold tabular-nums">
                    {source.display_order}
                  </span>
                }
              />
            </CardContent>

            {source.description && (
              <div className="border-t bg-muted/30 px-6 py-3">
                <div className="flex items-start gap-2 text-sm">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-muted-foreground">{source.description}</p>
                </div>
              </div>
            )}
          </Card>

          <SourceStatusCards
            sourceEnum={source.enum_value}
            institutionId={source.institution_id}
          />

          <DistributePanel
            sourceId={source.id}
            sourceEnum={source.enum_value}
            institutionId={source.institution_id}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="counselors">Counselors</TabsTrigger>
              <TabsTrigger value="distribution">Lead Distribution</TabsTrigger>
            </TabsList>

            <TabsContent value="counselors">
              <CounselorsTab
                sourceId={source.id}
                sourceEnum={source.enum_value}
                institutionId={source.institution_id}
              />
            </TabsContent>

            <TabsContent value="distribution">
              <DistributionTab
                sourceId={source.id}
                sourceEnum={source.enum_value}
                institutionId={source.institution_id}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function FactCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
