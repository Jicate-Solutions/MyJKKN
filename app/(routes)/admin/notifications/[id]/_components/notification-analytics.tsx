'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Users,
  UserCheck,
  UserX,
  Search,
  Shield,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  BarChart3,
  AlertTriangle,
  Send,
  Clock,
  Zap,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface NotificationAnalyticsProps {
  notificationId: string;
}

export function NotificationAnalytics({ notificationId }: NotificationAnalyticsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedInstitution, setExpandedInstitution] = useState<string | null>(null);
  const [showAllUnread, setShowAllUnread] = useState(false);

  const queryClient = useQueryClient();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['notification-analytics', notificationId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/notifications/${notificationId}/analytics`, {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    refetchInterval: 30000 // Auto-refresh every 30s for live monitoring
  });

  // Fetch escalation report (only if notification requires acknowledgment)
  const { data: escalationReport, isLoading: isEscalationLoading } = useQuery({
    queryKey: ['escalation-report', notificationId],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/notifications/escalation-report?notification_id=${notificationId}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        // 400 means not an ack notification — that's fine, return null
        if (res.status === 400) return null;
        throw new Error('Failed to fetch escalation report');
      }
      return res.json();
    },
    refetchInterval: 30000
  });

  // Escalation mutation
  const escalateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/notifications/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to escalate');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(
        data.escalated > 0
          ? `Escalation sent for ${data.escalated} user(s)`
          : data.message || 'No pending escalations'
      );
      // Refresh escalation report and analytics
      queryClient.invalidateQueries({ queryKey: ['escalation-report', notificationId] });
      queryClient.invalidateQueries({ queryKey: ['notification-analytics', notificationId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Escalation failed');
    }
  });

  // Send reminders mutation (re-sends push to unread users)
  const reminderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/notifications/send-reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notificationId })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send reminders');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Reminders sent successfully');
      queryClient.invalidateQueries({ queryKey: ['notification-analytics', notificationId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send reminders');
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!analytics) return null;

  const { summary, by_institution, by_role, recent_readers, not_read } = analytics;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ─── Summary Cards ─────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="Total Recipients"
          value={summary.total_recipients}
          color="blue"
        />
        <SummaryCard
          icon={<Eye className="h-4 w-4" />}
          label="Read"
          value={summary.read_count}
          subtext={`${summary.read_pct}%`}
          color="green"
        />
        <SummaryCard
          icon={<EyeOff className="h-4 w-4" />}
          label="Not Read"
          value={summary.unread_count}
          color="red"
        />
        <SummaryCard
          icon={<Shield className="h-4 w-4" />}
          label="Acknowledged"
          value={summary.acknowledged_count}
          subtext={`${summary.ack_pct}%`}
          color="emerald"
        />
      </div>

      {/* ─── Reach Progress Bar ────────────────── */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Communication Reach</span>
            <span className="text-sm font-bold text-primary">{summary.read_pct}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all duration-1000"
              style={{ width: `${Math.max(summary.read_pct, 1)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span>{summary.read_count} read</span>
            <span>{summary.unread_count} pending</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Escalation Controls ─────────────── */}
      {escalationReport && (
        <EscalationControls
          escalationReport={escalationReport}
          onEscalate={() => escalateMutation.mutate()}
          onSendReminders={() => reminderMutation.mutate()}
          isEscalating={escalateMutation.isPending}
          isSendingReminders={reminderMutation.isPending}
        />
      )}

      {/* ─── Tabs: Institution / Role / People ── */}
      <Tabs defaultValue="institution" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="institution" className="text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            By Institution
          </TabsTrigger>
          <TabsTrigger value="role" className="text-xs sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            By Role
          </TabsTrigger>
          <TabsTrigger value="people" className="text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            People
          </TabsTrigger>
        </TabsList>

        {/* ─── Institution Tab ───────────────── */}
        <TabsContent value="institution" className="mt-4 space-y-2">
          {(by_institution || []).map((inst: any) => (
            <Card
              key={inst.institution_name}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedInstitution(
                expandedInstitution === inst.institution_name ? null : inst.institution_name
              )}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">
                        {inst.institution_name}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          inst.read_pct >= 50 ? 'bg-green-500' :
                          inst.read_pct >= 20 ? 'bg-yellow-500' : 'bg-red-500'
                        )}
                        style={{ width: `${Math.max(inst.read_pct, 2)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <div className="text-right">
                      <div className={cn(
                        'text-lg font-bold',
                        inst.read_pct >= 50 ? 'text-green-600' :
                        inst.read_pct >= 20 ? 'text-yellow-600' : 'text-red-600'
                      )}>
                        {inst.read_pct}%
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {inst.read_count}/{inst.total}
                      </div>
                    </div>
                    {expandedInstitution === inst.institution_name
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                </div>

                {expandedInstitution === inst.institution_name && (
                  <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2 text-center animate-in fade-in duration-200">
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-lg font-bold text-blue-600">{inst.total}</div>
                      <div className="text-[10px] text-blue-600/70">Total</div>
                    </div>
                    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30">
                      <div className="text-lg font-bold text-green-600">{inst.read_count}</div>
                      <div className="text-[10px] text-green-600/70">Read</div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                      <div className="text-lg font-bold text-emerald-600">{inst.ack_count}</div>
                      <div className="text-[10px] text-emerald-600/70">Acknowledged</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ─── Role Tab ──────────────────────── */}
        <TabsContent value="role" className="mt-4 space-y-2">
          {(by_role || []).map((r: any) => (
            <div
              key={r.role}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
            >
              <Badge variant="secondary" className="text-xs capitalize shrink-0">
                {r.role}
              </Badge>
              <div className="flex-1">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      r.read_pct >= 50 ? 'bg-green-500' :
                      r.read_pct >= 20 ? 'bg-yellow-500' : 'bg-red-500'
                    )}
                    style={{ width: `${Math.max(r.read_pct, 2)}%` }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className={cn(
                  'text-sm font-bold',
                  r.read_pct >= 50 ? 'text-green-600' :
                  r.read_pct >= 20 ? 'text-yellow-600' : 'text-red-600'
                )}>
                  {r.read_pct}%
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  ({r.read_count}/{r.total})
                </span>
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ─── People Tab ────────────────────── */}
        <TabsContent value="people" className="mt-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or institution..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Recent Readers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                <UserCheck className="h-4 w-4" />
                Read ({(recent_readers || []).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[300px] overflow-y-auto">
                {(recent_readers || [])
                  .filter((r: any) => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return (r.name || '').toLowerCase().includes(q) ||
                      (r.email || '').toLowerCase().includes(q) ||
                      (r.institution_name || '').toLowerCase().includes(q);
                  })
                  .map((reader: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{reader.name || reader.email}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {reader.role} · {reader.institution_name}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {reader.acknowledged_at && (
                          <Badge variant="outline" className="text-[10px] border-green-300 text-green-600">
                            Ack
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {reader.read_at ? format(new Date(reader.read_at), 'h:mm a') : ''}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Not Read */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2 text-red-700">
                  <UserX className="h-4 w-4" />
                  Not Read ({summary.unread_count})
                </span>
                {(not_read || []).length > 10 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setShowAllUnread(!showAllUnread)}
                  >
                    {showAllUnread ? 'Show Less' : `Show All (${(not_read || []).length})`}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {(not_read || [])
                  .filter((r: any) => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return (r.name || '').toLowerCase().includes(q) ||
                      (r.email || '').toLowerCase().includes(q) ||
                      (r.institution_name || '').toLowerCase().includes(q);
                  })
                  .slice(0, showAllUnread ? undefined : 10)
                  .map((person: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{person.name || person.email}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {person.role} · {person.institution_name}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-red-200 text-red-500 shrink-0">
                        Not Read
                      </Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Escalation Controls Component ──────────────────
function EscalationControls({
  escalationReport,
  onEscalate,
  onSendReminders,
  isEscalating,
  isSendingReminders
}: {
  escalationReport: {
    notification_id: string;
    notification_title: string;
    sent_at: string;
    deadline: string;
    deadline_hours: number;
    is_overdue: boolean;
    total_recipients: number;
    total_acknowledged: number;
    total_overdue: number;
    acknowledgment_rate_percent: number;
    by_institution: {
      institution_id: string;
      institution_name: string;
      overdue_count: number;
      users: {
        user_id: string;
        full_name: string;
        email: string;
        role: string;
        escalation_level: number;
        escalated_at: string | null;
      }[];
    }[];
  };
  onEscalate: () => void;
  onSendReminders: () => void;
  isEscalating: boolean;
  isSendingReminders: boolean;
}) {
  const [now, setNow] = useState(new Date());

  // Update clock every minute for deadline countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const deadline = new Date(escalationReport.deadline);
  const isOverdue = escalationReport.is_overdue;
  const totalOverdue = escalationReport.total_overdue;
  const totalAcknowledged = escalationReport.total_acknowledged;
  const totalRecipients = escalationReport.total_recipients;

  // Calculate escalated vs pending escalation from the by_institution data
  let escalatedCount = 0;
  let pendingEscalation = 0;

  for (const inst of escalationReport.by_institution) {
    for (const user of inst.users) {
      if (user.escalated_at) {
        escalatedCount++;
      } else {
        pendingEscalation++;
      }
    }
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Escalation Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Deadline Status */}
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
          isOverdue
            ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300'
            : 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
        )}>
          <Clock className="h-4 w-4 shrink-0" />
          {isOverdue ? (
            <span>
              Deadline passed{' '}
              <strong>
                {formatDistanceToNow(deadline, { addSuffix: false })}
              </strong>{' '}
              ago
            </span>
          ) : (
            <span>
              Deadline in{' '}
              <strong>
                {formatDistanceToNow(deadline, { addSuffix: false })}
              </strong>
            </span>
          )}
          <span className="ml-auto text-xs opacity-70">
            ({format(deadline, 'PPp')})
          </span>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white dark:bg-slate-900 border p-3 text-center">
            <div className={cn(
              'text-xl font-bold',
              totalOverdue > 0 ? 'text-red-600' : 'text-green-600'
            )}>
              {totalOverdue}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Overdue</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-900 border p-3 text-center">
            <div className="text-xl font-bold text-orange-600">
              {escalatedCount}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Escalated</div>
          </div>
          <div className="rounded-lg bg-white dark:bg-slate-900 border p-3 text-center">
            <div className={cn(
              'text-xl font-bold',
              pendingEscalation > 0 ? 'text-amber-600' : 'text-green-600'
            )}>
              {pendingEscalation}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Pending Escalation</div>
          </div>
        </div>

        {/* Acknowledgment progress */}
        <div>
          <div className="flex items-center justify-between mb-1.5 text-xs">
            <span className="text-muted-foreground">Acknowledgment Progress</span>
            <span className="font-semibold text-emerald-600">
              {escalationReport.acknowledgment_rate_percent}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                escalationReport.acknowledgment_rate_percent >= 80
                  ? 'bg-emerald-500'
                  : escalationReport.acknowledgment_rate_percent >= 50
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              )}
              style={{
                width: `${Math.max(escalationReport.acknowledgment_rate_percent, 1)}%`
              }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
            <span>{totalAcknowledged} acknowledged</span>
            <span>{totalRecipients - totalAcknowledged} remaining</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={onEscalate}
            disabled={isEscalating || pendingEscalation === 0}
          >
            {isEscalating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Escalating...
              </>
            ) : pendingEscalation === 0 ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                All Escalated
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                Send Escalation Now ({pendingEscalation})
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onSendReminders}
            disabled={isSendingReminders}
          >
            {isSendingReminders ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send Reminders
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Summary Card Component ─────────────────────────
function SummaryCard({ icon, label, value, subtext, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtext?: string;
  color: 'blue' | 'green' | 'red' | 'emerald';
}) {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600',
    green: 'bg-green-50 dark:bg-green-950/30 text-green-600',
    red: 'bg-red-50 dark:bg-red-950/30 text-red-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600'
  };

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs mb-2', colors[color])}>
          {icon}
          {label}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl sm:text-3xl font-bold">{value.toLocaleString()}</span>
          {subtext && <span className="text-sm text-muted-foreground">{subtext}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
