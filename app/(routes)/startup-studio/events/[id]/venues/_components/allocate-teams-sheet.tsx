'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search } from 'lucide-react';
import {
  useAllocateTeamsToVenue,
  useRemoveTeamFromVenue,
} from '@/hooks/startup-studio';
import { useEventRegistrations } from '@/hooks/startup-studio';
import { toast } from 'sonner';

interface AllocateTeamsSheetProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  venueId: string;
  dayType: 'build_day' | 'demo_day';
  venueCapacity: number;
  currentTeamCount: number;
  venueName: string;
  currentTeamIds: string[];
}

export function AllocateTeamsSheet({
  open,
  onClose,
  eventId,
  venueId,
  dayType,
  venueCapacity,
  currentTeamCount,
  venueName,
  currentTeamIds,
}: AllocateTeamsSheetProps) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: registrationsRaw, isLoading } = useEventRegistrations(eventId);
  const allocateTeams = useAllocateTeamsToVenue();
  const removeTeam = useRemoveTeamFromVenue();

  // Extract teams from registrations response
  const allTeams: any[] = Array.isArray(registrationsRaw)
    ? registrationsRaw
    : (registrationsRaw as any)?.data ?? [];

  // Filter: show unallocated teams for this day type
  const venueColumn = dayType === 'build_day' ? 'build_venue_id' : 'demo_venue_id';
  const unallocatedTeams = allTeams.filter((t: any) => {
    const isUnallocated = !t[venueColumn];
    const matchesSearch = !search || t.name?.toLowerCase().includes(search.toLowerCase());
    return isUnallocated && matchesSearch;
  });

  const toggleSelect = (teamId: string) => {
    setSelectedIds((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId]
    );
  };

  const handleAllocate = async () => {
    if (selectedIds.length === 0) return;
    try {
      await allocateTeams.mutateAsync({
        eventId,
        venueId,
        teamIds: selectedIds,
      });
      toast.success(`${selectedIds.length} team(s) allocated to ${venueName}`);
      setSelectedIds([]);
    } catch {
      toast.error('Failed to allocate teams');
    }
  };

  const handleRemoveTeam = async (teamId: string) => {
    try {
      await removeTeam.mutateAsync({ eventId, venueId, teamId });
      toast.success('Team removed from venue');
    } catch {
      toast.error('Failed to remove team');
    }
  };

  const remainingCapacity = venueCapacity - currentTeamCount;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Allocate Teams to {venueName}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="text-sm text-muted-foreground">
            Capacity: {currentTeamCount}/{venueCapacity} ({remainingCapacity} remaining)
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unallocated teams..."
              className="pl-9"
            />
          </div>

          {/* Unallocated team list */}
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {isLoading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {unallocatedTeams.map((t: any) => (
              <label
                key={t.id}
                className="flex items-center gap-3 rounded-md border p-2 cursor-pointer hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedIds.includes(t.id)}
                  onCheckedChange={() => toggleSelect(t.id)}
                />
                <div className="min-w-0">
                  <p className="text-sm truncate">{t.name}</p>
                  {t.institution?.name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {t.institution.name}
                    </p>
                  )}
                </div>
              </label>
            ))}
            {!isLoading && unallocatedTeams.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No unallocated teams found
              </p>
            )}
          </div>

          {/* Allocate button */}
          {selectedIds.length > 0 && (
            <Button
              className="w-full"
              onClick={handleAllocate}
              disabled={allocateTeams.isPending}
            >
              {allocateTeams.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Allocate {selectedIds.length} Team(s)
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
