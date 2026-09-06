'use client';

// components/events/shared/checkin-board.tsx
// Shared check-in station for ANY event type (Events Platform Promotion PR5).
// Lists registrations, supports search + status filter, and lets a manager mark / undo check-in per row.
// Reads/writes events_registrations.checked_in via the shared EventOpsService. Read-only when canManage=false.

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Search, UserCheck, Users } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useEventCheckinList,
  useEventOpsStats,
  useSetCheckedIn,
} from '@/hooks/events/shared/use-event-ops';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'checked_in' | 'not_checked_in';

function formatTime(dateStr: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function CheckinBoard({ eventId, canManage = true }: { eventId: string; canManage?: boolean }) {
  const { profile } = useAuth();
  const { data: registrations, isLoading } = useEventCheckinList(eventId);
  const { data: stats } = useEventOpsStats(eventId);
  const setCheckedIn = useSetCheckedIn(eventId);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const rows = (registrations ?? []) as any[];
    return rows.filter((r) => {
      if (searchQuery.length >= 2) {
        const q = searchQuery.toLowerCase();
        const matches =
          r.bib_number?.toLowerCase().includes(q) ||
          r.participant_name?.toLowerCase().includes(q) ||
          r.participant_email?.toLowerCase().includes(q) ||
          r.participant_phone?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (filterStatus === 'checked_in' && !r.checked_in) return false;
      if (filterStatus === 'not_checked_in' && r.checked_in) return false;
      return true;
    });
  }, [registrations, searchQuery, filterStatus]);

  const checkedInPct = stats ? Math.round(((stats.checked_in ?? 0) / Math.max(stats.total, 1)) * 100) : 0;

  const handleToggle = (r: any) => {
    if (!profile?.id) return;
    setPendingId(r.id);
    setCheckedIn.mutate(
      { registrationId: r.id, checkedIn: !r.checked_in, operatorId: profile.id },
      { onSettled: () => setPendingId(null) }
    );
  };

  return (
    <div className="space-y-4">
      {/* Header + live counters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Check-in Station</h3>
          <p className="text-sm text-muted-foreground">Mark participants as arrived on the day.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 shadow-sm">
            <UserCheck className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold tabular-nums">{stats?.checked_in ?? 0}</span>
            <span className="text-xs text-muted-foreground">/ {stats?.total ?? 0}</span>
          </div>
          <div className="rounded-full border bg-green-50 px-3 py-2 shadow-sm">
            <span className="text-sm font-bold text-green-700 tabular-nums">{checkedInPct}%</span>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search BIB, name, email or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StatusFilter)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Participants</SelectItem>
                <SelectItem value="checked_in">Checked In</SelectItem>
                <SelectItem value="not_checked_in">Not Checked In</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="whitespace-nowrap">
              <Users className="mr-1 h-3 w-3" />
              {filtered.length}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[80px] font-semibold">BIB</TableHead>
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="hidden lg:table-cell font-semibold">Category</TableHead>
                    <TableHead className="hidden md:table-cell font-semibold">Stall</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="hidden md:table-cell font-semibold">Time</TableHead>
                    {canManage && <TableHead className="w-[110px] text-right font-semibold">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 7 : 6} className="py-12 text-center text-muted-foreground">
                        {searchQuery.length >= 2 ? `No results for "${searchQuery}"` : 'No registrations found.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r: any) => (
                      <TableRow
                        key={r.id}
                        className={cn('transition-colors', r.checked_in && 'bg-green-50/50 dark:bg-green-950/10')}
                      >
                        <TableCell className="font-mono text-sm font-bold">{r.bib_number ?? '-'}</TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="truncate font-medium">{r.participant_name}</div>
                          {r.participant_email && (
                            <div className="truncate text-xs text-muted-foreground">{r.participant_email}</div>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant="outline" className="text-xs">
                            {r.category?.code ?? r.category?.name ?? '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {r.stall?.stall_name ? (
                            <Badge variant="secondary" className="text-xs font-medium">
                              {r.stall.stall_name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.checked_in ? (
                            <Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
                              <UserCheck className="mr-1 h-3 w-3" />
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              No
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm tabular-nums text-muted-foreground">
                          {formatTime(r.checked_in_at)}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={r.checked_in ? 'ghost' : 'default'}
                              disabled={pendingId === r.id}
                              onClick={() => handleToggle(r)}
                              className="h-8 text-xs"
                            >
                              {pendingId === r.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : r.checked_in ? (
                                'Undo'
                              ) : (
                                'Check In'
                              )}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
