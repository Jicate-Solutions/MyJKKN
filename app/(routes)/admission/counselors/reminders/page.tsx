'use client';

import { useState, useCallback } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useFollowUpReminders,
  useCompleteReminder,
  useSnoozeReminder,
  useRescheduleReminder,
  useDismissReminder,
  useCreateReminder,
  useSearchLeadsForReminder,
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
  Loader2,
  Search,
  Plus,
  Trash2,
  Edit3,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, isPast, isToday, isTomorrow, format } from 'date-fns';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// ============================================================================
// Auto-follow-up rules -- local config state (not yet DB-backed)
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

function getTriggerLabel(trigger: string, value: number) {
  switch (trigger) {
    case 'no_response':
      return `After ${value} days without response`;
    case 'stage_change':
      return 'When lead stage changes';
    case 'days_since_contact':
      return `After ${value} days since last contact`;
    case 'scheduled':
      return `Every ${value} days`;
    default:
      return trigger;
  }
}

// ============================================================================
// RESCHEDULE DIALOG
// ============================================================================

function RescheduleDialog({
  reminder,
  open,
  onOpenChange,
}: {
  reminder: FollowUpReminder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reschedule = useRescheduleReminder();
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('10:00');

  const handleSubmit = async () => {
    if (!reminder || !newDate) return;
    const dateTime = new Date(`${newDate}T${newTime}:00`);
    await reschedule.mutateAsync({
      leadId: reminder.leadId,
      newDate: dateTime.toISOString(),
    });
    onOpenChange(false);
    setNewDate('');
    setNewTime('10:00');
  };

  // Set default date to tomorrow when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && reminder) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setNewDate(format(tomorrow, 'yyyy-MM-dd'));
      // Try to preserve original time
      try {
        const originalDate = new Date(reminder.dueDate);
        setNewTime(format(originalDate, 'HH:mm'));
      } catch {
        setNewTime('10:00');
      }
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule Reminder</DialogTitle>
          <DialogDescription>
            {reminder ? `Reschedule follow-up for ${reminder.leadName}` : 'Select a new date and time'}
          </DialogDescription>
        </DialogHeader>

        {reminder && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="text-muted-foreground">Current due date:</p>
              <p className="font-medium">
                {format(new Date(reminder.dueDate), 'PPP p')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reschedule-date">New Date</Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reschedule-time">Time</Label>
                <Input
                  id="reschedule-time"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!newDate || reschedule.isPending}
          >
            {reschedule.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Calendar className="h-4 w-4 mr-2" />
            )}
            Reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// DISMISS CONFIRM DIALOG
// ============================================================================

function DismissDialog({
  reminder,
  open,
  onOpenChange,
}: {
  reminder: FollowUpReminder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dismiss = useDismissReminder();
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = async () => {
    if (!reminder) return;
    setIsDismissing(true);
    try {
      await dismiss.mutateAsync(reminder.leadId);
      onOpenChange(false);
    } finally {
      setIsDismissing(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dismiss Reminder</AlertDialogTitle>
          <AlertDialogDescription>
            {reminder
              ? `Are you sure you want to dismiss the follow-up reminder for ${reminder.leadName}? This will remove the scheduled follow-up date from this lead. This action cannot be undone.`
              : 'Are you sure you want to dismiss this reminder?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDismissing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDismiss}
            disabled={isDismissing}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDismissing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Dismiss
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// CREATE REMINDER DIALOG
// ============================================================================

function CreateReminderDialog({
  open,
  onOpenChange,
  institutionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string | null | undefined;
}) {
  const createReminder = useCreateReminder();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedLeadName, setSelectedLeadName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('10:00');
  const [notes, setNotes] = useState('');

  const { data: searchResults, isLoading: isSearching } = useSearchLeadsForReminder(
    institutionId,
    searchTerm
  );

  const resetForm = useCallback(() => {
    setSearchTerm('');
    setSelectedLeadId('');
    setSelectedLeadName('');
    setDueDate('');
    setDueTime('10:00');
    setNotes('');
  }, []);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleSelectLead = (lead: { id: string; fullName: string; phone: string; stage: string }) => {
    setSelectedLeadId(lead.id);
    setSelectedLeadName(`${lead.fullName}${lead.phone ? ` (${lead.phone})` : ''}`);
    setSearchTerm('');
  };

  const handleSubmit = async () => {
    if (!selectedLeadId || !dueDate) return;
    const dateTime = new Date(`${dueDate}T${dueTime}:00`);
    await createReminder.mutateAsync({
      leadId: selectedLeadId,
      dueDate: dateTime.toISOString(),
    });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Reminder</DialogTitle>
          <DialogDescription>
            Schedule a follow-up reminder for a lead
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lead Search */}
          <div className="space-y-2">
            <Label>Lead</Label>
            {selectedLeadId ? (
              <div className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
                <span className="text-sm font-medium">{selectedLeadName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedLeadId('');
                    setSelectedLeadName('');
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads by name or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
                {/* Search results dropdown */}
                {searchTerm.length >= 2 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                    {isSearching ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                        Searching...
                      </div>
                    ) : searchResults && searchResults.length > 0 ? (
                      searchResults.map((lead) => (
                        <button
                          key={lead.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                          onClick={() => handleSelectLead(lead)}
                        >
                          <div>
                            <span className="font-medium">{lead.fullName}</span>
                            {lead.phone && (
                              <span className="text-muted-foreground ml-2">{lead.phone}</span>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs ml-2">
                            {lead.stage}
                          </Badge>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        No leads found
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="create-date">Due Date</Label>
              <Input
                id="create-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-time">Time</Label>
              <Input
                id="create-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="create-notes">Notes (optional)</Label>
            <Textarea
              id="create-notes"
              placeholder="Add any notes about this follow-up..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedLeadId || !dueDate || createReminder.isPending}
          >
            {createReminder.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Bell className="h-4 w-4 mr-2" />
            )}
            Create Reminder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// RULE SETTINGS DIALOG
// ============================================================================

function RuleSettingsDialog({
  rule,
  open,
  onOpenChange,
  onSave,
}: {
  rule: AutoFollowUpRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updatedRule: AutoFollowUpRule) => void;
}) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<AutoFollowUpRule['trigger']>('no_response');
  const [triggerValue, setTriggerValue] = useState(3);
  const [action, setAction] = useState<AutoFollowUpRule['action']>('call');
  const [message, setMessage] = useState('');
  const [isActive, setIsActive] = useState(true);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && rule) {
      setName(rule.name);
      setTrigger(rule.trigger);
      setTriggerValue(rule.triggerValue);
      setAction(rule.action);
      setMessage(rule.message);
      setIsActive(rule.isActive);
    }
    onOpenChange(isOpen);
  };

  const handleSave = () => {
    if (!rule || !name.trim()) return;
    onSave({
      ...rule,
      name: name.trim(),
      trigger,
      triggerValue,
      action,
      message: message.trim(),
      isActive,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rule Settings</DialogTitle>
          <DialogDescription>
            Configure automation rule parameters
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rule Name */}
          <div className="space-y-2">
            <Label htmlFor="rule-name">Rule Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter rule name"
            />
          </div>

          {/* Trigger */}
          <div className="space-y-2">
            <Label>Trigger Condition</Label>
            <Select value={trigger} onValueChange={(v) => setTrigger(v as AutoFollowUpRule['trigger'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_response">No response from lead</SelectItem>
                <SelectItem value="stage_change">Lead stage changes</SelectItem>
                <SelectItem value="days_since_contact">Days since last contact</SelectItem>
                <SelectItem value="scheduled">Recurring schedule</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trigger Value */}
          {trigger !== 'stage_change' && (
            <div className="space-y-2">
              <Label htmlFor="trigger-value">
                {trigger === 'no_response' ? 'Days without response' :
                 trigger === 'days_since_contact' ? 'Days since contact' :
                 'Interval (days)'}
              </Label>
              <Input
                id="trigger-value"
                type="number"
                min={1}
                max={90}
                value={triggerValue}
                onChange={(e) => setTriggerValue(parseInt(e.target.value) || 1)}
              />
            </div>
          )}

          {/* Action */}
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select value={action} onValueChange={(v) => setAction(v as AutoFollowUpRule['action'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Phone Call</SelectItem>
                <SelectItem value="whatsapp">WhatsApp Message</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="task">Task</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="rule-message">Reminder Message</Label>
            <Textarea
              id="rule-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message template for this rule..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Use {'{days}'} for days count, {'{lead_name}'} for lead name
            </p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label>Status</Label>
              <p className="text-sm text-muted-foreground">
                {isActive ? 'Rule is active and processing' : 'Rule is paused'}
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ADD RULE DIALOG
// ============================================================================

function AddRuleDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (rule: AutoFollowUpRule) => void;
}) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<AutoFollowUpRule['trigger']>('no_response');
  const [triggerValue, setTriggerValue] = useState(3);
  const [action, setAction] = useState<AutoFollowUpRule['action']>('call');
  const [message, setMessage] = useState('');

  const resetForm = useCallback(() => {
    setName('');
    setTrigger('no_response');
    setTriggerValue(3);
    setAction('call');
    setMessage('');
  }, []);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleAdd = () => {
    if (!name.trim()) return;
    const newRule: AutoFollowUpRule = {
      id: Date.now().toString(),
      name: name.trim(),
      trigger,
      triggerValue,
      action,
      message: message.trim() || `Auto-generated reminder: ${name.trim()}`,
      isActive: true,
      leadsAffected: 0,
    };
    onAdd(newRule);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Automation Rule</DialogTitle>
          <DialogDescription>
            Create a new rule to automatically generate follow-up reminders
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rule Name */}
          <div className="space-y-2">
            <Label htmlFor="add-rule-name">Rule Name</Label>
            <Input
              id="add-rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Follow up after 5 days of silence"
            />
          </div>

          {/* Trigger */}
          <div className="space-y-2">
            <Label>Trigger Condition</Label>
            <Select value={trigger} onValueChange={(v) => setTrigger(v as AutoFollowUpRule['trigger'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_response">No response from lead</SelectItem>
                <SelectItem value="stage_change">Lead stage changes</SelectItem>
                <SelectItem value="days_since_contact">Days since last contact</SelectItem>
                <SelectItem value="scheduled">Recurring schedule</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trigger Value */}
          {trigger !== 'stage_change' && (
            <div className="space-y-2">
              <Label htmlFor="add-trigger-value">
                {trigger === 'no_response' ? 'Days without response' :
                 trigger === 'days_since_contact' ? 'Days since contact' :
                 'Interval (days)'}
              </Label>
              <Input
                id="add-trigger-value"
                type="number"
                min={1}
                max={90}
                value={triggerValue}
                onChange={(e) => setTriggerValue(parseInt(e.target.value) || 1)}
              />
            </div>
          )}

          {/* Action */}
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select value={action} onValueChange={(v) => setAction(v as AutoFollowUpRule['action'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Phone Call</SelectItem>
                <SelectItem value="whatsapp">WhatsApp Message</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="task">Task</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="add-rule-message">Reminder Message</Label>
            <Textarea
              id="add-rule-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message template for this rule..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Use {'{days}'} for days count, {'{lead_name}'} for lead name
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!name.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// REMINDER CARD
// ============================================================================

function ReminderCard({ reminder, onComplete, onSnooze, onReschedule, onDismiss, isCompleting, isSnoozing }: {
  reminder: FollowUpReminder;
  onComplete: () => void;
  onSnooze: () => void;
  onReschedule: () => void;
  onDismiss: () => void;
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
                  <DropdownMenuItem onClick={onReschedule}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Reschedule
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600" onClick={onDismiss}>
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
// RULE CARD (local config -- not DB-backed yet)
// ============================================================================

function RuleCard({ rule, onToggle, onSettings }: {
  rule: AutoFollowUpRule;
  onToggle: () => void;
  onSettings: () => void;
}) {
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
                {getTriggerLabel(rule.trigger, rule.triggerValue)}
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
            <Button variant="ghost" size="icon" onClick={onSettings}>
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

  // Track which reminder IDs are in-flight for complete/snooze
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [snoozingIds, setSnoozingIds] = useState<Set<string>>(new Set());

  // Dialog states
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<FollowUpReminder | null>(null);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<FollowUpReminder | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [ruleSettingsDialogOpen, setRuleSettingsDialogOpen] = useState(false);
  const [ruleSettingsTarget, setRuleSettingsTarget] = useState<AutoFollowUpRule | null>(null);
  const [addRuleDialogOpen, setAddRuleDialogOpen] = useState(false);

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

  const handleReschedule = (reminder: FollowUpReminder) => {
    setRescheduleTarget(reminder);
    setRescheduleDialogOpen(true);
  };

  const handleDismiss = (reminder: FollowUpReminder) => {
    setDismissTarget(reminder);
    setDismissDialogOpen(true);
  };

  const handleRuleSettings = (rule: AutoFollowUpRule) => {
    setRuleSettingsTarget(rule);
    setRuleSettingsDialogOpen(true);
  };

  const handleSaveRule = (updatedRule: AutoFollowUpRule) => {
    setRules(prev =>
      prev.map(r => r.id === updatedRule.id ? updatedRule : r)
    );
    toast.success('Rule updated');
  };

  const handleAddRule = (newRule: AutoFollowUpRule) => {
    setRules(prev => [...prev, newRule]);
    toast.success('Rule added');
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
              <Button onClick={() => setCreateDialogOpen(true)}>
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
                      onReschedule={() => handleReschedule(reminder)}
                      onDismiss={() => handleDismiss(reminder)}
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
                <Button onClick={() => setAddRuleDialogOpen(true)}>
                  <Zap className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </div>
              <div className="space-y-3">
                {rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={() => handleToggleRule(rule.id)}
                    onSettings={() => handleRuleSettings(rule)}
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

        {/* Dialogs */}
        <RescheduleDialog
          reminder={rescheduleTarget}
          open={rescheduleDialogOpen}
          onOpenChange={setRescheduleDialogOpen}
        />
        <DismissDialog
          reminder={dismissTarget}
          open={dismissDialogOpen}
          onOpenChange={setDismissDialogOpen}
        />
        <CreateReminderDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          institutionId={selectedInstitutionId}
        />
        <RuleSettingsDialog
          rule={ruleSettingsTarget}
          open={ruleSettingsDialogOpen}
          onOpenChange={setRuleSettingsDialogOpen}
          onSave={handleSaveRule}
        />
        <AddRuleDialog
          open={addRuleDialogOpen}
          onOpenChange={setAddRuleDialogOpen}
          onAdd={handleAddRule}
        />
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
