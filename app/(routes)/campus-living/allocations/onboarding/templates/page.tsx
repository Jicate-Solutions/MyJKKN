'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import {
  useOnboardingTemplates,
  useCreateOnboardingTemplate,
  useUpdateOnboardingTemplate,
} from '@/hooks/campus-living/use-onboarding';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Save,
  FileText,
  CheckCircle2,
  X,
  GripVertical,
  Pencil,
  LayoutTemplate,
} from 'lucide-react';
import { ONBOARDING_ITEM_TYPE } from '@/types/campus-living';
import type { OnboardingTemplateItem, OnboardingItemType, HostelOnboardingTemplate } from '@/types/campus-living';

const itemTypeLabels: Record<OnboardingItemType, string> = {
  room_readiness: 'Room Readiness',
  document_collection: 'Document Collection',
  welcome_kit: 'Welcome Kit',
  orientation: 'Orientation',
  emergency_contact: 'Emergency Contact',
  rules_acknowledgment: 'Rules Acknowledgment',
  id_card: 'ID Card',
  mess_registration: 'Mess Registration',
  wifi_setup: 'WiFi Setup',
  custom: 'Custom',
};

const emptyItem = (): OnboardingTemplateItem => ({
  type: 'custom' as OnboardingItemType,
  title: '',
  required: false,
  order: 0,
});

export default function OnboardingTemplatesPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const { data: templates, isLoading } = useOnboardingTemplates(institutionId);
  const createTemplate = useCreateOnboardingTemplate();
  const updateTemplate = useUpdateOnboardingTemplate();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<HostelOnboardingTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateItems, setTemplateItems] = useState<OnboardingTemplateItem[]>([]);
  const [isActive, setIsActive] = useState(false);

  const resetForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateItems([]);
    setIsActive(false);
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
    setTemplateItems([{ ...emptyItem(), order: 1 }]);
  };

  const startEdit = (template: HostelOnboardingTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateItems(template.items.map((item, idx) => ({ ...item, order: idx + 1 })));
    setIsActive(template.is_active);
    setShowForm(true);
  };

  const addItem = () => {
    setTemplateItems((prev) => [
      ...prev,
      { ...emptyItem(), order: prev.length + 1 },
    ]);
  };

  const removeItem = (index: number) => {
    setTemplateItems((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((item, i) => ({ ...item, order: i + 1 }));
    });
  };

  const updateItem = (index: number, field: keyof OnboardingTemplateItem, value: any) => {
    setTemplateItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSave = () => {
    if (!templateName.trim()) return;
    const validItems = templateItems.filter((item) => item.title.trim());
    if (validItems.length === 0) return;

    if (editingTemplate) {
      updateTemplate.mutate(
        {
          id: editingTemplate.id,
          payload: {
            name: templateName.trim(),
            items: validItems,
            is_active: isActive,
          },
        },
        { onSuccess: resetForm }
      );
    } else {
      createTemplate.mutate(
        {
          institution_id: institutionId,
          name: templateName.trim(),
          items: validItems,
          is_active: isActive,
        },
        { onSuccess: resetForm }
      );
    }
  };

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  if (isLoading) {
    return (
      <ContentLayout title="Onboarding Templates">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Onboarding Templates">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Onboarding', href: '/campus-living/allocations/onboarding' },
          { label: 'Templates' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/allocations/onboarding">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Onboarding Templates</h1>
              <p className="text-sm text-muted-foreground">
                Define reusable onboarding checklists for new residents
              </p>
            </div>
          </div>
          {!showForm && (
            <Button onClick={startCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          )}
        </div>

        {/* Inline Create/Edit Form */}
        {showForm && (
          <Card className="border-primary/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {editingTemplate ? 'Edit Template' : 'Create New Template'}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Template Name & Active toggle */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1.5 block">Template Name</label>
                  <Input
                    placeholder="e.g. Standard Onboarding 2026"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={isActive}
                      onCheckedChange={(checked) => setIsActive(checked === true)}
                    />
                    <span className="text-sm font-medium">Set as active template</span>
                  </label>
                </div>
              </div>

              {/* Items List */}
              <div>
                <label className="text-sm font-medium mb-3 block">Checklist Items</label>
                <div className="space-y-3">
                  {templateItems.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 border rounded-lg bg-gray-50/50"
                    >
                      <div className="pt-2 text-muted-foreground">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <span className="pt-2 text-sm text-muted-foreground font-mono w-6 text-center">
                        {index + 1}
                      </span>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-3">
                        <Select
                          value={item.type}
                          onValueChange={(value) =>
                            updateItem(index, 'type', value as OnboardingItemType)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ONBOARDING_ITEM_TYPE).map(([key, value]) => (
                              <SelectItem key={value} value={value}>
                                {itemTypeLabels[value] ?? key}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Item title (e.g. Verify room is clean)"
                          value={item.title}
                          onChange={(e) => updateItem(index, 'title', e.target.value)}
                        />
                        <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap pt-2">
                          <Checkbox
                            checked={item.required}
                            onCheckedChange={(checked) =>
                              updateItem(index, 'required', checked === true)
                            }
                          />
                          <span className="text-sm">Required</span>
                        </label>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={() => removeItem(index)}
                        disabled={templateItems.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={addItem}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Item
                </Button>
              </div>

              {/* Save / Cancel */}
              <div className="flex justify-end gap-3 pt-2 border-t">
                <Button variant="outline" onClick={resetForm} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!templateName.trim() || templateItems.filter((i) => i.title.trim()).length === 0 || isSaving}
                >
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  {editingTemplate ? 'Update Template' : 'Save Template'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Templates List */}
        <div className="grid gap-4">
          {templates && templates.length > 0 ? (
            templates.map((template: HostelOnboardingTemplate) => (
              <Card
                key={template.id}
                className={template.is_active ? 'border-green-300 bg-green-50/30' : ''}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <LayoutTemplate className="h-8 w-8 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-lg">{template.name}</h3>
                          {template.is_active && (
                            <Badge variant="success" className="text-xs">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5" />
                            {template.items.length} items
                          </span>
                          <span>
                            {template.items.filter((i: OnboardingTemplateItem) => i.required).length} required
                          </span>
                          <span>
                            Created {new Date(template.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {/* Item preview */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {template.items.slice(0, 5).map((item: OnboardingTemplateItem, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs font-normal">
                              {item.title}
                            </Badge>
                          ))}
                          {template.items.length > 5 && (
                            <Badge variant="outline" className="text-xs font-normal">
                              +{template.items.length - 5} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(template)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      {!template.is_active && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateTemplate.mutate({
                              id: template.id,
                              payload: { is_active: true },
                            })
                          }
                          disabled={updateTemplate.isPending}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Set Active
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            !showForm && (
              <Card>
                <CardContent className="p-8 text-center">
                  <LayoutTemplate className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground font-medium">No templates yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create a template to standardize your onboarding process
                  </p>
                  <Button className="mt-4" onClick={startCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Template
                  </Button>
                </CardContent>
              </Card>
            )
          )}
        </div>
      </div>
    </ContentLayout>
  );
}
