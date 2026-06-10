'use client';

// ============================================================================
// NewPolicyEditor — institution-scoped JSONB policy editor for Wave 3 M8.
// ============================================================================
// Backs all 4 /hr/admin/policies/new/* pages. Extends the RdPolicyEditor
// pattern with two new field types needed for the M8 starter-draft content:
//   - 'string-list-managed' — bullet list with explicit add/remove/reorder
//                             buttons (used for permitted_uses, prohibited_uses,
//                             prohibited_posts, etc.)
//   - 'json-subtree'        — nested object editor; each sub-key becomes a
//                             child FieldSpec rendered inline (used for
//                             student_data_handling, eligibility_by_role, etc.)
//
// Also adds the "Draft Starter Content — Pending Director Review" banner that
// shows above the editor whenever publication_state === 'draft_only' for the
// selected institution (per Director lock R3-Q4 — these policies seed as
// starter drafts that Director must review and customize before publish).
//
// Save Draft / Publish / Edit Classification flow + mandatory-reason audit
// dialog match the RdPolicyEditor canon exactly.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Save, UploadCloud, Settings2, Loader2, Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAuth } from '@/hooks/use-auth';

// ---------------------------------------------------------------------------
// Field schema.
// ---------------------------------------------------------------------------
export type FieldType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'string-array' // comma-separated input
  | 'string-list-managed' // managed list with add/remove/reorder
  | 'enum'
  | 'json-subtree'; // nested object — child fields rendered inline

export interface FieldSpec {
  key: string;
  label: string;
  help?: string;
  type: FieldType;
  enumOptions?: string[];
  // For json-subtree only:
  children?: FieldSpec[];
}

interface PolicyRow {
  id: string;
  policy_key: string;
  scope_id: string;
  value: Record<string, unknown>;
  draft_value: Record<string, unknown> | null;
  classification: 'operational' | 'major';
  publication_state: 'draft_only' | 'published' | 'draft_pending';
  description: string | null;
  updated_at: string | null;
}

interface NewPolicyEditorProps {
  policyKey: string;
  fields: FieldSpec[];
}

// ---------------------------------------------------------------------------
// Coercion helpers.
// ---------------------------------------------------------------------------
function coerceFromForm(spec: FieldSpec, raw: unknown): unknown {
  switch (spec.type) {
    case 'number':
      return raw === '' || raw === null || raw === undefined ? null : Number(raw);
    case 'boolean':
      return Boolean(raw);
    case 'string-array':
      if (Array.isArray(raw)) return raw;
      return typeof raw === 'string'
        ? raw.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    case 'string-list-managed':
      return Array.isArray(raw) ? raw.filter((s) => typeof s === 'string') : [];
    case 'json-subtree':
      return raw && typeof raw === 'object' ? raw : {};
    default:
      return raw;
  }
}

function formatForInput(spec: FieldSpec, val: unknown): string {
  if (val === null || val === undefined) return '';
  switch (spec.type) {
    case 'string-array':
      return Array.isArray(val) ? val.join(', ') : String(val);
    case 'boolean':
      return val ? 'true' : 'false';
    default:
      return String(val);
  }
}

// ---------------------------------------------------------------------------
// Deep merge helper — overlay draft on top of value preserving nested keys.
// ---------------------------------------------------------------------------
function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      base[k] !== null &&
      typeof base[k] === 'object' &&
      !Array.isArray(base[k])
    ) {
      out[k] = deepMerge(
        base[k] as Record<string, unknown>,
        v as Record<string, unknown>
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main editor.
// ---------------------------------------------------------------------------
export function NewPolicyEditor({ policyKey, fields }: NewPolicyEditorProps) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const { profile } = useAuth();
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({ isActive: true });

  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formDraft, setFormDraft] = useState<Record<string, unknown>>({});

  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [pendingAction, setPendingAction] = useState<
    'save_draft' | 'publish' | 'classify_change' | null
  >(null);
  const [classifyTo, setClassifyTo] = useState<'operational' | 'major'>('major');
  const [saving, setSaving] = useState(false);

  const currentRow = useMemo(
    () => rows.find((r) => r.scope_id === selectedInstitutionId) ?? null,
    [rows, selectedInstitutionId]
  );

  const effectiveValue = useMemo(() => {
    if (!currentRow) return {} as Record<string, unknown>;
    const base =
      currentRow.draft_value && currentRow.publication_state !== 'published'
        ? currentRow.draft_value
        : currentRow.value;
    return deepMerge((base || {}) as Record<string, unknown>, formDraft);
  }, [currentRow, formDraft]);

  // -----------------------------------------------------------------------
  // Load rows.
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('platform_policies')
        .select('*')
        .eq('policy_key', policyKey)
        .eq('scope_type', 'institution');

      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      const safe = ((data ?? []) as unknown as PolicyRow[]).filter((r) => r.scope_id);
      setRows(safe);
      if (safe.length > 0 && !selectedInstitutionId) {
        setSelectedInstitutionId(safe[0].scope_id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyKey]);

  useEffect(() => {
    setFormDraft({});
  }, [selectedInstitutionId]);

  function handleFieldChange(field: FieldSpec, raw: unknown) {
    const coerced = coerceFromForm(field, raw);
    setFormDraft((d) => ({ ...d, [field.key]: coerced }));
  }

  function requestSaveDraft() {
    if (!currentRow) return;
    setPendingAction('save_draft');
    setReasonText('');
    setReasonDialogOpen(true);
  }

  function requestPublish() {
    if (!currentRow) return;
    setPendingAction('publish');
    setReasonText('');
    setReasonDialogOpen(true);
  }

  function requestClassify(next: 'operational' | 'major') {
    if (!currentRow) return;
    setClassifyTo(next);
    setPendingAction('classify_change');
    setReasonText('');
    setReasonDialogOpen(true);
  }

  async function confirmAction() {
    if (!currentRow || !pendingAction) return;
    if (!reasonText.trim()) {
      toast.error('Reason is required');
      return;
    }
    if (!profile?.id) {
      toast.error('Profile not loaded — cannot audit. Try again in a moment.');
      return;
    }
    setSaving(true);
    try {
      const updates: Partial<PolicyRow> = {};
      const auditAction = pendingAction;
      let oldValue: unknown = null;
      let newValue: unknown = null;

      if (pendingAction === 'save_draft') {
        const baseDraft = (currentRow.draft_value || currentRow.value || {}) as Record<
          string,
          unknown
        >;
        const merged = deepMerge(baseDraft, formDraft);
        updates.draft_value = merged;
        updates.publication_state = 'draft_pending';
        oldValue = currentRow.draft_value;
        newValue = merged;
      } else if (pendingAction === 'publish') {
        const base = (currentRow.draft_value || currentRow.value || {}) as Record<
          string,
          unknown
        >;
        const finalValue = deepMerge(base, formDraft);
        updates.value = finalValue;
        updates.draft_value = null;
        updates.publication_state = 'published';
        oldValue = currentRow.value;
        newValue = finalValue;
      } else if (pendingAction === 'classify_change') {
        updates.classification = classifyTo;
        oldValue = currentRow.classification;
        newValue = classifyTo;
      }

      const { error: updateErr } = await supabase
        .from('platform_policies')
        .update(updates)
        .eq('id', currentRow.id);
      if (updateErr) throw updateErr;

      const { error: auditErr } = await supabase.from('hr_policy_audit_log').insert({
        policy_id: currentRow.id,
        policy_key: currentRow.policy_key,
        scope_type: 'institution',
        scope_id: currentRow.scope_id,
        action: auditAction,
        old_value: oldValue,
        new_value: newValue,
        reason: reasonText.trim(),
        edited_by: profile.id,
      });
      if (auditErr) throw auditErr;

      const { data: refetched } = await supabase
        .from('platform_policies')
        .select('*')
        .eq('id', currentRow.id)
        .single();

      if (refetched) {
        setRows((rs) =>
          rs.map((r) => (r.id === currentRow.id ? (refetched as unknown as PolicyRow) : r))
        );
      }
      setFormDraft({});
      setReasonDialogOpen(false);
      setPendingAction(null);
      toast.success(
        pendingAction === 'save_draft'
          ? 'Draft saved'
          : pendingAction === 'publish'
            ? 'Published'
            : `Classification changed to ${classifyTo}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render.
  // -----------------------------------------------------------------------
  if (loading || institutionsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load policy</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (rows.length === 0) {
    return (
      <Alert>
        <AlertTitle>No rows seeded yet</AlertTitle>
        <AlertDescription>
          The migration <code>20260612_hr_new_policies_seeds.sql</code> must be applied
          before this page can show data. Once seeded, refresh.
        </AlertDescription>
      </Alert>
    );
  }

  const accessibleInstitutions = institutions.filter((i) =>
    rows.some((r) => r.scope_id === i.id)
  );

  const isStarterDraft = currentRow?.publication_state === 'draft_only';

  return (
    <div className="space-y-6">
      {/* Starter-draft banner — shows when the row is still in draft_only state. */}
      {isStarterDraft && (
        <Alert
          variant="default"
          className="border-amber-500/60 bg-amber-50 dark:bg-amber-950/30"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-900 dark:text-amber-200">
            Draft Starter Content — Pending Director Review
          </AlertTitle>
          <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
            This policy was seeded with industry-standard starter content
            (basis cited in <code>_meta.basis</code> on the row). It is NOT yet
            live for staff. Director and CAO should review every field, customize
            for JKKN, then click <strong>Publish</strong> to make it the
            institution&apos;s active policy.
          </AlertDescription>
        </Alert>
      )}

      {/* Institution selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Institution</CardTitle>
          <CardDescription>
            Pick the institution whose policy you want to edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedInstitutionId}
            onValueChange={(v) => setSelectedInstitutionId(v)}
          >
            <SelectTrigger className="w-full sm:w-96">
              <SelectValue placeholder="Pick an institution" />
            </SelectTrigger>
            <SelectContent>
              {accessibleInstitutions.length === 0
                ? rows.map((r) => (
                    <SelectItem key={r.scope_id} value={r.scope_id}>
                      {institutions.find((i) => i.id === r.scope_id)?.name ?? r.scope_id}
                    </SelectItem>
                  ))
                : accessibleInstitutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {currentRow && (
        <>
          {/* Status + classification */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">Status</CardTitle>
                  <CardDescription>
                    Current publication state and classification tier for this row.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">
                    state: {currentRow.publication_state}
                  </Badge>
                  <Badge
                    variant={
                      currentRow.classification === 'major' ? 'default' : 'secondary'
                    }
                  >
                    classification: {currentRow.classification}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground mr-2">
                Edit classification:
              </span>
              <Button
                variant={currentRow.classification === 'operational' ? 'default' : 'outline'}
                size="sm"
                onClick={() => requestClassify('operational')}
                disabled={saving || currentRow.classification === 'operational'}
              >
                <Settings2 className="mr-1 h-4 w-4" /> Operational
              </Button>
              <Button
                variant={currentRow.classification === 'major' ? 'default' : 'outline'}
                size="sm"
                onClick={() => requestClassify('major')}
                disabled={saving || currentRow.classification === 'major'}
              >
                <Settings2 className="mr-1 h-4 w-4" /> Major
              </Button>
            </CardContent>
          </Card>

          {/* Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policy fields</CardTitle>
              <CardDescription>
                Edit the values below. Save Draft stores changes without making them
                live. Publish makes them live.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {fields.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={effectiveValue[field.key]}
                  onChange={(raw) => handleFieldChange(field, raw)}
                />
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={requestSaveDraft}
              disabled={saving || Object.keys(formDraft).length === 0}
              variant="outline"
            >
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Save Draft
            </Button>
            <Button onClick={requestPublish} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="mr-1 h-4 w-4" />
              )}
              Publish
            </Button>
            <span className="ml-2 text-xs text-muted-foreground">
              All changes require a reason — recorded in the audit log.
            </span>
          </div>
        </>
      )}

      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction === 'save_draft'
                ? 'Save Draft'
                : pendingAction === 'publish'
                  ? 'Publish change'
                  : `Change classification to ${classifyTo}`}
            </DialogTitle>
            <DialogDescription>
              Enter a short reason. This goes into the audit log alongside the
              before/after values.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="e.g. Director approved updated GenAI prohibited list during 2026-Q2 review"
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReasonDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={confirmAction} disabled={saving || !reasonText.trim()}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldRow — render one editable field.
// ---------------------------------------------------------------------------
function FieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (raw: unknown) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[280px,1fr] sm:items-start">
      <div>
        <Label className="font-medium text-sm" htmlFor={`f-${field.key}`}>
          {field.label}
        </Label>
        {field.help && (
          <p className="text-xs text-muted-foreground mt-1">{field.help}</p>
        )}
      </div>
      <div>
        {field.type === 'boolean' ? (
          <BooleanInput field={field} value={value} onChange={onChange} />
        ) : field.type === 'enum' ? (
          <EnumInput field={field} value={value} onChange={onChange} />
        ) : field.type === 'number' ? (
          <Input
            id={`f-${field.key}`}
            type="number"
            step="any"
            value={formatForInput(field, value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full sm:w-60"
          />
        ) : field.type === 'string-list-managed' ? (
          <ManagedListInput
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={onChange}
          />
        ) : field.type === 'json-subtree' ? (
          <SubtreeInput field={field} value={value} onChange={onChange} />
        ) : (
          <Input
            id={`f-${field.key}`}
            type="text"
            value={formatForInput(field, value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full"
          />
        )}
      </div>
    </div>
  );
}

function BooleanInput({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (raw: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`f-${field.key}`}
        checked={Boolean(value)}
        onCheckedChange={(c) => onChange(Boolean(c))}
      />
      <Label htmlFor={`f-${field.key}`} className="text-sm">
        {value ? 'Yes' : 'No'}
      </Label>
    </div>
  );
}

function EnumInput({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (raw: unknown) => void;
}) {
  return (
    <Select value={String(value ?? '')} onValueChange={(v) => onChange(v)}>
      <SelectTrigger id={`f-${field.key}`} className="w-full sm:w-72">
        <SelectValue placeholder="Pick a value" />
      </SelectTrigger>
      <SelectContent>
        {field.enumOptions?.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// ManagedListInput — add / remove / reorder a list of strings.
// ---------------------------------------------------------------------------
function ManagedListInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [newItem, setNewItem] = useState('');

  function update(next: string[]) {
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {value.length === 0 && (
          <li className="text-xs italic text-muted-foreground">No items yet.</li>
        )}
        {value.map((item, idx) => (
          <li key={`${idx}-${item.slice(0, 16)}`} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => {
                const next = [...value];
                next[idx] = e.target.value;
                update(next);
              }}
              className="flex-1"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                if (idx === 0) return;
                const next = [...value];
                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                update(next);
              }}
              disabled={idx === 0}
              aria-label="Move up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                if (idx === value.length - 1) return;
                const next = [...value];
                [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                update(next);
              }}
              disabled={idx === value.length - 1}
              aria-label="Move down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => update(value.filter((_, i) => i !== idx))}
              aria-label="Remove"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add a new item…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newItem.trim()) {
              e.preventDefault();
              update([...value, newItem.trim()]);
              setNewItem('');
            }
          }}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (newItem.trim()) {
              update([...value, newItem.trim()]);
              setNewItem('');
            }
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubtreeInput — render an object's sub-fields inline.
// ---------------------------------------------------------------------------
function SubtreeInput({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const safeValue = (value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}) as Record<string, unknown>;

  if (!field.children || field.children.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        (No editable sub-fields configured.)
      </p>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-4">
      {field.children.map((child) => (
        <FieldRow
          key={child.key}
          field={child}
          value={safeValue[child.key]}
          onChange={(raw) => {
            const coerced = coerceFromForm(child, raw);
            onChange({ ...safeValue, [child.key]: coerced });
          }}
        />
      ))}
    </div>
  );
}
