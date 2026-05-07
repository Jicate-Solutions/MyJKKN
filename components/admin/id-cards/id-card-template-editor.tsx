'use client';

// ============================================================================
// IdCardTemplateEditor — Two-tab template editor.
// Created: 2026-05-07.
//
// Tab 1: Field Mappings — LookupTable (Shape C) — card-field → db-column.
// Tab 2: Photo Fallback — CascadeStepList (Shape A) — ordered fallback chain.
//
// Reads sides from GET /api/id-cards/policy (stubs to 1 on 404).
// Reads mappings from GET /api/id-cards/template (stubs to defaults on 404).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Info } from 'lucide-react';

import { LookupTable, CascadeStepList } from '@/lib/admin/policy-shell';
import type {
  LookupConfig,
  LookupColumn,
  CascadeConfig,
  CascadeStepView,
  FieldSchema,
  PolicyHandlers,
} from '@/lib/admin/policy-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

import {
  CARD_FIELD_LABELS,
  DB_COLUMN_OPTIONS,
  type FieldMappingRow,
  type PhotoFallbackStep,
  type CardField,
} from '@/app/(routes)/admin/id-cards/_types';

// ──────────────────────────────────────────────────────────────────────────────
// Stub data — used when Agent C's routes are not live yet
// ──────────────────────────────────────────────────────────────────────────────
const STUB_FIELD_MAPPINGS: FieldMappingRow[] = [
  { id: '1', card_field: 'name_line_1', db_column: 'students.full_name' },
  { id: '2', card_field: 'roll_number', db_column: 'students.roll_number' },
  { id: '3', card_field: 'course', db_column: 'students.course_id' },
  { id: '4', card_field: 'department', db_column: 'students.department_id' },
  { id: '5', card_field: 'valid_until', db_column: 'students.valid_until' },
  { id: '6', card_field: 'qr_code', db_column: 'students.id' },
  { id: '7', card_field: 'photo', db_column: 'students.photo_url' },
];

const STUB_PHOTO_FALLBACK: PhotoFallbackStep[] = [
  {
    id: '1',
    sort_order: 1,
    label: 'Student uploaded photo',
    source: 'students.photo_url',
    is_active: true,
  },
  {
    id: '2',
    sort_order: 2,
    label: 'Placeholder silhouette',
    source: 'system:placeholder',
    is_active: true,
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Fetch helpers — stub on 404/error
// ──────────────────────────────────────────────────────────────────────────────
async function fetchFieldMappings(): Promise<FieldMappingRow[]> {
  try {
    const res = await fetch('/api/id-cards/template/mappings');
    if (res.ok) return res.json();
    return STUB_FIELD_MAPPINGS;
  } catch {
    return STUB_FIELD_MAPPINGS;
  }
}

async function fetchPhotoFallback(): Promise<PhotoFallbackStep[]> {
  try {
    const res = await fetch('/api/id-cards/template/photo-fallback');
    if (res.ok) return res.json();
    return STUB_PHOTO_FALLBACK;
  } catch {
    return STUB_PHOTO_FALLBACK;
  }
}

async function fetchSides(): Promise<1 | 2> {
  try {
    const res = await fetch('/api/id-cards/policy');
    if (res.ok) {
      const json = await res.json();
      return json?.sides === 2 ? 2 : 1;
    }
    return 1;
  } catch {
    return 1;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Field Mappings — LookupConfig<FieldMappingRow>
// ──────────────────────────────────────────────────────────────────────────────
function buildMappingFormSchema(
  editing: FieldMappingRow | null,
): ReadonlyArray<FieldSchema> {
  return [
    {
      name: 'card_field',
      kind: 'enum',
      englishLabel: 'Card field',
      englishHint: 'Which zone on the printed card this data appears in.',
      required: true,
      disabled: !!editing, // can't change the card field on an existing mapping
      options: (Object.keys(CARD_FIELD_LABELS) as CardField[]).map((f) => ({
        value: f,
        label: CARD_FIELD_LABELS[f],
      })),
    },
    {
      name: 'db_column',
      kind: 'enum',
      englishLabel: 'Database column',
      englishHint: 'Which column from the students table to read the value from.',
      required: true,
      options: DB_COLUMN_OPTIONS,
    },
  ];
}

const mappingColumns: ReadonlyArray<LookupColumn<FieldMappingRow>> = [
  {
    header: 'Card field',
    widthClass: 'w-56',
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">
          {CARD_FIELD_LABELS[row.card_field] ?? row.card_field}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {row.card_field}
        </span>
      </div>
    ),
  },
  {
    header: 'Populated from',
    cell: (row) => (
      <span className="font-mono text-sm text-muted-foreground">
        {row.db_column}
      </span>
    ),
  },
];

const mappingConfig: LookupConfig<FieldMappingRow> = {
  title: 'Field Mappings',
  explainer: null,
  columns: mappingColumns,
  rowHint: (row) => {
    if (row.card_field === 'photo') {
      return 'Photo source is also governed by the Photo Fallback tab. This mapping sets the primary source; the fallback tab adds alternatives.';
    }
    return null;
  },
  formSchema: buildMappingFormSchema,
  addLabel: 'Add mapping',
  emptyMessage: 'No field mappings configured. Add a mapping to start printing cards.',
  entityNoun: 'Mapping',
};

function buildMappingHandlers(
  reload: () => void,
): PolicyHandlers<FieldMappingRow> {
  return {
    onLoad: fetchFieldMappings,
    onSave: async (values) => {
      const res = await fetch('/api/id-cards/template/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      reload();
      return res.json();
    },
    onDelete: async (row) => {
      const res = await fetch(`/api/id-cards/template/mappings/${row.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Photo Fallback — CascadeConfig<PhotoFallbackStep>
// ──────────────────────────────────────────────────────────────────────────────
function buildFallbackFormSchema(): ReadonlyArray<FieldSchema> {
  return [
    {
      name: 'label',
      kind: 'text',
      englishLabel: 'Step label',
      englishHint:
        'Plain-English name for this fallback source. Shown in the admin UI only.',
      placeholder: 'e.g. Student uploaded photo',
      required: true,
    },
    {
      name: 'source',
      kind: 'text',
      englishLabel: 'Source identifier',
      englishHint:
        'Either a database column path (e.g. students.photo_url) or a system key (e.g. system:placeholder).',
      placeholder: 'students.photo_url',
      required: true,
    },
    {
      name: 'sort_order',
      kind: 'number',
      englishLabel: 'Step order',
      englishHint:
        'Lower numbers are tried first. Step 1 is the primary source; the last step is the last resort.',
      min: 1,
      step: 1,
      required: true,
    },
    {
      name: 'is_active',
      kind: 'toggle',
      englishLabel: 'Active?',
      englishHint: 'When off, this fallback step is skipped.',
    },
  ];
}

function renderFallbackStep(row: PhotoFallbackStep): CascadeStepView {
  return {
    title: `Step ${row.sort_order}: ${row.label}`,
    explanation: `Try to find a photo using: ${row.source}`,
    metaLines: [
      row.source.startsWith('system:')
        ? 'Built-in source'
        : `Column: ${row.source}`,
    ],
    isActive: row.is_active,
  };
}

const fallbackConfig: CascadeConfig<PhotoFallbackStep> = {
  title: 'Photo Fallback Chain',
  explainer: null,
  orderBy: 'sort_order',
  groupBy: null,
  groupTitleFor: () => '',
  renderStep: renderFallbackStep,
  formSchema: buildFallbackFormSchema,
  addLabel: 'Add fallback step',
  emptyMessage:
    'No photo fallback steps configured. Add at least one step (e.g., a placeholder silhouette) to ensure every card prints.',
  entityNoun: 'Fallback step',
};

function buildFallbackHandlers(): PolicyHandlers<PhotoFallbackStep> {
  return {
    onLoad: fetchPhotoFallback,
    onSave: async (values, editing) => {
      const method = editing ? 'PATCH' : 'POST';
      const url = editing
        ? `/api/id-cards/template/photo-fallback/${editing.id}`
        : '/api/id-cards/template/photo-fallback';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onDelete: async (row) => {
      const res = await fetch(
        `/api/id-cards/template/photo-fallback/${row.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onToggle: async (row, _field, next) => {
      const res = await fetch(
        `/api/id-cards/template/photo-fallback/${row.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: next }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────
export function IdCardTemplateEditor() {
  const [sides, setSides] = useState<1 | 2 | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    fetchSides().then(setSides);
  }, []);

  const triggerReload = useCallback(() => {
    setReloadTick((t) => t + 1);
  }, []);

  const mappingHandlers = buildMappingHandlers(triggerReload);
  const fallbackHandlers = buildFallbackHandlers();

  return (
    <div className="space-y-4">
      {/* Sides indicator */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          Printer configured as:
        </span>
        {sides === null ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : sides === 2 ? (
          <Badge variant="secondary">Double-sided</Badge>
        ) : (
          <Badge variant="outline">Single-sided</Badge>
        )}
        {sides === 1 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            Back layout not used — change in Printer Policy to enable it.
          </span>
        )}
      </div>

      <Tabs defaultValue="mappings">
        <TabsList>
          <TabsTrigger value="mappings">Field mappings</TabsTrigger>
          <TabsTrigger value="photo-fallback">Photo fallback</TabsTrigger>
        </TabsList>

        <TabsContent value="mappings" className="mt-4">
          <div className="mb-3 text-sm text-muted-foreground">
            Each row maps one zone on the printed card (left column) to the
            student record column that fills it (right column). Changing a
            mapping takes effect on the next batch of cards printed — previously
            printed cards are not affected.
          </div>
          <LookupTable
            key={`mappings-${reloadTick}`}
            config={mappingConfig}
            handlers={mappingHandlers}
            newRowDefaults={{ card_field: 'name_line_1', db_column: 'students.full_name' }}
            rowToFormValues={(row) => ({
              card_field: row.card_field,
              db_column: row.db_column,
            })}
          />
        </TabsContent>

        <TabsContent value="photo-fallback" className="mt-4">
          <div className="mb-3 text-sm text-muted-foreground">
            When a student doesn&apos;t have a photo at the primary source, MyJKKN
            tries each step below in order. The first step that finds a photo
            wins. Steps marked &quot;Off&quot; are skipped. Drag-reorder by editing the
            step number.
          </div>
          <CascadeStepList
            config={fallbackConfig}
            handlers={fallbackHandlers}
            newRowDefaults={{
              label: '',
              source: '',
              sort_order: 3,
              is_active: true,
            }}
            rowToFormValues={(row) => ({
              label: row.label,
              source: row.source,
              sort_order: row.sort_order,
              is_active: row.is_active,
            })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
