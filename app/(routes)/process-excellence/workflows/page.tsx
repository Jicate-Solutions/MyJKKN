/**
 * Process Workflows Page
 *
 * Shows active process definitions as workflows with their instance counts and status.
 * Wired to real data via useActiveProcessDefinitions and useProcessInstances hooks.
 */

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useProcessDefinitions,
  useProcessInstances
} from '@/hooks/process-excellence';
import {
  Workflow,
  Play,
  Pause,
  Settings,
  Plus,
  Clock
} from 'lucide-react';

export default function ProcessWorkflowsPage() {
  const { selectedInstitutionId } = useUserInstitutionAccess();

  const { data: definitionsData, isLoading: definitionsLoading, error: definitionsError } = useProcessDefinitions({
    institution_id: selectedInstitutionId || undefined,
    limit: 50
  });

  const { data: instancesData, isLoading: instancesLoading } = useProcessInstances({
    institution_id: selectedInstitutionId || undefined,
    is_completed: false,
    limit: 200
  });

  const isLoading = definitionsLoading || instancesLoading;
  const definitions = definitionsData?.data ?? [];
  const instances = instancesData?.data ?? [];

  // Count active instances per process definition
  const instanceCountByProcess = new Map<string, number>();
  instances.forEach((inst) => {
    const pid = inst.process_id;
    instanceCountByProcess.set(pid, (instanceCountByProcess.get(pid) || 0) + 1);
  });

  const activeWorkflows = definitions.filter(d => d.is_active);
  const pausedWorkflows = definitions.filter(d => !d.is_active);
  const totalRunningInstances = instances.length;

  return (
    <ContentLayout title="Process Workflows">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Workflows' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Process Workflows</h1>
            <p className="text-sm text-muted-foreground">
              Manage and monitor automated business processes
            </p>
          </div>
          <Button asChild>
            <Link href="/process-excellence/definitions/new">
              <Plus className="mr-2 h-4 w-4" />
              New Workflow
            </Link>
          </Button>
        </div>

        {!selectedInstitutionId ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Please select an institution to view workflows.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : definitionsError ? (
          <Card>
            <CardContent className="py-10 text-center text-destructive">
              Failed to load workflows. Please try again.
            </CardContent>
          </Card>
        ) : definitions.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No process definitions found. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
                  <Play className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {activeWorkflows.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Running Instances</CardTitle>
                  <Workflow className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {totalRunningInstances}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Inactive</CardTitle>
                  <Pause className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {pausedWorkflows.length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Workflows List */}
            <Card>
              <CardHeader>
                <CardTitle>All Workflows</CardTitle>
                <CardDescription>Manage your business process workflows</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {definitions.map((definition) => {
                    const activeInstanceCount = instanceCountByProcess.get(definition.id) || 0;
                    const stageCount = definition.stages?.length || 0;
                    const slaHours = definition.sla_hours;

                    return (
                      <div key={definition.id} className="p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Workflow className="h-4 w-4 text-primary" />
                              <Link
                                href={`/process-excellence/definitions/${definition.id}`}
                                className="font-medium hover:underline"
                              >
                                {definition.name}
                              </Link>
                              {definition.is_active ? (
                                <Badge className="bg-green-100 text-green-700">Active</Badge>
                              ) : (
                                <Badge className="bg-yellow-100 text-yellow-700">Inactive</Badge>
                              )}
                              <Badge variant="outline" className="capitalize">
                                {definition.category}
                              </Badge>
                            </div>
                            {definition.description && (
                              <p className="text-sm text-muted-foreground">{definition.description}</p>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/process-excellence/definitions/${definition.id}`}>
                              <Settings className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>

                        <div className="mt-3 flex items-center gap-6 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span>{stageCount} stages</span>
                          </div>
                          {slaHours && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>SLA: {slaHours}h</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <span>{activeInstanceCount} active instances</span>
                          </div>
                          {definition.target_value_add_ratio && (
                            <div className="flex items-center gap-1">
                              <span>Target VA: {definition.target_value_add_ratio}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
