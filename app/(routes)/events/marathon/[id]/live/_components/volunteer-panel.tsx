'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useCheckinVolunteer,
  useCheckoutVolunteer,
} from '@/hooks/events/marathon/use-marathon-live-ops';
import { UserPlus, LogOut, Users2 } from 'lucide-react';
import { format } from 'date-fns';
import type { MarathonVolunteerCheckin } from '@/types/events-marathon';

interface VolunteerPanelProps {
  eventId: string;
  volunteers: MarathonVolunteerCheckin[];
}

export function VolunteerPanel({ eventId, volunteers }: VolunteerPanelProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [station, setStation] = useState('');
  const [role, setRole] = useState('');

  const checkinVolunteer = useCheckinVolunteer();
  const checkoutVolunteer = useCheckoutVolunteer();

  const activeCount = volunteers.filter((v) => !v.checked_out_at).length;

  const handleCheckin = () => {
    if (!name.trim() || !station.trim()) return;

    checkinVolunteer.mutate(
      {
        event_id: eventId,
        volunteer_name: name.trim(),
        volunteer_phone: phone.trim() || undefined,
        station: station.trim(),
        role: role.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName('');
          setPhone('');
          setStation('');
          setRole('');
        },
      }
    );
  };

  const handleCheckout = (id: string) => {
    checkoutVolunteer.mutate({ id, eventId });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users2 className="h-4 w-4" />
            Volunteers
            <Badge variant="outline" className="text-xs">
              {activeCount} active
            </Badge>
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                Check In
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Check In Volunteer</DialogTitle>
                <DialogDescription>
                  Register a volunteer at their assigned station.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Volunteer name"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Station *</Label>
                    <Input
                      value={station}
                      onChange={(e) => setStation(e.target.value)}
                      placeholder="e.g. KM 5 Water"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Role</Label>
                    <Input
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="e.g. Water distribution"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCheckin}
                  disabled={!name.trim() || !station.trim() || checkinVolunteer.isPending}
                >
                  {checkinVolunteer.isPending ? 'Checking in...' : 'Check In'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-auto max-h-[300px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left">
                <th className="py-2 pr-2 font-medium text-xs text-muted-foreground">Name</th>
                <th className="py-2 pr-2 font-medium text-xs text-muted-foreground">Station</th>
                <th className="py-2 pr-2 font-medium text-xs text-muted-foreground">Role</th>
                <th className="py-2 pr-2 font-medium text-xs text-muted-foreground">Checked In</th>
                <th className="py-2 font-medium text-xs text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {volunteers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                    No volunteers checked in yet
                  </td>
                </tr>
              )}
              {volunteers.map((v) => {
                const isActive = !v.checked_out_at;
                return (
                  <tr key={v.id} className="border-b border-muted/50">
                    <td className="py-2 pr-2 font-medium">{v.volunteer_name}</td>
                    <td className="py-2 pr-2">{v.station}</td>
                    <td className="py-2 pr-2 text-muted-foreground">{v.role ?? '-'}</td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {format(new Date(v.checked_in_at), 'HH:mm')}
                    </td>
                    <td className="py-2">
                      {isActive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-2 text-red-600 hover:text-red-700"
                          onClick={() => handleCheckout(v.id)}
                          disabled={checkoutVolunteer.isPending}
                        >
                          <LogOut className="h-3 w-3 mr-1" />
                          Check Out
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Checked Out
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
