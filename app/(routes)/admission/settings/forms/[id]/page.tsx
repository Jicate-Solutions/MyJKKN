'use client';

// app/(routes)/admission/settings/forms/[id]/page.tsx
// Form builder with drag-and-drop, field config, and publish controls
// Added: 2026-04-08

import { useState, useEffect, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useAdmissionForm, useFormMutations } from '@/hooks/admission/use-admission-forms';
import { FormBuilderService } from '@/lib/services/admission/form-builder-service';
import type {
  FormFieldType,
  AdmissionFormField,
  LeadSource,
} from '@/types/admission';

// Channel attribution options shown in the form-settings panel. Keep in
// sync with LEAD_SOURCE_OPTIONS in app/(routes)/admission/settings/forms/
// page.tsx and the lead_source enum in supabase/migrations.
const LEAD_SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'website', label: 'Website' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'education_fair', label: 'Education Fair' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'referral', label: 'Referral' },
  { value: 'agent', label: 'Agent' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'inbound_call', label: 'Inbound Call' },
  { value: 'gate_entry', label: 'Gate Entry' },
  { value: 'other', label: 'Other' },
];
import { FormPreviewDialog } from './_components/form-preview-dialog';
import { ImageUploadField } from './_components/image-upload-field';
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  Eye,
  Send,
  Type,
  Hash,
  Phone,
  Mail,
  ChevronDown,
  CheckSquare,
  Calendar,
  AlignLeft,
  Upload,
  CheckCircle,
  Circle,
  GraduationCap,
  Link2,
  ArrowLeft,
  Settings as SettingsIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';

const FIELD_TYPE_META: Record<FormFieldType, { label: string; icon: any }> = {
  text: { label: 'Text Input', icon: Type },
  number: { label: 'Number', icon: Hash },
  phone: { label: 'Phone', icon: Phone },
  email: { label: 'Email', icon: Mail },
  select: { label: 'Dropdown', icon: ChevronDown },
  multi_select: { label: 'Multi-Select', icon: CheckSquare },
  date: { label: 'Date', icon: Calendar },
  textarea: { label: 'Text Area', icon: AlignLeft },
  file: { label: 'File Upload', icon: Upload },
  checkbox: { label: 'Checkbox', icon: CheckCircle },
  radio: { label: 'Radio Group', icon: Circle },
  institution_program_selector: { label: 'Institution & Program', icon: GraduationCap },
};

const LEAD_FIELD_OPTIONS = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'alternate_phone', label: 'Alternate Phone' },
  { value: 'email', label: 'Email' },
  { value: 'gender', label: 'Gender' },
  { value: 'date_of_birth', label: 'Date of Birth' },
  { value: 'parent_name', label: 'Parent Name' },
  { value: 'parent_phone', label: 'Parent Phone' },
  { value: 'parent_email', label: 'Parent Email' },
  { value: 'address_line1', label: 'Address' },
  { value: 'city', label: 'City' },
  { value: 'district', label: 'District' },
  { value: 'state', label: 'State' },
  { value: 'pincode', label: 'Pincode' },
  { value: 'notes', label: 'Notes' },
];

// ─── Section Block (header with inline rename + delete, contains fields) ───

function SectionBlock({
  section,
  selectedFieldId,
  onSelectField,
  onDeleteField,
  onTitleCommit,
  onDescriptionCommit,
  onDeleteSection,
}: {
  section: any;
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onDeleteField: (id: string) => void;
  onTitleCommit: (title: string) => void;
  onDescriptionCommit: (desc: string) => void;
  onDeleteSection: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(section.title ?? '');
  const [descDraft, setDescDraft] = useState(section.description ?? '');

  // Keep local draft in sync if the section is refetched from the server
  useEffect(() => {
    setTitleDraft(section.title ?? '');
    setDescDraft(section.description ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  const fields = section.fields ?? [];

  return (
    <div className="border rounded-md bg-muted/20">
      {/* Section header */}
      <div className="flex items-start gap-2 p-3 border-b bg-muted/40">
        <div className="flex-1 min-w-0 space-y-1">
          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => onTitleCommit(titleDraft)}
            placeholder="Section title"
            className="h-8 font-semibold text-sm bg-background"
          />
          <Input
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => onDescriptionCommit(descDraft)}
            placeholder="Section description (optional)"
            className="h-7 text-xs bg-background"
          />
        </div>
        <button
          type="button"
          onClick={onDeleteSection}
          aria-label={`Delete section ${section.title}`}
          title="Delete section"
          className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-colors dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Fields inside this section */}
      <div className="p-2 space-y-2">
        {fields.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3">
            No fields yet — click a field type on the left to add one
          </div>
        ) : (
          fields.map((field: any) => (
            <FieldBlock
              key={field.id}
              field={field}
              isSelected={selectedFieldId === field.id}
              onSelect={() => onSelectField(field.id)}
              onDelete={() => onDeleteField(field.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Sortable Field Block ───────────────────────────────────────────────────

function FieldBlock({
  field,
  isSelected,
  onSelect,
  onDelete,
}: {
  field: AdmissionFormField;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const Icon = FIELD_TYPE_META[field.field_type]?.icon || Type;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex items-center gap-2 p-3 rounded-md border cursor-pointer transition-colors ${
        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{field.field_label}</div>
        <div className="text-xs text-muted-foreground truncate">
          {FIELD_TYPE_META[field.field_type]?.label}
          {field.is_required && ' · required'}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${field.field_label}`}
        title="Delete field"
        className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-colors dark:hover:bg-red-900/20"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Field Config Panel ─────────────────────────────────────────────────────

function FieldConfigPanel({
  field,
  onUpdate,
  onDelete,
}: {
  field: AdmissionFormField;
  onUpdate: (updates: Partial<AdmissionFormField>) => void;
  onDelete: () => void;
}) {
  // Local draft state for all text inputs — prevents race condition with React
  // Query refetches. Inputs bind to draft while typing, commit to DB on blur.
  const [draft, setDraft] = useState({
    field_label: field.field_label,
    field_key: field.field_key,
    placeholder: field.placeholder ?? '',
    help_text: field.help_text ?? '',
    min_value: field.min_value,
    max_value: field.max_value,
  });

  const [localOptions, setLocalOptions] = useState(
    field.options ? field.options.map((o) => `${o.label}|${o.value}`).join('\n') : ''
  );

  // Reset draft whenever the user selects a different field.
  // Intentionally keyed on field.id only — NOT on the other field properties —
  // so in-progress edits aren't overwritten by a React Query refetch of the
  // same field that returns stale data from the server.
  useEffect(() => {
    setDraft({
      field_label: field.field_label,
      field_key: field.field_key,
      placeholder: field.placeholder ?? '',
      help_text: field.help_text ?? '',
      min_value: field.min_value,
      max_value: field.max_value,
    });
    setLocalOptions(
      field.options ? field.options.map((o) => `${o.label}|${o.value}`).join('\n') : ''
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.id]);

  const hasOptions = ['select', 'multi_select', 'radio'].includes(field.field_type);

  const commitText = (key: 'field_label' | 'field_key' | 'placeholder' | 'help_text') => {
    const next = draft[key];
    const current = (field as any)[key] ?? '';
    if (next !== current) {
      // For nullable fields, store empty as null
      const normalized =
        (key === 'placeholder' || key === 'help_text') && next === '' ? null : next;
      onUpdate({ [key]: normalized } as Partial<AdmissionFormField>);
    }
  };

  const commitNumber = (key: 'min_value' | 'max_value') => {
    const next = draft[key];
    const current = field[key];
    if (next !== current) {
      onUpdate({ [key]: next } as Partial<AdmissionFormField>);
    }
  };

  const handleOptionsBlur = () => {
    const parsed = localOptions
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, value] = line.split('|').map((s) => s.trim());
        return { label, value: value || label.toLowerCase().replace(/\s+/g, '_') };
      });
    onUpdate({ options: parsed });
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <Label htmlFor="cfg-label">Field Label</Label>
        <Input
          id="cfg-label"
          value={draft.field_label}
          onChange={(e) => setDraft((d) => ({ ...d, field_label: e.target.value }))}
          onBlur={() => commitText('field_label')}
        />
      </div>
      <div>
        <Label htmlFor="cfg-key">Field Key</Label>
        <Input
          id="cfg-key"
          value={draft.field_key}
          onChange={(e) => setDraft((d) => ({ ...d, field_key: e.target.value }))}
          onBlur={() => commitText('field_key')}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Used internally. Lowercase letters, digits, underscores only.
        </p>
      </div>
      <div>
        <Label htmlFor="cfg-placeholder">Placeholder</Label>
        <Input
          id="cfg-placeholder"
          value={draft.placeholder}
          onChange={(e) => setDraft((d) => ({ ...d, placeholder: e.target.value }))}
          onBlur={() => commitText('placeholder')}
        />
      </div>
      <div>
        <Label htmlFor="cfg-help">Help Text</Label>
        <Input
          id="cfg-help"
          value={draft.help_text}
          onChange={(e) => setDraft((d) => ({ ...d, help_text: e.target.value }))}
          onBlur={() => commitText('help_text')}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="cfg-required">Required field</Label>
        <Switch
          id="cfg-required"
          checked={field.is_required}
          onCheckedChange={(checked) => onUpdate({ is_required: checked })}
        />
      </div>
      <div>
        <Label htmlFor="cfg-leadmap">Map to Lead Field</Label>
        <Select
          value={field.lead_field_map ?? 'none'}
          onValueChange={(v) => onUpdate({ lead_field_map: v === 'none' ? null : v })}
        >
          <SelectTrigger id="cfg-leadmap">
            <SelectValue placeholder="Custom field (not mapped)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Custom field (not mapped)</SelectItem>
            {LEAD_FIELD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasOptions && (
        <div>
          <Label htmlFor="cfg-options">Options (one per line: label|value)</Label>
          <Textarea
            id="cfg-options"
            rows={6}
            value={localOptions}
            onChange={(e) => setLocalOptions(e.target.value)}
            onBlur={handleOptionsBlur}
            placeholder={'Male|male\nFemale|female\nOther|other'}
          />
        </div>
      )}
      {field.field_type === 'number' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="cfg-min">Min</Label>
            <Input
              id="cfg-min"
              type="number"
              value={draft.min_value ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  min_value: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              onBlur={() => commitNumber('min_value')}
            />
          </div>
          <div>
            <Label htmlFor="cfg-max">Max</Label>
            <Input
              id="cfg-max"
              type="number"
              value={draft.max_value ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  max_value: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              onBlur={() => commitNumber('max_value')}
            />
          </div>
        </div>
      )}

      {/* Danger zone — delete this field */}
      <div className="pt-4 mt-2 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Delete this field
        </Button>
      </div>
    </div>
  );
}

// ─── Form Settings Panel ────────────────────────────────────────────────────

function FormSettingsPanel({
  form,
  onUpdate,
  onPersist,
  formId,
}: {
  form: any;
  onUpdate: (updates: any) => void;
  /** Fire-and-forget immediate DB save — used for uploads which should persist at once */
  onPersist?: (updates: any) => void;
  formId: string;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <Label htmlFor="set-name">Form Name</Label>
        <Input
          id="set-name"
          value={form.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="set-desc">Description</Label>
        <Textarea
          id="set-desc"
          rows={3}
          value={form.description ?? ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="set-lead-source">Lead Source</Label>
        <Select
          value={(form.lead_source as LeadSource) || 'website'}
          onValueChange={(v) => onUpdate({ lead_source: v as LeadSource })}
        >
          <SelectTrigger id="set-lead-source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Submissions from this form attribute leads to this source in the
          leads module. The website form keeps the default <em>Website</em>;
          a WhatsApp-campaign form should use <em>WhatsApp</em>.
        </p>
      </div>
      <div>
        <Label htmlFor="set-color">Primary Color</Label>
        <div className="flex gap-2 items-center">
          <Input
            id="set-color"
            type="color"
            value={form.primary_color || '#1a73e8'}
            onChange={(e) => onUpdate({ primary_color: e.target.value })}
            className="w-16 h-10 p-1"
          />
          <Input
            value={form.primary_color || '#1a73e8'}
            onChange={(e) => onUpdate({ primary_color: e.target.value })}
            className="flex-1"
          />
        </div>
      </div>
      <ImageUploadField
        label="Form Logo"
        kind="logo"
        formId={formId}
        value={form.logo_url ?? null}
        onChange={(url) => {
          onUpdate({ logo_url: url });
          onPersist?.({ logo_url: url });
        }}
        help="Displayed at the top of the public form. Square images work best."
        previewClassName="h-20 w-20"
      />
      <ImageUploadField
        label="Form Banner"
        kind="banner"
        formId={formId}
        value={form.banner_url ?? null}
        onChange={(url) => {
          onUpdate({ banner_url: url });
          onPersist?.({ banner_url: url });
        }}
        help="Optional hero image shown above the form title. Wide images work best."
        previewClassName="h-24 w-full"
      />
      <div>
        <Label htmlFor="set-thank-title">Thank You Title</Label>
        <Input
          id="set-thank-title"
          value={form.thank_you_title}
          onChange={(e) => onUpdate({ thank_you_title: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="set-thank-msg">Thank You Message</Label>
        <Textarea
          id="set-thank-msg"
          rows={3}
          value={form.thank_you_message}
          onChange={(e) => onUpdate({ thank_you_message: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="set-wa">Auto WhatsApp</Label>
          <p className="text-xs text-muted-foreground">Send welcome message on submission</p>
        </div>
        <Switch
          id="set-wa"
          checked={!!form.auto_whatsapp}
          onCheckedChange={(checked) => onUpdate({ auto_whatsapp: checked })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="set-dup">Allow Duplicate Submissions</Label>
          <p className="text-xs text-muted-foreground">Same phone can apply multiple times</p>
        </div>
        <Switch
          id="set-dup"
          checked={!!form.allow_duplicate}
          onCheckedChange={(checked) => onUpdate({ allow_duplicate: checked })}
        />
      </div>
    </div>
  );
}

// ─── Main builder ───────────────────────────────────────────────────────────

function FormBuilderContent({ formId }: { formId: string }) {
  const router = useRouter();
  const { data: form, isLoading } = useAdmissionForm(formId);
  const {
    updateForm,
    createField,
    updateField,
    deleteField,
    reorderFields,
    createSection,
    updateSection,
    deleteSection,
  } = useFormMutations();

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'field' | 'settings'>('field');
  const [localFormState, setLocalFormState] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<any | null>(null);

  useEffect(() => {
    if (form) setLocalFormState(form);
  }, [form?.id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (isLoading || !form || !localFormState) {
    return (
      <ContentLayout title="Loading...">
        <div className="p-8 text-center text-muted-foreground">Loading form...</div>
      </ContentLayout>
    );
  }

  const allFields = (form.sections || []).flatMap((s: any) => s.fields ?? []);
  const selectedField = allFields.find((f: any) => f.id === selectedFieldId) || null;

  const handleAddField = async (fieldType: FormFieldType) => {
    let sectionId: string | null = null;
    let displayOrder = 0;

    if (form.sections && form.sections.length > 0) {
      const realSection = form.sections.find((s: any) => s.id !== 'unsectioned');
      if (realSection) {
        sectionId = realSection.id;
        displayOrder = (realSection.fields?.length ?? 0);
      }
    }

    if (!sectionId) {
      const section = await createSection.mutateAsync({
        formId,
        section: { title: 'General', display_order: 0 },
      });
      sectionId = section.id;
    }

    const fieldKey = `${fieldType}_${Date.now()}`;
    await createField.mutateAsync({
      formId,
      field: {
        section_id: sectionId,
        field_key: fieldKey,
        field_label: `New ${FIELD_TYPE_META[fieldType].label}`,
        field_type: fieldType,
        placeholder: null,
        help_text: null,
        is_required: false,
        display_order: displayOrder,
        min_length: null,
        max_length: null,
        min_value: null,
        max_value: null,
        pattern: null,
        options: hasOptions(fieldType) ? [] : null,
        condition: null,
        lead_field_map: null,
      },
    });
  };

  const hasOptions = (t: FormFieldType) => ['select', 'multi_select', 'radio'].includes(t);

  const handleFieldUpdate = async (fieldId: string, updates: Partial<AdmissionFormField>) => {
    await updateField.mutateAsync({ fieldId, updates });
  };

  const handleFieldDelete = async (fieldId: string) => {
    if (!confirm('Delete this field?')) return;
    await deleteField.mutateAsync(fieldId);
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  const handleAddSection = async () => {
    await createSection.mutateAsync({
      formId,
      section: {
        title: 'New Section',
        display_order: (form.sections?.length ?? 0),
      },
    });
  };

  const handleSectionTitleCommit = async (sectionId: string, nextTitle: string) => {
    const section = (form.sections || []).find((s: any) => s.id === sectionId);
    if (!section || section.title === nextTitle || !nextTitle.trim()) return;
    await updateSection.mutateAsync({
      sectionId,
      updates: { title: nextTitle.trim() },
    });
  };

  const handleSectionDescriptionCommit = async (
    sectionId: string,
    nextDescription: string
  ) => {
    const section = (form.sections || []).find((s: any) => s.id === sectionId);
    if (!section) return;
    const normalized = nextDescription.trim() === '' ? null : nextDescription.trim();
    if ((section.description ?? null) === normalized) return;
    await updateSection.mutateAsync({
      sectionId,
      updates: { description: normalized },
    });
  };

  const handleSectionDelete = (sectionId: string) => {
    const section = (form.sections || []).find((s: any) => s.id === sectionId);
    if (!section) return;
    setSectionToDelete(section);
  };

  const confirmSectionDelete = async () => {
    if (!sectionToDelete) return;
    const section = sectionToDelete;
    try {
      await deleteSection.mutateAsync(section.id);
      if (
        selectedFieldId &&
        section.fields?.some((f: any) => f.id === selectedFieldId)
      ) {
        setSelectedFieldId(null);
      }
      toast.success(`Section "${section.title}" deleted`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete section');
    } finally {
      setSectionToDelete(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fieldsInSection = allFields;
    const oldIndex = fieldsInSection.findIndex((f: any) => f.id === active.id);
    const newIndex = fieldsInSection.findIndex((f: any) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(fieldsInSection, oldIndex, newIndex);
    const updates = reordered.map((f: any, idx: number) => ({
      id: f.id,
      display_order: idx,
      section_id: f.section_id,
    }));
    await reorderFields.mutateAsync(updates);
  };

  const handleSaveSettings = async () => {
    if (!localFormState) {
      toast.error('Form not loaded yet');
      return;
    }
    const savePromise = updateForm.mutateAsync({
      formId,
      updates: {
        name: localFormState.name,
        description: localFormState.description,
        primary_color: localFormState.primary_color,
        logo_url: localFormState.logo_url,
        thank_you_title: localFormState.thank_you_title,
        thank_you_message: localFormState.thank_you_message,
        auto_whatsapp: localFormState.auto_whatsapp,
        allow_duplicate: localFormState.allow_duplicate,
        lead_source: localFormState.lead_source,
      },
    });
    // react-hot-toast's promise helper gives inline loading/success/error states
    await toast.promise(savePromise, {
      loading: 'Saving draft...',
      success: 'Draft saved',
      error: (err: any) => err?.message || 'Failed to save draft',
    });
  };

  const handlePublish = async () => {
    try {
      if (localFormState) {
        await updateForm.mutateAsync({
          formId,
          updates: {
            name: localFormState.name,
            description: localFormState.description,
            primary_color: localFormState.primary_color,
            logo_url: localFormState.logo_url,
            thank_you_title: localFormState.thank_you_title,
            thank_you_message: localFormState.thank_you_message,
            auto_whatsapp: localFormState.auto_whatsapp,
            allow_duplicate: localFormState.allow_duplicate,
            lead_source: localFormState.lead_source,
          },
        });
      }
      const publishPromise = updateForm.mutateAsync({
        formId,
        updates: { status: 'published' },
      });
      await toast.promise(publishPromise, {
        loading: 'Publishing...',
        success: 'Form published! Share the public link.',
        error: (err: any) => err?.message || 'Failed to publish',
      });
    } catch {
      /* toast.promise already surfaced the error */
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/apply/${form.slug}`;

    // Modern clipboard API (requires HTTPS or localhost).
    // On insecure origins navigator.clipboard is undefined — we fall back to
    // a temporary <textarea> + document.execCommand('copy'), which works
    // on most browsers even over plain HTTP dev servers.
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('execCommand copy returned false');
      }
      toast.success(`Public link copied\n${url}`);
    } catch (err) {
      console.error('[admission/forms] Copy link failed:', err);
      toast.error(`Could not copy. Link: ${url}`);
    }
  };

  return (
    <ContentLayout title={`Edit: ${form.name}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/settings/forms">Forms</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{form.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/admission/settings/forms')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              <Link2 className="h-4 w-4 mr-2" />
              Copy Link
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveSettings}>
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
            {form.status === 'published' ? (
              <Badge className="bg-green-100 text-green-700 px-3 py-1.5">Published</Badge>
            ) : (
              <Button size="sm" onClick={handlePublish}>
                <Send className="h-4 w-4 mr-2" />
                Publish
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Field palette */}
          <Card className="col-span-12 md:col-span-2">
            <CardContent className="pt-4">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Add Field
              </h3>
              <div className="space-y-1">
                {Object.entries(FIELD_TYPE_META).map(([type, meta]) => {
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => handleAddField(type as FormFieldType)}
                      className="w-full flex items-center gap-2 p-2 rounded text-xs hover:bg-muted transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Canvas */}
          <Card className="col-span-12 md:col-span-6">
            <CardContent className="pt-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{form.name}</h3>
                  <p className="text-xs text-muted-foreground">/apply/{form.slug}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSection}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Section
                </Button>
              </div>

              {(!form.sections || form.sections.length === 0) && allFields.length === 0 ? (
                <div className="border-2 border-dashed rounded-md p-8 text-center text-sm text-muted-foreground">
                  Click a field type on the left to start building
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={allFields.map((f: any) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-4">
                      {(form.sections || []).map((section: any) => (
                        <SectionBlock
                          key={section.id}
                          section={section}
                          selectedFieldId={selectedFieldId}
                          onSelectField={(id) => {
                            setSelectedFieldId(id);
                            setRightTab('field');
                          }}
                          onDeleteField={handleFieldDelete}
                          onTitleCommit={(title) =>
                            handleSectionTitleCommit(section.id, title)
                          }
                          onDescriptionCommit={(desc) =>
                            handleSectionDescriptionCommit(section.id, desc)
                          }
                          onDeleteSection={() => handleSectionDelete(section.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </CardContent>
          </Card>

          {/* Preview dialog (rendered outside canvas/palette) */}
          <FormPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            form={form as any}
          />

          {/* Confirm section deletion */}
          <AlertDialog
            open={!!sectionToDelete}
            onOpenChange={(open) => !open && setSectionToDelete(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete section?</AlertDialogTitle>
                <AlertDialogDescription>
                  {sectionToDelete && (
                    <>
                      You are about to delete{' '}
                      <span className="font-semibold text-foreground">
                        &quot;{sectionToDelete.title}&quot;
                      </span>
                      {sectionToDelete.fields?.length > 0 ? (
                        <>
                          {' '}and all{' '}
                          <span className="font-semibold text-foreground">
                            {sectionToDelete.fields.length} field
                            {sectionToDelete.fields.length === 1 ? '' : 's'}
                          </span>{' '}
                          inside it.
                        </>
                      ) : (
                        '.'
                      )}
                      <br />
                      This action cannot be undone.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteSection.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    // Prevent the default close-on-click — we close manually
                    // after the mutation resolves so users see loading state
                    e.preventDefault();
                    confirmSectionDelete();
                  }}
                  disabled={deleteSection.isPending}
                  className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
                >
                  {deleteSection.isPending ? 'Deleting...' : 'Delete section'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Right panel: Field config or Form settings */}
          <Card className="col-span-12 md:col-span-4">
            <CardContent className="pt-4">
              <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as 'field' | 'settings')}>
                <TabsList className="w-full">
                  <TabsTrigger value="field" className="flex-1">
                    Field
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="flex-1">
                    <SettingsIcon className="h-3.5 w-3.5 mr-1" />
                    Settings
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="field" className="mt-4">
                  {selectedField ? (
                    <FieldConfigPanel
                      field={selectedField}
                      onUpdate={(updates) => handleFieldUpdate(selectedField.id, updates)}
                      onDelete={() => handleFieldDelete(selectedField.id)}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Select a field on the canvas to edit
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="settings" className="mt-4">
                  <FormSettingsPanel
                    form={localFormState}
                    formId={formId}
                    onUpdate={(updates) =>
                      setLocalFormState((prev: any) => ({ ...prev, ...updates }))
                    }
                    onPersist={(updates) => {
                      // Fire the DB save immediately so uploaded asset URLs
                      // survive even if the user closes the tab before
                      // clicking Save Draft.
                      updateForm.mutate({ formId, updates });
                    }}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}

export default function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  return (
    <AdmissionErrorBoundary>
      <PermissionGuard module="admission" action="view">
        <FormBuilderContent formId={id} />
      </PermissionGuard>
    </AdmissionErrorBoundary>
  );
}
