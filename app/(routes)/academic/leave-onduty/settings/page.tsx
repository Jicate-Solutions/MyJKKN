'use client';

/**
 * Leave/OnDuty Flow Configuration Page
 *
 * Allows admins to:
 * - Create approval workflows
 * - Edit existing workflows
 * - Activate/deactivate workflows
 * - View workflow statistics
 *
 * @route /academic/leave-onduty/settings
 */

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  useFlowsByInstitution,
  useCreateFlow,
  useUpdateFlow,
  useActivateFlow,
  useDeactivateFlow,
  useDeleteFlow,
  useFlowStatistics,
} from '@/hooks/academic/use-leave-onduty';
import {
  FlowCreationData,
  LeaveOndutyCategory,
  FlowType,
  ApprovalFlowStep,
  LEAVE_SUB_CATEGORIES,
  ONDUTY_SUB_CATEGORIES,
} from '@/types/leave-onduty';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ApprovalFlowBuilder } from '@/components/academic/leave-onduty/approval-flow-builder';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Settings,
  Trash2,
  Edit,
  Power,
  PowerOff,
  AlertCircle,
  TrendingUp,
  GitBranch,
} from 'lucide-react';
import { toast } from 'sonner';

export default function FlowSettingsPage() {
  const { profile } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);

  // Form state
  const [category, setCategory] = useState<LeaveOndutyCategory | 'all'>('all');
  const [subCategory, setSubCategory] = useState('');
  const [flowType, setFlowType] = useState<FlowType>('sequential');
  const [flowSteps, setFlowSteps] = useState<ApprovalFlowStep[]>([]);

  // Get institution ID from profile
  const institutionId = profile?.institution_id || '';

  const { data: flows, isLoading, error } = useFlowsByInstitution(institutionId);
  const { data: stats } = useFlowStatistics(institutionId);
  const createFlow = useCreateFlow();
  const updateFlow = useUpdateFlow();
  const activateFlow = useActivateFlow();
  const deactivateFlow = useDeactivateFlow();
  const deleteFlow = useDeleteFlow();

  const resetForm = () => {
    setCategory('all');
    setSubCategory('');
    setFlowType('sequential');
    setFlowSteps([]);
  };

  const handleCreateFlow = async () => {
    if (!profile?.id || flowSteps.length === 0) {
      toast.error('Please add at least one approval step');
      return;
    }

    const flowData: FlowCreationData = {
      institution_id: institutionId,
      department_id: null,
      semester_id: null,
      category,
      sub_category: subCategory || null,
      flow_type: flowType,
      flow_steps: flowSteps,
    };

    createFlow.mutate(
      { flowData, createdBy: profile.id },
      {
        onSuccess: () => {
          setShowCreateDialog(false);
          resetForm();
        },
      }
    );
  };

  const handleToggleActivation = (flowId: string, isActive: boolean) => {
    if (isActive) {
      deactivateFlow.mutate(flowId);
    } else {
      activateFlow.mutate(flowId);
    }
  };

  const handleDeleteFlow = (flowId: string) => {
    if (!confirm('Are you sure you want to delete this flow? This action cannot be undone.')) {
      return;
    }

    deleteFlow.mutate(flowId);
  };

  if (isLoading) {
    return (
      <ContentLayout title="Workflow Settings">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Workflow Settings">
        <div className="space-y-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load workflows. Please try again.</AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Workflow Settings">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic">Academic</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic/leave-onduty">Leave/OnDuty</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Approval Workflow Settings
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Configure approval workflows for leave and onduty applications
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Workflow
          </Button>
        </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Workflows</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.total_flows}
                  </p>
                </div>
                <Settings className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Active</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.active_flows}
                  </p>
                </div>
                <Power className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Sequential</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.by_type.sequential}
                  </p>
                </div>
                <GitBranch className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Workflows List */}
      <Card>
        <CardHeader>
          <CardTitle>Configured Workflows</CardTitle>
          <CardDescription>
            Manage approval workflows for different application types
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!flows || flows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Settings className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
                No workflows configured
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                Create Your First Workflow
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {flows.map((flow) => (
                <Card key={flow.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">
                            {flow.category === 'all' ? 'All Applications' : flow.category}{' '}
                            {flow.sub_category && `- ${flow.sub_category.replace('_', ' ')}`}
                          </h3>
                          <Badge variant={flow.is_active ? 'default' : 'secondary'}>
                            {flow.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {flow.flow_type}
                          </Badge>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          {flow.flow_steps.length} approval step(s)
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {flow.flow_steps.map((step, index) => (
                            <div
                              key={step.step_order}
                              className="inline-flex items-center gap-2 rounded-md bg-gray-100 dark:bg-gray-800 px-3 py-1 text-sm"
                            >
                              <span className="font-medium">{index + 1}.</span>
                              <span className="capitalize">{step.role.replace('_', ' ')}</span>
                              {!step.is_required && (
                                <span className="text-xs text-gray-500">(Optional)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleActivation(flow.id, flow.is_active)}
                        >
                          {flow.is_active ? (
                            <>
                              <PowerOff className="h-4 w-4 mr-1" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-1" />
                              Activate
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteFlow(flow.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Flow Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Approval Workflow</DialogTitle>
            <DialogDescription>
              Configure a new approval workflow for leave/onduty applications
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Category Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Application Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="leave">Leave Only</SelectItem>
                    <SelectItem value="onduty">OnDuty Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sub-category (Optional)</Label>
                <Input
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value)}
                  placeholder="e.g., casual, medical"
                />
              </div>
            </div>

            {/* Flow Builder */}
            <ApprovalFlowBuilder
              flowType={flowType}
              flowSteps={flowSteps}
              onFlowTypeChange={setFlowType}
              onFlowStepsChange={setFlowSteps}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFlow}
              disabled={createFlow.isPending || flowSteps.length === 0}
            >
              {createFlow.isPending ? 'Creating...' : 'Create Workflow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ContentLayout>
  );
}
