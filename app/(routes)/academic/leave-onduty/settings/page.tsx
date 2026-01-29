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

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
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
  LeaveOndutyApprovalFlow,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApprovalFlowBuilder } from '@/components/academic/leave-onduty/approval-flow-builder';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  MoreHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';

// =====================================================
// TABLE COLUMNS DEFINITION
// =====================================================

interface FlowColumnsProps {
  isSuperAdmin: boolean;
  onEdit: (flow: LeaveOndutyApprovalFlow) => void;
  onToggleActivation: (flowId: string, isActive: boolean) => void;
  onDelete: (flowId: string) => void;
}

function getFlowColumns({
  isSuperAdmin,
  onEdit,
  onToggleActivation,
  onDelete,
}: FlowColumnsProps) {
  const columns: any[] = [];

  // Institution column (only for super admin)
  if (isSuperAdmin) {
    columns.push({
      accessorKey: 'institution.name',
      header: 'Institution',
      cell: ({ row }: any) => (
        <div className="font-medium">
          {row.original.institution?.name || '-'}
        </div>
      ),
    });
  }

  // Category column
  columns.push({
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }: any) => {
      const category = row.original.category;
      const subCategory = row.original.sub_category;
      return (
        <div className="space-y-1">
          <Badge variant="outline" className="capitalize">
            {category === 'all' ? 'All' : category}
          </Badge>
          {subCategory && (
            <div className="text-xs text-muted-foreground capitalize">
              {subCategory.replace('_', ' ')}
            </div>
          )}
        </div>
      );
    },
  });

  // Hierarchy column (Degree/Department/Program/Semester)
  columns.push({
    id: 'hierarchy',
    header: 'Scope',
    cell: ({ row }: any) => {
      const flow = row.original;
      const parts: string[] = [];
      if (flow.degree) parts.push(flow.degree.degree_name);
      if (flow.department) parts.push(flow.department.department_name);
      if (flow.program) parts.push(flow.program.program_name);
      if (flow.semester) parts.push(flow.semester.semester_name);

      if (parts.length === 0) {
        return <span className="text-muted-foreground text-sm">All Levels</span>;
      }

      return (
        <div className="space-y-0.5 max-w-[200px]">
          {parts.map((part, idx) => (
            <div key={idx} className="text-xs truncate" title={part}>
              {part}
            </div>
          ))}
        </div>
      );
    },
  });

  // Flow Type column
  columns.push({
    accessorKey: 'flow_type',
    header: 'Type',
    cell: ({ row }: any) => (
      <Badge variant="secondary" className="capitalize">
        {row.original.flow_type}
      </Badge>
    ),
  });

  // Approval Steps column
  columns.push({
    id: 'steps',
    header: 'Approval Steps',
    cell: ({ row }: any) => {
      const steps = row.original.flow_steps || [];
      return (
        <div className="space-y-1">
          <div className="font-medium text-sm">{steps.length} step(s)</div>
          <div className="flex flex-wrap gap-1">
            {steps.slice(0, 3).map((step: any, idx: number) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {idx + 1}. {step.role_name || 'Role'}
              </Badge>
            ))}
            {steps.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{steps.length - 3} more
              </Badge>
            )}
          </div>
        </div>
      );
    },
  });

  // Status column
  columns.push({
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }: any) => (
      <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
        {row.original.is_active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  });

  // Actions column
  columns.push({
    id: 'actions',
    header: 'Actions',
    cell: ({ row }: any) => {
      const flow = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(flow)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActivation(flow.id, flow.is_active)}>
              {flow.is_active ? (
                <>
                  <PowerOff className="mr-2 h-4 w-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <Power className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(flow.id)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  });

  return columns;
}

export default function FlowSettingsPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, can, canAccess } = usePermissions();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null);

  // Check permissions - super admin, principal, HOD, or users with specific permission
  const canManageFlows =
    isSuperAdmin ||
    profile?.role === 'principal' ||
    profile?.role === 'hod' ||
    can('leave_onduty.manage') ||
    canAccess('leave_onduty', 'manage');

  // Form state
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [selectedDegreeId, setSelectedDegreeId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>('');
  const [category, setCategory] = useState<LeaveOndutyCategory | 'all'>('all');
  const [subCategory, setSubCategory] = useState('none');
  const [flowType, setFlowType] = useState<FlowType>('sequential');
  const [flowSteps, setFlowSteps] = useState<ApprovalFlowStep[]>([]);

  // Get institution ID - super admin can view all (null), others see their institution
  const defaultInstitutionId = profile?.institution_id || null;
  // For super admin: null = show all flows by default, others: show their institution
  const [viewInstitutionId, setViewInstitutionId] = useState<string | null>(
    isSuperAdmin ? null : defaultInstitutionId
  );

  // Fetch data
  const { institutions } = useInstitutionsWithAccess();

  const { data: degreesData } = useDegrees({
    institution_id: selectedInstitutionId || undefined,
  });

  const { data: departmentsData } = useDepartments({
    institution_id: selectedInstitutionId || undefined,
    degree_id: selectedDegreeId || undefined,
  });

  const { data: programsData } = usePrograms({
    institution_id: selectedInstitutionId || undefined,
    degree_id: selectedDegreeId || undefined,
    department_id: selectedDepartmentId || undefined,
  });

  const { data: semestersData } = useSemesters({
    institution_id: selectedInstitutionId || undefined,
    degree_id: selectedDegreeId || undefined,
    department_id: selectedDepartmentId || undefined,
    program_id: selectedProgramId || undefined,
  });

  const { data: flows, isLoading, error } = useFlowsByInstitution(viewInstitutionId);
  const { data: stats } = useFlowStatistics(viewInstitutionId || '');

  // Extract data from query results
  const degrees = degreesData?.data || [];
  const departments = departmentsData?.data || [];
  const programs = programsData?.data || [];
  const semesters = semestersData?.data || [];

  // Set default institution for form when dialog opens
  useEffect(() => {
    if (showCreateDialog && defaultInstitutionId && !isSuperAdmin) {
      setSelectedInstitutionId(defaultInstitutionId);
    }
  }, [showCreateDialog, defaultInstitutionId, isSuperAdmin]);
  const createFlow = useCreateFlow();
  const updateFlow = useUpdateFlow();
  const activateFlow = useActivateFlow();
  const deactivateFlow = useDeactivateFlow();
  const deleteFlow = useDeleteFlow();

  const resetForm = () => {
    setSelectedInstitutionId((!isSuperAdmin && defaultInstitutionId) ? defaultInstitutionId : '');
    setSelectedDegreeId('');
    setSelectedDepartmentId('');
    setSelectedProgramId('');
    setSelectedSemesterId('');
    setCategory('all');
    setSubCategory('none');
    setFlowType('sequential');
    setFlowSteps([]);
  };

  // Get available sub-categories based on selected category
  const getSubCategoryOptions = () => {
    if (category === 'leave') {
      return LEAVE_SUB_CATEGORIES;
    } else if (category === 'onduty') {
      return ONDUTY_SUB_CATEGORIES;
    }
    return [];
  };

  // Reset sub-category when category changes
  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory as LeaveOndutyCategory | 'all');
    setSubCategory('none'); // Reset sub-category when category changes
  };

  const handleToggleActivation = (flowId: string, isActive: boolean) => {
    if (isActive) {
      deactivateFlow.mutate(flowId);
    } else {
      activateFlow.mutate(flowId);
    }
  };

  const handleDeleteFlow = (flowId: string) => {
    setFlowToDelete(flowId);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteFlow = () => {
    if (flowToDelete) {
      deleteFlow.mutate(flowToDelete);
      setDeleteConfirmOpen(false);
      setFlowToDelete(null);
    }
  };

  // Handle edit flow - populate form with existing flow data
  const handleEditFlow = (flow: LeaveOndutyApprovalFlow) => {
    setEditingFlowId(flow.id);
    setSelectedInstitutionId(flow.institution_id);
    setSelectedDegreeId(flow.degree_id || '');
    setSelectedDepartmentId(flow.department_id || '');
    setSelectedProgramId(flow.program_id || '');
    setSelectedSemesterId(flow.semester_id || '');
    setCategory(flow.category);
    setSubCategory(flow.sub_category || 'none');
    setFlowType(flow.flow_type);
    setFlowSteps(flow.flow_steps || []);
    setShowCreateDialog(true);
  };

  // Handle save (create or update)
  const handleSaveFlow = async () => {
    if (!profile?.id) {
      toast.error('User profile not found');
      return;
    }

    // Validate all required fields
    if (!selectedInstitutionId) {
      toast.error('Please select an institution');
      return;
    }

    if (!selectedDegreeId) {
      toast.error('Please select a degree');
      return;
    }

    if (!selectedDepartmentId) {
      toast.error('Please select a department');
      return;
    }

    if (!selectedProgramId) {
      toast.error('Please select a program');
      return;
    }

    if (!selectedSemesterId) {
      toast.error('Please select a semester');
      return;
    }

    if (flowSteps.length === 0) {
      toast.error('Please add at least one approval step');
      return;
    }

    const flowData: FlowCreationData = {
      institution_id: selectedInstitutionId,
      degree_id: selectedDegreeId,
      department_id: selectedDepartmentId,
      program_id: selectedProgramId,
      semester_id: selectedSemesterId,
      category,
      sub_category: subCategory && subCategory !== 'none' ? subCategory : null,
      flow_type: flowType,
      flow_steps: flowSteps,
    };

    if (editingFlowId) {
      // Update existing flow
      updateFlow.mutate(
        { flowId: editingFlowId, updateData: flowData },
        {
          onSuccess: () => {
            setShowCreateDialog(false);
            setEditingFlowId(null);
            resetForm();
            toast.success('Workflow updated successfully');
          },
        }
      );
    } else {
      // Create new flow
      createFlow.mutate(
        { flowData, createdBy: profile.id },
        {
          onSuccess: () => {
            setShowCreateDialog(false);
            resetForm();
            toast.success('Workflow created successfully');
          },
        }
      );
    }
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

  // Check permissions
  if (!canManageFlows) {
    return (
      <ContentLayout title="Workflow Settings">
        <div className="space-y-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You do not have permission to access this page. Only administrators and principals can manage approval workflows.
            </AlertDescription>
          </Alert>
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
          {isSuperAdmin && institutions && (
            <div className="w-64">
              <Select value={viewInstitutionId || 'all'} onValueChange={(v) => setViewInstitutionId(v === 'all' ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Institution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Institutions</SelectItem>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

      {/* Statistics */}
      {stats && stats.total_flows > 0 && (
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

      {/* Workflows Table */}
      <Card>
        <CardHeader>
          <CardTitle>Configured Workflows</CardTitle>
          <CardDescription>
            Manage approval workflows for different application types
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={getFlowColumns({
              isSuperAdmin,
              onEdit: handleEditFlow,
              onToggleActivation: handleToggleActivation,
              onDelete: handleDeleteFlow,
            })}
            data={flows || []}
            searchPlaceholder="Search workflows..."
            filterColumn="category"
            tableTools={
              <Button onClick={() => {
                setEditingFlowId(null);
                resetForm();
                setShowCreateDialog(true);
              }} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Workflow
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Create/Edit Flow Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setEditingFlowId(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFlowId ? 'Edit Approval Workflow' : 'Create Approval Workflow'}</DialogTitle>
            <DialogDescription>
              {editingFlowId
                ? 'Update the approval workflow configuration'
                : 'Configure a new approval workflow for leave/onduty applications'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Hierarchy Selection: Institution -> Degree -> Department -> Program -> Semester */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Workflow Scope (Hierarchy Level)
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Define the complete hierarchy scope for this workflow. All fields are required.
              </p>

              {/* Two Column Grid for Hierarchy */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Institution */}
                <div className="space-y-2">
                  <Label>Institution *</Label>
                  <Select value={selectedInstitutionId} onValueChange={(v) => {
                    setSelectedInstitutionId(v);
                    setSelectedDegreeId('');
                    setSelectedDepartmentId('');
                    setSelectedProgramId('');
                    setSelectedSemesterId('');
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Institution" />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions?.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Degree */}
                <div className="space-y-2">
                  <Label>Degree *</Label>
                  <Select
                    value={selectedDegreeId}
                    onValueChange={(v) => {
                      setSelectedDegreeId(v);
                      setSelectedDepartmentId('');
                      setSelectedProgramId('');
                      setSelectedSemesterId('');
                    }}
                    disabled={!selectedInstitutionId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Degree" />
                    </SelectTrigger>
                    <SelectContent>
                      {degrees?.map((degree) => (
                        <SelectItem key={degree.id} value={degree.id}>
                          {degree.degree_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Department */}
                <div className="space-y-2">
                  <Label>Department *</Label>
                  <Select
                    value={selectedDepartmentId}
                    onValueChange={(v) => {
                      setSelectedDepartmentId(v);
                      setSelectedProgramId('');
                      setSelectedSemesterId('');
                    }}
                    disabled={!selectedDegreeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments?.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.department_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Program */}
                <div className="space-y-2">
                  <Label>Program *</Label>
                  <Select
                    value={selectedProgramId}
                    onValueChange={(v) => {
                      setSelectedProgramId(v);
                      setSelectedSemesterId('');
                    }}
                    disabled={!selectedDepartmentId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Program" />
                    </SelectTrigger>
                    <SelectContent>
                      {programs?.map((program) => (
                        <SelectItem key={program.id} value={program.id}>
                          {program.program_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Semester */}
                <div className="space-y-2">
                  <Label>Semester *</Label>
                  <Select
                    value={selectedSemesterId}
                    onValueChange={setSelectedSemesterId}
                    disabled={!selectedProgramId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Semester" />
                    </SelectTrigger>
                    <SelectContent>
                      {semesters?.map((sem) => (
                        <SelectItem key={sem.id} value={sem.id}>
                          {sem.semester_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Category Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Application Category *</Label>
                <Select value={category} onValueChange={handleCategoryChange}>
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
                {category === 'all' ? (
                  <Select value={subCategory} onValueChange={setSubCategory} disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category first" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No options available</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={subCategory} onValueChange={setSubCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${category} sub-category`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">All {category === 'leave' ? 'Leave Types' : 'OnDuty Types'}</SelectItem>
                      {getSubCategoryOptions().map((subCat) => (
                        <SelectItem key={subCat.value} value={subCat.value}>
                          {subCat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Flow Builder */}
            <ApprovalFlowBuilder
              flowType={flowType}
              flowSteps={flowSteps}
              onFlowTypeChange={setFlowType}
              onFlowStepsChange={setFlowSteps}
              institutionId={selectedInstitutionId}
              departmentId={selectedDepartmentId}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingFlowId(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveFlow}
              disabled={
                createFlow.isPending ||
                updateFlow.isPending ||
                flowSteps.length === 0 ||
                !selectedInstitutionId ||
                !selectedDegreeId ||
                !selectedDepartmentId ||
                !selectedProgramId ||
                !selectedSemesterId
              }
            >
              {createFlow.isPending || updateFlow.isPending
                ? (editingFlowId ? 'Updating...' : 'Creating...')
                : (editingFlowId ? 'Update Workflow' : 'Create Workflow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Approval Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this approval workflow. This action cannot be undone.
              <br />
              <br />
              <strong>Warning:</strong> Applications using this workflow may be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteFlow}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete Workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </ContentLayout>
  );
}
