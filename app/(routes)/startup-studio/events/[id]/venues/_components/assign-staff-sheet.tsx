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
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, UserPlus, X } from 'lucide-react';
import {
  useAvailableMentors,
  useAssignVenueStaff,
  useRemoveVenueStaff,
} from '@/hooks/startup-studio';
import { toast } from 'sonner';

interface AssignStaffSheetProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  venueId: string;
  dayType: 'build_day' | 'demo_day';
  existingStaff: any[];
  venueName: string;
}

export function AssignStaffSheet({
  open,
  onClose,
  eventId,
  venueId,
  dayType,
  existingStaff,
  venueName,
}: AssignStaffSheetProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = search.length >= 2 ? search : undefined;

  const { data: mentorsRaw, isLoading } = useAvailableMentors(eventId, debouncedSearch);
  const mentors: any[] = Array.isArray(mentorsRaw) ? mentorsRaw : [];

  const assignStaff = useAssignVenueStaff();
  const removeStaff = useRemoveVenueStaff();

  const existingIds = new Set(existingStaff.map((s: any) => s.user_id));

  const defaultRole = dayType === 'build_day' ? 'mentor' : 'judge';

  const handleAssign = async (userId: string) => {
    try {
      await assignStaff.mutateAsync({
        eventId,
        venueId,
        userIds: [userId],
        role: defaultRole,
      });
      toast.success('Staff assigned');
    } catch {
      toast.error('Failed to assign staff');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeStaff.mutateAsync({ eventId, venueId, userId });
      toast.success('Staff removed');
    } catch {
      toast.error('Failed to remove staff');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Assign {dayType === 'build_day' ? 'Mentors' : 'Judges'} to {venueName}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Current staff */}
          {existingStaff.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Current Staff</p>
              {existingStaff.map((s: any) => (
                <div
                  key={s.id || s.user_id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {s.user?.full_name || s.user_id}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {s.role}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive"
                    onClick={() => handleRemove(s.user_id)}
                    disabled={removeStaff.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Search Staff</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="pl-9"
              />
            </div>
          </div>

          {/* Results */}
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {isLoading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {mentors
              .filter((m: any) => !existingIds.has(m.id))
              .map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.email}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0"
                    onClick={() => handleAssign(m.id)}
                    disabled={assignStaff.isPending}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            {!isLoading && mentors.filter((m: any) => !existingIds.has(m.id)).length === 0 && search.length >= 2 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No matching staff found
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
