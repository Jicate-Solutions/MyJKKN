'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useFollowUpReminders,
  useCompleteReminder,
  useSnoozeReminder,
} from '@/hooks/admission/use-reminders';
import type { FollowUpReminder } from '@/lib/services/admission/reminders-service';
import {
  Bell,
  Clock,
  AlertCircle,
  CheckCircle,
  Phone,
  MessageCircle,
  Mail,
  Calendar,
  RefreshCw,
  Settings,
  MoreHorizontal,
  ExternalLink,
  Zap,
  Timer,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// ============================================================================
// Auto-follow-up rules — local config state (not yet DB-backed)
// ============================================================================

interface AutoFollowUpRule {
  id: string;
  name: string;
  trigger: 'no_response' | 'stage_change' | 'days_since_contact' | 'scheduled';
  triggerValue: number;
  action: 'call' | 'whatsapp' | 'email' | 'task';
  message: string;
  isActive: boolean;
  leadsAffected: number;
}

const DEFAULT_RULES: AutoFollowUpRule[] = [
  {
    id: '1',
    name: 'No Response Follow-up',
    trigger: 'no_response',
    triggerValue: 3,
    action: 'call',
    message: 'No response for {days} days - follow up recommended',
    isActive: true,
    leadsAffected: 0
  },
  {
    id: '2',
    name: 'Application Confirmation',
    trigger: 'stage_change',
    triggerValue: 1,
    action: 'email',
    message: 'Send application confirmation and next steps',
    isActive: true,
    leadsAffected: 0
  },
  {
    id: '3',
    name: 'Weekly Check-in',
    trigger: 'days_since_contact',
    triggerValue: 7,
    action: 'whatsapp',
    message: 'Weekly check-in with interested leads',
    isActive: false,
    leadsAffected: 0
  },
  {
    id: '4',
    name: 'Cold Lead Re-engagement',
    trigger: 'days_since_contact',
    triggerValue: 14,
    action: 'email',
    message: 'Re-engagement email for leads with no recent contact',
    isActive: true,
    leadsAffected: 0
  }
];

// ============================================================================
// UI HELPERS
// ============================================================================

function getActionIcon(action: string) {
  switch (action) {
    case 'call':
      return <Phone className="h-4 w-4" />;
    case 'whatsapp':
      return <MessageCircle className="h-4 w-4" />;
    case 'email':
      return <Mail className="h-4 w-4" />;
    default:
      return <CheckCircle className="h-4 w-4" />;
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'high':
      return 'text-red-600 bg-red-100 dark:bg-red-900/30';
    case 'medium':
      return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
    case 'low':
      return 'text-green-600 bg-green-100 dark:bg-green-900/30';
    default:
      return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30';
  }
}

function getDueDateStatus(dueDate: string) {
  const date = new Date(dueDate);
  if (isPast(date) && !isToday(date)) {
    return { label: 'Overdue', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' };
  }
  if (isToday(date)) {
    return { label: 'Due Today', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' };
  }
  if (isTomorrow(date)) {
    return { label: 'Tomorrow', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' };
  }
  return { label: formatDistanceToNow(date, { addSuffix: true }), color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-900/30' };
}

// ============================================================================
// REMINDER CARD
// ============================================================================

function ReminderCard({ reminder, onComplete, onSnooze, isCompleting, isSnoozing }: {
  reminder: FollowUpReminder;
  onComplete: () => void;
  onSnooze: () => void;
  isCompleting?: boolean;
  isSnoozing?: boolean;
}) {
  const dueStatus = getDueDateStatus(reminder.dueDate);
  const isOverdue = isPast(new Date(reminder.dueDate)) && !isToday(new Date(reminder.dueDate));

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      isOverdue && "border-red-300 dark:border-red-800"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              reminder.action === 'call' && "bg-green-100 dark:bg-green-900/30",
              reminder.action === 'whatsapp' && "bg-emerald-100 dark:bg-emerald-900/30",
              reminder.action === 'email' && "bg-blue-100 dark:bg-blue-900/30",
              reminder.action === 'task' && "bg-purple-100 dark:bg-purple-900/30"
            )}>
              {getActionIcon(reminder.action)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium truncate">{reminder.leadName}</h4>
                <Badge variant="outline" className="text-xs">
                  {reminder.leadStage}
                </Badge>
                {reminder.isHotLead && (
                  <Badge variant="destructive" className="text-xs">Hot</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {reminder.message}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {reminder.leadPhone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {reminder.leadPhone}
                  </span>
                )}
                <span className="flex items-center gap-1 text-muted-foreground">
                  Counselor: {reminder.counselorName}
                </span>
                <span className={cn("px-2 py-0.5 rounded-full", dueStatus.bg, dueStatus.color)}>
                  {dueStatus.label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={cn("text-xs", getPriorityColor(reminder.priority))}>
              {reminder.priority}
            </Badge>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={onSnooze}
                disabled={isSnoozing || isCompleting}
              >
                {isSnoozing ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Clock className="h-3 w-3 mr-1" />
                )}
                Snooze
              </Button>
              <Button
                size="sm"
                onClick={onComplete}
                disabled={isCompleting || isSnoozing}
              >
                {isCompleting ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3 mr-1" />
                )}
                Done
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    window.open(`/admission/leads/${reminder.leadId}`, '_blank');
                  }}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Lead
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info('Reschedule coming soon')}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Reschedule
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600" onClick={() => toast.info('Dismiss coming soon')}>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Dismiss
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// RULE CARD (local config — not DB-backed yet)
// ============================================================================

function RuleCard({ rule, onToggle }: { rule: AutoFollowUpRule; onToggle: () => void }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              rule.isActive ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-900/30"
            )}>
              <Zap className={cn(
                "h-5 w-5",
                rule.isActive ? "text-green-600" : "text-gray-400"
              )} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{rule.name}</h4>
                <Badge variant={rule.isActive ? "default" : "secondary"}>
                  {rule.isActive ? 'Active' : 'Paused'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {rule.trigger === 'no_response' && `After ${rule.triggerValue} days without response`}
                {rule.trigger === 'stage_change' && 'When lead stage changes'}
                {rule.trigger === 'days_since_contact' && `After ${rule.triggerValue} days since last contact`}
              </p>
              {rule.isActive && rule.leadsAffected > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Currently affecting {rule.leadsAffected} leads
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-4">
              {getActionIcon(rule.action)}
              <span className="text-sm text-muted-foreground capitalize">{rule.action}</span>
            </div>
            <Switch checked={rule.isActive} onCheckedChange={onToggle} />
            <Button variant="ghost" size="icon" onClick={() => toast.info('Rule settings coming soon')}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function RemindersSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map(i => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-3 w-36" />
              </div>
              <div className="flex flex-col gap-2 items-end">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-8 w-32" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN PAGE CONTENT
// ============================================================================

function AdmissionRemindersPageContent() {
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();
  const { reminders, isLoading, refetch } = useFollowUpReminders(selectedInstitutionId);
  const completeReminder = useCompleteReminder();
  const snoozeReminder = useSnoozeReminder();

  const [rules, setRules] = useState<AutoFollowUpRule[]>(DEFAULT_RULES);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddingRule, setIsAddingRule] = useState(false);

  // Track which reminder IDs are in-flight for complete/snooze
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [snoozingIds, setSnoozingIds] = useState<Set<string>>(new Set());

  // Classify reminders by due date
  const overdueCount = reminders.filter(r =>
    isPast(new Date(r.dueDate)) && !isToday(new Date(r.dueDate))
  ).length;

  const todayCount = reminders.filter(r =>
    isToday(new Date(r.dueDate))
  ).length;

  const upcomingCount = reminders.filter(r =>
    !isPast(new Date(r.dueDate)) && !isToday(new Date(r.dueDate))
  ).length;

  const filteredReminders = reminders.filter(r => {
    if (filter === 'overdue') return isPast(new Date(r.dueDate)) && !isToday(new Date(r.dueDate));
    if (filter === 'today') return isToday(new Date(r.dueDate));
    if (filter === 'upcoming') return !isPast(new Date(r.dueDate)) && !isToday(new Date(r.dueDate));
    return true;
  });

  const handleComplete = async (id: string) => {
    setCompletingIds(prev => new Set(prev).add(id));
    try {
      await completeReminder.mutateAsync(id);
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSnooze = async (id: string) => {
    setSnoozingIds(prev => new Set(prev).add(id));
    try {
      await snoozeReminder.mutateAsync(id);
    } finally {
      setSnoozingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success('Reminders refreshed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleToggleRule = (id: string) => {
    const rule = rules.find(r => r.id === id);
    setRules(prev =>
      prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r)
    );
    toast.success(rule?.isActive ? 'Rule paused' : 'Rule activated');
  };

  const dataLoading = accessLoading || isLoading;

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Follow-up Reminders">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Follow-up Reminders</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing || dataLoading}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
              <Button
                onClick={() => toast.info('Create reminder coming soon')}
              >
                <Bell className="h-4 w-4 mr-2" />
                Create Reminder
              </Button>
            </div>
          </div>

          {/* Page Title */}
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6" />
              Auto Follow-up Reminders
            </h1>
            <p className="text-muted-foreground mt-1">
              Automated reminders to ensure no lead falls through the cracks
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className={cn(
              "cursor-pointer transition-all",
              filter === 'all' && "ring-2 ring-primary"
            )} onClick={() => setFilter('all')}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">All Pending</p>
                    {dataLoading ? (
                      <Skeleton className="h-8 w-12 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold">{overdueCount + todayCount + upcomingCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={cn(
              "cursor-pointer transition-all",
              filter === 'overdue' && "ring-2 ring-red-500"
            )} onClick={() => setFilter('overdue')}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Overdue</p>
                    {dataLoading ? (
                      <Skeleton className="h-8 w-12 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={cn(
              "cursor-pointer transition-all",
              filter === 'today' && "ring-2 ring-amber-500"
            )} onClick={() => setFilter('today')}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Timer className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Due Today</p>
                    {dataLoading ? (
                      <Skeleton className="h-8 w-12 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-amber-600">{todayCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={cn(
              "cursor-pointer transition-all",
              filter === 'upcoming' && "ring-2 ring-green-500"
            )} onClick={() => setFilter('upcoming')}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Upcoming</p>
                    {dataLoading ? (
                      <Skeleton className="h-8 w-12 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-green-600">{upcomingCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="reminders" className="space-y-6">
            <TabsList>
              <TabsTrigger value="reminders">
                Reminders
                {(overdueCount > 0) && (
                  <Badge variant="destructive" className="ml-2">{overdueCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="rules">Automation Rules</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            {/* Reminders Tab */}
            <TabsContent value="reminders" className="space-y-4">
              {dataLoading ? (
                <RemindersSkeleton />
              ) : filteredReminders.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                    <h2 className="text-xl font-semibold mb-2">All Caught Up!</h2>
                    <p className="text-muted-foreground mb-4">
                      {filter === 'all'
                        ? 'No pending follow-up reminders. Leads with a scheduled follow-up date will appear here.'
                        : `No ${filter} reminders.`}
                    </p>
                    {filter !== 'all' && (
                      <Button variant="outline" onClick={() => setFilter('all')}>
                        View All Reminders
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredReminders.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      onComplete={() => handleComplete(reminder.id)}
                      onSnooze={() => handleSnooze(reminder.id)}
                      isCompleting={completingIds.has(reminder.id)}
                      isSnoozing={snoozingIds.has(reminder.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Automation Rules Tab */}
            <TabsContent value="rules" className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium">Automation Rules</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure rules to automatically generate follow-up reminders
                  </p>
                </div>
                <Button
                  onClick={async () => {
                    setIsAddingRule(true);
                    try {
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      toast.info('Add rule coming soon');
                    } finally {
                      setIsAddingRule(false);
                    }
                  }}
                  disabled={isAddingRule}
                >
                  {isAddingRule ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Add Rule
                </Button>
              </div>
              <div className="space-y-3">
                {rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={() => handleToggleRule(rule.id)}
                  />
                ))}
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Completed Reminders</CardTitle>
                  <CardDescription>History of completed follow-up tasks</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Completed reminders will appear here</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionRemindersPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionRemindersPageContent />
    </AdmissionErrorBoundary>
  );
}
