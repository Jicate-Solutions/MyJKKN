'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../../_components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  TrendingUp,
  AlertTriangle,
  Ban,
  Bell,
  Download,
  Mail,
  Shield,
  FileText,
  Calendar,
  Filter,
  Search,
  Unlock
} from 'lucide-react';
import { OKRComplianceAdminService } from '@/lib/services/okr';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { UserBadge } from '@/types/okr';

// Badge configuration
const badgeConfig: Record<UserBadge, {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
  bgClass: string;
}> = {
  green: {
    label: 'Compliant',
    icon: CheckCircle2,
    className: 'text-green-400',
    bgClass: 'bg-green-950/50 text-green-400 border-green-700'
  },
  yellow: {
    label: 'Warning',
    icon: AlertCircle,
    className: 'text-yellow-400',
    bgClass: 'bg-yellow-950/50 text-yellow-400 border-yellow-700'
  },
  red: {
    label: 'Critical',
    icon: XCircle,
    className: 'text-red-400',
    bgClass: 'bg-red-950/50 text-red-400 border-red-700'
  },
  blocked: {
    label: 'Blocked',
    icon: Ban,
    className: 'text-orange-400',
    bgClass: 'bg-orange-950/50 text-orange-400 border-orange-700'
  }
};

export default function AdminCompliancePage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadgeFilter, setSelectedBadgeFilter] = useState<string>('all');
  const [selectedUserToUnblock, setSelectedUserToUnblock] = useState<any>(null);
  const [unblockReason, setUnblockReason] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Fetch compliance stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['compliance-stats'],
    queryFn: () => OKRComplianceAdminService.getComplianceStats()
  });

  // Fetch all users compliance
  const { data: usersCompliance, isLoading: usersLoading } = useQuery({
    queryKey: ['all-users-compliance'],
    queryFn: () => OKRComplianceAdminService.getAllUsersCompliance()
  });

  // Fetch compliance logs
  const { data: complianceLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['compliance-logs', dateRange],
    queryFn: () => OKRComplianceAdminService.getComplianceLogs({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: 100
    })
  });

  // Unblock user mutation
  const unblockMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      OKRComplianceAdminService.unblockUserWithLog(userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users-compliance'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-stats'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-logs'] });
      setSelectedUserToUnblock(null);
      setUnblockReason('');
    }
  });

  // Export report
  const handleExportReport = () => {
    OKRComplianceAdminService.exportComplianceReport();
  };

  // Send bulk reminders
  const handleBulkRemind = () => {
    const atRiskUsers = filteredUsers.filter((u: any) =>
      u.current_badge === 'yellow' || u.current_badge === 'red' || u.current_badge === 'blocked'
    );

    if (atRiskUsers.length === 0) {
      toast.info('No users need reminders');
      return;
    }

    OKRComplianceAdminService.sendBulkReminders(atRiskUsers.map((u: any) => u.user_id));
  };

  // Filtered and searched users
  const filteredUsers = useMemo(() => {
    if (!usersCompliance) return [];

    return usersCompliance.filter((user: any) => {
      // Badge filter
      if (selectedBadgeFilter !== 'all' && user.current_badge !== selectedBadgeFilter) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const email = user.user?.email?.toLowerCase() || '';
        const name = user.user?.raw_user_meta_data?.full_name?.toLowerCase() || '';
        const query = searchQuery.toLowerCase();
        return email.includes(query) || name.includes(query);
      }

      return true;
    });
  }, [usersCompliance, selectedBadgeFilter, searchQuery]);

  if (statsLoading || usersLoading) {
    return (
      <ContentLayout title="Compliance Audit">
        <OKRErrorBoundary>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <div className="grid gap-6 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
        </OKRErrorBoundary>
      </ContentLayout>
    );
  }

  const blockedUsers = filteredUsers.filter((u: any) => u.current_badge === 'blocked');
  const atRiskUsers = filteredUsers.filter((u: any) => u.current_badge === 'yellow' || u.current_badge === 'red');

  return (
    <ContentLayout title="Compliance Audit Dashboard">
      <OKRErrorBoundary>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-6 w-6 text-orange-400" />
              Compliance Audit Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitor OKR check-in compliance and enforcement across the organization
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportReport}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkRemind}
              disabled={atRiskUsers.length === 0 && blockedUsers.length === 0}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Reminders ({atRiskUsers.length + blockedUsers.length})
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Users */}
          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total Users in OKR System
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.total_users || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Active participants
              </p>
            </CardContent>
          </Card>

          {/* Compliance Rate */}
          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Compliance Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-400">
                {stats?.compliance_rate || 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Non-blocked users
              </p>
            </CardContent>
          </Card>

          {/* Blocked Users */}
          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Ban className="h-4 w-4" />
                Blocked This Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-400">
                {stats?.blocked_this_week || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                New enforcement actions
              </p>
            </CardContent>
          </Card>

          {/* Check-in Completion */}
          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Avg Check-in Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-400">
                {stats?.avg_check_in_completion || 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Last 7 days
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Status Distribution */}
        <Card className="border-slate-800">
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
            <CardDescription>
              Breakdown of user compliance badges
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(badgeConfig).map(([badge, config]) => {
                const Icon = config.icon;
                const count = stats?.[`${badge}_count` as keyof typeof stats] || 0;
                return (
                  <div
                    key={badge}
                    className="flex items-center gap-3 p-4 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    <Icon className={cn('h-8 w-8', config.className)} />
                    <div>
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-xs text-muted-foreground">{config.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Blocked Users Table */}
        {blockedUsers.length > 0 && (
          <Card className="border-orange-800 bg-orange-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-400">
                <Ban className="h-5 w-5" />
                Blocked Users ({blockedUsers.length})
              </CardTitle>
              <CardDescription>
                Users currently blocked from system access
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Days Since Check-in</TableHead>
                    <TableHead>Consecutive Missed</TableHead>
                    <TableHead>Blocked Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blockedUsers.map((user: any) => (
                    <TableRow key={user.id} className="border-slate-800">
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {user.user?.raw_user_meta_data?.full_name || 'N/A'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {user.user?.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badgeConfig.blocked.bgClass}>
                          <Ban className="h-3 w-3 mr-1" />
                          Blocked
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-orange-400 font-semibold">
                          {user.days_since_last_check_in || 'Never'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">{user.consecutive_missed || 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {user.updated_at ? format(new Date(user.updated_at), 'MMM dd, yyyy') : 'N/A'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedUserToUnblock(user)}
                            >
                              <Unlock className="h-4 w-4 mr-2" />
                              Unblock
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Unblock User</DialogTitle>
                              <DialogDescription>
                                This will restore access for {user.user?.email}. Provide a reason for the audit log.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="unblock-reason">Reason for Unblocking</Label>
                                <Input
                                  id="unblock-reason"
                                  placeholder="e.g., Completed missed check-ins, manager override..."
                                  value={unblockReason}
                                  onChange={(e) => setUnblockReason(e.target.value)}
                                  className="mt-1.5"
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setSelectedUserToUnblock(null);
                                  setUnblockReason('');
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => {
                                  if (!unblockReason.trim()) {
                                    toast.error('Please provide a reason');
                                    return;
                                  }
                                  unblockMutation.mutate({
                                    userId: user.user_id,
                                    reason: unblockReason
                                  });
                                }}
                                disabled={unblockMutation.isPending}
                              >
                                {unblockMutation.isPending ? 'Unblocking...' : 'Unblock User'}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* All Users Compliance Table */}
        <Card className="border-slate-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>All Users Compliance</CardTitle>
                <CardDescription>
                  Complete compliance status for all OKR participants
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
                <Select value={selectedBadgeFilter} onValueChange={setSelectedBadgeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Filter by badge" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Badges</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="yellow">Yellow</SelectItem>
                    <SelectItem value="red">Red</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead>User</TableHead>
                  <TableHead>Badge Status</TableHead>
                  <TableHead>Consecutive Missed</TableHead>
                  <TableHead>Last Check-in</TableHead>
                  <TableHead>Days Since</TableHead>
                  <TableHead>Total Check-ins</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-lg font-medium">No users found</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Try adjusting your filters
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user: any) => {
                    const badgeInfo = badgeConfig[user.current_badge as UserBadge];
                    const BadgeIcon = badgeInfo.icon;
                    return (
                      <TableRow key={user.id} className="border-slate-800 hover:bg-slate-900/50">
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {user.user?.raw_user_meta_data?.full_name || 'N/A'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {user.user?.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badgeInfo.bgClass}>
                            <BadgeIcon className="h-3 w-3 mr-1" />
                            {badgeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            'font-mono',
                            user.consecutive_missed >= 2 ? 'text-red-400' : 'text-muted-foreground'
                          )}>
                            {user.consecutive_missed || 0}
                          </span>
                        </TableCell>
                        <TableCell>
                          {user.last_check_in_date ? (
                            <span className="text-sm">
                              {format(new Date(user.last_check_in_date), 'MMM dd, yyyy')}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            'font-semibold',
                            user.days_since_last_check_in > 14 ? 'text-red-400' :
                            user.days_since_last_check_in > 7 ? 'text-yellow-400' :
                            'text-green-400'
                          )}>
                            {user.days_since_last_check_in !== null ? `${user.days_since_last_check_in}d` : 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono">{user.total_check_ins || 0}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Audit Log Table */}
        <Card className="border-slate-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Audit Log
                </CardTitle>
                <CardDescription>
                  Complete history of compliance actions
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Date Range:</Label>
                  <Input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-auto"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-auto"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="p-12 text-center">
                <Skeleton className="h-8 w-full mb-4" />
                <Skeleton className="h-8 w-full mb-4" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Performed By</TableHead>
                    <TableHead>Badge Change</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!complianceLogs || complianceLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-lg font-medium">No audit logs found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Try adjusting the date range
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    complianceLogs.map((log: any) => (
                      <TableRow key={log.id} className="border-slate-800">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">
                              {log.user?.raw_user_meta_data?.full_name || 'N/A'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {log.user?.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {log.action.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {log.performed_by_user?.email || 'System'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {log.previous_badge && log.new_badge ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {log.previous_badge}
                              </Badge>
                              <span className="text-muted-foreground">→</span>
                              <Badge variant="outline" className="text-xs">
                                {log.new_badge}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {log.reason || 'No reason provided'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
