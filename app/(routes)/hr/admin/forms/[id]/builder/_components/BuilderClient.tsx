/**
 * BuilderClient — interactive two-pane drag-drop form builder.
 *
 * Wave 3 M9 follow-up. Director-lock R5-Q1: every widget type from
 * WidgetType is offered in the palette.
 *
 * Layout:
 *   - Left:  palette of 10 widget types. Click adds to canvas; drag from
 *            palette also adds (via DndContext).
 *   - Mid:   canvas — sortable list of widgets currently on the form. Each
 *            widget renders via WidgetRenderer in readOnly preview mode.
 *   - Right: edit panel for the currently selected widget (label, required,
 *            conditional logic, options, etc).
 *
 * Save Draft / Publish call into formBuilderService through a thin server
 * action. Reasons are captured for the audit trail.
 */
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import {
  GripVertical,
  Trash2,
  Plus,
  Save,
  Rocket,
  CheckSquare,
  CircleDot,
  Calendar,
  FileText,
  Hash,
  ListChecks,
  PenLine,
  Type,
  Upload,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WidgetRenderer } from '@/components/hr/forms/widgets';
import type {
  Widget,
  WidgetType,
  ConditionalExpression,
} from '@/types/hr-forms';

import { saveDraftAction, publishAction } from '../actions';

// ---------------------------------------------------------------------------
// Palette definitions
// ---------------------------------------------------------------------------

interface PaletteItem {
  type: WidgetType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PALETTE: PaletteItem[] = [
  { type: 'text', label: 'Short text', icon: Type },
  { type: 'textarea', label: 'Long text', icon: FileText },
  { type: 'number', label: 'Number', icon: Hash },
  { type: 'date', label: 'Date', icon: Calendar },
  { type: 'dropdown', label: 'Dropdown', icon: ListChecks },
  { type: 'radio', label: 'Radio (single choice)', icon: CircleDot },
  { type: 'checkbox', label: 'Checkbox (multi)', icon: CheckSquare },
  { type: 'file_upload', label: 'File upload', icon: Upload },
  { type: 'signature', label: 'Signature', icon: PenLine },
  { type: 'conditional', label: 'Conditional branch', icon: Workflow },
];

function emptyWidget(type: WidgetType): Widget {
  const id = `w_${crypto.randomUUID().slice(0, 8)}`;
  const base = { id, label: `New ${type.replace('_', ' ')}`, required: false };
  switch (type) {
    case 'text':
      return { ...base, type, placeholder: '' };
    case 'textarea':
      return { ...base, type, rows: 4 };
    case 'number':
      return { ...base, type };
    case 'date':
      return { ...base, type };
    case 'dropdown':
      return {
        ...base,
        type,
        options: [{ value: 'opt1', label: 'Option 1' }],
      };
    case 'radio':
      return {
        ...base,
        type,
        options: [{ value: 'opt1', label: 'Option 1' }],
      };
    case 'checkbox':
      return {
        ...base,
        type,
        options: [{ value: 'opt1', label: 'Option 1' }],
      };
    case 'file_upload':
      return { ...base, type, max_size_mb: 10, multiple: false };
    case 'signature':
      return { ...base, type };
    case 'conditional':
      return {
        ...base,
        type,
        expression: { field_id: '', operator: 'eq', value: '' },
        true_widget: { id: `${id}_t`, label: 'Yes branch', type: 'text' },
      };
  }
}

// ---------------------------------------------------------------------------
// Builder client
// ---------------------------------------------------------------------------

interface BuilderClientProps {
  formId: string;
  formTitle: string;
  initialSchema: Widget[];
  isPublished: boolean;
  hasDraft: boolean;
}

export function BuilderClient({
  formId,
  formTitle,
  initialSchema,
  isPublished,
  hasDraft,
}: BuilderClientProps) {
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>(initialSchema);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const selected = useMemo(
    () => widgets.find((w) => w.id === selectedId) ?? null,
    [widgets, selectedId],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Preview value map keyed by widget id; the canvas runs readOnly so this
  // stays empty — but allows visible_when to evaluate without crashing.
  const previewValues: Record<string, unknown> = {};

  function addWidget(type: WidgetType) {
    const w = emptyWidget(type);
    setWidgets((prev) => [...prev, w]);
    setSelectedId(w.id);
  }

  function updateWidget(next: Widget) {
    setWidgets((prev) => prev.map((w) => (w.id === next.id ? next : w)));
  }

  function deleteWidget(id: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = widgets.findIndex((w) => w.id === active.id);
    const newIdx = widgets.findIndex((w) => w.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setWidgets((prev) => arrayMove(prev, oldIdx, newIdx));
  }

  async function handleSaveDraft() {
    const reason = window.prompt(
      'Brief note for the audit trail (e.g. "added reimbursement fields")',
    );
    if (!reason?.trim()) return;
    setSaving(true);
    try {
      const res = await saveDraftAction(formId, widgets, reason);
      if (!res.ok) throw new Error(res.error);
      toast.success('Draft saved');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (widgets.length === 0) {
      toast.error('Add at least one widget before publishing');
      return;
    }
    const reason = window.prompt(
      'Reason for publishing (audit trail)',
    );
    if (!reason?.trim()) return;
    setPublishing(true);
    try {
      // Save draft first so publish picks up the latest in-memory state.
      const saveRes = await saveDraftAction(formId, widgets, reason);
      if (!saveRes.ok) throw new Error(saveRes.error);
      const pubRes = await publishAction(formId, reason);
      if (!pubRes.ok) throw new Error(pubRes.error);
      toast.success('Form published');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{formTitle}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={isPublished ? 'default' : 'outline'}>
              {isPublished ? 'Published' : 'Unpublished'}
            </Badge>
            {hasDraft ? <Badge variant="secondary">Unpublished draft</Badge> : null}
            <span>{widgets.length} widget(s)</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
          >
            <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={saving || publishing}
          >
            <Rocket className="mr-1.5 h-4 w-4" />{' '}
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      </div>

      {/* Three-pane workspace */}
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* Palette */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Widget palette</CardTitle>
            <CardDescription className="text-xs">
              Click to add to the canvas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {PALETTE.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.type}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => addWidget(item.type)}
                  data-testid={`palette-${item.type}`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </CardContent>
        </Card>

        {/* Canvas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Form canvas</CardTitle>
            <CardDescription className="text-xs">
              Drag to reorder. Click a widget to edit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {widgets.length === 0 ? (
              <div className="rounded border-2 border-dashed py-12 text-center text-sm text-muted-foreground">
                <Plus className="mx-auto mb-2 h-6 w-6" />
                Add widgets from the palette to start building.
              </div>
            ) : (
              <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={widgets.map((w) => w.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {widgets.map((w) => (
                      <SortableCanvasItem
                        key={w.id}
                        widget={w}
                        previewValues={previewValues}
                        selected={selectedId === w.id}
                        onSelect={() => setSelectedId(w.id)}
                        onDelete={() => deleteWidget(w.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>

        {/* Edit panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Edit widget</CardTitle>
            <CardDescription className="text-xs">
              {selected
                ? `Selected: ${selected.label || selected.type}`
                : 'Select a widget on the canvas'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selected ? (
              <WidgetEditPanel
                widget={selected}
                otherWidgets={widgets.filter((w) => w.id !== selected.id)}
                onChange={updateWidget}
              />
            ) : (
              <p className="text-xs text-muted-foreground">No selection.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable canvas item
// ---------------------------------------------------------------------------

interface SortableCanvasItemProps {
  widget: Widget;
  previewValues: Record<string, unknown>;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SortableCanvasItem({
  widget,
  previewValues,
  selected,
  onSelect,
  onDelete,
}: SortableCanvasItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-card p-3 ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
      data-widget-id={widget.id}
      data-widget-type={widget.type}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
          aria-label="Reorder widget"
        >
          <GripVertical className="h-4 w-4" />
          <Badge variant="outline" className="text-[10px] uppercase">
            {widget.type}
          </Badge>
        </button>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSelect}
            className="h-7 text-xs"
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-7 text-destructive hover:text-destructive"
            aria-label="Delete widget"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="pointer-events-none opacity-90">
        <WidgetRenderer widget={widget} values={previewValues} readOnly />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit panel
// ---------------------------------------------------------------------------

interface WidgetEditPanelProps {
  widget: Widget;
  otherWidgets: Widget[];
  onChange: (next: Widget) => void;
}

function WidgetEditPanel({
  widget,
  otherWidgets,
  onChange,
}: WidgetEditPanelProps) {
  function patch<T extends Widget>(p: Partial<T>) {
    onChange({ ...(widget as T), ...p } as Widget);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Field label</Label>
        <Input
          value={widget.label}
          onChange={(e) => patch({ label: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Help text</Label>
        <Textarea
          rows={2}
          value={widget.help_text ?? ''}
          onChange={(e) => patch({ help_text: e.target.value })}
        />
      </div>

      <div className="flex items-center justify-between rounded border px-3 py-2">
        <div>
          <Label className="text-xs font-medium">Required field</Label>
          <p className="text-[11px] text-muted-foreground">
            Submitter cannot skip this question
          </p>
        </div>
        <Switch
          checked={widget.required ?? false}
          onCheckedChange={(v) => patch({ required: v })}
        />
      </div>

      {/* Per-widget config */}
      {widget.type === 'text' || widget.type === 'textarea' ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Placeholder</Label>
          <Input
            value={widget.placeholder ?? ''}
            onChange={(e) =>
              patch<typeof widget>({ placeholder: e.target.value } as never)
            }
          />
        </div>
      ) : null}

      {(widget.type === 'dropdown' ||
        widget.type === 'radio' ||
        widget.type === 'checkbox') && (
        <OptionsEditor
          options={widget.options}
          onChange={(opts) => patch({ options: opts } as never)}
        />
      )}

      {widget.type === 'file_upload' ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Max size (MB)</Label>
          <Input
            type="number"
            min={1}
            value={widget.max_size_mb ?? 10}
            onChange={(e) =>
              patch({ max_size_mb: Number(e.target.value) } as never)
            }
          />
          <div className="mt-2 flex items-center justify-between rounded border px-3 py-2">
            <Label className="text-xs">Allow multiple files</Label>
            <Switch
              checked={widget.multiple ?? false}
              onCheckedChange={(v) => patch({ multiple: v } as never)}
            />
          </div>
        </div>
      ) : null}

      {/* Conditional visibility (visible_when) for every widget */}
      <ConditionalEditor
        title="Show only when…"
        expression={widget.visible_when}
        otherWidgets={otherWidgets}
        onChange={(expr) => patch({ visible_when: expr })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Options editor (dropdown / radio / checkbox)
// ---------------------------------------------------------------------------

interface OptionsEditorProps {
  options: Array<{ value: string; label: string }>;
  onChange: (next: Array<{ value: string; label: string }>) => void;
}

function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Options</Label>
      {options.map((opt, idx) => (
        <div key={idx} className="flex gap-1.5">
          <Input
            placeholder="Label"
            value={opt.label}
            onChange={(e) => {
              const next = [...options];
              next[idx] = { ...opt, label: e.target.value };
              onChange(next);
            }}
          />
          <Input
            placeholder="value"
            className="w-24"
            value={opt.value}
            onChange={(e) => {
              const next = [...options];
              next[idx] = { ...opt, value: e.target.value };
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(options.filter((_, i) => i !== idx))}
            aria-label="Remove option"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...options,
            { value: `opt${options.length + 1}`, label: `Option ${options.length + 1}` },
          ])
        }
        className="w-full"
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add option
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conditional logic editor
// ---------------------------------------------------------------------------

interface ConditionalEditorProps {
  title: string;
  expression?: ConditionalExpression;
  otherWidgets: Widget[];
  onChange: (next: ConditionalExpression | undefined) => void;
}

function ConditionalEditor({
  title,
  expression,
  otherWidgets,
  onChange,
}: ConditionalEditorProps) {
  const enabled = Boolean(expression);
  return (
    <div className="space-y-2 rounded border px-3 py-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{title}</Label>
        <Switch
          checked={enabled}
          onCheckedChange={(v) =>
            v
              ? onChange({
                  field_id: otherWidgets[0]?.id ?? '',
                  operator: 'eq',
                  value: '',
                })
              : onChange(undefined)
          }
        />
      </div>
      {enabled && expression ? (
        <div className="space-y-1.5">
          <Select
            value={expression.field_id}
            onValueChange={(v) =>
              onChange({ ...expression, field_id: v })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Pick a field" />
            </SelectTrigger>
            <SelectContent>
              {otherWidgets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.label || w.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1.5">
            <Select
              value={expression.operator}
              onValueChange={(v) =>
                onChange({
                  ...expression,
                  operator: v as ConditionalExpression['operator'],
                })
              }
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eq">equals</SelectItem>
                <SelectItem value="neq">not equals</SelectItem>
                <SelectItem value="gt">greater</SelectItem>
                <SelectItem value="lt">less than</SelectItem>
                <SelectItem value="gte">≥</SelectItem>
                <SelectItem value="lte">≤</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-8 text-xs"
              value={String(expression.value ?? '')}
              onChange={(e) => onChange({ ...expression, value: e.target.value })}
              placeholder="value"
            />
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Field is always shown
        </p>
      )}
    </div>
  );
}
