'use client';

// app/(routes)/admission/settings/forms/page.tsx
// Admin forms list page — view, create, manage admission forms
// Added: 2026-04-08

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAdmissionForms,
  useFormMutations,
  useFormTemplates,
} from '@/hooks/admission/use-admission-forms';
import {
  useFormSubmissionCounts,
  useFormViewCounts,
} from '@/hooks/admission/use-form-analytics';
import { FormBuilderService } from '@/lib/services/admission/form-builder-service';
import { Plus, FileText, BarChart3, Link2, Pencil, Trash2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

function FormsListContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { selectedInstitutionId, getAccessibleInstitutionIds } =
    useUserInstitutionAccess();
  const { isSuperAdmin, canAccess } = usePermissions();
  const canEditForms = canAccess('admission', 'edit')
    || canAccess('admission', 'manage')
    || canAccess('admission', 'settings.edit');
  const canDeleteForms = canAccess('admission', 'delete')
    || canAccess('admission', 'manage')
    || canAccess('admission', 'settings.delete');
  const [createOpen, setCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    name: '',
    slug: '',
    description: '',
    templateId: '',
  });

  // Super admins see forms from ALL institutions they can access.
  // Regular users see only forms for their current institution context.
  const accessibleIds = getAccessibleInstitutionIds();
  const formsQueryScope = isSuperAdmin
    ? accessibleIds.length > 0
      ? accessibleIds
      : selectedInstitutionId
    : selectedInstitutionId;
  const { data: forms = [], isLoading } = useAdmissionForms(formsQueryScope || undefined);
  const { data: templates = [] } = useFormTemplates();
  const formIds = forms.map((f) => f.id);
  const { data: submissionCounts = {} } = useFormSubmissionCounts(formIds);
  const { data: viewCounts = {} } = useFormViewCounts(formIds);
  const { createForm, createFromTemplate, deleteForm } = useFormMutations();

  const handleNameChange = (name: string) => {
    setNewForm((prev) => ({
      ...prev,
      name,
      slug: FormBuilderService.generateSlug(name),
    }));
  };

  const handleCreate = async () => {
    if (!selectedInstitutionId || !profile?.id) {
      toast.error('Institution context required');
      return;
    }
    if (!newForm.name.trim() || !newForm.slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }

    const slugAvailable = await FormBuilderService.isSlugAvailable(newForm.slug);
    if (!slugAvailable) {
      toast.error('Slug already taken. Please choose another.');
      return;
    }

    const input = {
      institution_id: selectedInstitutionId,
      name: newForm.name.trim(),
      slug: newForm.slug.trim(),
      description: newForm.description.trim() || null,
      institution_ids: [selectedInstitutionId],
    };

    try {
      let createdForm;
      if (newForm.templateId) {
        createdForm = await createFromTemplate.mutateAsync({
          templateId: newForm.templateId,
          input,
          userId: profile.id,
        });
      } else {
        createdForm = await createForm.mutateAsync({ input, userId: profile.id });
      }
      setCreateOpen(false);
      setNewForm({ name: '', slug: '', description: '', templateId: '' });
      router.push(`/admission/settings/forms/${createdForm.id}`);
    } catch {
      // Error toast handled by mutation hook
    }
  };

  const handleDelete = async (formId: string, formName: string) => {
    if (!confirm(`Delete form "${formName}"? This cannot be undone.`)) return;
    try {
      await deleteForm.mutateAsync(formId);
    } catch {
      // Error handled by hook
    }
  };

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/apply/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Public link copied to clipboard');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Live</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'archived':
        return <Badge variant="outline" className="text-red-600">Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Form Builder">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/settings">Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Form Builder</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Admission Form Builder
            </h1>
            <p className="text-muted-foreground mt-1">
              Create public admission forms that capture leads directly into your CRM
            </p>
          </div>
          {canEditForms && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Form
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-1">No forms yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first admission form to start collecting leads
              </p>
              {canEditForms && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Form
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => (
              <Card key={form.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{form.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">/apply/{form.slug}</p>
                    </div>
                    {getStatusBadge(form.status)}
                  </div>
                  {form.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {form.description}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="text-center p-2 rounded bg-muted/40">
                      <div className="text-lg font-bold">{submissionCounts[form.id] ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Submissions</div>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/40">
                      <div className="text-lg font-bold">{viewCounts[form.id] ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Views</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <Link href={`/admission/settings/forms/${form.id}`}>
                      <Button size="sm" variant="ghost">
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/admission/settings/forms/${form.id}/analytics`}>
                      <Button size="sm" variant="ghost">
                        <BarChart3 className="h-3.5 w-3.5 mr-1" />
                        Analytics
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => handleCopyLink(form.slug)}>
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                    {canDeleteForms && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(form.id, form.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create form dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Admission Form</DialogTitle>
              <DialogDescription>
                Start from a template or build from scratch. You can customize fields after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="form-name">Form Name *</Label>
                <Input
                  id="form-name"
                  placeholder="e.g., UG Admission 2026"
                  value={newForm.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="form-slug">Public URL Slug *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">/apply/</span>
                  <Input
                    id="form-slug"
                    placeholder="ug-admission-2026"
                    value={newForm.slug}
                    onChange={(e) => setNewForm((p) => ({ ...p, slug: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="form-description">Description</Label>
                <Textarea
                  id="form-description"
                  placeholder="Brief description shown on the public form"
                  value={newForm.description}
                  onChange={(e) => setNewForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                />
              </div>
              {templates.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="form-template">Start from template (optional)</Label>
                  <Select
                    value={newForm.templateId || 'blank'}
                    onValueChange={(v) =>
                      setNewForm((p) => ({ ...p, templateId: v === 'blank' ? '' : v }))
                    }
                  >
                    <SelectTrigger id="form-template">
                      <SelectValue placeholder="Blank form" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blank">Blank form</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createForm.isPending || createFromTemplate.isPending}
              >
                {createForm.isPending || createFromTemplate.isPending ? 'Creating...' : 'Create Form'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}

export default function AdmissionFormsPage() {
  return (
    <AdmissionErrorBoundary>
      <PermissionGuard module="admission" action="view">
        <FormsListContent />
      </PermissionGuard>
    </AdmissionErrorBoundary>
  );
}
