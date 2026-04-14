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
  AlertDialogTrigger,
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

export function CounselorList({ onRefresh }: CounselorListProps) {
  const supabase = createClientSupabaseClient();
  const { canAccess } = usePermissions();
  const canDelete = canAccess('admission', 'counselors.delete');

  const [counselors, setCounselors] = useState<CounselorRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchCounselors = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('admission_counselors')
        .select(`
          id, name, email, phone, is_active, max_leads, current_leads, specializations,
          institution_id, user_id, created_at,
          institutions!inner(name)
        `)
        .order('name');

      if (error) {
        toast.error('Failed to load counselors');
        console.error('[admission/counselors] Failed to fetch counselors:', error);
        return;
      }

      const records = (data || []) as unknown as CounselorRecord[];

      // Fetch profile roles for counselors that have a user_id
      const userIds = records
        .filter((c) => c.user_id)
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
            if (counselor.user_id && profileMap.has(counselor.user_id)) {
              const prof = profileMap.get(counselor.user_id)!;
              counselor.profile_role = prof.role;
              counselor.profile_full_name = prof.full_name;
            }
          }
        }
      }

      setCounselors(records);
    } catch {
      toast.error('Failed to load counselors');
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCounselors();
  }, [fetchCounselors]);

  const handleToggleActive = async (counselorId: string, currentActive: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(counselorId));
    try {
      const { error } = await supabase
        .from('admission_counselors')
        .update({ is_active: !currentActive })
        .eq('id', counselorId);

      if (error) {
        toast.error('Failed to update counselor status');
        console.error('[admission/counselors] Failed to toggle active:', error);
        return;
      }

      toast.success(currentActive ? 'Counselor deactivated' : 'Counselor activated');
      await fetchCounselors();
      onRefresh?.();
    } catch {
      toast.error('Failed to update counselor status');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(counselorId);
        return next;
      });
    }
  };

  const handleRemove = async (
    e: React.MouseEvent,
    counselorId: string,
    userId: string | null
  ) => {
    e.preventDefault();
    setRemovingId(counselorId);
    try {
      // 1. Delete from admission_counselors
      const { error: deleteError } = await supabase
        .from('admission_counselors')
        .delete()
        .eq('id', counselorId);

      if (deleteError) {
        toast.error('Failed to remove counselor');
        console.error('[admission/counselors] Failed to delete counselor:', deleteError);
        return;
      }

      // 2. Remove counselor role from user_roles (if user has it)
      if (userId) {
        const { data: counselorRole } = await supabase
          .from('custom_roles')
          .select('id')
          .eq('role_key', 'counselor')
          .single();

        if (counselorRole) {
          await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', userId)
            .eq('role_id', counselorRole.id);
        }
      }

      toast.success('Counselor removed');
      await fetchCounselors();
      onRefresh?.();
    } catch {
      toast.error('Failed to remove counselor');
    } finally {
      setRemovingId(null);
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

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() =>
                        handleToggleActive(counselor.id, counselor.is_active)
                      }
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
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={isRemoving}
                          >
                            {isRemoving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Counselor</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove{' '}
                              <span className="font-medium text-foreground">
                                {counselor.name}
                              </span>
                              ? This will delete their counselor record
                              {counselor.user_id &&
                                ' and remove the counselor role from their profile'}
                              . This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={(e) =>
                                handleRemove(e, counselor.id, counselor.user_id)
                              }
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
