'use client';

// components/events/shared/volunteers-board.tsx
// Shared volunteer-roster board for ANY event type (Events Platform Promotion PR4;
// MyJKKN volunteer link 2026-07).
//
// Check-in is TYPE-FIRST, mirroring committee members and tournament entries:
//   - "JKKN Volunteer" → search the staff/student directory (role tabs + cascading
//     academic filters) and PICK a person; the row stores member_id/member_role/
//     member_email so the volunteer resolves back to their profile.
//   - "Guest"          → free-text name + phone for outside helpers (decision #8).
// Organizers can check volunteers out / remove them. Read-only when canManage is false.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Plus,
  Trash2,
  UserCheck,
  LogOut,
  Phone,
  MapPin,
  Users,
  Mail,
  X,
  Check,
} from 'lucide-react';
import {
  useEventVolunteers,
  useCheckinVolunteer,
  useCheckoutVolunteer,
  useDeleteVolunteer,
} from '@/hooks/events/shared/use-event-volunteers';
import {
  MemberDirectoryPicker,
  type DirectoryHit,
} from './member-picker-dialog';
import type { MarathonVolunteerCheckin } from '@/types/events-marathon';

type VolunteerType = 'jkkn' | 'guest';

function AddVolunteerForm({
  eventId,
  onClose,
  onDutyNames,
}: {
  eventId: string;
  onClose: () => void;
  onDutyNames: string[];
}) {
  const checkin = useCheckinVolunteer(eventId);
  const [type, setType] = useState<VolunteerType>('jkkn');
  const [picked, setPicked] = useState<DirectoryHit | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [station, setStation] = useState('');
  const [role, setRole] = useState('');

  const isGuest = type === 'guest';
  // JKKN volunteers must be picked from the directory; guests need a typed name.
  const identityReady = isGuest ? !!name.trim() : !!picked;
  const canSubmit = identityReady && !!station.trim();

  const switchType = (t: VolunteerType) => {
    setType(t);
    setPicked(null);
    setName('');
  };

  const submit = () => {
    if (!canSubmit) return;
    checkin.mutate(
      isGuest
        ? {
            event_id: eventId,
            volunteer_name: name.trim(),
            volunteer_phone: phone.trim() || undefined,
            station: station.trim(),
            role: role.trim() || undefined,
            is_external: true,
          }
        : {
            event_id: eventId,
            volunteer_name: picked!.name,
            volunteer_phone: phone.trim() || undefined,
            station: station.trim(),
            role: role.trim() || undefined,
            is_external: false,
            member_id: picked!.member_id,
            member_role: picked!.role,
            member_email: picked!.email,
          },
      { onSuccess: onClose }
    );
  };

  return (
    <>
      <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-1">
        {/* Volunteer type */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Volunteer type">
          {(
            [
              { key: 'jkkn', label: 'JKKN Volunteer', hint: 'Search staff or students', icon: Users },
              { key: 'guest', label: 'Guest', hint: 'Outside helper — no login', icon: UserCheck },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={type === t.key}
              onClick={() => switchType(t.key)}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                type === t.key
                  ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40'
                  : 'hover:bg-accent'
              }`}
            >
              <t.icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  type === t.key ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                }`}
              />
              <span>
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Identity */}
        {isGuest ? (
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. R. Kumar" />
          </div>
        ) : picked ? (
          <div className="flex items-start justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">{picked.name}</span>
                <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">
                  {picked.role}
                </Badge>
              </p>
              {picked.subtitle && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{picked.subtitle}</p>
              )}
              {picked.email && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  {picked.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              title="Choose a different person"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs">Volunteer *</Label>
            <MemberDirectoryPicker
              selectedIds={new Set()}
              onPick={(hit) => setPicked(hit)}
              existingNames={onDutyNames}
            />
            <p className="text-xs text-muted-foreground">
              Only MyJKKN staff and current students appear here. People already on duty are
              disabled.
            </p>
          </div>
        )}

        {/* Assignment */}
        <div className="space-y-1">
          <Label className="text-xs">Station *</Label>
          <Input
            placeholder="Gate A, Water Point 2…"
            value={station}
            onChange={(e) => setStation(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Input placeholder="Optional" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input
              placeholder="Optional"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
      </div>

      <DialogFooter className="shrink-0 gap-2 border-t pt-3 sm:gap-0">
        <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={checkin.isPending}>
          Cancel
        </Button>
        <Button className="w-full sm:w-auto" onClick={submit} disabled={checkin.isPending || !canSubmit}>
          {checkin.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Check In
        </Button>
      </DialogFooter>
    </>
  );
}

function AddVolunteerDialog({
  open,
  onClose,
  eventId,
  onDutyNames,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  onDutyNames: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg p-4 sm:max-h-[85dvh] sm:w-full sm:max-w-xl sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="pr-6 text-base sm:text-lg">Check In Volunteer</DialogTitle>
        </DialogHeader>
        {open && <AddVolunteerForm eventId={eventId} onClose={onClose} onDutyNames={onDutyNames} />}
      </DialogContent>
    </Dialog>
  );
}

function VolunteerCard({
  volunteer,
  eventId,
  canManage,
}: {
  volunteer: MarathonVolunteerCheckin;
  eventId: string;
  canManage: boolean;
}) {
  const checkout = useCheckoutVolunteer(eventId);
  const del = useDeleteVolunteer(eventId);
  const isExternal = !!volunteer.external_name;
  const checkedOut = !!volunteer.checked_out_at;
  const memberRole = volunteer.member_role;

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-2 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserCheck className={`h-4 w-4 ${checkedOut ? 'text-muted-foreground' : 'text-emerald-600'}`} />
            <span className="truncate font-semibold">{volunteer.volunteer_name}</span>
            {isExternal ? (
              <Badge variant="outline" className="text-[10px]">
                Guest
              </Badge>
            ) : memberRole ? (
              <Badge variant="secondary" className="text-[10px] capitalize">
                {memberRole}
              </Badge>
            ) : null}
            {checkedOut && (
              <Badge variant="secondary" className="text-[10px]">
                Checked out
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {volunteer.station}
            </span>
            {volunteer.role && <span>{volunteer.role}</span>}
            {volunteer.volunteer_phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {volunteer.volunteer_phone}
              </span>
            )}
            {volunteer.member_email && (
              <span className="flex items-center gap-1 truncate">
                <Mail className="h-3 w-3 shrink-0" /> {volunteer.member_email}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            {!checkedOut && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[11px]"
                disabled={checkout.isPending}
                onClick={() => checkout.mutate(volunteer.id)}
                title="Check out"
              >
                <LogOut className="h-3.5 w-3.5" /> Out
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={del.isPending}
              onClick={() => del.mutate(volunteer.id)}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function VolunteersBoard({ eventId, canManage = true }: { eventId: string; canManage?: boolean }) {
  const { data: volunteers, isLoading } = useEventVolunteers(eventId);
  const [addOpen, setAddOpen] = useState(false);

  const rows = volunteers ?? [];
  const onDutyRows = rows.filter((v) => !v.checked_out_at);
  const onDuty = onDutyRows.length;
  // Names still on duty — the picker disables them so nobody is checked in twice
  // (the partial unique index enforces the same rule server-side).
  const onDutyNames = onDutyRows.filter((v) => v.member_id).map((v) => v.volunteer_name);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Volunteers</h3>
          <p className="text-sm text-muted-foreground">
            Station roster — staff, students and guests. {onDuty} on duty.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Check In
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No volunteers checked in yet</p>
              <p className="text-xs text-muted-foreground">
                Check in JKKN staff and students from the directory, or add an outside guest.
              </p>
            </div>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Check In
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((v) => (
            <VolunteerCard key={v.id} volunteer={v} eventId={eventId} canManage={canManage} />
          ))}
        </div>
      )}

      <AddVolunteerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        eventId={eventId}
        onDutyNames={onDutyNames}
      />
    </div>
  );
}
