'use client';

// =====================================================================
// /admin/telephony-policies — Director's zero-deploy telephony config UI
// =====================================================================
// Standing rule (2026-04-29): every policy decision = config-table row +
// super_admin UI. Edits land in `platform_policies` and the next call
// ingest reads them. No deploy, no PR, no developer round-trip.
//
// Backed by:
//   - Table:    public.platform_policies
//   - Helper:   public.fn_get_policy(text, text, uuid)
//   - Consumer: lib/services/telephony/call-pipeline-service.ts
//
// Policy keys surfaced on this page:
//   1. telephony.exovoice.config — { tasks: string[], categories: string[] }
//      (ExoVoiceAnalyze submission tasks + call classification taxonomy)
//   2. (future) telephony.cdr_sync.config — Agent 3 will add this in a
//      sister PR. Section is stubbed below for clarity.
//
// Permission: super_admin / admin only (PermissionGuard).
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, Plus, RotateCcw, Save, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { POLICY_KEYS } from '@/lib/policies/keys';
import { usePermissions } from '@/hooks/use-permissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExoVoiceConfig {
  tasks: string[];
  categories: string[];
}

interface PolicyRow {
  id: string;
  policy_key: string;
  value: ExoVoiceConfig;
  description: string | null;
  updated_at: string | null;
}

// ExoVoiceAnalyze tasks Exotel currently supports — checkbox set, not
// free-form (Exotel's API rejects unknown tasks). Keep in sync with
// vendor docs if Exotel adds more.
const EXOVOICE_TASK_OPTIONS = [
  'transcript',
  'summarization',
  'sentiment',
  'categorise',
] as const;

// ---------------------------------------------------------------------------
// Page wrapper — gated by PermissionGuard.
// ---------------------------------------------------------------------------
export default function TelephonyPoliciesPage() {
  return (
    <PermissionGuard module="users" action="manage">
      <ContentLayout title="Telephony Policies">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'Telephony Policies' },
          ]}
        />
        <TelephonyPoliciesContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Content — loads the row, lets super_admin edit, persists on Save.
// ---------------------------------------------------------------------------
function TelephonyPoliciesContent() {
  const { isSuperAdmin } = usePermissions();
  const [row, setRow] = useState<PolicyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drafts — only set when the user has touched a field; un-touched
  // fields render the server values.
  const [draftTasks, setDraftTasks] = useState<string[] | null>(null);
  const [draftCategories, setDraftCategories] = useState<string[] | null>(null);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error: rpcErr } = await supabase
          .from('platform_policies')
          .select('id, policy_key, value, description, updated_at')
          .eq('policy_key', POLICY_KEYS.TELEPHONY_EXOVOICE_CONFIG)
          .eq('scope_type', 'global')
          .is('scope_id', null)
          .maybeSingle();

        if (rpcErr) throw rpcErr;
        if (cancelled) return;

        if (data) {
          // PostgREST returns JSONB as parsed JS object.
          const value = (data.value || {}) as Partial<ExoVoiceConfig>;
          setRow({
            id: data.id,
            policy_key: data.policy_key,
            value: {
              tasks: Array.isArray(value.tasks) ? value.tasks : [],
              categories: Array.isArray(value.categories) ? value.categories : [],
            },
            description: data.description,
            updated_at: data.updated_at,
          });
        } else {
          setRow(null);
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
  }, []);

  const tasks = draftTasks ?? row?.value.tasks ?? [];
  const categories = draftCategories ?? row?.value.categories ?? [];

  const dirty = useMemo(() => {
    if (!row) return false;
    if (draftTasks && !arraysEqual(draftTasks, row.value.tasks)) return true;
    if (draftCategories && !arraysEqual(draftCategories, row.value.categories)) return true;
    return false;
  }, [row, draftTasks, draftCategories]);

  const canSave = dirty && tasks.length > 0 && isSuperAdmin && !saving;

  function toggleTask(task: string) {
    const next = tasks.includes(task) ? tasks.filter((t) => t !== task) : [...tasks, task];
    setDraftTasks(next);
  }

  function addCategory() {
    const v = newCategoryInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v) return;
    if (categories.includes(v)) {
      toast.info(`"${v}" is already in the list.`);
      return;
    }
    setDraftCategories([...categories, v]);
    setNewCategoryInput('');
  }

  function removeCategory(c: string) {
    setDraftCategories(categories.filter((x) => x !== c));
  }

  function revert() {
    setDraftTasks(null);
    setDraftCategories(null);
    setNewCategoryInput('');
  }

  async function save() {
    if (!row) return;
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const newValue: ExoVoiceConfig = { tasks, categories };
      const { data, error: upErr } = await supabase
        .from('platform_policies')
        .update({
          value: newValue, // supabase-js JSON-encodes for JSONB column
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .select('id, policy_key, value, description, updated_at')
        .single();

      if (upErr) throw upErr;
      if (data) {
        const value = (data.value || {}) as Partial<ExoVoiceConfig>;
        setRow({
          id: data.id,
          policy_key: data.policy_key,
          value: {
            tasks: Array.isArray(value.tasks) ? value.tasks : [],
            categories: Array.isArray(value.categories) ? value.categories : [],
          },
          description: data.description,
          updated_at: data.updated_at,
        });
        setDraftTasks(null);
        setDraftCategories(null);
        toast.success('Telephony policy updated.');
      }
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load telephony policies</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!row) {
    return (
      <Alert className="mt-6">
        <Database className="h-4 w-4" />
        <AlertTitle>Telephony policy not seeded</AlertTitle>
        <AlertDescription>
          The <code>{POLICY_KEYS.TELEPHONY_EXOVOICE_CONFIG}</code> row is
          missing in <code>platform_policies</code>. Run the migration{' '}
          <code>20260503022300_telephony_exovoice_config_policy.sql</code> to
          seed it.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>Zero-deploy telephony tweaks</AlertTitle>
        <AlertDescription>
          Edit ExoVoiceAnalyze tasks (which analyses Exotel runs on each
          recorded call) and categories (the call classification taxonomy)
          here. The next call submission picks up the new value &mdash; no
          deploy, no PR, no developer round-trip.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>ExoVoiceAnalyze configuration</CardTitle>
          <CardDescription>
            Policy key: <code className="text-xs">{row.policy_key}</code>{' '}
            &middot; Last updated:{' '}
            {row.updated_at ? format(new Date(row.updated_at), 'MMM d, HH:mm') : '—'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* TASKS — fixed checkbox set */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Tasks</h3>
              <p className="text-xs text-muted-foreground">
                Which analyses ExoVoiceAnalyze runs on every answered call.
                Exotel currently supports these four — uncheck to disable.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EXOVOICE_TASK_OPTIONS.map((task) => {
                const checked = tasks.includes(task);
                const id = `task-${task}`;
                return (
                  <label
                    key={task}
                    htmlFor={id}
                    className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      disabled={!isSuperAdmin || saving}
                      onCheckedChange={() => toggleTask(task)}
                    />
                    <span className="text-sm font-mono">{task}</span>
                  </label>
                );
              })}
            </div>
            {tasks.length === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  At least one task must be enabled or ExoVoiceAnalyze
                  submissions will fail.
                </AlertDescription>
              </Alert>
            )}
          </section>

          {/* CATEGORIES — chip input */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Categories</h3>
              <p className="text-xs text-muted-foreground">
                Call classification taxonomy. Exotel routes each transcript
                into one of these buckets. Add or remove freely &mdash; lower-snake-case
                is normalised on add.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Badge key={c} variant="secondary" className="pr-1 text-sm">
                  <span className="font-mono">{c}</span>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => removeCategory(c)}
                      disabled={saving}
                      className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                      aria-label={`Remove ${c}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No categories configured.
                </p>
              )}
            </div>
            {isSuperAdmin && (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Add new category (e.g. hostel_inquiry)"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                  disabled={saving}
                  className="max-w-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addCategory}
                  disabled={saving || !newCategoryInput.trim()}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            )}
          </section>

          {/* DESCRIPTION (read-only) */}
          {row.description && (
            <p className="text-xs text-muted-foreground border-t pt-4">
              {row.description}
            </p>
          )}

          {/* ACTIONS */}
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={revert}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Revert
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSave}
              onClick={save}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>

          {!isSuperAdmin && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You can view telephony policies but only{' '}
                <strong>super_admin</strong> can edit them. Contact the
                Director to request a change.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
