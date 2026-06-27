'use client';

// components/events/shared/volunteers-board.tsx
// Shared volunteer-roster board for ANY event type (Events Platform Promotion PR4).
// Lists who is staffing which station, supports adding a guest (non-JKKN) volunteer by name + phone
// (decision #8), and lets organizers check volunteers out / remove them. Read-only when canManage is false.

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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2, UserCheck, LogOut, Phone, MapPin } from 'lucide-react';
import {
  useEventVolunteers,
  useCheckinVolunteer,
  useCheckoutVolunteer,
  useDeleteVolunteer,
} from '@/hooks/events/shared/use-event-volunteers';
import type { MarathonVolunteerCheckin } from '@/types/events-marathon';

function AddVolunteerDialog({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const checkin = useCheckinVolunteer(eventId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [station, setStation] = useState('');
  const [role, setRole] = useState('');
  const [isExternal, setIsExternal] = useState(false);

  const reset = () => {
    setName('');
    setPhone('');
    setStation('');
    setRole('');
    setIsExternal(false);
  };

  const submit = () => {
    if (!name.trim() || !station.trim()) return;
    checkin.mutate(
      {
        event_id: eventId,
        volunteer_name: name.trim(),
        volunteer_phone: phone.trim() || undefined,
        station: station.trim(),
        role: role.trim() || undefined,
        is_external: isExternal,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Check In Volunteer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Station *</Label>
            <Input placeholder="Gate A, Water Point 2…" value={station} onChange={(e) => setStation(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Input placeholder="Optional" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input placeholder="Optional" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            <Checkbox checked={isExternal} onCheckedChange={(v) => setIsExternal(v === true)} />
            Guest (external, non-JKKN) volunteer — no login needed
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={checkin.isPending || !name.trim() || !station.trim()}>
            {checkin.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Check In
          </Button>
        </DialogFooter>
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

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-2 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserCheck className={`h-4 w-4 ${checkedOut ? 'text-muted-foreground' : 'text-emerald-600'}`} />
            <span className="truncate font-semibold">{volunteer.volunteer_name}</span>
            {isExternal && (
              <Badge variant="outline" className="text-[10px]">
                Guest
              </Badge>
            )}
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
  const onDuty = rows.filter((v) => !v.checked_out_at).length;

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
        <p className="py-8 text-center text-sm text-muted-foreground">
          No volunteers checked in yet{canManage ? ' — check in the first one.' : '.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((v) => (
            <VolunteerCard key={v.id} volunteer={v} eventId={eventId} canManage={canManage} />
          ))}
        </div>
      )}

      <AddVolunteerDialog open={addOpen} onClose={() => setAddOpen(false)} eventId={eventId} />
    </div>
  );
}
