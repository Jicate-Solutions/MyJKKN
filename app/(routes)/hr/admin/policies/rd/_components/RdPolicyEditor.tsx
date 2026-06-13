'use client';

// ============================================================================
// RdPolicyEditor — institution-scoped JSONB policy editor for Wave 3 R&D pages.
// ============================================================================
// Backs all 5 /hr/admin/policies/rd/* pages. Each page parameterizes:
//   - policyKey      (e.g. 'hr.rd.publication_incentives')
//   - title + explainer (plain-English Director-friendly)
//   - fields         (the JSONB field schema — drives the form widgets)
//
// What the editor does:
//   1. Fetch all rows of (policy_key, scope_type='institution') and the
//      list of institutions the user has access to.
//   2. Render an institution selector + the row's `value` (or `draft_value`
//      if publication_state='draft_pending'/'draft_only').
//   3. Save Draft  → update `draft_value`, set publication_state='draft_pending',
//                    insert audit row (action='edit_draft', reason required).
//      Publish     → copy `draft_value` into `value`, clear `draft_value`,
//                    set publication_state='published',
//                    insert audit row (action='publish', reason required).
//      Classify    → toggle `classification`, insert audit row
//                    (action='classify_change', reason required).
//
// Permission gating is provided by the page-level <PermissionGuard>.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Save, UploadCloud, Settings2, Loader2 } from 'lucide-react';
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
// Field schema — describes a single editable JSONB key.
// ---------------------------------------------------------------------------
export type FieldType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'string-array' // newline-separated entry, or comma in UI
  | 'object-papers-patents' // { papers: number, patents: number }
  | 'enum';

export interface FieldSpec {
  key: string;
  label: string;
  help?: string;
  type: FieldType;
  enumOptions?: string[]; // for type='enum'
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

interface RdPolicyEditorProps {
  policyKey: string;
  fields: FieldSpec[];
  /** Optional per-institution variant — when set, only show these fields for that institution */
  perInstitutionFieldOverrides?: Record<string, FieldSpec[]>;
}

// ---------------------------------------------------------------------------
// Helpers — read/write field with type coercion.
// ---------------------------------------------------------------------------
function coerceFromForm(spec: FieldSpec, raw: string | boolean | string[]): unknown {
  switch (spec.type) {
    case 'number':
      return raw === '' ? null : Number(raw);
    case 'boolean':
      return Boolean(raw);
    case 'string-array':
      if (Array.isArray(raw)) return raw;
      return typeof raw === 'string'
        ? raw.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    case 'object-papers-patents': {
      // raw is a string like "papers=3,patents=1"
      if (typeof raw !== 'string') return raw;
      const result = { papers: 0, patents: 0 };
      raw.split(',').forEach((pair) => {
        const [k, v] = pair.split('=').map((s) => s.trim());
        if (k === 'papers' || k === 'patents') result[k] = Number(v) || 0;
      });
      return result;
    }
    default:
      return raw;
  }
}

function formatForInput(spec: FieldSpec, val: unknown): string {
  if (val === null || val === undefined) return '';
  switch (spec.type) {
    case 'string-array':
      return Array.isArray(val) ? val.join(', ') : String(val);
    case 'object-papers-patents': {
      const obj = val as { papers?: number; patents?: number };
      return `papers=${obj?.papers ?? 0},patents=${obj?.patents ?? 0}`;
    }
    case 'boolean':
      return val ? 'true' : 'false';
    default:
      return String(val);
  }
}

// ---------------------------------------------------------------------------
// Main editor component.
// ---------------------------------------------------------------------------
export function RdPolicyEditor({
  policyKey,
  fields,
  perInstitutionFieldOverrides,
}: RdPolicyEditorProps) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const { profile } = useAuth();
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({ isActive: true });

  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Draft form values keyed by field.key — only set when user touches a field.
  const [formDraft, setFormDraft] = useState<Record<string, unknown>>({});

  // Reason dialog state.
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

  // Determine which field set to render — institution-aware override or default.
  const activeFields = useMemo(() => {
    if (
      perInstitutionFieldOverrides &&
      currentRow &&
      perInstitutionFieldOverrides[currentRow.scope_id]
    ) {
      return perInstitutionFieldOverrides[currentRow.scope_id];
    }
    return fields;
  }, [fields, perInstitutionFieldOverrides, currentRow]);

  // Derived effective value — overlay draft (if any) over published value.
  const effectiveValue = useMemo(() => {
    if (!currentRow) return {};
    const base =
      currentRow.draft_value && currentRow.publication_state !== 'published'
        ? currentRow.draft_value
        : currentRow.value;
    return { ...(base || {}), ...formDraft };
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
        .select(
          'id, policy_key, scope_id, value, draft_value, classification, publication_state, description, updated_at'
        )
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

  // Reset formDraft when institution changes.
  useEffect(() => {
    setFormDraft({});
  }, [selectedInstitutionId]);

  // -----------------------------------------------------------------------
  // Field change handler.
  // -----------------------------------------------------------------------
  function handleFieldChange(field: FieldSpec, raw: string | boolean | string[]) {
    const coerced = coerceFromForm(field, raw);
    setFormDraft((d) => ({ ...d, [field.key]: coerced }));
  }

  // -----------------------------------------------------------------------
  // Persist actions — open reason dialog first.
  // -----------------------------------------------------------------------
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
        const merged = { ...currentRow.value, ...currentRow.draft_value, ...formDraft };
        updates.draft_value = merged as Record<string, unknown>;
        updates.publication_state = 'draft_pending';
        oldValue = currentRow.draft_value;
        newValue = merged;
      } else if (pendingAction === 'publish') {
        const finalValue = {
          ...currentRow.value,
          ...currentRow.draft_value,
          ...formDraft,
        };
        updates.value = finalValue as Record<string, unknown>;
        updates.draft_value = null;
        updates.publication_state = 'published';
        oldValue = currentRow.value;
        newValue = finalValue;
      } else if (pendingAction === 'classify_change') {
        updates.classification = classifyTo;
        oldValue = currentRow.classification;
        newValue = classifyTo;
      }

      // 1. UPDATE platform_policies row.
      const { error: updateErr } = await supabase
        .from('platform_policies')
        .update(updates)
        .eq('id', currentRow.id);
      if (updateErr) throw updateErr;

      // 2. INSERT into hr_policy_audit_log.
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

      // 3. Refetch row.
      const { data: refetched } = await supabase
        .from('platform_policies')
        .select(
          'id, policy_key, scope_id, value, draft_value, classification, publication_state, description, updated_at'
        )
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
          The migration <code>20260604_hr_rd_seeds.sql</code> must be applied before this
          page can show data. Once seeded, refresh.
        </AlertDescription>
      </Alert>
    );
  }

  const accessibleInstitutions = institutions.filter((i) =>
    rows.some((r) => r.scope_id === i.id)
  );

  return (
    <div className="space-y-6">
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
          {/* Status + classification controls */}
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
              {activeFields.map((field) => (
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

      {/* Reason dialog */}
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
            placeholder="e.g. Director approved updated WFH cap during 2026-Q2 review"
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
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
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
  onChange: (raw: string | boolean | string[]) => void;
}) {
  const displayValue = formatForInput(field, value);

  return (
    <div className="grid gap-2 sm:grid-cols-[260px,1fr] sm:items-start">
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
        ) : field.type === 'enum' ? (
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
        ) : field.type === 'number' ? (
          <Input
            id={`f-${field.key}`}
            type="number"
            step="any"
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full sm:w-60"
          />
        ) : (
          <Input
            id={`f-${field.key}`}
            type="text"
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full"
          />
        )}
      </div>
    </div>
  );
}
