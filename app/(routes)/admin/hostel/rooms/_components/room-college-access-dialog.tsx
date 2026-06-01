'use client';
// app/(routes)/admin/hostel/rooms/_components/room-college-access-dialog.tsx
//
// Hostel rooms v2 PR 4a (2026-05-26)
//
// "Manage Access" dialog for a single hostel room. Lists every active
// room_institution_access grant as a chip with a revoke action, and offers a
// simple <Select> picker over the institutions catalog to grant new colleges.
//
// Idempotency: the underlying grantRoomAccess service re-activates a
// soft-revoked row if the user grants the same (room, institution) pair
// again — no error path needed in the UI.
//
// Per memory `radix-dialog-race-fix` we keep the confirm-revoke flow inside
// the same Dialog using a plain confirmation step (no nested AlertDialog),
// avoiding the pointer-event trap entirely.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShieldCheck, Trash2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useGrantRoomAccess,
  useRevokeRoomAccess,
  useRoomAccessByRoom,
} from '@/hooks/hostel/use-room-access';
import type { HostelRoomWithOccupancy } from '@/lib/services/campus-living/hostel-room-service';

interface InstitutionRow {
  id: string;
  name: string;
}

interface Props {
  room:
    | (HostelRoomWithOccupancy & {
        hostel_blocks: { id: string; name: string; code: string | null } | null;
      })
    | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoomCollegeAccessDialog({ room, open, onOpenChange }: Props) {
  const roomId = room?.id ?? '';
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

  // Reset transient state when the dialog closes so reopening a different
  // room doesn't carry stale selections forward. Done in the onOpenChange
  // handler rather than an effect to avoid the cascade-render lint
  // (react-hooks/set-state-in-effect).
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedInstitutionId('');
      setPendingRevokeId(null);
    }
    onOpenChange(next);
  };

  // ── Institutions catalog (kept inline; same query the picker uses) ───
  const { data: institutions, isLoading: institutionsLoading } = useQuery<InstitutionRow[]>({
    queryKey: ['institutions', 'for-room-access-picker'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data ?? []) as InstitutionRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Existing grants for this room ────────────────────────────────────
  const accessQuery = useRoomAccessByRoom(roomId);
  const activeGrants = useMemo(
    () => (accessQuery.data ?? []).filter((g) => g.is_active),
    [accessQuery.data],
  );
  const activeGrantInstitutionIds = useMemo(
    () => new Set(activeGrants.map((g) => g.institution_id)),
    [activeGrants],
  );

  // Institutions not already granted (avoid duplicate picker selection).
  const grantableInstitutions = useMemo(() => {
    if (!institutions) return [];
    return institutions.filter((inst) => !activeGrantInstitutionIds.has(inst.id));
  }, [institutions, activeGrantInstitutionIds]);

  const institutionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const inst of institutions ?? []) m.set(inst.id, inst.name);
    return m;
  }, [institutions]);

  const grantMutation = useGrantRoomAccess();
  const revokeMutation = useRevokeRoomAccess();

  const handleGrant = () => {
    if (!selectedInstitutionId || !roomId) return;
    grantMutation.mutate(
      { room_id: roomId, institution_id: selectedInstitutionId },
      {
        onSuccess: () => setSelectedInstitutionId(''),
      },
    );
  };

  const handleConfirmRevoke = () => {
    if (!pendingRevokeId || !roomId) return;
    revokeMutation.mutate(
      { accessId: pendingRevokeId, roomId },
      {
        onSettled: () => setPendingRevokeId(null),
      },
    );
  };

  const isLoadingDialogData = accessQuery.isLoading || institutionsLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Manage College Access
          </DialogTitle>
          <DialogDescription>
            {room ? (
              <>
                Room <span className="font-medium">{room.room_number}</span>
                {room.hostel_blocks?.name ? <> · {room.hostel_blocks.name}</> : null}
                {' '}— grant or revoke college access for this room. Revocations are
                soft (audit-preserving).
              </>
            ) : (
              'Select a room to manage access.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* ── Pending revoke confirmation (inline, no nested dialog) ── */}
        {pendingRevokeId ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
            <p className="font-medium text-amber-900">Revoke access?</p>
            <p className="mt-1 text-amber-800">
              This college will lose access to this room. The grant row is kept for
              audit; you can re-grant later from this same dialog.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleConfirmRevoke}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 h-3 w-3" />
                )}
                Confirm revoke
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPendingRevokeId(null)}
                disabled={revokeMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* ── Current grants ───────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Currently granted ({activeGrants.length})
          </p>
          {isLoadingDialogData ? (
            <div className="space-y-1">
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-7 w-2/3" />
            </div>
          ) : activeGrants.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              No colleges have access yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {activeGrants.map((g) => (
                <li key={g.id}>
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1 py-1 pr-1 pl-2"
                  >
                    <span>{institutionNameById.get(g.institution_id) ?? g.institution_id}</span>
                    <button
                      type="button"
                      aria-label="Revoke access"
                      onClick={() => setPendingRevokeId(g.id)}
                      disabled={pendingRevokeId === g.id || revokeMutation.isPending}
                      className="ml-1 rounded-full p-0.5 hover:bg-destructive/10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Grant a new institution ──────────────────────────────── */}
        <div className="space-y-2 border-t pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Grant access
          </p>
          <div className="flex gap-2">
            <Select
              value={selectedInstitutionId}
              onValueChange={setSelectedInstitutionId}
              disabled={institutionsLoading || grantableInstitutions.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={
                    institutionsLoading
                      ? 'Loading colleges…'
                      : grantableInstitutions.length === 0
                        ? 'All colleges already granted'
                        : 'Select a college…'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {grantableInstitutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={handleGrant}
              disabled={!selectedInstitutionId || grantMutation.isPending}
            >
              {grantMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              Grant
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
