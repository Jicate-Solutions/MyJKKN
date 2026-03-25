'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Award, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePrivilegeTypes,
  usePrivilegeTemplates,
  useCreatePrivilegeGroup,
  useCreateFromTemplate,
  usePrivilegeGroup,
} from '@/hooks/academic/use-privileges';
import toast from 'react-hot-toast';
import type { PrivilegeType } from '@/types/privileges';

export default function CreatePrivilegeGroupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateIdFromUrl = searchParams.get('template');

  const { userProfile, isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : userProfile?.institution_id;

  const { data: privilegeTypes, isLoading: typesLoading } = usePrivilegeTypes();
  const { data: templates, isLoading: templatesLoading } = usePrivilegeTemplates();
  const createGroup = useCreatePrivilegeGroup();
  const createFromTemplate = useCreateFromTemplate();

  // Load template data if templateId is in URL
  const { data: templateGroup } = usePrivilegeGroup(templateIdFromUrl);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Handle both array and paginated response shapes
  const typesList: PrivilegeType[] = Array.isArray(privilegeTypes)
    ? privilegeTypes
    : (privilegeTypes as { data?: PrivilegeType[] })?.data ?? [];
  const templatesList = Array.isArray(templates)
    ? templates
    : (templates as { data?: unknown[] })?.data ?? [];

  // Pre-fill from template if provided via URL
  useEffect(() => {
    if (templateGroup && templateIdFromUrl) {
      setName('');
      setDescription(templateGroup.description || '');
      setReferenceCode('');
      if (templateGroup.privilege_types) {
        setSelectedTypeIds(templateGroup.privilege_types.map((pt) => pt.type_id));
      }
    }
  }, [templateGroup, templateIdFromUrl]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === 'none') {
      return;
    }
    // Find template and pre-fill
    const template = (templatesList as Array<{ id: string; name: string; description: string | null; privilege_types?: Array<{ type_id: string }> }>).find(
      (t) => t.id === templateId
    );
    if (template) {
      setName('');
      setDescription(template.description || '');
      if (template.privilege_types) {
        setSelectedTypeIds(template.privilege_types.map((pt) => pt.type_id));
      }
    }
  };

  const handleTypeToggle = (typeId: string) => {
    setSelectedTypeIds((prev) =>
      prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!referenceCode.trim()) {
      toast.error('Reference code is required');
      return;
    }
    if (selectedTypeIds.length === 0) {
      toast.error('Select at least one privilege type');
      return;
    }

    // If creating from a template via dropdown
    if (selectedTemplateId && selectedTemplateId !== 'none') {
      createFromTemplate.mutate(
        {
          templateId: selectedTemplateId,
          overrides: {
            name: name.trim(),
            description: description.trim() || undefined,
            reference_code: referenceCode.trim(),
            semester_id: semesterId || undefined,
            institution_id: institutionId || '',
            created_by: userProfile?.id || '',
            privilege_type_ids: selectedTypeIds,
          },
        },
        {
          onSuccess: () => {
            router.push('/academic/privileges');
          },
        }
      );
      return;
    }

    createGroup.mutate(
      {
        institution_id: institutionId || '',
        name: name.trim(),
        description: description.trim() || undefined,
        reference_code: referenceCode.trim(),
        semester_id: semesterId || undefined,
        created_by: userProfile?.id || '',
        privilege_type_ids: selectedTypeIds,
      },
      {
        onSuccess: () => {
          router.push('/academic/privileges');
        },
      }
    );
  };

  const isSubmitting = createGroup.isPending || createFromTemplate.isPending;

  return (
    <ContentLayout title="Create Privilege Group">
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
              <BreadcrumbPage>Create</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Create from Template</CardTitle>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : templatesList.length > 0 ? (
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {(templatesList as Array<{ id: string; template_name: string | null; name: string }>).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.template_name || t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No templates available. You can save groups as templates later.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Group Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-600" />
                Group Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., SG36 Batch - AI Privilege"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference_code">Reference Code *</Label>
                  <Input
                    id="reference_code"
                    placeholder="e.g., SG36"
                    value={referenceCode}
                    onChange={(e) => setReferenceCode(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the purpose of this privilege group..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="semester">Semester (optional)</Label>
                <Input
                  id="semester"
                  placeholder="Enter semester ID"
                  value={semesterId}
                  onChange={(e) => setSemesterId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Associate this group with a specific semester.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Privilege Types Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Privilege Types *</CardTitle>
            </CardHeader>
            <CardContent>
              {typesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : typesList.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No privilege types configured for this institution.
                </p>
              ) : (
                <div className="space-y-3">
                  {typesList.map((type) => (
                    <label
                      key={type.id}
                      className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedTypeIds.includes(type.id)}
                        onCheckedChange={() => handleTypeToggle(type.id)}
                        className="mt-0.5"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{type.name}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground capitalize">
                            {type.category}
                          </span>
                        </div>
                        {type.description && (
                          <p className="text-xs text-muted-foreground">{type.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/academic/privileges')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Group
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
