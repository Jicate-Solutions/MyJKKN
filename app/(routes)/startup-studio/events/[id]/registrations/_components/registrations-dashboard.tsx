'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  AlertCircle,
  Users,
  Laptop,
  Building2,
  Search,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  useSSEvent,
  useEventRegistrations,
  useUpdateRegistrationStatus,
} from '@/hooks/startup-studio';

interface RegistrationsDashboardProps {
  eventId: string;
}

export function RegistrationsDashboard({ eventId }: RegistrationsDashboardProps) {
  const { data: eventRaw } = useSSEvent(eventId);
  const event = eventRaw as any;

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const filters: Record<string, any> = {};
  if (statusFilter !== 'all') filters.status = statusFilter;
  if (institutionFilter !== 'all') filters.institution = institutionFilter;

  const {
    data: registrationsRaw,
    isLoading,
    error,
  } = useEventRegistrations(eventId, Object.keys(filters).length > 0 ? filters : undefined);
  const updateStatus = useUpdateRegistrationStatus();

  // API returns { data: teams[], stats, metadata } — extract properly
  const responseData = registrationsRaw as any;
  const registrations: any[] = responseData?.data ?? (Array.isArray(registrationsRaw) ? registrationsRaw : []);
  const serverStats = responseData?.stats;

  // Filter by search query
  const filteredRegistrations = useMemo(() => {
    if (!searchQuery.trim()) return registrations;
    const q = searchQuery.toLowerCase();
    return registrations.filter(
      (r: any) =>
        r.name?.toLowerCase().includes(q) ||
        r.problem_idea?.toLowerCase().includes(q)
    );
  }, [registrations, searchQuery]);

  // Compute stats (use server stats if available, else compute client-side)
  const stats = useMemo(() => {
    if (serverStats) {
      // Map server stats to display format
      const institutionMap: Record<string, number> = {};
      (serverStats.by_institution || []).forEach((inst: any) => {
        institutionMap[inst.institution_name] = inst.team_count;
      });
      return {
        totalTeams: serverStats.total_teams || 0,
        totalMembers: serverStats.total_members || 0,
        totalLaptops: serverStats.laptops_confirmed || 0,
        institutionMap,
      };
    }

    const totalTeams = registrations.length;
    let totalMembers = 0;
    let totalLaptops = 0;
    const institutionMap: Record<string, number> = {};

    registrations.forEach((r: any) => {
      const members = r.members ?? [];
      totalMembers += members.length;
      totalLaptops += members.filter((m: any) => m.has_laptop).length;

      const inst = r.institution?.name || 'Unknown';
      institutionMap[inst] = (institutionMap[inst] || 0) + 1;
    });

    return { totalTeams, totalMembers, totalLaptops, institutionMap };
  }, [registrations, serverStats]);

  // Get unique institutions for filter
  const institutions = useMemo(() => {
    const set = new Set<string>();
    registrations.forEach((r: any) => {
      const instName = r.institution?.name;
      if (instName) set.add(instName);
    });
    return Array.from(set).sort();
  }, [registrations]);

  const toggleSelectTeam = (teamId: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTeams.size === filteredRegistrations.length) {
      setSelectedTeams(new Set());
    } else {
      setSelectedTeams(
        new Set(filteredRegistrations.map((r: any) => r.team_id || r.id))
      );
    }
  };

  const handleBulkAction = async (status: string) => {
    if (selectedTeams.size === 0) return;
    try {
      await updateStatus.mutateAsync({
        eventId,
        teamIds: Array.from(selectedTeams),
        status,
      });
      setSelectedTeams(new Set());
    } catch {
      // Error handled by React Query
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge variant="default">Confirmed</Badge>;
      case 'checked_in':
        return <Badge className="bg-green-600">Checked In</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'waitlisted':
        return <Badge variant="secondary">Waitlisted</Badge>;
      default:
        return <Badge variant="outline">{status || 'Pending'}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load registrations. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Registrations</h1>
        {event?.name && (
          <p className="text-sm text-muted-foreground mt-1">{event.name}</p>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Teams</p>
                <p className="text-2xl font-bold">{stats.totalTeams}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Members</p>
                <p className="text-2xl font-bold">{stats.totalMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2">
                <Laptop className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Laptops Confirmed</p>
                <p className="text-2xl font-bold">{stats.totalLaptops}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Institution Breakdown */}
      {Object.keys(stats.institutionMap).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Per-Institution Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institution</TableHead>
                  <TableHead className="text-right">Teams</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(stats.institutionMap)
                  .sort(([, a], [, b]) => b - a)
                  .map(([inst, count]) => (
                    <TableRow key={inst}>
                      <TableCell>{inst}</TableCell>
                      <TableCell className="text-right font-medium">
                        {count}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Teams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="checked_in">Checked In</SelectItem>
                <SelectItem value="waitlisted">Waitlisted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            {institutions.length > 0 && (
              <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Institution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Institutions</SelectItem>
                  {institutions.map((inst) => (
                    <SelectItem key={inst} value={inst}>
                      {inst}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Bulk Actions */}
          {selectedTeams.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                {selectedTeams.size} selected
              </span>
              <Button
                size="sm"
                onClick={() => handleBulkAction('confirmed')}
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-3 w-3" />
                )}
                Confirm Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction('checked_in')}
                disabled={updateStatus.isPending}
              >
                Check-in Selected
              </Button>
            </div>
          )}

          {/* Teams Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      filteredRegistrations.length > 0 &&
                      selectedTeams.size === filteredRegistrations.length
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-8" />
                <TableHead>Team Name</TableHead>
                <TableHead>Members</TableHead>
                <TableHead className="hidden md:table-cell">Institution</TableHead>
                <TableHead className="hidden lg:table-cell">Problem Idea</TableHead>
                <TableHead>Laptops</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRegistrations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No registrations found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRegistrations.map((reg: any) => {
                  const teamId = reg.team_id || reg.id;
                  const members = reg.members ?? [];
                  const laptopCount = members.filter((m: any) => m.has_laptop).length;
                  const isExpanded = expandedTeam === teamId;

                  return (
                    <TableRow key={teamId}>
                      <TableCell>
                        <Checkbox
                          checked={selectedTeams.has(teamId)}
                          onCheckedChange={() => toggleSelectTeam(teamId)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() =>
                            setExpandedTeam(isExpanded ? null : teamId)
                          }
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{reg.name || reg.team_name}</p>
                          {isExpanded && members.length > 0 && (
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {members.map((m: any, i: number) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span>{m.user_name || m.user_id || `Member ${i + 1}`}</span>
                                  {m.is_team_lead && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                                      Lead
                                    </Badge>
                                  )}
                                  {m.department && (
                                    <span className="text-muted-foreground">
                                      ({m.department})
                                    </span>
                                  )}
                                  {m.has_laptop && (
                                    <Laptop className="h-3 w-3 text-green-500" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{members.length}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {reg.institution?.name || '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell max-w-[200px]">
                        <p className="truncate text-sm">
                          {reg.problem_idea || '-'}
                        </p>
                      </TableCell>
                      <TableCell>
                        {laptopCount}/{members.length}
                      </TableCell>
                      <TableCell>{getStatusBadge(reg.status)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
