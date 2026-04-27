'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Users,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CounselorRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  max_leads: number;
  current_leads: number;
  specializations: string[] | null;
  institution_id: string;
  user_id: string | null;
  created_at: string;
  institutions: { name: string } | null;
  profile_role?: string | null;
  profile_full_name?: string | null;
}

interface CounselorListProps {
  onRefresh?: () => void;
  institutionId?: string;
  isGlobalUser?: boolean;
}

// Agent G — mutation guardrails
interface ImpactPreview {
  assigned_leads: number;
  call_logs: number;
  callback_queue: number;
  counselor_record_leads: number;
  counselor_full_name: string | null;
  counselor_email: string | null;
}

type GuardrailMode = 'toggle' | 'remove';

interface GuardrailDialogState {
  open: boolean;
  mode: GuardrailMode;
  counselor: CounselorRecord | null;
}

const ROLE_COLORS: Record<string, string> = {
  student: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  faculty: 'bg-blue-100 text-blue-700 border-blue-200',
  counselor: 'bg-purple-100 text-purple-700 border-purple-200',
  accounts: 'bg-amber-100 text-amber-700 border-amber-200',
  guest: 'bg-gray-100 text-gray-600 border-gray-200',
};

function getRoleBadgeClass(role: string | null | undefined): string {
  if (!role) return 'bg-red-100 text-red-700 border-red-200';
  return ROLE_COLORS[role.toLowerCase()] || 'bg-gray-100 text-gray-600 border-gray-200';
}

function getRoleLabel(role: string | null | undefined): string {
  if (!role) return 'No Profile';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function CounselorList({ onRefresh, institutionId, isGlobalUser }: CounselorListProps) {
  const supabase = createClientSupabaseClient();
  const { canAccess } = usePermissions();
  const canDelete = canAccess('admission', 'counselors.delete');

  const [counselors, setCounselors] = useState<CounselorRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Agent G — mutation guardrail dialog (Toggle + Remove share one dialog)
  const [dialog, setDialog] = useState<GuardrailDialogState>({
    open: false,
    mode: 'toggle',
    counselor: null,
  });
  const [impact, setImpact] = useState<ImpactPreview | null>(null);
  const [isLoadingImpact, setIsLoadingImpact] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const fetchCounselors = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch counselors from admission_counselors table
      // Scope by institution unless caller is a global user (super admin / admission-global)
      let counselorQuery = supabase
        .from('admission_counselors')
        .select(`
          id, name, email, phone, is_active, max_leads, current_leads, specializations,
          institution_id, user_id, created_at,
          institutions(name)
        `)
        .order('name');

      if (!isGlobalUser && institutionId) {
        counselorQuery = counselorQuery.eq('institution_id', institutionId);
      }

      const { data, error } = await counselorQuery;

      if (error) {
        toast.error('Failed to load counselors');
        console.error('[admission/counselors] Failed to fetch counselors:', error);
        return;
      }

      const records = (data || []) as unknown as CounselorRecord[];

      // 2. Fetch users with counselor role who may NOT be in admission_counselors table
      // Step A: Get the counselor role ID
      const { data: counselorRoleData } = await supabase
        .from('custom_roles')
        .select('id')
        .eq('role_key', 'counselor')
        .single();

      if (counselorRoleData) {
        // Step B: Get all user_ids with counselor role
        const { data: roleAssignments } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role_id', counselorRoleData.id);

        const roleUserIds = (roleAssignments || []).map((r: any) => r.user_id);

        // 3. Find role-based counselors not already in admission_counselors
        const existingUserIds = new Set(records.filter(c => c.user_id).map(c => c.user_id));
        const missingUserIds = roleUserIds.filter((uid: string) => !existingUserIds.has(uid));

        if (missingUserIds.length > 0) {
          // Step C: Fetch profiles for missing users (scoped by institution when not global)
          let profileQuery = supabase
            .from('profiles')
            .select('id, full_name, email, phone_number, role, institution_id')
            .in('id', missingUserIds);

          if (!isGlobalUser && institutionId) {
            profileQuery = profileQuery.eq('institution_id', institutionId);
          }

          const { data: missingProfiles } = await profileQuery;

          // Step D: Fetch institution names for these profiles
          const instIds = [...new Set((missingProfiles || []).map((p: any) => p.institution_id).filter(Boolean))];
          const instMap = new Map<string, string>();
          if (instIds.length > 0) {
            const { data: insts } = await supabase
              .from('institutions')
              .select('id, name')
              .in('id', instIds);
            if (insts) {
              for (const inst of insts as any[]) {
                instMap.set(inst.id, inst.name);
              }
            }
          }

          // Step E: Add as virtual counselor records
          for (const profile of (missingProfiles || []) as any[]) {
            records.push({
              id: `role-${profile.id}`,
              name: profile.full_name || profile.email || '',
              email: profile.email,
              phone: profile.phone_number,
              is_active: true,
              max_leads: 50,
              current_leads: 0,
              specializations: null,
              institution_id: profile.institution_id || '',
              user_id: profile.id,
              created_at: '',
              institutions: profile.institution_id ? { name: instMap.get(profile.institution_id) || '' } : null,
              profile_role: profile.role,
              profile_full_name: profile.full_name,
            });
          }
        }
      }

      // 4. Fetch profile roles for table-based counselors that have a user_id
      const userIds = records
        .filter((c) => c.user_id && !c.profile_role)
        .map((c) => c.user_id as string);

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, role, full_name')
          .in('id', userIds);

        if (profiles) {
          const profileMap = new Map<string, { role: string | null; full_name: string | null }>();
          for (const p of profiles as Array<{ id: string; role: string | null; full_name: string | null }>) {
            profileMap.set(p.id, { role: p.role, full_name: p.full_name });
          }

          for (const counselor of records) {
            if (counselor.user_id && !counselor.profile_role && profileMap.has(counselor.user_id)) {
              const prof = profileMap.get(counselor.user_id)!;
              counselor.profile_role = prof.role;
              counselor.profile_full_name = prof.full_name;
            }
          }
        }
      }

      // 5. For unmatched user_ids (orphaned counselor rows), still try to load name fields when available
      for (const counselor of records) {
        if (counselor.user_id && !counselor.profile_role) {
          // Backfill display name only — leave profile_role null to surface "No Profile"
          supabase
            .from('profiles')
            .select('full_name')
            .eq('id', counselor.user_id)
            .single()
            .then();
        }
      }

      // Sort by name
      records.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      setCounselors(records);
    } catch {
      toast.error('Failed to load counselors');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, institutionId, isGlobalUser]);

  useEffect(() => {
    fetchCounselors();
  }, [fetchCounselors]);

  // Agent G — open guardrail dialog instead of mutating immediately
  const openGuardrailDialog = useCallback(
    async (mode: GuardrailMode, counselor: CounselorRecord) => {
      if (mode === 'toggle' && counselor.id.startsWith('role-')) {
        toast.error('This counselor has no table record. Add them via "Add Counselor" first to manage their status.');
        return;
      }
      setDialog({ open: true, mode, counselor });
      setConfirmInput('');
      setImpact(null);

      // Skip impact preview for activate (no destruction) and for role-only rows with no user_id
      const isActivate = mode === 'toggle' && !counselor.is_active;
      const isRoleOnly = counselor.id.startsWith('role-');
      if (isActivate) return;
      if (isRoleOnly && !counselor.user_id) return;

      setIsLoadingImpact(true);
      try {
        const url = `/api/admission/counselors/${encodeURIComponent(counselor.id)}?action=impact${
          counselor.user_id ? `&user_id=${encodeURIComponent(counselor.user_id)}` : ''
        }`;
        const res = await fetch(url);
        if (res.ok) {
          const json = (await res.json()) as ImpactPreview;
          setImpact(json);
        } else {
          setImpact({
            assigned_leads: 0,
            call_logs: 0,
            callback_queue: 0,
            counselor_record_leads: 0,
            counselor_full_name: counselor.name,
            counselor_email: counselor.email,
          });
        }
      } catch (err) {
        console.warn('[admission/counselors] impact preview failed', err);
        setImpact({
          assigned_leads: 0,
          call_logs: 0,
          callback_queue: 0,
          counselor_record_leads: 0,
          counselor_full_name: counselor.name,
          counselor_email: counselor.email,
        });
      } finally {
        setIsLoadingImpact(false);
      }
    },
    [],
  );

  const closeGuardrailDialog = useCallback(() => {
    setDialog({ open: false, mode: 'toggle', counselor: null });
    setConfirmInput('');
    setImpact(null);
  }, []);

  const performToggle = async (counselor: CounselorRecord) => {
    setTogglingIds((prev) => new Set(prev).add(counselor.id));
    try {
      const { error } = await supabase
        .from('admission_counselors')
        .update({ is_active: !counselor.is_active })
        .eq('id', counselor.id);

      if (error) {
        toast.error('Failed to update counselor status');
        console.error('[admission/counselors] Failed to toggle active:', error);
        return;
      }

      toast.success(counselor.is_active ? 'Counselor deactivated' : 'Counselor activated');
      await fetchCounselors();
      onRefresh?.();
    } catch {
      toast.error('Failed to update counselor status');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(counselor.id);
        return next;
      });
    }
  };

  const performRemove = async (counselor: CounselorRecord) => {
    setRemovingId(counselor.id);
    try {
      const isRoleOnly = counselor.id.startsWith('role-');

      // 1. Soft-delete via API endpoint (replaces hard DELETE).
      //    Endpoint sets is_active=false, deactivated_at=now(), deactivated_by=auth.uid().
      //    Audit log trigger fires on UPDATE (admission_counselors_audit_log, PR #516).
      if (!isRoleOnly) {
        const res = await fetch(
          `/api/admission/counselors/${encodeURIComponent(counselor.id)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          toast.error(json?.message || 'Failed to remove counselor');
          console.error('[admission/counselors] Soft-delete failed:', json);
          return;
        }
      }

      // 2. Remove counselor role from user_roles
      if (counselor.user_id) {
        const { data: counselorRole } = await supabase
          .from('custom_roles')
          .select('id')
          .eq('role_key', 'counselor')
          .single();

        if (counselorRole) {
          await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', counselor.user_id)
            .eq('role_id', counselorRole.id);
        }

        // 3. Update profiles.role if it's set to 'counselor' (legacy sync)
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', counselor.user_id)
          .single();

        if (profile?.role === 'counselor') {
          const { data: remainingRoles } = await supabase
            .from('user_roles')
            .select('custom_roles!inner(role_key)')
            .eq('user_id', counselor.user_id)
            .eq('is_primary', true)
            .limit(1);

          const nextRole = (remainingRoles as any)?.[0]?.custom_roles?.role_key || 'guest';

          await supabase
            .from('profiles')
            .update({ role: nextRole })
            .eq('id', counselor.user_id);
        }
      }

      toast.success('Counselor removed (soft-delete + audit logged)');
      await fetchCounselors();
      onRefresh?.();
    } catch {
      toast.error('Failed to remove counselor');
    } finally {
      setRemovingId(null);
    }
  };

  const handleConfirm = async () => {
    if (!dialog.counselor) return;
    const counselor = dialog.counselor;
    const mode = dialog.mode;
    closeGuardrailDialog();
    if (mode === 'toggle') {
      await performToggle(counselor);
    } else {
      await performRemove(counselor);
    }
  };

  const filteredCounselors = useMemo(() => {
    if (!searchQuery.trim()) return counselors;
    const q = searchQuery.toLowerCase();
    return counselors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [counselors, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and count */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="secondary" className="w-fit">
          {filteredCounselors.length} counselor{filteredCounselors.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Counselor cards */}
      {filteredCounselors.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">
                {searchQuery ? 'No counselors match your search' : 'No counselors found'}
              </p>
              <p className="text-sm mt-1">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Add a counselor using the button above'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCounselors.map((counselor) => {
            const isToggling = togglingIds.has(counselor.id);
            const isRemoving = removingId === counselor.id;
            const leadsPercent =
              counselor.max_leads > 0
                ? (counselor.current_leads / counselor.max_leads) * 100
                : 0;
            const specsDisplay =
              counselor.specializations && counselor.specializations.length > 0
                ? counselor.specializations.join(', ')
                : null;

            return (
              <Card
                key={counselor.id}
                className={`transition-all ${
                  !counselor.is_active ? 'opacity-60' : ''
                }`}
              >
                <CardContent className="pt-6 space-y-3">
                  {/* Name + Active badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{counselor.name}</p>
                      {counselor.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {counselor.email}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        counselor.is_active
                          ? 'bg-green-50 text-green-700 border-green-200 flex-shrink-0'
                          : 'bg-red-50 text-red-700 border-red-200 flex-shrink-0'
                      }
                    >
                      {counselor.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {/* Institution */}
                  <p className="text-xs text-muted-foreground truncate">
                    {counselor.institutions?.name || 'Unknown Institution'}
                  </p>

                  {/* Primary Role */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Primary Role:</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getRoleBadgeClass(counselor.profile_role)}`}
                    >
                      {getRoleLabel(counselor.profile_role)}
                    </Badge>
                  </div>

                  {/* Leads + Specializations */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Leads: {counselor.current_leads}/{counselor.max_leads}
                      </span>
                      {specsDisplay && (
                        <span className="text-muted-foreground truncate ml-2 max-w-[50%]">
                          Specs: {specsDisplay}
                        </span>
                      )}
                      {!specsDisplay && (
                        <span className="text-muted-foreground">Specs: —</span>
                      )}
                    </div>
                    <Progress value={Math.min(leadsPercent, 100)} className="h-1.5" />
                  </div>

                  {/* Actions — Toggle and Remove both go through guardrail dialog */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => openGuardrailDialog('toggle', counselor)}
                      disabled={isToggling || isRemoving}
                    >
                      {isToggling ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : counselor.is_active ? (
                        <ToggleRight className="h-3.5 w-3.5 mr-1.5" />
                      ) : (
                        <ToggleLeft className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {counselor.is_active ? 'Deactivate' : 'Activate'}
                    </Button>

                    {canDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={isRemoving || isToggling}
                        onClick={() => openGuardrailDialog('remove', counselor)}
                        aria-label={`Remove counselor ${counselor.name}`}
                      >
                        {isRemoving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Agent G — Centralized mutation guardrail dialog (typed-confirm) */}
      <AlertDialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) closeGuardrailDialog();
        }}
      >
        <AlertDialogContent>
          {dialog.counselor &&
            (() => {
              const counselor = dialog.counselor;
              const mode = dialog.mode;
              const isToggleMode = mode === 'toggle';
              const willActivate = isToggleMode && !counselor.is_active;
              const requiredKeyword = isToggleMode
                ? willActivate
                  ? 'ACTIVATE'
                  : 'DEACTIVATE'
                : 'REMOVE';
              const isConfirmed = confirmInput === requiredKeyword;
              const title = isToggleMode
                ? willActivate
                  ? 'Activate Counselor'
                  : 'Deactivate Counselor'
                : 'Remove Counselor';
              const actionWord = isToggleMode
                ? willActivate
                  ? 'activate'
                  : 'deactivate'
                : 'remove';
              const showImpact = !willActivate;
              const totalImpact =
                (impact?.assigned_leads ?? 0) +
                (impact?.call_logs ?? 0) +
                (impact?.callback_queue ?? 0) +
                (impact?.counselor_record_leads ?? 0);

              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3">
                        <div>
                          You are about to {actionWord}{' '}
                          <span className="font-medium text-foreground">
                            {counselor.name}
                          </span>
                          {counselor.email && (
                            <>
                              {' '}
                              <span className="text-muted-foreground">
                                ({counselor.email})
                              </span>
                            </>
                          )}
                          .
                        </div>

                        {/* Impact preview — only for destructive flows */}
                        {showImpact && (
                          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                            <div className="font-medium text-foreground">
                              Impact preview
                            </div>
                            {isLoadingImpact ? (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Calculating impact…</span>
                              </div>
                            ) : impact ? (
                              <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                                <li>
                                  <span className="text-foreground font-medium">
                                    {impact.assigned_leads}
                                  </span>{' '}
                                  assigned lead{impact.assigned_leads === 1 ? '' : 's'}{' '}
                                  will lose their counselor link
                                </li>
                                <li>
                                  <span className="text-foreground font-medium">
                                    {impact.call_logs}
                                  </span>{' '}
                                  historical call log
                                  {impact.call_logs === 1 ? '' : 's'} reference this counselor
                                </li>
                                <li>
                                  <span className="text-foreground font-medium">
                                    {impact.callback_queue}
                                  </span>{' '}
                                  callback queue item
                                  {impact.callback_queue === 1 ? '' : 's'} assigned to them
                                </li>
                                {impact.counselor_record_leads > 0 && (
                                  <li>
                                    <span className="text-foreground font-medium">
                                      {impact.counselor_record_leads}
                                    </span>{' '}
                                    lead{impact.counselor_record_leads === 1 ? '' : 's'} linked via counselor record
                                  </li>
                                )}
                                {totalImpact === 0 && (
                                  <li className="list-none text-muted-foreground italic">
                                    No active leads or recent activity will be affected.
                                  </li>
                                )}
                              </ul>
                            ) : (
                              <div className="text-muted-foreground italic">
                                Impact data unavailable.
                              </div>
                            )}
                          </div>
                        )}

                        {/* Audit notice */}
                        <div className="text-xs text-muted-foreground">
                          {isToggleMode
                            ? 'This change is recorded in the counselors audit log.'
                            : 'This is a soft-delete: the record is retained, marked inactive, and recorded in the counselors audit log. Lead history remains queryable.'}
                        </div>

                        {/* Type-to-confirm */}
                        <div className="space-y-1.5 pt-1">
                          <label
                            htmlFor="counselor-guardrail-confirm"
                            className="text-sm font-medium text-foreground block"
                          >
                            Type{' '}
                            <span className="font-mono font-semibold">
                              {requiredKeyword}
                            </span>{' '}
                            to confirm
                          </label>
                          <Input
                            id="counselor-guardrail-confirm"
                            value={confirmInput}
                            onChange={(e) => setConfirmInput(e.target.value)}
                            placeholder={requiredKeyword}
                            autoComplete="off"
                            spellCheck={false}
                            className="font-mono"
                          />
                        </div>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className={
                        willActivate
                          ? ''
                          : 'bg-red-600 hover:bg-red-700 disabled:bg-red-300'
                      }
                      disabled={!isConfirmed}
                      onClick={(e) => {
                        if (!isConfirmed) {
                          e.preventDefault();
                          return;
                        }
                        handleConfirm();
                      }}
                    >
                      {isToggleMode
                        ? willActivate
                          ? 'Activate'
                          : 'Deactivate'
                        : 'Remove'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
