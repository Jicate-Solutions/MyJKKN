'use client';

// Registration Form builder — organizer-configurable custom fields for one
// tournament, layered on top of the fixed core fields (division, entry name,
// roster, contact info) every registration already collects. Sections hold
// fields; both reorder via up/down buttons (no drag-and-drop dependency).

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import {
  useRegistrationForm,
  useCreateFormSection,
  useUpdateFormSection,
  useDeleteFormSection,
  useReorderFormSections,
  useCreateFormField,
  useUpdateFormField,
  useDeleteFormField,
  useReorderFormFields,
} from '@/hooks/events/use-tournament-registration-form';
import { DynamicFieldInput } from '@/components/events/dynamic-field-input';
import { FORM_FIELD_TYPES } from '@/types/tournament';
import type { EventRegistrationFormField, EventRegistrationFormSection } from '@/types/tournament';

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '_')
    .replace(/^_|_$/g, '') || 'field';
}

function FieldRow({
  field,
  isFirst,
  isLast,
  onMove,
  onUpdate,
  onDelete,
}: {
  field: EventRegistrationFormField;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onUpdate: (updates: Partial<EventRegistrationFormField>) => void;
  onDelete: () => void;
}) {
  const needsOptions = field.field_type === 'select' || field.field_type === 'multi_select' || field.field_type === 'radio';
  const optionsText = (field.options ?? []).map((o) => o.label).join('\n');

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Field label</Label>
          <Input
            value={field.field_label}
            onChange={(e) => onUpdate({ field_label: e.target.value })}
            placeholder="e.g. T-shirt size"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Field type</Label>
          <Select value={field.field_type} onValueChange={(v) => onUpdate({ field_type: v as EventRegistrationFormField['field_type'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORM_FIELD_TYPES.filter((t) => t.value !== 'file').map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {needsOptions && (
        <div className="space-y-1.5">
          <Label>Options (one per line)</Label>
          <Textarea
            rows={3}
            value={optionsText}
            onChange={(e) =>
              onUpdate({
                options: e.target.value
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => ({ label: l, value: slugifyKey(l) })),
              })
            }
            placeholder={'Small\nMedium\nLarge'}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Help text (optional)</Label>
        <Input
          value={field.help_text ?? ''}
          onChange={(e) => onUpdate({ help_text: e.target.value || null })}
          placeholder="Shown under the field"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={field.is_required} onCheckedChange={(v) => onUpdate({ is_required: v })} />
          <Label className="text-sm">Required</Label>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={isFirst} onClick={() => onMove('up')}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={isLast} onClick={() => onMove('down')}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RegistrationFormBuilder({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const { data: form, isLoading } = useRegistrationForm(eventId);
  const createSection = useCreateFormSection(eventId);
  const updateSection = useUpdateFormSection(eventId);
  const deleteSection = useDeleteFormSection(eventId);
  const reorderSections = useReorderFormSections(eventId);
  const createField = useCreateFormField(eventId);
  const updateField = useUpdateFormField(eventId);
  const deleteField = useDeleteFormField(eventId);
  const reorderFields = useReorderFormFields(eventId);

  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});

  const sections = form?.sections ?? [];

  function addSection() {
    if (!form) return;
    createSection.mutate({
      formId: form.id,
      section: { title: 'New section', display_order: sections.length },
    });
  }

  function moveSection(section: EventRegistrationFormSection, direction: 'up' | 'down') {
    const idx = sections.findIndex((s) => s.id === section.id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sections.length) return;
    reorderSections.mutate([
      { id: sections[idx].id, display_order: sections[swapWith].display_order },
      { id: sections[swapWith].id, display_order: sections[idx].display_order },
    ]);
  }

  function addField(section: EventRegistrationFormSection) {
    const fields = section.fields ?? [];
    createField.mutate({
      section_id: section.id,
      field_key: `field_${Date.now()}`,
      field_label: 'New field',
      field_type: 'text',
      display_order: fields.length,
    });
  }

  function moveField(section: EventRegistrationFormSection, field: EventRegistrationFormField, direction: 'up' | 'down') {
    const fields = section.fields ?? [];
    const idx = fields.findIndex((f) => f.id === field.id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= fields.length) return;
    reorderFields.mutate([
      { id: fields[idx].id, display_order: fields[swapWith].display_order, section_id: section.id },
      { id: fields[swapWith].id, display_order: fields[idx].display_order, section_id: section.id },
    ]);
  }

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Registration Form</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Add custom fields registrants must fill in, on top of the standard division/name/roster/contact
              fields every tournament already collects. These apply to all divisions in this tournament.
            </p>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* ── Builder ── */}
              <div className="space-y-4">
                {sections.map((section, sIdx) => (
                  <div key={section.id} className="space-y-3 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        className="flex-1"
                        value={section.title}
                        onChange={(e) => updateSection.mutate({ sectionId: section.id, updates: { title: e.target.value } })}
                      />
                      <Button type="button" variant="ghost" size="icon" disabled={sIdx === 0} onClick={() => moveSection(section, 'up')}>
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" disabled={sIdx === sections.length - 1} onClick={() => moveSection(section, 'down')}>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => deleteSection.mutate(section.id)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {(section.fields ?? []).map((field, fIdx) => (
                        <FieldRow
                          key={field.id}
                          field={field}
                          isFirst={fIdx === 0}
                          isLast={fIdx === (section.fields?.length ?? 1) - 1}
                          onMove={(dir) => moveField(section, field, dir)}
                          onUpdate={(updates) => updateField.mutate({ fieldId: field.id, updates })}
                          onDelete={() => deleteField.mutate(field.id)}
                        />
                      ))}
                    </div>

                    <Button type="button" variant="outline" size="sm" onClick={() => addField(section)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add field
                    </Button>
                  </div>
                ))}

                <Button type="button" variant="outline" onClick={addSection} disabled={!form}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add section
                </Button>
              </div>

              {/* ── Live preview ── */}
              <div className="space-y-4 rounded-lg border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Preview — what registrants will see
                </p>
                {sections.length === 0 && (
                  <p className="text-sm text-muted-foreground">No custom fields yet — add a section to get started.</p>
                )}
                {sections.map((section) => (
                  <div key={section.id} className="space-y-3">
                    <p className="text-sm font-semibold">{section.title}</p>
                    {(section.fields ?? []).map((field) => (
                      <DynamicFieldInput
                        key={field.id}
                        field={field}
                        value={previewValues[field.field_key]}
                        onChange={(v) => setPreviewValues((prev) => ({ ...prev, [field.field_key]: v }))}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
