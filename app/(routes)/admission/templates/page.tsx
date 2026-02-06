'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useCommunicationTemplates,
  useTemplateMutations,
  useTemplateStats,
  useTemplateVariables
} from '@/hooks/admission';
import type { TemplateChannel, CreateTemplateInput } from '@/lib/services/admission/communication-templates-service';
import {
  MessageSquare,
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Copy,
  Trash2,
  RefreshCw,
  X,
  Mail,
  Phone,
  MessageCircle,
  Loader2,
  Power,
  PowerOff,
  FileText,
  Variable
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { AdmissionErrorBoundary } from '@/components/admission';

const TEMPLATE_TYPES: { value: TemplateChannel; label: string; icon: React.ElementType }[] = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }
];

function getTypeIcon(type: TemplateChannel | null) {
  const templateType = TEMPLATE_TYPES.find((t) => t.value === type);
  const Icon = templateType?.icon || MessageSquare;
  return <Icon className="h-4 w-4" />;
}

function TemplatesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AdmissionTemplatesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();

  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<CreateTemplateInput>>({
    name: '',
    channel: 'email',
    subject: '',
    content: '',
    is_active: true
  });

  const typeFilter = searchParams.get('type') as TemplateChannel | null;

  const filters = {
    institutionId: selectedInstitutionId || '',
    channel: typeFilter || undefined,
    isActive: undefined, // Show all (active and inactive)
    search: searchTerm || undefined
  };

  const {
    templates,
    total,
    isLoading: templatesLoading,
    refetch
  } = useCommunicationTemplates(filters);

  const { stats, isLoading: statsLoading } = useTemplateStats(selectedInstitutionId);
  const { leadVariables } = useTemplateVariables();

  const {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    toggleStatus,
    duplicateTemplate,
    isCreating,
    isUpdating,
    isDeleting,
    isToggling,
    isDuplicating
  } = useTemplateMutations();

  const isLoading = accessLoading || templatesLoading;

  const updateParams = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/admission/templates?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.push('/admission/templates');
    setSearchTerm('');
  }, [router]);

  const activeFilterCount = [typeFilter].filter(Boolean).length;

  const resetForm = () => {
    setFormData({
      name: '',
      channel: 'email',
      subject: '',
      content: '',
      is_active: true
    });
  };

  const handleCreateTemplate = async () => {
    if (!selectedInstitutionId) {
      toast.error('No institution selected');
      return;
    }

    try {
      await createTemplate.mutateAsync({
        institution_id: selectedInstitutionId,
        name: formData.name || '',
        channel: formData.channel || 'email',
        subject: formData.subject,
        content: formData.content || '',
        is_active: formData.is_active ?? true
      });
      setIsCreateDialogOpen(false);
      resetForm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteConfirmId || !selectedInstitutionId) return;
    try {
      await deleteTemplate.mutateAsync({ id: deleteConfirmId, institutionId: selectedInstitutionId });
      setDeleteConfirmId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateTemplate.mutateAsync(id);
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await toggleStatus.mutateAsync({ id, isActive: !currentStatus });
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Communication Templates">
          <TemplatesSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Communication Templates">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
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
                  <BreadcrumbPage>Templates</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await refetch();
                    toast.success('Templates refreshed');
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>

              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => resetForm()}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Communication Template</DialogTitle>
                    <DialogDescription>
                      Create a reusable template for WhatsApp, SMS, or Email messages.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Template Name *</Label>
                        <Input
                          id="name"
                          placeholder="e.g., Welcome Message"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="type">Channel Type *</Label>
                        <Select
                          value={formData.type}
                          onValueChange={(value) =>
                            setFormData({ ...formData, type: value as TemplateChannel })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select channel" />
                          </SelectTrigger>
                          <SelectContent>
                            {TEMPLATE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                <div className="flex items-center gap-2">
                                  <type.icon className="h-4 w-4" />
                                  {type.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {formData.type === 'email' && (
                      <div className="space-y-2">
                        <Label htmlFor="subject">Email Subject *</Label>
                        <Input
                          id="subject"
                          placeholder="e.g., Welcome to {{institution_name}}"
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="content">Message Content *</Label>
                        <span className="text-xs text-muted-foreground">
                          {formData.type === 'sms' && formData.content
                            ? `${formData.content.length}/160 characters`
                            : ''}
                        </span>
                      </div>
                      <Textarea
                        id="content"
                        placeholder="Enter your message content. Use {{variable_name}} for dynamic values."
                        rows={6}
                        value={formData.content}
                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Variable className="h-4 w-4" />
                        Available Variables
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {leadVariables.slice(0, 6).map((variable) => (
                          <Badge
                            key={variable.name}
                            variant="outline"
                            className="cursor-pointer hover:bg-muted"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                content: (formData.content || '') + `{{${variable.name}}}`
                              })
                            }
                          >
                            {`{{${variable.name}}}`}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Click to insert variable into content
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="is_active"
                        checked={formData.is_active}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, is_active: checked })
                        }
                      />
                      <Label htmlFor="is_active">Active (available for use)</Label>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateTemplate} disabled={isCreating}>
                      {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Template
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Templates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalTemplates}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Templates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.activeTemplates}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  By Channel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 text-sm">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {stats.byType.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {stats.byType.sms}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" /> {stats.byType.whatsapp}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Template
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary">{activeFilterCount}</Badge>
                  )}
                </CardTitle>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isClearing}
                    onClick={() => {
                      setIsClearing(true);
                      clearFilters();
                      toast.success('Filters cleared');
                      setTimeout(() => setIsClearing(false), 300);
                    }}
                  >
                    {isClearing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <X className="h-4 w-4 mr-2" />
                    )}
                    Clear All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex gap-2 flex-1 min-w-[200px]">
                  <Input
                    placeholder="Search templates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                  <Button variant="outline" onClick={() => refetch()}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>

                <Select
                  value={typeFilter || '_all'}
                  onValueChange={(value) =>
                    updateParams('type', value === '_all' ? undefined : value)
                  }
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Types</SelectItem>
                    {TEMPLATE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Results Summary */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {templates.length} of {total} templates
            </span>
          </div>

          {/* Templates Grid */}
          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h2 className="text-xl font-semibold mb-2">No Templates Found</h2>
                <p className="text-muted-foreground mb-4">
                  {total === 0
                    ? 'Get started by creating your first communication template.'
                    : 'Try adjusting your filters to find templates.'}
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  className={`hover:shadow-md transition-shadow ${
                    !template.is_active ? 'opacity-60' : ''
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(template.type)}
                        <CardTitle className="text-base">{template.name}</CardTitle>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => toast.success('Preview coming soon')}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toast.success('Editor coming soon')}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(template.id)}
                            disabled={isDuplicating}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleToggleStatus(template.id, template.is_active)}
                            disabled={isToggling}
                          >
                            {template.is_active ? (
                              <>
                                <PowerOff className="h-4 w-4 mr-2" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Power className="h-4 w-4 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteConfirmId(template.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {template.type}
                      </Badge>
                      {template.category && (
                        <Badge variant="secondary" className="text-xs">
                          {template.category}
                        </Badge>
                      )}
                      {!template.is_active && (
                        <Badge variant="destructive" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {template.content || 'No content preview available'}
                    </p>
                    {template.subject && (
                      <p className="text-xs text-muted-foreground mt-2 truncate">
                        <strong>Subject:</strong> {template.subject}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!deleteConfirmId}
          onOpenChange={() => setDeleteConfirmId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this template? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTemplate}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionTemplatesPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionTemplatesPageContent />
    </AdmissionErrorBoundary>
  );
}
