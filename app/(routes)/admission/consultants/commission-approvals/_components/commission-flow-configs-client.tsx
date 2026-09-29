'use client';

/**
 * Consultant commission payment approval flow settings — list + editor.
 *
 * Adapted from the billing refund flow settings
 * (app/(routes)/billing/refund-approvals/_components/flow-configs-client.tsx).
 * Unlike refunds, the commission flow is GLOBAL only — there is no
 * institution scope and only one flow can be active at a time. Every uuid
 * stored in initiator/disburser/stage role-or-user arrays MUST stay a plain
 * string — the assignee matcher checks them with the jsonb `?` operator.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowDown, ArrowUp, Loader2, Pencil, Plus,
  Power, Search, Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import {
  useCommissionPaymentFlowConfigs,
  useSaveCommissionPaymentFlowConfig,
  useDeleteCommissionPaymentFlowConfig,
  useCommissionPaymentRoleMembers,
} from '@/hooks/admission/use-commission-payments';
import { CommissionPaymentFlowActiveConflictError } from '@/lib/services/admission/commission-payment-service';
import type {
  CommissionPaymentFlowConfig, CommissionPaymentFlowStage,
} from '@/types/consultant-commission-payment';

interface RoleOption {
  id: string;
  role_name: string;
  holders?: number;
}

interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

// ---- Data sources for the pickers ------------------------------------------------

function useCommissionRoles() {
  return useQuery({
    queryKey: ['commission-flow-roles'],
    queryFn: async (): Promise<RoleOption[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('custom_roles')
        .select('id, role_name')
        .eq('is_active', true)
        .order('role_name');
      if (error) throw new Error(getErrorMessage(error));
      return data ?? [];
    },
  });
}

// Holder counts come from the shared fn_role_user_counts() RPC (also used by
// the HR recruitment and refund flow builders). Not registered in the
// generated Supabase types, so the RPC call is cast.
function useRoleHolderCounts() {
  return useQuery({
    queryKey: ['commission-flow-role-holder-counts'],
    queryFn: async (): Promise<Array<{ role_key: string; role_name: string; users: number }>> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('fn_role_user_counts');
      if (error) throw new Error(getErrorMessage(error));
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useCommissionProfiles() {
  return useQuery({
    queryKey: ['commission-flow-profiles'],
    queryFn: async (): Promise<ProfileOption[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      if (error) throw new Error(getErrorMessage(error));
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function newStage(): CommissionPaymentFlowStage {
  return { key: crypto.randomUUID(), name: '', assignee_roles: [], assignee_users: [] };
}

export function CommissionFlowConfigsClient() {
  const { data: configs, isLoading, error } = useCommissionPaymentFlowConfigs();
  const { data: roles } = useCommissionRoles();
  const { data: roleCounts } = useRoleHolderCounts();
  const { data: profiles } = useCommissionProfiles();
  // Role→member pairs (active roles only), so the Users picker can be scoped to
  // holders of the selected role(s) regardless of user_roles RLS.
  const { data: roleMembers } = useCommissionPaymentRoleMembers();

  // user_id -> set of role_ids they hold (active roles), for the Users picker's
  // "only holders of the selected role(s)" filter.
  const rolesByUser = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const rm of roleMembers ?? []) {
      let set = m.get(rm.user_id);
      if (!set) { set = new Set(); m.set(rm.user_id, set); }
      set.add(rm.role_id);
    }
    return m;
  }, [roleMembers]);

  const saveConfig = useSaveCommissionPaymentFlowConfig();
  const deleteConfig = useDeleteCommissionPaymentFlowConfig();

  const [editorTarget, setEditorTarget] = useState<CommissionPaymentFlowConfig | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommissionPaymentFlowConfig | null>(null);
  // Set when a save/activate collides with the currently-active flow — only
  // one commission payment flow can be active at a time. Confirming re-saves
  // with replaceActive so the listed flow(s) are deactivated and this one
  // takes its place, atomically, via the RPC.
  const [conflict, setConflict] = useState<{
    cfg: Partial<CommissionPaymentFlowConfig>; conflicts: Array<{ id: string; name: string }>; onReplaced?: () => void;
  } | null>(null);

  async function attemptSave(cfg: Partial<CommissionPaymentFlowConfig>, replaceActive = false, onSaved?: () => void) {
    try {
      await saveConfig.mutateAsync({ cfg, replaceActive });
      setConflict(null);
      onSaved?.();
    } catch (e) {
      if (e instanceof CommissionPaymentFlowActiveConflictError) {
        setConflict({ cfg, conflicts: e.conflicts, onReplaced: onSaved });
      }
    }
  }

  const holdersByRoleName = useMemo(() => {
    const m = new Map<string, number>();
    for (const rc of roleCounts ?? []) m.set(rc.role_name.toLowerCase(), rc.users);
    return m;
  }, [roleCounts]);

  const roleOptions = useMemo<RoleOption[]>(
    () => (roles ?? []).map((r) => ({
      id: r.id,
      role_name: r.role_name,
      holders: holdersByRoleName.get(r.role_name.toLowerCase()),
    })),
    [roles, holdersByRoleName],
  );

  function handleToggleActive(cfg: CommissionPaymentFlowConfig) {
    attemptSave({ ...cfg, is_active: !cfg.is_active });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteConfig.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  }

  const conflictNames = conflict ? conflict.conflicts.map((c) => `“${c.name}”`).join(', ') : '';

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button onClick={() => setEditorTarget('new')}>
          <Plus className='mr-1.5 h-4 w-4' /> Create Flow
        </Button>
      </div>

      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Stages</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}><Skeleton className='h-6 w-full' /></TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={4} className='py-8 text-center text-sm text-destructive'>
                    Failed to load flows: {error instanceof Error ? error.message : 'Unknown error'}
                  </TableCell>
                </TableRow>
              ) : !configs || configs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className='py-8 text-center text-sm text-muted-foreground'>
                    No commission payment approval flows configured yet. Create one to allow
                    commission payment requests to be initiated.
                  </TableCell>
                </TableRow>
              ) : (
                configs.map((cfg) => (
                  <TableRow key={cfg.id} className={cfg.is_active ? '' : 'opacity-60'}>
                    <TableCell className='font-medium'>{cfg.name}</TableCell>
                    <TableCell>{cfg.stages.length}</TableCell>
                    <TableCell>
                      <Badge variant={cfg.is_active ? 'default' : 'outline'}>
                        {cfg.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-1'>
                        <Button
                          variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs'
                          onClick={() => setEditorTarget(cfg)}
                        >
                          <Pencil className='h-3.5 w-3.5' /> Edit
                        </Button>
                        <Button
                          variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs'
                          onClick={() => handleToggleActive(cfg)}
                          disabled={saveConfig.isPending}
                        >
                          <Power className='h-3.5 w-3.5' /> {cfg.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs text-destructive'
                          onClick={() => setDeleteTarget(cfg)}
                        >
                          <Trash2 className='h-3.5 w-3.5' /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editorTarget && (
        <FlowEditorDialog
          target={editorTarget}
          configs={configs ?? []}
          roleOptions={roleOptions}
          profiles={profiles ?? []}
          rolesByUser={rolesByUser}
          isSaving={saveConfig.isPending}
          onClose={() => setEditorTarget(null)}
          onSave={(cfg) => attemptSave(cfg, false, () => setEditorTarget(null))}
        />
      )}

      <AlertDialog open={!!conflict} onOpenChange={(o) => { if (!o) setConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {conflict && conflict.conflicts.length > 1 ? 'Replace the active flows?' : 'Replace the active flow?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Only one commission payment flow can be active at a time. Saving this one as active
              will deactivate {conflictNames || 'the currently active flow'}. Commission payment
              requests already in progress keep their frozen approval chain and are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveConfig.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saveConfig.isPending}
              onClick={() => conflict && attemptSave(conflict.cfg, true, conflict.onReplaced)}
            >
              {saveConfig.isPending ? 'Replacing…' : 'Replace'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the flow permanently. Commission payment requests already initiated
              under this flow keep their frozen approval chain, but new commission payment
              requests will fail to initiate until another flow is active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConfig.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfig.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteConfig.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Editor dialog -----------------------------------------------------------------

function FlowEditorDialog({
  target, configs, roleOptions, profiles, rolesByUser, isSaving, onClose, onSave,
}: {
  target: CommissionPaymentFlowConfig | 'new';
  configs: CommissionPaymentFlowConfig[];
  roleOptions: RoleOption[];
  profiles: ProfileOption[];
  rolesByUser: Map<string, Set<string>>;
  isSaving: boolean;
  onClose: () => void;
  onSave: (config: Partial<CommissionPaymentFlowConfig>) => void;
}) {
  const existing = target === 'new' ? null : target;

  const [name, setName] = useState(existing?.name ?? '');
  // This flow will save as active (is_active isn't user-editable here — new
  // flows are always active, edits keep whatever they already were), so warn
  // up front, before Save, about the currently-active flow that would need
  // deactivating: only one commission payment flow can be active at a time.
  const willBeActive = existing?.is_active ?? true;
  const activeConflicts = useMemo(
    () => (willBeActive
      ? configs.filter((c) => c.is_active && c.id !== existing?.id)
      : []),
    [configs, existing, willBeActive],
  );
  const [initiatorRoles, setInitiatorRoles] = useState<string[]>(existing?.initiator_roles ?? []);
  const [initiatorUsers, setInitiatorUsers] = useState<string[]>(existing?.initiator_users ?? []);
  const [stages, setStages] = useState<CommissionPaymentFlowStage[]>(
    existing && existing.stages.length > 0 ? existing.stages : [newStage()],
  );
  const [disburserRoles, setDisburserRoles] = useState<string[]>(existing?.disburser_roles ?? []);
  const [disburserUsers, setDisburserUsers] = useState<string[]>(existing?.disburser_users ?? []);

  function updateStage(key: string, patch: Partial<CommissionPaymentFlowStage>) {
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }
  function removeStage(key: string) {
    setStages((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev));
  }
  function moveStage(key: string, dir: -1 | 1) {
    setStages((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }

  function handleSave() {
    if (!name.trim()) { toast.error('Flow name is required'); return; }
    if (stages.length === 0) { toast.error('Add at least one stage'); return; }
    for (const s of stages) {
      if (!s.name.trim()) { toast.error('Every stage needs a name'); return; }
      if (s.assignee_roles.length === 0 && s.assignee_users.length === 0) {
        toast.error(`Stage “${s.name}” needs at least one role or user`);
        return;
      }
    }
    if (initiatorRoles.length === 0 && initiatorUsers.length === 0) {
      toast.error('Initiators need at least one role or user'); return;
    }
    if (disburserRoles.length === 0 && disburserUsers.length === 0) {
      toast.error('Disbursers need at least one role or user'); return;
    }

    onSave({
      ...(existing ? { id: existing.id } : {}),
      name: name.trim(),
      initiator_roles: initiatorRoles,
      initiator_users: initiatorUsers,
      stages,
      disburser_roles: disburserRoles,
      disburser_users: disburserUsers,
      is_active: existing?.is_active ?? true,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className='max-h-[90vh] max-w-3xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit “${existing.name}”` : 'Create commission payment approval flow'}</DialogTitle>
          <DialogDescription>
            Define who can initiate consultant commission payments, the ordered approval stages,
            and who can disburse the payment once approved.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div>
            <Label htmlFor='commission-flow-name'>Name</Label>
            <Input
              id='commission-flow-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. Standard Commission Payment'
            />
          </div>

          {activeConflicts.length > 0 && (
            <Alert className='border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300'>
              <AlertTriangle className='h-4 w-4' />
              <AlertDescription>
                Only one commission payment flow can be active at a time. Saving this one as active
                will deactivate{' '}
                <strong>{activeConflicts.map((c) => `“${c.name}”`).join(', ')}</strong>
                {' '}— you’ll be asked to confirm.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm'>Initiators</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2'>
              <RolePicker label='Roles' options={roleOptions} selected={initiatorRoles} onChange={setInitiatorRoles} />
              <UserPicker label='Users' profiles={profiles} selected={initiatorUsers} onChange={setInitiatorUsers} restrictToRoleIds={initiatorRoles} rolesByUser={rolesByUser} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm'>
                Stages — {stages.length} step{stages.length === 1 ? '' : 's'}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {stages.map((stage, idx) => (
                <StageRow
                  key={stage.key}
                  stage={stage}
                  index={idx}
                  total={stages.length}
                  roleOptions={roleOptions}
                  profiles={profiles}
                  rolesByUser={rolesByUser}
                  onChange={(patch) => updateStage(stage.key, patch)}
                  onMove={(dir) => moveStage(stage.key, dir)}
                  onRemove={() => removeStage(stage.key)}
                />
              ))}
              <Button variant='outline' size='sm' className='gap-1.5' onClick={() => setStages((prev) => [...prev, newStage()])}>
                <Plus className='h-3.5 w-3.5' /> Add stage
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm'>Disbursers</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2'>
              <RolePicker label='Roles' options={roleOptions} selected={disburserRoles} onChange={setDisburserRoles} />
              <UserPicker label='Users' profiles={profiles} selected={disburserUsers} onChange={setDisburserUsers} restrictToRoleIds={disburserRoles} rolesByUser={rolesByUser} />
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving} className='gap-1.5'>
            {isSaving && <Loader2 className='h-4 w-4 animate-spin' />}
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Single stage row ---------------------------------------------------------------

function StageRow({
  stage, index, total, roleOptions, profiles, rolesByUser, onChange, onMove, onRemove,
}: {
  stage: CommissionPaymentFlowStage;
  index: number;
  total: number;
  roleOptions: RoleOption[];
  profiles: ProfileOption[];
  rolesByUser: Map<string, Set<string>>;
  onChange: (patch: Partial<CommissionPaymentFlowStage>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className='rounded-md border border-border p-3 space-y-3'>
      <div className='flex items-center gap-2'>
        <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums'>
          {index + 1}
        </span>
        <Input
          value={stage.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder='Stage name (e.g. Admission Head Approval)'
          className='h-8'
        />
        <div className='ml-auto flex items-center gap-1'>
          <Button variant='ghost' size='icon' className='h-7 w-7' disabled={index === 0} onClick={() => onMove(-1)} aria-label='Move stage up'>
            <ArrowUp className='h-3.5 w-3.5' />
          </Button>
          <Button variant='ghost' size='icon' className='h-7 w-7' disabled={index === total - 1} onClick={() => onMove(1)} aria-label='Move stage down'>
            <ArrowDown className='h-3.5 w-3.5' />
          </Button>
          <Button
            variant='ghost' size='icon' className='h-7 w-7 text-destructive'
            disabled={total <= 1} onClick={onRemove} aria-label='Remove stage'
          >
            <Trash2 className='h-3.5 w-3.5' />
          </Button>
        </div>
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <RolePicker label='Roles' options={roleOptions} selected={stage.assignee_roles} onChange={(v) => onChange({ assignee_roles: v })} />
        <UserPicker label='Users' profiles={profiles} selected={stage.assignee_users} onChange={(v) => onChange({ assignee_users: v })} restrictToRoleIds={stage.assignee_roles} rolesByUser={rolesByUser} />
      </div>
    </div>
  );
}

// ---- Role multi-select: INLINE checklist (no popover — avoids nested-overlay
//      click/focus/scroll bugs inside the editor Dialog) --------------------------

function RolePicker({
  label, options, selected, onChange,
}: {
  label: string;
  options: RoleOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.role_name.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div>
      <div className='mb-1 flex items-center justify-between'>
        <Label className='text-xs'>{label}</Label>
        {selected.length > 0 && <span className='text-[11px] text-muted-foreground'>{selected.length} selected</span>}
      </div>
      <div className='rounded-md border border-input'>
        <div className='relative border-b border-input'>
          <Search className='pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search roles…'
            className='h-8 border-0 pl-7 text-sm shadow-none focus-visible:ring-0'
          />
        </div>
        <div className='max-h-48 space-y-0.5 overflow-y-auto p-1'>
          {filtered.length === 0 && (
            <p className='px-2 py-1.5 text-xs text-muted-foreground'>No roles match.</p>
          )}
          {filtered.map((o) => {
            const zeroHolders = o.holders === 0;
            return (
              <div
                key={o.id}
                role='button'
                tabIndex={0}
                onClick={() => toggle(o.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(o.id); } }}
                className='flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted'
              >
                <Checkbox checked={selected.includes(o.id)} tabIndex={-1} className='pointer-events-none' />
                <span className='flex-1 truncate'>{o.role_name}</span>
                {o.holders !== undefined && (
                  <span className={`flex items-center gap-1 text-[10px] tabular-nums ${zeroHolders ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                    {zeroHolders && <AlertTriangle className='h-3 w-3' />}
                    {o.holders}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- User multi-select: INLINE searchable checklist (no popover) ------------------

function UserPicker({
  label, profiles, selected, onChange, restrictToRoleIds = [], rolesByUser,
}: {
  label: string;
  profiles: ProfileOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  restrictToRoleIds?: string[];
  rolesByUser?: Map<string, Set<string>>;
}) {
  const [query, setQuery] = useState('');

  const CAP = 100;
  // When roles are selected for this section, scope the pool to their holders
  // (so you pick people who actually hold the chosen role). With no role
  // selected, show everyone so you can still pin an arbitrary user.
  const { filtered, totalMatches } = useMemo(() => {
    const q = query.trim().toLowerCase();
    let pool = profiles;
    if (restrictToRoleIds.length > 0 && rolesByUser) {
      pool = pool.filter((p) => {
        const held = rolesByUser.get(p.id);
        return held ? restrictToRoleIds.some((rid) => held.has(rid)) : false;
      });
    }
    if (q) {
      pool = pool.filter(
        (p) => (p.full_name ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q),
      );
    }
    return { filtered: pool.slice(0, CAP), totalMatches: pool.length };
  }, [profiles, query, restrictToRoleIds, rolesByUser]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div>
      <div className='mb-1 flex items-center justify-between'>
        <Label className='text-xs'>{label}</Label>
        {selected.length > 0 && <span className='text-[11px] text-muted-foreground'>{selected.length} selected</span>}
      </div>
      <div className='rounded-md border border-input'>
        <div className='relative border-b border-input'>
          <Search className='pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search name or email…'
            className='h-8 border-0 pl-7 text-sm shadow-none focus-visible:ring-0'
          />
        </div>
        {restrictToRoleIds.length > 0 && (
          <p className='border-b border-input px-2 py-1 text-[11px] text-muted-foreground'>
            Showing holders of the selected role{restrictToRoleIds.length > 1 ? 's' : ''}.
          </p>
        )}
        <div className='max-h-48 space-y-0.5 overflow-y-auto p-1'>
          {filtered.length === 0 && (
            <p className='px-2 py-1.5 text-xs text-muted-foreground'>
              {restrictToRoleIds.length > 0 ? 'No users hold the selected role(s).' : 'No people match.'}
            </p>
          )}
          {filtered.map((p) => (
            <div
              key={p.id}
              role='button'
              tabIndex={0}
              onClick={() => toggle(p.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(p.id); } }}
              className='flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted'
            >
              <Checkbox checked={selected.includes(p.id)} tabIndex={-1} className='pointer-events-none' />
              <span className='min-w-0 flex-1'>
                <span className='block truncate'>{p.full_name ?? '(no name)'}</span>
                <span className='block truncate text-xs text-muted-foreground'>{p.email}</span>
              </span>
            </div>
          ))}
          {totalMatches > filtered.length && (
            <p className='px-2 py-1.5 text-[11px] text-muted-foreground'>
              Showing {filtered.length} of {totalMatches}. Type to narrow the list.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
