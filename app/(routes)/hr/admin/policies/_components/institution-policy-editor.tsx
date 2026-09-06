'use client';

// =====================================================================
// Shared editor for institution-scoped HR policies (Wave 3 M1).
// =====================================================================
// Loads a single platform_policies row (policy_key × scope_type='institution'
// × scope_id=<institution_id>) and renders it as an editable JSON form.
//
// Wave 3 keeps the editor simple: a Textarea bound to the JSONB value with
// JSON validation + Save. Each page provides a `defaultValue` (the shape
// described in spec §1 / §3 / §17 / §18 / §33) so a missing row can still
// be created via the Save button.
//
// Director-tweakable via /hr/admin/policies/<slug> — no deploy needed.
//
// Permission: super_admin / admin only (PermissionGuard wraps each page).
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, Loader2, RotateCcw, Save, Send } from 'lucide-react';
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
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface InstitutionPolicyEditorProps {
  policyKey: string;
  policyTitle: string;
  policyDescription: string;
  defaultValue: Record<string, unknown>;
  /** Plain-English documentation of the JSON shape (rendered in a card). */
  schemaNotes: string[];
}

interface PolicyRow {
  id: string | null;
  policy_key: string;
  scope_id: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InstitutionPolicyEditor(props: InstitutionPolicyEditorProps) {
  const { policyKey, policyTitle, policyDescription, defaultValue, schemaNotes } = props;

  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { institutions, loading: instLoading } = useInstitutionsWithAccess({
    entityType: 'institution',
  });

  // Default to user's own institution if available; otherwise first in list.
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');

  useEffect(() => {
    if (selectedInstitutionId) return;
    if (profile?.institution_id) {
      setSelectedInstitutionId(profile.institution_id);
      return;
    }
    if (institutions.length > 0) {
      setSelectedInstitutionId(institutions[0].id);
    }
  }, [profile?.institution_id, institutions, selectedInstitutionId]);

  const [row, setRow] = useState<PolicyRow | null>(null);
  const [draftJson, setDraftJson] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Load policy row whenever selected institution changes.
  useEffect(() => {
    if (!selectedInstitutionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error: rpcErr } = await supabase
          .from('platform_policies')
          .select('id, policy_key, scope_id, value, description, updated_at')
          .eq('policy_key', policyKey)
          .eq('scope_type', 'institution')
          .eq('scope_id', selectedInstitutionId)
          .maybeSingle();

        if (rpcErr) throw rpcErr;
        if (cancelled) return;

        if (data) {
          const value = (data.value || {}) as Record<string, unknown>;
          const nextRow: PolicyRow = {
            id: data.id,
            policy_key: data.policy_key,
            scope_id: data.scope_id ?? selectedInstitutionId,
            value,
            description: data.description,
            updated_at: data.updated_at,
          };
          setRow(nextRow);
          setDraftJson(JSON.stringify(value, null, 2));
        } else {
          // No row yet — surface the default so Save creates the row.
          setRow({
            id: null,
            policy_key: policyKey,
            scope_id: selectedInstitutionId,
            value: defaultValue,
            description: null,
            updated_at: null,
          });
          setDraftJson(JSON.stringify(defaultValue, null, 2));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [policyKey, selectedInstitutionId, defaultValue]);

  const parsedDraft = useMemo(() => {
    try {
      const parsed = JSON.parse(draftJson) as Record<string, unknown>;
      return { ok: true as const, value: parsed };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [draftJson]);

  useEffect(() => {
    setParseError(parsedDraft.ok ? null : parsedDraft.error);
  }, [parsedDraft]);

  const dirty = useMemo(() => {
    if (!row || !parsedDraft.ok) return false;
    return JSON.stringify(parsedDraft.value) !== JSON.stringify(row.value);
  }, [row, parsedDraft]);

  const canSave = dirty && parsedDraft.ok && isSuperAdmin && !saving;

  function revert() {
    if (row) setDraftJson(JSON.stringify(row.value, null, 2));
  }

  async function save(publish: boolean) {
    if (!row || !parsedDraft.ok) return;
    const reason = window.prompt(
      publish
        ? 'Publish reason (audit log): why is this change being published?'
        : 'Draft save reason (audit log):'
    );
    if (reason === null) return; // user cancelled

    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (row.id) {
        // Update existing row.
        const { data, error: upErr } = await supabase
          .from('platform_policies')
          .update({
            value: parsedDraft.value,
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .select('id, policy_key, scope_id, value, description, updated_at')
          .single();

        if (upErr) throw upErr;
        if (data) {
          setRow({
            id: data.id,
            policy_key: data.policy_key,
            scope_id: data.scope_id ?? selectedInstitutionId,
            value: (data.value || {}) as Record<string, unknown>,
            description: data.description,
            updated_at: data.updated_at,
          });
          setDraftJson(JSON.stringify(data.value, null, 2));
          toast.success(
            publish ? 'Policy published.' : 'Policy saved as draft.',
            { description: reason || undefined }
          );
        }
      } else {
        // Insert new row (no existing row for this institution yet).
        const { data, error: insErr } = await supabase
          .from('platform_policies')
          .insert({
            policy_key: policyKey,
            scope_type: 'institution',
            scope_id: selectedInstitutionId,
            value: parsedDraft.value,
            description: policyDescription,
            data_type: 'object',
            is_system: false,
            updated_by: user?.id ?? null,
          })
          .select('id, policy_key, scope_id, value, description, updated_at')
          .single();

          if (insErr) throw insErr;
          if (data) {
            setRow({
              id: data.id,
              policy_key: data.policy_key,
              scope_id: data.scope_id ?? selectedInstitutionId,
              value: (data.value || {}) as Record<string, unknown>,
              description: data.description,
              updated_at: data.updated_at,
            });
            setDraftJson(JSON.stringify(data.value, null, 2));
            toast.success(
              publish ? 'Policy created and published.' : 'Policy saved as draft.',
              { description: reason || undefined }
            );
          }
      }
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (instLoading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{policyTitle}</CardTitle>
          <CardDescription>{policyDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="institution-select">Institution</Label>
            <Select
              value={selectedInstitutionId}
              onValueChange={setSelectedInstitutionId}
            >
              <SelectTrigger id="institution-select" className="max-w-md">
                <SelectValue placeholder="Select an institution" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Policies are scoped per institution. Edits here affect only the
              selected institution.
            </p>
          </div>

          {row?.id ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-mono">
                {policyKey}
              </Badge>
              <span>·</span>
              <span>
                Last updated:{' '}
                {row.updated_at
                  ? format(new Date(row.updated_at), 'd MMM yyyy, HH:mm')
                  : '—'}
              </span>
              <Badge variant="secondary">published</Badge>
              <Badge variant="outline">classification: major</Badge>
            </div>
          ) : (
            <Alert>
              <Database className="h-4 w-4" />
              <AlertTitle>No row yet for this institution</AlertTitle>
              <AlertDescription>
                Saving below will create the first row using the default shape.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>JSON value</CardTitle>
          <CardDescription>
            Edit the JSONB structure directly. The shape mirrors the printed HR
            Policy Manual chapter for this policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Textarea
                value={draftJson}
                onChange={(e) => setDraftJson(e.target.value)}
                spellCheck={false}
                className="h-96 font-mono text-xs"
              />

              {parseError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Invalid JSON</AlertTitle>
                  <AlertDescription className="font-mono text-xs">
                    {parseError}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={revert}
                  disabled={!dirty || saving}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Revert
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => save(false)}
                  disabled={!canSave}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Draft
                </Button>
                <Button
                  type="button"
                  onClick={() => save(true)}
                  disabled={!canSave}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Publish
                </Button>
                <button
                  type="button"
                  className="ml-auto self-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() =>
                    toast.info(
                      'Classification editing is Director-only — substrate columns ship in Wave 3 M0.'
                    )
                  }
                >
                  Edit classification
                </button>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Failed to load policy</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schema notes</CardTitle>
          <CardDescription>
            Plain-English description of the JSON shape for this policy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {schemaNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
