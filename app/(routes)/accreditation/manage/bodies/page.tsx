// app/(routes)/accreditation/manage/bodies/page.tsx
// ============================================================================
// /accreditation/manage/bodies — which awarding bodies exist, and which apply
// to which institution.
//
// This screen exists because the mapping is a POLICY DECISION THAT CHANGES. A
// college may take up a new body; a body may be created that nobody has heard
// of today — five of the fifteen below did not exist in this system on the
// morning of 2026-08-06. Per docs/architecture/config-table-pattern.md every
// such value gets a row and an admin UI, never a hardcoded list, so neither
// half needs a deploy to change.
//
// TWO PANELS, TWO QUESTIONS, deliberately not merged:
//   Registry  — what bodies exist at all. Cluster-wide.
//   Mapping   — which of them a given campus answers to. Institution-scoped.
// One combined grid would invite editing the cluster registry while thinking
// about one college.
//
// Both tables arrive with migration 20260816010000, APPLIED to production
// 2026-08-06. The not-provisioned branch below is kept rather than removed: if
// the read ever fails, the page says the register is not provisioned yet
// rather than rendering an empty registry as "there are no awarding bodies".
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Landmark, Building2, Loader2, X } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import {
  AccreditationBodyService,
  type AccreditationBodyRecord,
  type AccreditationBodyKind,
} from '@/lib/services/accreditation/accreditation-body-service';
import { useInstitutionBodyMappings } from '@/hooks/accreditation/use-institution-bodies';

const KIND_LABELS: Record<AccreditationBodyKind, string> = {
  indian_regulator: 'Indian regulator',
  international_ranking: 'International ranking',
  school_board: 'School board',
};

const REGISTRY_KEY = ['accreditation', 'body-registry'] as const;

interface InstitutionRow {
  id: string;
  name: string;
}

/**
 * The campuses this viewer may edit. Read through
 * `_user_accessible_institutions()` rather than from `institutions` directly:
 * that table carries a blanket `USING (true)` select policy, so offering every
 * campus would let a viewer pick one whose mapping RLS then silently refuses —
 * and an empty result would render as "this college answers to nobody", which
 * is a factual claim this page must never make on the strength of a denial.
 */
function useEditableInstitutions() {
  return useQuery({
    queryKey: ['institutions', 'body-mapping-desk'],
    queryFn: async (): Promise<InstitutionRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data: allowedIds, error: allowedError } = await sb.rpc(
        '_user_accessible_institutions',
      );
      if (allowedError) throw allowedError;
      const ids = (allowedIds ?? []) as string[];
      if (ids.length === 0) return [];
      const { data, error } = await sb
        .from('institutions')
        .select('id, name')
        .in('id', ids)
        .order('name');
      if (error) throw error;
      return (data ?? []) as InstitutionRow[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

function useBodyRegistry() {
  return useQuery({
    queryKey: REGISTRY_KEY,
    queryFn: () => AccreditationBodyService.listBodies(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// ----------------------------------------------------------------------------
function BodyFormDialog({
  open, onOpenChange, mode, entity,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'create' | 'edit';
  entity?: AccreditationBodyRecord;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState(entity?.code ?? '');
  const [name, setName] = useState(entity?.name ?? '');
  const [shortName, setShortName] = useState(entity?.short_name ?? '');
  const [kind, setKind] = useState<AccreditationBodyKind>(
    (entity?.kind as AccreditationBodyKind) ?? 'indian_regulator',
  );
  const [sourceUrl, setSourceUrl] = useState(entity?.source_url ?? '');
  const [notes, setNotes] = useState(entity?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create' && !/^[A-Za-z][A-Za-z0-9_-]{1,15}$/.test(code.trim())) {
      toast.error('Code must be 2–16 letters, digits, dashes or underscores, starting with a letter.');
      return;
    }
    if (name.trim().length < 3) {
      toast.error('Name must be at least 3 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'edit' && entity) {
        await AccreditationBodyService.updateBody(entity.code, {
          name,
          short_name: shortName.trim() || null,
          kind,
          source_url: sourceUrl.trim() || null,
          notes: notes.trim() || null,
        });
        toast.success('Awarding body updated.');
      } else {
        await AccreditationBodyService.createBody({
          code,
          name,
          short_name: shortName.trim() || null,
          kind,
          source_url: sourceUrl.trim() || null,
          notes: notes.trim() || null,
        });
        toast.success('Awarding body created. It has no metrics defined yet.');
      }
      qc.invalidateQueries({ queryKey: REGISTRY_KEY });
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? `Edit ${entity?.code}` : 'New awarding body'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Code *</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="NCAHP"
                maxLength={16}
                disabled={mode === 'edit'}
              />
              {mode === 'edit' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  The code is referenced by evidence, committees, submissions
                  and the metric catalogue, so it cannot be renamed here.
                </p>
              )}
            </div>
            <div>
              <Label>Short label</Label>
              <Input
                value={shortName ?? ''}
                onChange={(e) => setShortName(e.target.value)}
                maxLength={32}
              />
            </div>
          </div>
          <div>
            <Label>Full name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AccreditationBodyKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as AccreditationBodyKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Official website</Label>
            <Input
              value={sourceUrl ?? ''}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Why this body was added, and anything still to confirm."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'edit' ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
function AccessDenied() {
  return (
    <ContentLayout title="Awarding Bodies">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">
            You do not have access to this page
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Which awarding bodies a college answers to decides which metrics it
            is measured against, so editing it is limited to the people who run
            accreditation for the cluster.
          </p>
          <p>
            To get access, ask your IQAC coordinator for the
            <code> accreditation.bodies.manage </code>
            permission.
          </p>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

/**
 * navMeta — reached from the Accreditation module nav (Manage → Awarding
 * Bodies) and from the owners desk when a campus has no mapping recorded.
 * `scripts/assert-nav-coverage.mjs` reads this to pass discoverability.
 */
export const navMeta = {
  invokedFrom: '/accreditation',
} as const;

// ----------------------------------------------------------------------------
export default function AwardingBodiesPage() {
  const qc = useQueryClient();
  const { can, isSuperAdmin, isLoading: permsLoading, userProfile } = usePermissions();

  const canManage = isSuperAdmin || can('accreditation.bodies.manage');
  const canView = canManage || can('accreditation.bodies.view');

  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AccreditationBodyRecord | null>(null);
  const [addingBody, setAddingBody] = useState<string>('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data: institutions } = useEditableInstitutions();
  const {
    data: registry,
    isLoading: registryLoading,
    error: registryError,
  } = useBodyRegistry();

  const activeInstitution =
    institutionId ??
    (userProfile as any)?.institution_id ??
    institutions?.[0]?.id ??
    null;

  const {
    data: mappings,
    isLoading: mappingsLoading,
  } = useInstitutionBodyMappings(activeInstitution);

  // A read that failed is "not provisioned", never "there are no bodies".
  const notProvisioned = !!registryError;

  const activeMappings = useMemo(
    () => (mappings ?? []).filter((m) => m.is_active),
    [mappings],
  );

  const mappedCodes = useMemo(
    () => new Set(activeMappings.map((m) => m.body_code)),
    [activeMappings],
  );

  const addableBodies = useMemo(
    () =>
      (registry ?? [])
        .filter((b) => b.is_active && !mappedCodes.has(b.code))
        .map((b) => ({ value: b.code, label: `${b.code} — ${b.name}` })),
    [registry, mappedCodes],
  );

  // Clear a stale pick when the campus changes: a code already mapped on the
  // newly-chosen campus is no longer addable, and leaving it selected offers a
  // button that can only fail.
  useEffect(() => {
    setAddingBody('');
  }, [activeInstitution]);

  const bodyByCode = useMemo(
    () => new Map((registry ?? []).map((b) => [b.code, b])),
    [registry],
  );

  const institutionName =
    institutions?.find((i) => i.id === activeInstitution)?.name ?? null;

  const invalidateMappings = () =>
    qc.invalidateQueries({ queryKey: ['accreditation', 'institution-bodies'] });

  async function addMapping() {
    if (!activeInstitution || !addingBody) return;
    setBusyKey(`add::${addingBody}`);
    try {
      await AccreditationBodyService.addMapping(activeInstitution, addingBody);
      toast.success(`${addingBody} now applies to ${institutionName ?? 'this campus'}.`);
      setAddingBody('');
      await invalidateMappings();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  async function removeMapping(id: string, code: string) {
    setBusyKey(`remove::${id}`);
    try {
      await AccreditationBodyService.removeMapping(id);
      toast.success(`${code} no longer applies to ${institutionName ?? 'this campus'}.`);
      await invalidateMappings();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleBodyActive(body: AccreditationBodyRecord) {
    setBusyKey(`body::${body.code}`);
    try {
      await AccreditationBodyService.setBodyActive(body.code, !body.is_active);
      toast.success(
        body.is_active ? `${body.code} retired.` : `${body.code} restored.`,
      );
      qc.invalidateQueries({ queryKey: REGISTRY_KEY });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  if (permsLoading) {
    return (
      <ContentLayout title="Awarding Bodies">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }
  if (!canView) return <AccessDenied />;

  return (
    <ContentLayout title="Awarding Bodies">
      <PageBreadcrumb
        items={[
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'Manage' },
          { label: 'Awarding Bodies' },
        ]}
      />

      <div className="space-y-6">
        {notProvisioned && (
          <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
            <CardContent className="space-y-2 pt-6 text-sm">
              <div className="font-medium">
                The awarding-body register is not provisioned yet
              </div>
              <p className="text-muted-foreground">
                Its tables ship with migration{' '}
                <code>20260816010000_institution_accreditation_bodies.sql</code>,
                which has not been applied. Until it is, every accreditation
                screen shows all bodies to every institution, exactly as it does
                today — nothing is hidden and nothing is broken. This page will
                start working the moment the migration is applied, with no
                further deploy.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------------- */}
        {/* Which bodies apply to one campus. The reason this page exists. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              Bodies that apply to one campus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A college is measured only against the bodies listed here. Removing
              one removes its metrics from that college&apos;s totals, so a
              target it could never reach stops counting against it.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">Campus</span>
              <SearchableSelect
                className="w-[300px] bg-card"
                value={activeInstitution ?? ''}
                onValueChange={setInstitutionId}
                options={(institutions ?? []).map((i) => ({ value: i.id, label: i.name }))}
                placeholder="Choose a campus"
                searchPlaceholder="Search campuses…"
                emptyMessage="No campus you can access."
              />
            </div>

            {mappingsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : activeMappings.length === 0 ? (
              <div className="rounded-lg border bg-card p-4 text-sm">
                <div className="font-medium">
                  No awarding body applies to {institutionName ?? 'this entity'}
                </div>
                <p className="mt-1 text-muted-foreground">
                  Offices, companies and shared entities sit outside every
                  accreditation framework, and their accreditation screens say
                  so rather than showing an empty scorecard. If that is wrong for
                  this campus, add the bodies it answers to below.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeMappings.map((m) => {
                  const body = bodyByCode.get(m.body_code);
                  const busy = busyKey === `remove::${m.id}`;
                  return (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pl-3 pr-1 text-sm"
                    >
                      <span className="font-medium">{m.body_code}</span>
                      <span className="text-xs text-muted-foreground">
                        {body?.name ?? 'Not in the registry'}
                      </span>
                      {canManage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={busy}
                          aria-label={`Remove ${m.body_code}`}
                          onClick={() => removeMapping(m.id, m.body_code)}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-[320px]">
                  <Label className="text-xs">Add a body</Label>
                  <SearchableSelect
                    className="bg-card"
                    value={addingBody}
                    onValueChange={setAddingBody}
                    options={addableBodies}
                    placeholder="Choose a body…"
                    searchPlaceholder="Search bodies…"
                    emptyMessage="Every active body already applies here."
                  />
                </div>
                <Button
                  onClick={addMapping}
                  disabled={!addingBody || !activeInstitution || busyKey === `add::${addingBody}`}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------- */}
        {/* The cluster-wide registry.                                     */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="h-5 w-5 text-muted-foreground" />
                  Awarding body registry
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every body JKKN answers to, cluster-wide. Adding one here makes
                  it available to every campus; it applies to none of them until
                  it is mapped above.
                </p>
              </div>
              {canManage && (
                <Button onClick={() => setShowCreate(true)} disabled={notProvisioned}>
                  <Plus className="mr-2 h-4 w-4" /> New Body
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {registryLoading ? (
              <div className="p-6"><Skeleton className="h-24 w-full" /></div>
            ) : notProvisioned ? (
              <div className="p-6 text-sm text-muted-foreground">
                Nothing to show until the migration is applied.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[180px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(registry ?? []).map((body) => {
                      const busy = busyKey === `body::${body.code}`;
                      return (
                        <TableRow key={body.code} className="hover:bg-muted/40">
                          <TableCell className="font-mono text-sm font-medium">
                            {body.code}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{body.name}</div>
                            {body.notes && (
                              <div className="max-w-md text-xs text-muted-foreground">
                                {body.notes}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {KIND_LABELS[body.kind as AccreditationBodyKind] ?? body.kind}
                          </TableCell>
                          <TableCell>
                            {body.is_active ? (
                              <Badge variant="outline" className="font-normal">active</Badge>
                            ) : (
                              <Badge variant="secondary" className="font-normal">retired</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {canManage && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => setEditing(body)}>
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => toggleBodyActive(body)}
                                >
                                  {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                  {body.is_active ? 'Retire' : 'Restore'}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BodyFormDialog open={showCreate} onOpenChange={setShowCreate} mode="create" />
      {editing && (
        <BodyFormDialog
          key={editing.code}
          open
          onOpenChange={(v) => { if (!v) setEditing(null); }}
          mode="edit"
          entity={editing}
        />
      )}
    </ContentLayout>
  );
}
