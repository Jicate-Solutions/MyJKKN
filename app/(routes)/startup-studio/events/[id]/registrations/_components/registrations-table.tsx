'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  useEventRegistrationsPaginated,
  useToggleCheckIn,
  useToggleLovableVerified,
} from '@/hooks/startup-studio/use-event-registrations';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Laptop, Search, Users, Loader2, CheckCircle2,
} from 'lucide-react';
import type { RegistrationStatus } from '@/types/startup-studio';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'registered', label: 'Registered' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'disqualified', label: 'Disqualified' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export function RegistrationsTable({ eventId }: { eventId: string }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const { data: result, isLoading } = useEventRegistrationsPaginated({
    event_id: eventId,
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? statusFilter as RegistrationStatus : undefined,
    page,
    limit: pageSize,
  });

  const toggleCheckIn = useToggleCheckIn();
  const toggleLovable = useToggleLovableVerified();

  const teams = result?.data || [];
  const pagination = result?.pagination || { page: 1, limit: 10, total_items: 0, total_pages: 0 };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer) clearTimeout(searchTimer);
    const timer = setTimeout(() => {
      setDebouncedSearch(value.trim());
      setPage(1);
    }, 400);
    setSearchTimer(timer);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Teams</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10">
                    <Checkbox aria-label="Select all" disabled />
                  </TableHead>
                  <TableHead className="min-w-[160px]">Team Name</TableHead>
                  <TableHead className="min-w-[80px]">Members</TableHead>
                  <TableHead className="min-w-[140px]">Institution</TableHead>
                  <TableHead className="min-w-[200px]">Problem Idea</TableHead>
                  <TableHead className="text-center min-w-[80px]">Laptops</TableHead>
                  <TableHead className="text-center min-w-[80px]">Lovable</TableHead>
                  <TableHead className="text-center min-w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No registrations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  teams.map((reg) => {
                    const memberCount = reg.team_members?.length || 0;
                    const laptopCount = reg.team_members?.filter((m: any) => m.has_laptop).length || 0;

                    return (
                      <TableRow key={reg.id} className="group">
                        <TableCell>
                          <Checkbox aria-label={`Select ${reg.team_name}`} />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{reg.team_name}</p>
                            <p className="text-xs text-muted-foreground">{reg.owner?.full_name || reg.owner?.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{memberCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{reg.institution?.name || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground line-clamp-2 max-w-[250px]">
                            {reg.problem_idea}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1 text-sm">
                            <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{laptopCount}</span>
                          </div>
                        </TableCell>
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
                          <StatusBadge status={reg.status} checkedIn={reg.checked_in} onToggleCheckIn={() => {
                            toggleCheckIn.mutate({
                              registrationId: reg.id,
                              checked_in: !reg.checked_in,
                            });
                          }} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-2">
              {pagination.total_items > 0
                ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, pagination.total_items)} of ${pagination.total_items}`
                : '0 results'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(1)}
              disabled={page <= 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-3 text-muted-foreground">
              Page {page} of {pagination.total_pages || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
              disabled={page >= pagination.total_pages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(pagination.total_pages)}
              disabled={page >= pagination.total_pages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, checkedIn, onToggleCheckIn }: {
  status: RegistrationStatus; checkedIn: boolean; onToggleCheckIn: () => void;
}) {
  if (checkedIn) {
    return (
      <Badge
        variant="default"
        className="gap-1 cursor-pointer bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
        onClick={onToggleCheckIn}
      >
        <CheckCircle2 className="h-3 w-3" /> Checked In
      </Badge>
    );
  }

  if (status === 'disqualified') {
    return <Badge variant="destructive">Disqualified</Badge>;
  }

  return (
    <Badge
      variant="secondary"
      className="cursor-pointer hover:bg-primary/10"
      onClick={onToggleCheckIn}
    >
      {status === 'registered' ? 'Registered' : status}
    </Badge>
  );
}
