'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, Globe } from 'lucide-react';

import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { SourceMasterService } from '@/lib/services/admission/source-master-service';
import { CounselorsTab } from './_components/counselors-tab';
import { DistributionTab } from './_components/distribution-tab';

interface SourceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function SourceDetailPage({ params }: SourceDetailPageProps) {
  const { id } = use(params);

  return (
    <AdmissionErrorBoundary>
      <PermissionGuard module="admission.settings" action="view">
        <SourceDetailContent id={id} />
      </PermissionGuard>
    </AdmissionErrorBoundary>
  );
}

function SourceDetailContent({ id }: { id: string }) {
  const { data: source, isLoading, error } = useQuery({
    queryKey: ['admission-sources-master', id],
    queryFn: () => SourceMasterService.getById(id),
  });

  return (
    <ContentLayout title={source?.label ?? 'Source'}>
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/settings/sources">Sources</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{source?.label ?? 'Loading...'}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3">
          <Link href="/admission/settings/sources">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
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
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  {source.label}
                  {source.is_active ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                  {source.is_system && <Badge variant="outline">System</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <Field label="Key">
                  <span className="font-mono">{source.key}</span>
                </Field>
                <Field label="Routes To">
                  <Badge variant="outline" className="font-mono">{source.enum_value}</Badge>
                </Field>
                <Field label="Scope">
                  {source.institution_id === null ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" /> Global
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" /> Institution-scoped
                    </span>
                  )}
                </Field>
                <Field label="Display order">{source.display_order}</Field>
                {source.description && (
                  <Field label="Description" className="sm:col-span-2 lg:col-span-4">
                    <span className="text-muted-foreground">{source.description}</span>
                  </Field>
                )}
              </CardContent>
            </Card>

            <Tabs defaultValue="counselors" className="space-y-4">
              <TabsList>
                <TabsTrigger value="counselors">Counselors</TabsTrigger>
                <TabsTrigger value="distribution">Lead Distribution</TabsTrigger>
              </TabsList>

              <TabsContent value="counselors">
                <CounselorsTab
                  sourceId={source.id}
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
    </ContentLayout>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
