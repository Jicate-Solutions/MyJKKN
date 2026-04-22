'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Award, HelpCircle, Info, Loader2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
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
  usePrivilegeSourceTypes,
} from '@/hooks/academic/use-privileges';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useYuvaVerticals } from '@/hooks/academic/use-yuva-verticals';
import toast from 'react-hot-toast';
import type { PrivilegeSourceType, PrivilegeSourceTypeField, PrivilegeType } from '@/types/privileges';

// ---------------------------------------------------------------------------
// Helper: resolve a lucide icon name from the registry to a React component.
// Falls back to HelpCircle for unknown names.
// ---------------------------------------------------------------------------
function SourceIcon({ name, className }: { name: string | null; className?: string }) {
  if (!name) return <HelpCircle className={className} />;
  // lucide-react exports icons in PascalCase. The DB stores kebab-case names.
  const pascal = name
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  const IconComponent = (LucideIcons as Record<string, React.ComponentType<{ className?: string }>>)[pascal];
  if (!IconComponent) return <HelpCircle className={className} />;
  return <IconComponent className={className} />;
}

// ---------------------------------------------------------------------------
// Dynamic config field renderer — handles text | select | checkbox.
// No registered source currently has fields, but the renderer is ready.
// ---------------------------------------------------------------------------
function SourceConfigField({
  field,
  value,
  onChange,
}: {
  field: PrivilegeSourceTypeField;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  if (field.type === 'select') {
    return (
      <div className="space-y-1">
        <Label htmlFor={`config-${field.key}`}>{field.label}{field.required && ' *'}</Label>
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onChange(field.key, v)}
        >
          <SelectTrigger id={`config-${field.key}`}>
            <SelectValue placeholder={`Select ${field.label}`} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={`config-${field.key}`}
          checked={!!value}
          onCheckedChange={(checked) => onChange(field.key, checked)}
        />
        <Label htmlFor={`config-${field.key}`}>{field.label}</Label>
      </div>
    );
  }

  // default: text
  return (
    <div className="space-y-1">
      <Label htmlFor={`config-${field.key}`}>{field.label}{field.required && ' *'}</Label>
      <Input
        id={`config-${field.key}`}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    </div>
  );
}

export default function CreatePrivilegeGroupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateIdFromUrl = searchParams.get('template');

  const { userProfile, isSuperAdmin } = usePermissions();

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  const { data: privilegeTypes, isLoading: typesLoading } = usePrivilegeTypes();
  const { data: templates, isLoading: templatesLoading } = usePrivilegeTemplates();
  const { data: sourceTypes, isLoading: sourceTypesLoading } = usePrivilegeSourceTypes();
  const createGroup = useCreatePrivilegeGroup();
  const createFromTemplate = useCreateFromTemplate();

  // Load template data if templateId is in URL
  const { data: templateGroup } = usePrivilegeGroup(templateIdFromUrl);

  // Form state — core fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Institution selection — super_admin picks from dropdown; others are locked to their own
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');

  // Seed institution once profile + institutions list are ready
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.institution_id && !selectedInstitutionId) {
      setSelectedInstitutionId(userProfile.institution_id);
    }
  }, [isSuperAdmin, userProfile?.institution_id, selectedInstitutionId]);

  // Source state
  const [sourceKind, setSourceKind] = useState<string>('manual');
  const [sourceConfig, setSourceConfig] = useState<Record<string, unknown>>({});

  // Vertical selection — only relevant when sourceKind === 'yuva_vertical_chairs'
  const [selectedVerticalId, setSelectedVerticalId] = useState<string | null>(null);
  const isYuvaVerticalChairs = sourceKind === 'yuva_vertical_chairs';
  const { data: yuvaVerticals, isLoading: verticalsLoading } = useYuvaVerticals(isYuvaVerticalChairs);

  // Handle both array and paginated response shapes
  const typesList: PrivilegeType[] = Array.isArray(privilegeTypes)
    ? privilegeTypes
    : (privilegeTypes as { data?: PrivilegeType[] })?.data ?? [];
  const templatesList = Array.isArray(templates)
    ? templates
    : (templates as { data?: unknown[] })?.data ?? [];

  // The selected source type object (for config_schema rendering + banner)
  const selectedSource: PrivilegeSourceType | undefined = (sourceTypes ?? []).find(
    (s) => s.kind === sourceKind
  );

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
    if (templateId === 'none') return;
    const template = (
      templatesList as Array<{
        id: string;
        name: string;
        description: string | null;
        privilege_types?: Array<{ type_id: string }>;
      }>
    ).find((t) => t.id === templateId);
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

  const handleSourceSelect = (kind: string) => {
    setSourceKind(kind);
    setSourceConfig({}); // reset config whenever source changes
    setSelectedVerticalId(null); // reset vertical when source changes
  };

  const handleConfigChange = (key: string, val: unknown) => {
    setSourceConfig((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedInstitutionId) {
      toast.error('Institution is required');
      return;
    }
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
    if (isYuvaVerticalChairs && !selectedVerticalId) {
      toast.error('Vertical is required for YUVA Vertical Chairs source');
      return;
    }

    // Build source_config — yuva_vertical_chairs adds vertical_id; others use dynamic config
    const resolvedSourceConfig: Record<string, unknown> = isYuvaVerticalChairs
      ? { vertical_id: selectedVerticalId }
      : sourceConfig;

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
            institution_id: selectedInstitutionId,
            created_by: userProfile?.id || '',
            privilege_type_ids: selectedTypeIds,
            source_kind: sourceKind,
            source_config: resolvedSourceConfig,
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
        institution_id: selectedInstitutionId,
        name: name.trim(),
        description: description.trim() || undefined,
        reference_code: referenceCode.trim(),
        semester_id: semesterId || undefined,
        created_by: userProfile?.id || '',
        privilege_type_ids: selectedTypeIds,
        source_kind: sourceKind,
        source_config: resolvedSourceConfig,
      },
      {
        onSuccess: () => {
          router.push('/academic/privileges');
        },
      }
    );
  };

  const isSubmitting = createGroup.isPending || createFromTemplate.isPending;
  const isManualSource = sourceKind === 'manual';

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
                    {(
                      templatesList as Array<{
                        id: string;
                        template_name: string | null;
                        name: string;
                      }>
                    ).map((t) => (
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
              {/* Institution picker — appears first in the form (which college → what group) */}
              <div className="space-y-2">
                <Label htmlFor="institution">Institution *</Label>
                {isSuperAdmin ? (
                  <>
                    {institutionsLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select
                        value={selectedInstitutionId}
                        onValueChange={setSelectedInstitutionId}
                      >
                        <SelectTrigger id="institution">
                          <SelectValue placeholder="Select institution" />
                        </SelectTrigger>
                        <SelectContent>
                          {institutions.map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                ) : (
                  <>
                    <Input
                      id="institution"
                      value={
                        institutions.find((i) => i.id === selectedInstitutionId)?.name ??
                        (institutionsLoading ? 'Loading…' : 'Your institution')
                      }
                      disabled
                      className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">
                      You can only create groups for your own institution.
                    </p>
                  </>
                )}
              </div>

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

          {/* Source of Membership */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Source of membership</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Where does this group&apos;s membership come from? Sourced groups stay in sync
                automatically — no manual curation required.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {sourceTypesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(sourceTypes ?? []).map((source) => {
                    const isSelected = sourceKind === source.kind;
                    const isUnavailable = !source.is_available;

                    return (
                      <button
                        key={source.kind}
                        type="button"
                        disabled={isUnavailable}
                        onClick={() => !isUnavailable && handleSourceSelect(source.kind)}
                        className={[
                          'relative flex items-start gap-3 rounded-lg border p-4 text-left transition-all',
                          isUnavailable
                            ? 'cursor-not-allowed opacity-60 bg-muted/30'
                            : 'cursor-pointer hover:bg-muted/50',
                          isSelected && !isUnavailable
                            ? 'ring-2 ring-primary border-primary'
                            : 'border-border',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-pressed={isSelected}
                        aria-disabled={isUnavailable}
                        title={isUnavailable && source.available_note ? source.available_note : undefined}
                      >
                        {/* Coming soon ribbon */}
                        {isUnavailable && (
                          <span className="absolute top-2 right-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                            Coming soon
                          </span>
                        )}

                        {/* Icon */}
                        <div className="mt-0.5 shrink-0 text-muted-foreground">
                          <SourceIcon name={source.icon} className="h-5 w-5" />
                        </div>

                        {/* Text */}
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-semibold leading-tight">{source.display_name}</p>
                          {source.description && (
                            <p className="text-xs text-muted-foreground leading-snug">
                              {source.description}
                            </p>
                          )}
                          {isUnavailable && source.available_note && (
                            <p className="text-[11px] text-muted-foreground/70 italic">
                              {source.available_note}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sourced-group info banner */}
              {!isManualSource && selectedSource && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Membership is synced from{' '}
                    <span className="font-medium">{selectedSource.display_name}</span> — no manual
                    curation needed. Members update automatically as the source changes.
                  </p>
                </div>
              )}

              {/* Dynamic config fields (rendered when a future source has config_schema.fields) */}
              {selectedSource &&
                (selectedSource.config_schema?.fields ?? []).length > 0 && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <p className="text-sm font-medium">Source configuration</p>
                    {(selectedSource.config_schema.fields ?? []).map((field) => (
                      <SourceConfigField
                        key={field.key}
                        field={field}
                        value={sourceConfig[field.key]}
                        onChange={handleConfigChange}
                      />
                    ))}
                  </div>
                )}

              {/* Vertical picker — only shown for yuva_vertical_chairs source */}
              {isYuvaVerticalChairs && (
                <div className="space-y-2 rounded-lg border p-4">
                  <Label htmlFor="vertical">Vertical *</Label>
                  {verticalsLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select
                      value={selectedVerticalId ?? ''}
                      onValueChange={(v) => setSelectedVerticalId(v)}
                    >
                      <SelectTrigger id="vertical">
                        <SelectValue placeholder="Select a vertical" />
                      </SelectTrigger>
                      <SelectContent>
                        {(yuvaVerticals ?? []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Each group = one institution + one vertical. Review cadence is per-group-per-month.
                  </p>
                </div>
              )}
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
