'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  useEventRegistrations,
  useToggleCheckIn,
  useToggleLovableVerified,
} from '@/hooks/startup-studio/use-event-registrations';
import { Laptop, Search, Users, Loader2 } from 'lucide-react';

export function RegistrationsTable({ eventId }: { eventId: string }) {
  const [search, setSearch] = useState('');
  const { data: registrations, isLoading } = useEventRegistrations({ event_id: eventId, search: search || undefined });
  const toggleCheckIn = useToggleCheckIn();
  const toggleLovable = useToggleLovableVerified();

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const teams = registrations || [];
  const totalMembers = teams.reduce((sum, t) => sum + (t.team_members?.length || 0), 0);
  const totalLaptops = teams.reduce((sum, t) =>
    sum + (t.team_members?.filter((m: any) => m.has_laptop).length || 0), 0);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{teams.length}</p>
          <p className="text-xs text-muted-foreground">Teams</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{totalMembers}</p>
          <p className="text-xs text-muted-foreground">Members</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{totalLaptops}</p>
          <p className="text-xs text-muted-foreground">Laptops</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{teams.filter(t => t.checked_in).length}</p>
          <p className="text-xs text-muted-foreground">Checked In</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search teams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Leader</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>College</TableHead>
              <TableHead className="text-center">Lovable</TableHead>
              <TableHead className="text-center">Check-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((reg, index) => (
              <TableRow key={reg.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{reg.team_name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{reg.problem_idea}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{reg.owner?.full_name || reg.owner?.email}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm">
                    <Users className="h-3 w-3" /> {reg.team_members?.length || 0}
                    <Laptop className="h-3 w-3 ml-2" />
                    {reg.team_members?.filter((m: any) => m.has_laptop).length || 0}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{reg.institution?.name || '-'}</TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={reg.lovable_verified}
                    onCheckedChange={(checked) => {
                      toggleLovable.mutate({
                        registrationId: reg.id,
                        verified: !!checked,
                      });
                    }}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={reg.checked_in}
                    onCheckedChange={(checked) => {
                      toggleCheckIn.mutate({
                        registrationId: reg.id,
                        checked_in: !!checked,
                      });
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {teams.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No registrations found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
