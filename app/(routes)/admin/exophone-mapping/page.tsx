'use client';
// ============================================
// EXOPHONE → INSTITUTION MAPPING (Super-Admin)
// ============================================
// Created: 2026-05-03 — M-1 brand-integrity recovery
// Purpose: 22 of 27 active inbound DIDs were silently defaulting to JKKN
//          Pharmacy because the hardcoded EXOPHONE_MAP only knew 5 entries.
//          Director uses this page to assign every DID to its real institution.
// Source:  probe-capture-2026-05-03.md (PROBE-A finding D1)
// Memory:  feedback_policy_decisions_must_be_config_rows.md
// Pattern: clones /admin/counselors/routing-config + /admin/whatsapp-limits
// ============================================

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  Save,
  ShieldAlert,
  RefreshCw,
  Trash2,
  PhoneIncoming,
  Power,
  PowerOff,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ExophoneInstitutionMapService,
  type ExophoneMapWithInstitution,
} from '@/lib/services/admin/exophone-institution-map-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface InstitutionOption {
  id: string;
  name: string;
}

interface NewRowDraft {
  exophone: string;
  institution_id: string;
  description: string;
  saving: boolean;
}

const EMPTY_DRAFT: NewRowDraft = {
  exophone: '',
  institution_id: '',
  description: '',
  saving: false,
};

export default function ExophoneMappingPage() {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();
  // RLS allows super_admin AND admin to write; UI gate keeps it tight to
  // super_admin to mirror /admin/counselors/routing-config. Lower the gate
  // here if Director wants admin to edit directly.
  const canEdit = isSuperAdmin;

  const [rows, setRows] = useState<ExophoneMapWithInstitution[] | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<NewRowDraft>(EMPTY_DRAFT);
  const [editingExophone, setEditingExophone] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    institution_id: string;
    description: string;
  }>({ institution_id: '', description: '' });

  const load = async () => {
    setLoading(true);
    const [list, instData] = await Promise.all([
      ExophoneInstitutionMapService.list(),
      loadInstitutions(),
    ]);
    setRows(list);
    setInstitutions(instData);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Load institutions for the dropdown. Read-only — uses the client supabase
  // (RLS allows authenticated users to see institutions).
  async function loadInstitutions(): Promise<InstitutionOption[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) {
      console.error('[admin/exophone-mapping] institutions load failed:', error);
      return [];
    }
    return (data || []) as InstitutionOption[];
  }

  // -------------------- Add new row --------------------
  const handleAdd = async () => {
    const trimmed = draft.exophone.trim();
    if (!trimmed) {
      toast.error('ExoPhone is required');
      return;
    }
    if (!draft.institution_id) {
      toast.error('Select an institution');
      return;
    }
    setDraft((d) => ({ ...d, saving: true }));
    const res = await ExophoneInstitutionMapService.upsert({
      exophone: trimmed,
      institution_id: draft.institution_id,
      description: draft.description.trim() || null,
      is_active: true,
    });
    if (!res.ok) {
      toast.error(res.error || 'Save failed');
      setDraft((d) => ({ ...d, saving: false }));
      return;
    }
    toast.success(`Added ${trimmed}`);
    setDraft(EMPTY_DRAFT);
    await load();
  };

  // -------------------- Edit existing row --------------------
  const beginEdit = (row: ExophoneMapWithInstitution) => {
    setEditingExophone(row.exophone);
    setEditDraft({
      institution_id: row.institution_id,
      description: row.description ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingExophone(null);
    setEditDraft({ institution_id: '', description: '' });
  };

  const saveEdit = async (row: ExophoneMapWithInstitution) => {
    if (!editDraft.institution_id) {
      toast.error('Select an institution');
      return;
    }
    const res = await ExophoneInstitutionMapService.upsert({
      exophone: row.exophone,
      institution_id: editDraft.institution_id,
      description: editDraft.description.trim() || null,
      is_active: row.is_active,
    });
    if (!res.ok) {
      toast.error(res.error || 'Save failed');
      return;
    }
    toast.success(`${row.exophone} updated`);
    cancelEdit();
    await load();
  };

  // -------------------- Toggle active --------------------
  const toggleActive = async (row: ExophoneMapWithInstitution) => {
    const next = !row.is_active;
    const res = await ExophoneInstitutionMapService.setActive(row.exophone, next);
    if (!res.ok) {
      toast.error(res.error || 'Update failed');
      return;
    }
    toast.success(`${row.exophone} ${next ? 'activated' : 'deactivated'}`);
    await load();
  };

  // -------------------- Hard delete --------------------
  const remove = async (row: ExophoneMapWithInstitution) => {
    if (!confirm(`Delete ${row.exophone}? This cannot be undone.`)) return;
    const res = await ExophoneInstitutionMapService.remove(row.exophone);
    if (!res.ok) {
      toast.error(res.error || 'Delete failed');
      return;
    }
    toast.success(`${row.exophone} deleted`);
    await load();
  };

  // -------------------- Permission gate --------------------
  if (permsLoading) {
    return (
      <ContentLayout title="ExoPhone → Institution Mapping">
        <Skeleton className="h-32 w-full" />
      </ContentLayout>
    );
  }

  if (!canEdit) {
    return (
      <ContentLayout title="ExoPhone → Institution Mapping">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin only</AlertTitle>
          <AlertDescription>
            This page is restricted to super-admin users. Mapping drives
            per-institution call attribution in dashboards.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="ExoPhone → Institution Mapping">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'ExoPhone Mapping' },
        ]}
      />

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <PhoneIncoming className="h-6 w-6" />
            ExoPhone &rarr; Institution Mapping
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Tells the inbound-call webhook which institution to attribute each
            DID/ExoPhone to. Without a row here, calls fall through to a default
            institution &mdash; producing dashboard mis-attribution. 27 active
            DIDs deliver inbound calls; all should be listed here.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Alert className="mb-6">
        <AlertTitle>How this works</AlertTitle>
        <AlertDescription className="text-sm">
          The webhook reads this table on every inbound call, with a 60-second
          in-memory cache. Edits propagate to production within a minute &mdash; no
          deploy needed. If the DB read fails, the webhook falls back to a
          5-entry hardcoded map (zero regression). Use leading-zero form for
          DIDs (e.g. <code>04446313503</code>); +91/91 prefixed variants are
          auto-resolved.
        </AlertDescription>
      </Alert>

      {/* Add new row */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" /> Add new DID
          </CardTitle>
          <CardDescription>
            Enter the ExoPhone exactly as Exotel reports it. Matches are
            case-insensitive and prefix-tolerant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <Label htmlFor="new-exophone" className="text-xs uppercase tracking-wide text-muted-foreground">
                ExoPhone
              </Label>
              <Input
                id="new-exophone"
                placeholder="04446313503"
                value={draft.exophone}
                onChange={(e) => setDraft({ ...draft, exophone: e.target.value })}
                disabled={draft.saving}
              />
            </div>
            <div>
              <Label htmlFor="new-institution" className="text-xs uppercase tracking-wide text-muted-foreground">
                Institution
              </Label>
              <Select
                value={draft.institution_id}
                onValueChange={(v) => setDraft({ ...draft, institution_id: v })}
                disabled={draft.saving}
              >
                <SelectTrigger id="new-institution">
                  <SelectValue placeholder="Select institution" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-1">
              <Label htmlFor="new-description" className="text-xs uppercase tracking-wide text-muted-foreground">
                Description (optional)
              </Label>
              <Input
                id="new-description"
                placeholder="e.g. Admission inquiries — main line"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                disabled={draft.saving}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAdd}
                disabled={draft.saving || !draft.exophone.trim() || !draft.institution_id}
                className="w-full gap-2"
              >
                <Save className="h-4 w-4" />
                {draft.saving ? 'Saving…' : 'Add'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing rows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configured DIDs ({rows?.length ?? 0})</CardTitle>
          <CardDescription>
            Inactive rows are skipped by the webhook resolver. Use deactivate
            instead of delete to preserve audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading || rows === null ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <Alert>
              <AlertTitle>No DIDs configured</AlertTitle>
              <AlertDescription>
                The seed migration should have inserted 5 default rows. If this
                is empty, run{' '}
                <code className="mx-1 rounded bg-muted px-1">
                  20260503140001_exophone_institution_map.sql
                </code>
                .
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ExoPhone</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isEditing = editingExophone === row.exophone;
                  return (
                    <TableRow key={row.exophone}>
                      <TableCell className="font-mono text-sm">{row.exophone}</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Select
                            value={editDraft.institution_id}
                            onValueChange={(v) =>
                              setEditDraft({ ...editDraft, institution_id: v })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {institutions.map((inst) => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  {inst.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm">
                            {row.institution?.name ?? row.institution_id.slice(0, 8) + '…'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        {isEditing ? (
                          <Input
                            value={editDraft.description}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, description: e.target.value })
                            }
                            placeholder="Optional"
                            className="h-8"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {row.description || '—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.is_active ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-100 text-emerald-800 border-emerald-200"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-gray-100 text-gray-700 border-gray-200"
                          >
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => saveEdit(row)}
                                className="h-8 gap-1"
                              >
                                <Save className="h-3.5 w-3.5" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEdit}
                                className="h-8"
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => beginEdit(row)}
                                className="h-8"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleActive(row)}
                                className="h-8 px-2"
                                title={row.is_active ? 'Deactivate' : 'Activate'}
                              >
                                {row.is_active ? (
                                  <PowerOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Power className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              {isSuperAdmin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => remove(row)}
                                  className="h-8 px-2 text-destructive hover:text-destructive"
                                  title="Hard-delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
