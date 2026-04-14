'use client';

/**
 * PolicyEditor — universal CRUD shell for any HR policy table
 *
 * Renders:
 * - Top: filter toggle (current vs include superseded)
 * - List: rows with edit / deactivate / history actions
 * - Drawer: form for create / edit (uses field types from registry)
 * - Drawer: history view with diff + restore
 */

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { BeatLoader } from 'react-spinners';
import { AlertCircle, Plus, Edit, Archive, History as HistoryIcon, RotateCcw } from 'lucide-react';
import {
  usePolicyList, usePolicyHistory, useCreatePolicy, useUpdatePolicy,
  useDeactivatePolicy, useRestorePolicy, usePolicyDiff,
} from '@/hooks/hr/use-policies';
import type { PolicyTableDef, PolicyFieldDef } from '@/features/hr/policies/registry';

interface Props {
  def: PolicyTableDef;
  hrOrganizationId?: string; // if super_admin, may be optional initially
}

type Mode = 'list' | 'create' | 'edit' | 'history';

export function PolicyEditor({ def, hrOrganizationId }: Props) {
  const [mode, setMode] = useState<Mode>('list');
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);

  const list = usePolicyList(def.table, hrOrganizationId, showSuperseded);

  return (
    <ContentLayout title={`HR Policies — ${def.label}`}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/policies">Policies</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{def.label}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{def.label}</h1>
            <p className="text-sm text-muted-foreground">{def.description}</p>
            <p className="text-xs text-muted-foreground mt-1">Category: <Badge variant="secondary">{def.category}</Badge></p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button onClick={() => { setEditingRow(null); setMode('create'); }}>
              <Plus className="mr-2 h-4 w-4" /> New {def.label}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMode('history')}>
              <HistoryIcon className="mr-2 h-4 w-4" /> View History
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Current Rows</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={showSuperseded} onCheckedChange={setShowSuperseded} id="show-sup" />
              <Label htmlFor="show-sup" className="cursor-pointer">Include superseded</Label>
            </div>
          </CardHeader>
          <CardContent>
            {list.isLoading && <div className="flex justify-center py-8"><BeatLoader color="#3b82f6" /></div>}
            {list.error && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span>Failed to load: {list.error instanceof Error ? list.error.message : 'Unknown'}</span>
              </div>
            )}
            {list.data && list.data.data.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No rows yet. Click <strong>New {def.label}</strong> to add the first one.
              </div>
            )}
            {list.data && list.data.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Display</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Created</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.data.map((row: Record<string, unknown>) => {
                      const dispVal = def.displayField ? String(row[def.displayField] ?? '—') : (row.id as string).slice(0, 8);
                      const isCurrent = !row.valid_until;
                      return (
                        <tr key={row.id as string} className="border-b hover:bg-muted/40">
                          <td className="py-2 pr-3 font-mono text-xs max-w-xs truncate">{dispVal}</td>
                          <td className="py-2 pr-3">
                            {isCurrent ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Current</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-600">Superseded</Badge>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {row.created_at ? new Date(row.created_at as string).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex gap-1">
                              {isCurrent && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => { setEditingRow(row); setMode('edit'); }}>
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  <DeactivateButton table={def.table} id={row.id as string} />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {(mode === 'create' || mode === 'edit') && (
          <PolicyForm
            def={def}
            hrOrganizationId={hrOrganizationId}
            mode={mode}
            existing={editingRow}
            onCancel={() => { setMode('list'); setEditingRow(null); }}
            onSaved={() => { setMode('list'); setEditingRow(null); }}
          />
        )}

        {mode === 'history' && (
          <PolicyHistoryPanel def={def} hrOrganizationId={hrOrganizationId} onClose={() => setMode('list')} />
        )}
      </div>
    </ContentLayout>
  );
}

function DeactivateButton({ table, id }: { table: string; id: string }) {
  const deactivate = useDeactivatePolicy();
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex gap-1">
        <Button variant="destructive" size="sm" onClick={() => deactivate.mutate({ table, id }, { onSettled: () => setConfirming(false) })}>
          Confirm
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    );
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} title="Deactivate">
      <Archive className="h-3.5 w-3.5" />
    </Button>
  );
}

function PolicyForm({
  def, hrOrganizationId, mode, existing, onCancel, onSaved,
}: {
  def: PolicyTableDef;
  hrOrganizationId?: string;
  mode: 'create' | 'edit';
  existing: Record<string, unknown> | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const create = useCreatePolicy();
  const update = useUpdatePolicy();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    if (existing) {
      def.fields.forEach((f) => { init[f.name] = existing[f.name] ?? defaultForField(f); });
    } else {
      def.fields.forEach((f) => { init[f.name] = defaultForField(f); });
    }
    return init;
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = { ...values };
      if (mode === 'create') {
        if (hrOrganizationId) payload.hr_organization_id = hrOrganizationId;
        await create.mutateAsync({ table: def.table, payload });
      } else if (existing) {
        await update.mutateAsync({ table: def.table, id: existing.id as string, payload });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{mode === 'create' ? `New ${def.label}` : `Edit ${def.label} (creates new version)`}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!hrOrganizationId && (
            <div>
              <Label htmlFor="hr_organization_id">HR Organization ID</Label>
              <Input
                id="hr_organization_id"
                value={(values.hr_organization_id as string) ?? ''}
                onChange={(e) => setValues({ ...values, hr_organization_id: e.target.value })}
                required
              />
            </div>
          )}
          {def.fields.map((f) => (
            <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues({ ...values, [f.name]: v })} />
          ))}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" /><span>{error}</span>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) ? 'Saving...' : (mode === 'create' ? 'Create' : 'Save as new version')}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function defaultForField(f: PolicyFieldDef): unknown {
  switch (f.type) {
    case 'boolean': return false;
    case 'number': case 'currency': case 'percent': return null;
    case 'json': return f.jsonShape === 'array' ? '[]' : '{}';
    default: return '';
  }
}

function FieldInput({ field, value, onChange }: { field: PolicyFieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${field.name}`;
  switch (field.type) {
    case 'textarea':
      return (
        <div>
          <Label htmlFor={id}>{field.label}{field.required && ' *'}</Label>
          <textarea id={id} className="w-full mt-1 rounded-md border p-2 text-sm" rows={3}
            value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} required={field.required} />
          {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
        </div>
      );
    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <Switch id={id} checked={!!value} onCheckedChange={onChange} />
          <Label htmlFor={id} className="cursor-pointer">{field.label}</Label>
        </div>
      );
    case 'number': case 'currency': case 'percent':
      return (
        <div>
          <Label htmlFor={id}>{field.label}{field.required && ' *'}</Label>
          <Input id={id} type="number" step={field.type === 'percent' ? '0.01' : 'any'}
            value={(value as number | string) ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            required={field.required} />
          {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
        </div>
      );
    case 'date':
      return (
        <div>
          <Label htmlFor={id}>{field.label}{field.required && ' *'}</Label>
          <Input id={id} type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} required={field.required} />
        </div>
      );
    case 'time':
      return (
        <div>
          <Label htmlFor={id}>{field.label}{field.required && ' *'}</Label>
          <Input id={id} type="time" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} required={field.required} />
        </div>
      );
    case 'enum':
      return (
        <div>
          <Label htmlFor={id}>{field.label}{field.required && ' *'}</Label>
          <select id={id} className="w-full mt-1 rounded-md border p-2 text-sm bg-background"
            value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} required={field.required}>
            <option value="">— select —</option>
            {field.enumValues?.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      );
    case 'json':
      return (
        <div>
          <Label htmlFor={id}>{field.label}</Label>
          <textarea id={id} className="w-full mt-1 rounded-md border p-2 text-xs font-mono" rows={4}
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            onChange={(e) => onChange(e.target.value)} placeholder={field.jsonShape === 'array' ? '[]' : '{}'} />
          {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
        </div>
      );
    case 'fk_cadre': case 'fk_designation': case 'fk_leave_type':
      return (
        <div>
          <Label htmlFor={id}>{field.label}{field.required && ' *'}</Label>
          <Input id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}
            placeholder="UUID (typeahead picker arrives in Sprint 2.1)" required={field.required} />
        </div>
      );
    default:
      return (
        <div>
          <Label htmlFor={id}>{field.label}{field.required && ' *'}</Label>
          <Input id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} required={field.required} />
          {field.helpText && <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>}
        </div>
      );
  }
}

function PolicyHistoryPanel({ def, hrOrganizationId, onClose }: { def: PolicyTableDef; hrOrganizationId?: string; onClose: () => void }) {
  const history = usePolicyHistory(def.table, hrOrganizationId);
  const restore = useRestorePolicy();
  const [diffPair, setDiffPair] = useState<{ old: string; new: string } | null>(null);
  const diff = usePolicyDiff(def.table, diffPair?.old ?? null, diffPair?.new ?? null, hrOrganizationId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><HistoryIcon className="h-4 w-4" /> Version History — {def.label}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </CardHeader>
      <CardContent>
        {history.isLoading && <BeatLoader color="#3b82f6" />}
        {history.error && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="h-4 w-4" /><span>{history.error instanceof Error ? history.error.message : 'Failed to load history'}</span>
          </div>
        )}
        {history.data && history.data.length === 0 && (
          <div className="text-sm text-muted-foreground">No version history yet.</div>
        )}
        {history.data && history.data.length > 0 && (
          <div className="space-y-2">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground text-xs">
                <tr>
                  <th className="py-2 pr-3">Version</th>
                  <th className="py-2 pr-3">Valid from</th>
                  <th className="py-2 pr-3">Valid until</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((v: Record<string, unknown>, idx: number) => (
                  <tr key={v.id as string} className="border-b">
                    <td className="py-2 pr-3 font-mono text-xs">{(v.id as string).slice(0, 8)}</td>
                    <td className="py-2 pr-3 text-xs">{v.valid_from ? new Date(v.valid_from as string).toLocaleString() : '—'}</td>
                    <td className="py-2 pr-3 text-xs">{v.valid_until ? new Date(v.valid_until as string).toLocaleString() : '—'}</td>
                    <td className="py-2 pr-3">
                      {v.is_current ? <Badge variant="outline" className="bg-green-50 text-green-700">Current</Badge>
                        : <Badge variant="outline">Superseded</Badge>}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <div className="flex gap-1">
                        {idx + 1 < history.data.length && (
                          <Button variant="ghost" size="sm"
                            onClick={() => setDiffPair({ old: history.data[idx + 1].id as string, new: v.id as string })}>
                            Diff vs prev
                          </Button>
                        )}
                        {!v.is_current && (
                          <Button variant="ghost" size="sm"
                            onClick={() => restore.mutate({ table: def.table, version_id: v.id as string })}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diffPair && diff.data && (
              <Card className="mt-3">
                <CardHeader><CardTitle className="text-sm">Diff: {diffPair.old.slice(0,8)} → {diffPair.new.slice(0,8)}</CardTitle></CardHeader>
                <CardContent>
                  {diff.data.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No differences in operational fields.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="border-b text-left text-muted-foreground"><tr><th>Field</th><th>Old</th><th>New</th><th>Change</th></tr></thead>
                      <tbody>
                        {diff.data.map((d: Record<string, unknown>) => (
                          <tr key={d.field_name as string} className="border-b">
                            <td className="py-1 pr-2 font-mono">{d.field_name as string}</td>
                            <td className="py-1 pr-2 font-mono text-red-600">{JSON.stringify(d.old_value)}</td>
                            <td className="py-1 pr-2 font-mono text-green-700">{JSON.stringify(d.new_value)}</td>
                            <td className="py-1 pr-2"><Badge variant="outline">{d.change_kind as string}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDiffPair(null)}>Close diff</Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
