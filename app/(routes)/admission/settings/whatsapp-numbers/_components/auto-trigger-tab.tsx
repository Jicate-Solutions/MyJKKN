'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Zap, Loader2, Play, Pause } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAutoTriggerRules,
  useAutoTriggerMutations,
  usePersonalWAQueueStats,
} from '@/hooks/admission/use-auto-trigger';
import { usePersonalWATemplates } from '@/hooks/admission/use-personal-wa-templates';
import type {
  AutoTriggerRule,
  AutoTriggerEventType,
  WAChannelType,
  CreateAutoTriggerInput,
} from '@/types/whatsapp-personal';

interface AutoTriggerTabProps {
  institutionId: string;
}

const EVENT_TYPE_LABELS: Record<AutoTriggerEventType, { label: string; description: string }> = {
  lead_created: { label: 'Lead Created', description: 'When a new lead is added' },
  expo_lead_captured: { label: 'Expo Lead Captured', description: 'When a lead is captured at an expo' },
  stage_changed: { label: 'Stage Changed', description: 'When lead funnel stage changes' },
  followup_due: { label: 'Follow-up Due', description: 'When a scheduled follow-up is due' },
};

const CHANNEL_LABELS: Record<WAChannelType, string> = {
  personal: 'Personal WhatsApp',
  meta_waba: 'Business WhatsApp',
};

export function AutoTriggerTab({ institutionId }: AutoTriggerTabProps) {
  const { data: rules, isLoading } = useAutoTriggerRules(institutionId);
  const { createRule, updateRule, deleteRule, toggleRule } =
    useAutoTriggerMutations(institutionId);
  const { data: templates } = usePersonalWATemplates(institutionId);
  const { data: queueStats } = usePersonalWAQueueStats(institutionId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoTriggerRule | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<AutoTriggerEventType>('expo_lead_captured');
  const [templateId, setTemplateId] = useState<string>('');
  const [channelPriority, setChannelPriority] = useState<WAChannelType[]>(['personal', 'meta_waba']);
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(500);

  const openCreate = () => {
    setEditingRule(null);
    setName('');
    setEventType('expo_lead_captured');
    setTemplateId('');
    setChannelPriority(['personal', 'meta_waba']);
    setDelaySeconds(0);
    setDailyLimit(500);
    setDialogOpen(true);
  };

  const openEdit = (rule: AutoTriggerRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setEventType(rule.event_type);
    setTemplateId(rule.template_id || '');
    setChannelPriority(rule.channel_priority);
    setDelaySeconds(rule.delay_seconds);
    setDailyLimit(rule.daily_limit);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    if (!templateId) {
      toast.error('Please select a message template');
      return;
    }

    if (editingRule) {
      updateRule.mutate(
        {
          id: editingRule.id,
          name,
          event_type: eventType,
          template_id: templateId,
          channel_priority: channelPriority,
          delay_seconds: delaySeconds,
          daily_limit: dailyLimit,
        },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createRule.mutate(
        {
          institution_id: institutionId,
          name,
          event_type: eventType,
          template_id: templateId,
          channel_priority: channelPriority,
          delay_seconds: delaySeconds,
          daily_limit: dailyLimit,
        },
        { onSuccess: () => setDialogOpen(false) }
      );
    }
  };

  const isSaving = createRule.isPending || updateRule.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            Auto-Trigger Rules
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure automatic WhatsApp messages triggered by lead events.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Rule
        </Button>
      </div>

      {/* Queue Stats */}
      {queueStats && (
        <div className="flex gap-3 flex-wrap">
          <Badge variant="outline" className="gap-1">
            Queued: {queueStats.queued || 0}
          </Badge>
          <Badge variant="outline" className="gap-1 text-green-600">
            Sent: {queueStats.sent || 0}
          </Badge>
          <Badge variant="outline" className="gap-1 text-red-600">
            Failed: {queueStats.failed || 0}
          </Badge>
          {(queueStats.permanently_failed || 0) > 0 && (
            <Badge variant="destructive" className="gap-1">
              Perm. Failed: {queueStats.permanently_failed}
            </Badge>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !rules?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No auto-trigger rules configured</p>
            <p className="text-sm mt-1">Create a rule to automatically send messages when leads are captured</p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={!rule.is_active ? 'opacity-60' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{rule.name}</CardTitle>
                    <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                      {rule.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                    <Badge variant="outline">
                      {EVENT_TYPE_LABELS[rule.event_type]?.label || rule.event_type}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleRule.mutate({ id: rule.id, is_active: !rule.is_active })}
                      title={rule.is_active ? 'Disable' : 'Enable'}
                    >
                      {rule.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteRule.mutate(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>
                    Template: <span className="font-medium text-foreground">{rule.template?.name || 'None'}</span>
                  </span>
                  <span>
                    Channels: {rule.channel_priority.map(c => CHANNEL_LABELS[c]).join(' → ')}
                  </span>
                  {rule.delay_seconds > 0 && (
                    <span>Delay: {rule.delay_seconds}s</span>
                  )}
                  <span>Limit: {rule.daily_limit}/day</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Trigger Rule' : 'Create Trigger Rule'}
            </DialogTitle>
            <DialogDescription>
              Define when and how to automatically send WhatsApp messages.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rule Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Expo Welcome Auto-Send"
              />
            </div>

            <div className="space-y-2">
              <Label>Trigger Event</Label>
              <Select value={eventType} onValueChange={(v) => setEventType(v as AutoTriggerEventType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPE_LABELS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      <div>
                        <span className="font-medium">{val.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{val.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Message Template *</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {(templates || []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!templates?.length && (
                <p className="text-xs text-destructive">
                  No templates found. Create a template first in the Templates tab.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Channel Priority</Label>
              <Select
                value={channelPriority.join(',')}
                onValueChange={(v) => setChannelPriority(v.split(',') as WAChannelType[])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal,meta_waba">Personal first, Business fallback</SelectItem>
                  <SelectItem value="meta_waba,personal">Business first, Personal fallback</SelectItem>
                  <SelectItem value="personal">Personal only</SelectItem>
                  <SelectItem value="meta_waba">Business only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Delay (seconds)</Label>
                <Input
                  type="number"
                  min={0}
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">0 = send immediately</p>
              </div>
              <div className="space-y-2">
                <Label>Daily Limit</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(parseInt(e.target.value) || 500)}
                />
                <p className="text-xs text-muted-foreground">Max messages per day</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingRule ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
