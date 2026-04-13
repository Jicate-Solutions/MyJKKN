'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Award, FileText, Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { usePermissions } from '@/hooks/use-permissions';
import { usePrivilegeTemplates } from '@/hooks/academic/use-privileges';
import type { PrivilegeGroup } from '@/types/privileges';

export default function PrivilegeTemplatesPage() {
  const router = useRouter();
  const { userProfile, isSuperAdmin } = usePermissions();

  const { data: templates, isLoading } = usePrivilegeTemplates();

  // Handle both array and paginated shapes
  const templatesList: PrivilegeGroup[] = Array.isArray(templates)
    ? templates
    : (templates as { data?: PrivilegeGroup[] })?.data ?? [];

  return (
    <ContentLayout title="Privilege Templates">
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic/privileges">Privileges</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Templates</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6 text-amber-600" />
              Privilege Templates
            </h2>
            <p className="text-muted-foreground mt-1">
              Reusable templates for quickly creating new privilege groups.
            </p>
          </div>
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : templatesList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">
                No templates saved yet
              </h3>
              <p className="text-sm text-muted-foreground/60 mt-1 text-center max-w-md">
                Create a privilege group and save it as a template to reuse its configuration
                for future groups.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => router.push('/academic/privileges/new')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Group
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templatesList.map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-600" />
                    {template.template_name || template.name}
                  </CardTitle>
                  {template.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {template.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Privilege Types */}
                  {template.privilege_types && template.privilege_types.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {template.privilege_types.map((pgt) => (
                        <Badge
                          key={pgt.id}
                          variant="secondary"
                          className="text-xs"
                        >
                          {pgt.privilege_type?.name || 'Unknown'}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No privilege types configured.
                    </p>
                  )}

                  {/* Reference code */}
                  <div className="text-xs text-muted-foreground">
                    Reference:{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono">
                      {template.reference_code}
                    </code>
                  </div>

                  {/* Create from template */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      router.push(
                        `/academic/privileges/new?template=${template.id}`
                      )
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create from Template
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
