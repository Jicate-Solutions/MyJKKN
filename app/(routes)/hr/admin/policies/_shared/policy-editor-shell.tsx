'use client';

// =====================================================================
// Wave 3 W3-M2 — shared editor shell for the 3 HR policy admin pages.
// =====================================================================
// Mirrors /admin/telephony-policies/page.tsx pattern but adds:
//   - Institution selector at top (policies are scope=institution per
//     Director lock 2026-05-15)
//   - Save Draft / Publish flow (writes to draft_value / value)
//   - Mandatory reason for every save (logged to hr_policy_audit_log)
//   - Edit Classification flow (Director-only)
//
// W3-M0 dependency:
//   - platform_policies.classification, draft_value, publication_state
//   - hr_policy_audit_log table
//
// Each consuming page passes a render-prop that knows how to draw the
// JSONB shape's editable form. The shell handles the lifecycle.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, RotateCcw, Save, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyRow<V> {
  id: string;
  policy_key: string;
  scope_type: string;
  scope_id: string | null;
  value: V;
  draft_value: V | null;
  publication_state: 'published' | 'draft_only' | 'draft_pending';
  classification: 'operational' | 'major';
  description: string | null;
  updated_at: string | null;
}

interface InstitutionOption {
  id: string;
  name: string;
}

export interface PolicyEditorShellProps<V> {
  policyKey: string;
  pageTitle: string;
  pageBlurb: string;
  defaultValue: V;
  // Render-prop: draws the editable form from current working value.
  renderEditor: (
    workingValue: V,
    onChange: (next: V) => void,
    disabled: boolean,
  ) => React.ReactNode;
  // Parser: hardens a freshly-loaded JSONB value into the typed shape.
  parseValue: (raw: unknown) => V;
}

// Raw row shape including W3-M0 columns (classification, draft_value,
// publication_state). Generated Supabase types in this branch do not yet
// know about those columns — they ship in 20260601_hr_policy_substrate_extensions.
// We cast at the seam rather than maintaining a parallel type file.
interface RawPolicyPolicy {
  id: string;
  policy_key: string;
  scope_type: string;
  scope_id: string | null;
  value: unknown;
  draft_value: unknown | null;
  publication_state: string | null;
  classification: string | null;
  description: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function PolicyEditorShell<V>(props: PolicyEditorShellProps<V>) {
  const { policyKey, pageTitle, pageBlurb, defaultValue, renderEditor, parseValue } = props;
  const { isSuperAdmin, userProfile } = usePermissions();
  // CAO (admin role) may edit rows where classification='operational';
  // super_admin (Director) may edit any classification. Use legacy
  // profile.role for the admin signal — matches /admin/* convention.
  const isAdminRole = userProfile?.role === 'admin';

  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const [row, setRow] = useState<PolicyRow<V> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draftValue, setDraftValue] = useState<V | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Load institution list once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClientSupabaseClient();
      const { data, error: instErr } = await supabase
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      if (instErr) {
        setError(`Failed to load institutions: ${instErr.message}`);
        setLoading(false);
        return;
      }
      const opts = (data || []) as InstitutionOption[];
      setInstitutions(opts);
      if (opts.length > 0 && !selectedInstitutionId) {
        setSelectedInstitutionId(opts[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRow = useCallback(
    async (institutionId: string) => {
      setLoading(true);
      setError(null);
      setDraftValue(null);
      setReason('');
      try {
        const supabase = createClientSupabaseClient();
        const { data: rawData, error: rpcErr } = await supabase
          .from('platform_policies')
          .select('*')
          .eq('policy_key', policyKey)
          .eq('scope_type', 'institution')
          .eq('scope_id', institutionId)
          .maybeSingle();
        if (rpcErr) throw rpcErr;
        const data = rawData as unknown as RawPolicyPolicy | null;
        if (data) {
          setRow({
            id: data.id,
            policy_key: data.policy_key,
            scope_type: data.scope_type,
            scope_id: data.scope_id,
            value: parseValue(data.value),
            draft_value: data.draft_value ? parseValue(data.draft_value) : null,
            publication_state:
              (data.publication_state as PolicyRow<V>['publication_state']) ?? 'published',
            classification:
              (data.classification as PolicyRow<V>['classification']) ?? 'major',
            description: data.description,
            updated_at: data.updated_at,
          });
        } else {
          setRow(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [policyKey, parseValue],
  );

  // Reload when institution changes.
  useEffect(() => {
    if (!selectedInstitutionId) return;
    loadRow(selectedInstitutionId);
  }, [selectedInstitutionId, loadRow]);

  // Determine the working value: draft (if user has touched fields) >
  // existing draft_value > published value > defaultValue
  const workingValue: V = useMemo(() => {
    if (draftValue !== null) return draftValue;
    if (row?.draft_value) return row.draft_value;
    if (row?.value) return row.value;
    return defaultValue;
  }, [draftValue, row, defaultValue]);

  const canEditClassification = isSuperAdmin;
  const canEdit =
    row !== null &&
    (canEditClassification ||
      (isAdminRole && row.classification === 'operational'));

  const dirty = draftValue !== null;
  const reasonOk = reason.trim().length >= 5;
  const canSave = canEdit && dirty && reasonOk && !saving;

  function revert() {
    setDraftValue(null);
    setReason('');
  }

  async function persistDraft({ publish }: { publish: boolean }) {
    if (!row || !dirty) return;
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const updatePayload: Record<string, unknown> = {
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (publish) {
        // Publish: copy draft → value, clear draft, mark published.
        updatePayload.value = draftValue;
        updatePayload.draft_value = null;
        updatePayload.publication_state = 'published';
      } else {
        // Save Draft: stash in draft_value, mark pending if value already exists.
        updatePayload.draft_value = draftValue;
        updatePayload.publication_state = 'draft_pending';
      }

      // Cast through unknown — W3-M0 columns (draft_value etc.) not yet in
      // the generated Supabase types in this branch.
      const updateBuilder = supabase
        .from('platform_policies')
        .update(updatePayload as never)
        .eq('id', row.id)
        .select('*')
        .single();
      const { data: rawData, error: upErr } = await updateBuilder;
      if (upErr) throw upErr;
      const data = rawData as unknown as RawPolicyPolicy | null;

      // Best-effort audit log (W3-M0 substrate ships hr_policy_audit_log).
      // Cast supabase to any: table not in generated types yet.
      try {
        const supabaseAny = supabase as unknown as {
          from: (table: string) => {
            insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
          };
        };
        await supabaseAny.from('hr_policy_audit_log').insert({
          policy_id: row.id,
          policy_key: row.policy_key,
          scope_type: row.scope_type,
          scope_id: row.scope_id,
          action: publish ? 'publish' : 'edit_draft',
          old_value: row.value as unknown,
          new_value: draftValue as unknown,
          reason: reason.trim(),
          edited_by: user?.id ?? null,
        });
      } catch (auditErr) {
        // Don't fail the save if audit table is not yet migrated.
        console.warn('[hr-policy] audit insert skipped:', auditErr);
      }

      if (data) {
        setRow({
          id: data.id,
          policy_key: data.policy_key,
          scope_type: data.scope_type,
          scope_id: data.scope_id,
          value: parseValue(data.value),
          draft_value: data.draft_value ? parseValue(data.draft_value) : null,
          publication_state:
            (data.publication_state as PolicyRow<V>['publication_state']) ?? 'published',
          classification:
            (data.classification as PolicyRow<V>['classification']) ?? 'major',
          description: data.description,
          updated_at: data.updated_at,
        });
        setDraftValue(null);
        setReason('');
        toast.success(publish ? 'Published.' : 'Draft saved.');
      }
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function setClassification(next: 'operational' | 'major') {
    if (!row || !canEditClassification) return;
    if (next === row.classification) return;
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: upErr } = await supabase
        .from('platform_policies')
        .update({ classification: next, updated_by: user?.id ?? null } as never)
        .eq('id', row.id);
      if (upErr) throw upErr;
      try {
        const supabaseAny = supabase as unknown as {
          from: (table: string) => {
            insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
          };
        };
        await supabaseAny.from('hr_policy_audit_log').insert({
          policy_id: row.id,
          policy_key: row.policy_key,
          scope_type: row.scope_type,
          scope_id: row.scope_id,
          action: 'classify_change',
          old_value: { classification: row.classification },
          new_value: { classification: next },
          reason: `Classification changed to ${next}`,
          edited_by: user?.id ?? null,
        });
      } catch (auditErr) {
        console.warn('[hr-policy] audit insert skipped:', auditErr);
      }
      setRow({ ...row, classification: next });
      toast.success(`Classification set to ${next}.`);
    } catch (e) {
      toast.error(`Reclassify failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>{pageTitle}</AlertTitle>
        <AlertDescription>{pageBlurb}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Institution</CardTitle>
          <CardDescription>
            Per Director lock (2026-05-15): every policy is per-institution. Pick the
            institution whose configuration you want to edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedInstitutionId ?? ''}
            onValueChange={(v) => setSelectedInstitutionId(v)}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose an institution…" />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {error && !loading && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load policy</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && !row && selectedInstitutionId && (
        <Alert>
          <Database className="h-4 w-4" />
          <AlertTitle>Policy not seeded for this institution</AlertTitle>
          <AlertDescription>
            <code>{policyKey}</code> has no row for the selected institution. Run
            migration <code>20260603_hr_roles_academic_seeds.sql</code>.
          </AlertDescription>
        </Alert>
      )}

      {!loading && !error && row && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Policy editor</CardTitle>
                <CardDescription>
                  Key: <code className="text-xs">{row.policy_key}</code> ·
                  Last updated:{' '}
                  {row.updated_at ? format(new Date(row.updated_at), 'MMM d, HH:mm') : '—'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={row.publication_state === 'published' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {row.publication_state}
                </Badge>
                <Badge
                  variant={row.classification === 'major' ? 'destructive' : 'outline'}
                  className="text-xs"
                >
                  {row.classification}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {renderEditor(
              workingValue,
              (next) => setDraftValue(next),
              !canEdit || saving,
            )}

            {row.description && (
              <p className="text-xs text-muted-foreground border-t pt-4">
                {row.description}
              </p>
            )}

            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="reason">
                Reason for change <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Mandatory: explain why you are making this change (min 5 chars). Logged in hr_policy_audit_log."
                rows={2}
                disabled={!canEdit || saving}
              />
              {dirty && !reasonOk && (
                <p className="text-xs text-destructive">
                  Reason must be at least 5 characters.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              {canEditClassification ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs">Classification:</Label>
                  <Select
                    value={row.classification}
                    onValueChange={(v) =>
                      setClassification(v as 'operational' | 'major')
                    }
                    disabled={saving}
                  >
                    <SelectTrigger className="h-8 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="major">major (Director only)</SelectItem>
                      <SelectItem value="operational">operational (CAO ok)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Classification: {row.classification}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={revert}
                  disabled={!dirty || saving}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Revert
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => persistDraft({ publish: false })}
                  disabled={!canSave}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {saving ? 'Saving…' : 'Save Draft'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => persistDraft({ publish: true })}
                  disabled={!canSave}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Publish
                </Button>
              </div>
            </div>

            {!canEdit && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You can view this policy but only{' '}
                  <strong>
                    {row.classification === 'major'
                      ? 'super_admin'
                      : 'super_admin or admin'}
                  </strong>{' '}
                  can edit. Contact the Director to request a change.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
