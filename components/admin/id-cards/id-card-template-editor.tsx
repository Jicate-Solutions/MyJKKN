'use client';

// ============================================================================
// IdCardTemplateEditor — template editor tabs.
// Created: 2026-05-07. Rewired: 2026-07-25.
//
// Tab 1: Card design — per-template artwork (IdCardDesignTab, live).
// Tab 2: Field mappings — per-template `field_mappings` jsonb on
//         id_card_templates, the SAME column the render engine reads
//         (parseFieldMappings in the render route). Served by
//         GET/PUT /api/id-cards/template/[id]/mappings.
//         The old /api/id-cards/template/mappings endpoints never existed —
//         the tab stubbed to defaults and its Save posted into the void.
//
// Photo fallback: the old tab was REMOVED — the fallback chain is hardcoded
// in lib/id-cards/render-data.ts (learner photo / team-member picture →
// profile avatar → printed initials); there is no editable substrate. A
// muted note below the tabs explains the fixed behaviour.
//
// Sides badge: GET /api/id-cards/policy?institution_id=<uuid>. The endpoint
// REQUIRES institution_id and wraps responses as { data: IdCardPolicy }, so
// sides lives at data.sides (the old top-level `json.sides` read plus the
// missing query param made the badge always claim "Single-sided").
// Fail-soft: any failure → 1.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';

import { LookupTable } from '@/lib/admin/policy-shell';
import type {
  LookupConfig,
  LookupColumn,
  FieldSchema,
  PolicyHandlers,
} from '@/lib/admin/policy-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchTemplatesWithLayout,
  type TemplateDesignRow,
} from '@/lib/services/id-cards/template-design-client';

import {
  CARD_FIELD_LABELS,
  DB_COLUMN_OPTIONS,
  type FieldMappingRow,
  type CardField,
} from '@/app/(routes)/admin/id-cards/_types';
import { IdCardDesignTab } from '@/components/admin/id-cards/id-card-design-tab';

// Display order for mapping rows = the order fields appear on the card.
const CARD_FIELD_ORDER = Object.keys(CARD_FIELD_LABELS) as CardField[];

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extract `sides` from a GET /api/id-cards/policy response body.
 * Envelope (lib/id-cards/responses.ts): { data: IdCardPolicy } — sides lives
 * at data.sides. Anything unexpected → 1 (fail-soft).
 */
export function parseSidesFromPolicyResponse(json: unknown): 1 | 2 {
  if (json && typeof json === 'object') {
    const data = (json as { data?: unknown }).data;
    if (data && typeof data === 'object' && (data as { sides?: unknown }).sides === 2) {
      return 2;
    }
  }
  return 1;
}

/**
 * Defensive parse of a GET /api/id-cards/template/[id]/mappings response body
 * into table rows (id = card_field — one mapping per field), sorted in card
 * order. Malformed entries are dropped, never thrown.
 */
export function toMappingRows(json: unknown): FieldMappingRow[] {
  const list =
    json && typeof json === 'object'
      ? (json as { data?: { mappings?: unknown } }).data?.mappings
      : undefined;
  if (!Array.isArray(list)) return [];
  const rows: FieldMappingRow[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const cf = (entry as Record<string, unknown>).card_field;
    const col = (entry as Record<string, unknown>).db_column;
    if (typeof cf !== 'string' || typeof col !== 'string') continue;
    if (!(CARD_FIELD_ORDER as readonly string[]).includes(cf)) continue;
    if (rows.some((r) => r.card_field === cf)) continue;
    rows.push({ id: cf, card_field: cf as CardField, db_column: col });
  }
  rows.sort(
    (a, b) =>
      CARD_FIELD_ORDER.indexOf(a.card_field) - CARD_FIELD_ORDER.indexOf(b.card_field)
  );
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────────────────────────────────────

async function errorMessageOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    if (typeof body?.error?.message === 'string') return body.error.message;
  } catch {
    // fall through to the generic message
  }
  return `HTTP ${res.status}`;
}

async function fetchSides(institutionId: string | null): Promise<1 | 2> {
  // The policy endpoint requires an institution scope. Without one (rare —
  // a couple of super_admin profiles have no institution_id) we fail soft
  // to the conservative single-sided default.
  if (!institutionId) return 1;
  try {
    const res = await fetch(
      `/api/id-cards/policy?institution_id=${encodeURIComponent(institutionId)}`
    );
    if (!res.ok) return 1;
    return parseSidesFromPolicyResponse(await res.json());
  } catch {
    return 1;
  }
}

async function fetchTemplateMappings(templateId: string): Promise<FieldMappingRow[]> {
  const res = await fetch(`/api/id-cards/template/${templateId}/mappings`);
  if (!res.ok) throw new Error(await errorMessageOf(res));
  return toMappingRows(await res.json());
}

async function putTemplateMappings(
  templateId: string,
  mappings: ReadonlyArray<{ card_field: CardField; db_column: string }>
): Promise<void> {
  const res = await fetch(`/api/id-cards/template/${templateId}/mappings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mappings }),
  });
  if (!res.ok) throw new Error(await errorMessageOf(res));
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
      options: CARD_FIELD_ORDER.map((f) => ({
        value: f,
        label: CARD_FIELD_LABELS[f],
      })),
    },
    {
      name: 'db_column',
      kind: 'enum',
      englishLabel: 'Database column',
      englishHint: "Which column from the learner's record to read the value from.",
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
      return 'This sets the primary photo source. If it has no image, the print engine automatically falls back to the profile avatar and finally to printed initials.';
    }
    return null;
  },
  formSchema: buildMappingFormSchema,
  addLabel: 'Add mapping',
  emptyMessage:
    'No field mappings configured for this template — cards print with the built-in defaults. Add a mapping to override a field.',
  entityNoun: 'Mapping',
};

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────
export function IdCardTemplateEditor() {
  const { profile, isLoading: authLoading } = useAuth();
  const [sides, setSides] = useState<1 | 2 | null>(null);
  const [templates, setTemplates] = useState<TemplateDesignRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');

  const institutionId = profile?.institution_id ?? null;

  // Sides badge — wait for auth to resolve (loading is NOT "no institution").
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    fetchSides(institutionId).then((value) => {
      if (!cancelled) setSides(value);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, institutionId]);

  // Template list for the mappings tab picker (session client, RLS applies).
  useEffect(() => {
    let cancelled = false;
    fetchTemplatesWithLayout()
      .then((rows) => {
        if (cancelled) return;
        setTemplates(rows);
        setSelectedId((prev) =>
          prev && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? '')
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[id-cards/template-editor] template list load failed:', err);
        setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Memoized so LookupTable's load effect doesn't re-fire every render.
  const mappingHandlers = useMemo<PolicyHandlers<FieldMappingRow>>(
    () => ({
      onLoad: () =>
        selectedId ? fetchTemplateMappings(selectedId) : Promise.resolve([]),
      onSave: async (values, editing) => {
        const cardField = String(values.card_field ?? '') as CardField;
        const dbColumn = String(values.db_column ?? '');
        const current = await fetchTemplateMappings(selectedId);
        if (!editing && current.some((m) => m.card_field === cardField)) {
          throw new Error(
            'That card field already has a mapping — edit the existing row instead.'
          );
        }
        const replacedField = editing ? editing.card_field : cardField;
        const next = current
          .filter((m) => m.card_field !== replacedField)
          .map((m) => ({ card_field: m.card_field, db_column: m.db_column }));
        next.push({ card_field: cardField, db_column: dbColumn });
        await putTemplateMappings(selectedId, next);
        return { id: cardField, card_field: cardField, db_column: dbColumn };
      },
      onDelete: async (row) => {
        const current = await fetchTemplateMappings(selectedId);
        const next = current
          .filter((m) => m.card_field !== row.card_field)
          .map((m) => ({ card_field: m.card_field, db_column: m.db_column }));
        await putTemplateMappings(selectedId, next);
      },
    }),
    [selectedId]
  );

  const selectedTemplate = templates?.find((t) => t.id === selectedId) ?? null;

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

      <Tabs defaultValue="design">
        <TabsList>
          <TabsTrigger value="design">Card design</TabsTrigger>
          <TabsTrigger value="mappings">Field mappings</TabsTrigger>
        </TabsList>

        <TabsContent value="design" className="mt-4">
          <div className="mb-3 text-sm text-muted-foreground">
            Give each template its own look: design the card artwork in Canva
            (or any tool), export it at 1014×638, and upload it here. Learner
            details print on top. No artwork = the standard green design.
          </div>
          <IdCardDesignTab />
        </TabsContent>

        <TabsContent value="mappings" className="mt-4">
          <div className="mb-3 text-sm text-muted-foreground">
            Each row maps one zone on the printed card (left column) to the
            learner record column that fills it (right column). Mappings are
            saved per template and take effect on the next card printed —
            previously printed cards are not affected.
          </div>

          {templates === null ? (
            <div className="py-6 text-sm text-muted-foreground">
              Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No templates exist yet. Templates are created when the first card
              is set up — once one exists, its field mappings are managed here.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">Template:</span>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {(t.name ?? 'Untitled template') +
                          (t.active ? '' : ' (inactive)')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTemplate && (
                <LookupTable
                  key={selectedId}
                  config={mappingConfig}
                  handlers={mappingHandlers}
                  newRowDefaults={{
                    card_field: 'name_line_1',
                    db_column: 'learners_profiles.first_name',
                  }}
                  rowToFormValues={(row) => ({
                    card_field: row.card_field,
                    db_column: row.db_column,
                  })}
                />
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Photo fallback: no editable substrate — the chain is fixed in the
          print engine (lib/id-cards/render-data.ts). Explains, no dead UI. */}
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Photo fallback: when a learner has no uploaded photo (or a team member
        has no profile picture), cards automatically fall back to the account
        avatar, and finally to printed initials. This order is fixed in the
        print engine today — an editing screen is planned.
      </div>
    </div>
  );
}
