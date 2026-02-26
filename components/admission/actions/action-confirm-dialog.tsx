'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  AlertTriangle,
  CalendarIcon,
  Users,
  Bell,
  MessageCircle,
  Mail,
  Phone,
  FileText,
  Calendar as CalendarIconAlt,
  UserPlus,
  Download,
  Zap,
  ArrowRight,
  Tag,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useActionMetadata } from '@/hooks/admission/use-insight-actions';
import type {
  InsightActionType,
  ActionParams,
} from '@/lib/services/admission/insight-actions-service';

// ============================================================================
// TYPES
// ============================================================================

interface ActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: InsightActionType;
  leadCount: number;
  leadNames?: string[];
  onConfirm: (params: ActionParams) => void;
  isLoading?: boolean;
}

// ============================================================================
// ICON MAPPING
// ============================================================================

const iconMap: Record<string, LucideIcon> = {
  bell: Bell,
  'message-circle': MessageCircle,
  mail: Mail,
  phone: Phone,
  'file-text': FileText,
  calendar: CalendarIconAlt,
  'user-plus': UserPlus,
  download: Download,
  zap: Zap,
  'arrow-right': ArrowRight,
  tag: Tag,
  activity: Activity,
};

const colorMap: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
  indigo: 'bg-indigo-100 text-indigo-600',
  orange: 'bg-orange-100 text-orange-600',
  pink: 'bg-pink-100 text-pink-600',
  gray: 'bg-gray-100 text-gray-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  teal: 'bg-teal-100 text-teal-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  red: 'bg-red-100 text-red-600',
};

// ============================================================================
// ACTION CONFIRM DIALOG COMPONENT
// ============================================================================

export function ActionConfirmDialog({
  open,
  onOpenChange,
  actionType,
  leadCount,
  leadNames,
  onConfirm,
  isLoading = false,
}: ActionConfirmDialogProps) {
  const { data: metadata } = useActionMetadata(actionType);
  const [params, setParams] = useState<ActionParams>({});
  const [followupDate, setFollowupDate] = useState<Date | undefined>();

  // Reset params when dialog opens
  useEffect(() => {
    if (open) {
      setParams({});
      setFollowupDate(undefined);
    }
  }, [open]);

  const IconComponent = iconMap[metadata?.icon || 'activity'] || Activity;
  const colorClass = colorMap[metadata?.color || 'gray'];

  const handleConfirm = () => {
    const finalParams: ActionParams = { ...params };

    // Add date if set
    if (followupDate) {
      finalParams.followup_date = followupDate.toISOString();
    }

    onConfirm(finalParams);
  };

  const isValid = () => {
    if (!metadata) return true;

    // Check required params
    for (const param of metadata.required_params) {
      if (param === 'followup_date' && !followupDate) return false;
      if (param === 'followup_type' && !params.followup_type) return false;
      if (param === 'new_stage' && !params.new_stage) return false;
      if (param === 'tag' && !params.tag) return false;
      if (param === 'counselor_id' && !params.counselor_id) return false;
      if (param === 'template_id' && !params.template_id) return false;
      if (param === 'workflow_id' && !params.workflow_id) return false;
    }

    return true;
  };

  const renderParamInputs = () => {
    switch (actionType) {
      case 'schedule_followups':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Follow-up Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !followupDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {followupDate ? format(followupDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={followupDate}
                    onSelect={setFollowupDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Follow-up Type *</Label>
              <Select
                value={params.followup_type}
                onValueChange={(value) =>
                  setParams({ ...params, followup_type: value as ActionParams['followup_type'] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Task Description (Optional)</Label>
              <Textarea
                placeholder="Add notes for the follow-up..."
                value={params.task_description || ''}
                onChange={(e) => setParams({ ...params, task_description: e.target.value })}
              />
            </div>
          </div>
        );

      case 'update_stage':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Stage *</Label>
              <Select
                value={params.new_stage}
                onValueChange={(value) => setParams({ ...params, new_stage: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="negotiation">Negotiation</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Add notes for the stage change..."
                value={params.stage_notes || ''}
                onChange={(e) => setParams({ ...params, stage_notes: e.target.value })}
              />
            </div>
          </div>
        );

      case 'add_tag':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tag *</Label>
              <Input
                placeholder="Enter tag name..."
                value={params.tag || ''}
                onChange={(e) => setParams({ ...params, tag: e.target.value })}
              />
            </div>
          </div>
        );

      case 'assign_counselor':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Counselor *</Label>
              <Select
                value={params.counselor_id}
                onValueChange={(value) => setParams({ ...params, counselor_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select counselor" />
                </SelectTrigger>
                <SelectContent>
                  {/* This would be populated from actual counselor data */}
                  <SelectItem value="counselor-1">John Smith</SelectItem>
                  <SelectItem value="counselor-2">Jane Doe</SelectItem>
                  <SelectItem value="counselor-3">Mike Johnson</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assignment Reason (Optional)</Label>
              <Textarea
                placeholder="Why are you assigning these leads?"
                value={params.assignment_reason || ''}
                onChange={(e) => setParams({ ...params, assignment_reason: e.target.value })}
              />
            </div>
          </div>
        );

      case 'send_whatsapp':
      case 'send_email':
      case 'send_sms':
      case 'notify_leads':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Message Template *</Label>
              <Select
                value={params.template_id}
                onValueChange={(value) => setParams({ ...params, template_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {/* This would be populated from actual template data */}
                  <SelectItem value="template-welcome">Welcome Message</SelectItem>
                  <SelectItem value="template-followup">Follow-up Reminder</SelectItem>
                  <SelectItem value="template-promo">Promotional Offer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Custom Message (Optional)</Label>
              <Textarea
                placeholder="Add a custom message..."
                value={params.message || ''}
                onChange={(e) => setParams({ ...params, message: e.target.value })}
              />
            </div>
          </div>
        );

      case 'export_list':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Export Format</Label>
              <Select
                value={params.export_format || 'csv'}
                onValueChange={(value) =>
                  setParams({ ...params, export_format: value as ActionParams['export_format'] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'create_campaign':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Workflow *</Label>
              <Select
                value={params.workflow_id}
                onValueChange={(value) => setParams({ ...params, workflow_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select workflow" />
                </SelectTrigger>
                <SelectContent>
                  {/* This would be populated from actual workflow data */}
                  <SelectItem value="workflow-nurture">Lead Nurture Sequence</SelectItem>
                  <SelectItem value="workflow-onboarding">Onboarding Campaign</SelectItem>
                  <SelectItem value="workflow-reengagement">Re-engagement Campaign</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Campaign Name (Optional)</Label>
              <Input
                placeholder="Name this campaign..."
                value={params.campaign_name || ''}
                onChange={(e) => setParams({ ...params, campaign_name: e.target.value })}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', colorClass)}>
              <IconComponent className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{metadata?.label || 'Confirm Action'}</DialogTitle>
              <DialogDescription>
                {metadata?.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          {/* Affected leads summary */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted mb-4">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              This action will affect{' '}
              <Badge variant="secondary" className="font-semibold">
                {leadCount} lead{leadCount !== 1 ? 's' : ''}
              </Badge>
            </span>
          </div>

          {/* Show first few names if provided */}
          {leadNames && leadNames.length > 0 && (
            <div className="mb-4 text-sm text-muted-foreground">
              Including: {leadNames.slice(0, 3).join(', ')}
              {leadNames.length > 3 && ` and ${leadNames.length - 3} more`}
            </div>
          )}

          {/* Parameter inputs */}
          {renderParamInputs()}

          {/* Warning for destructive actions */}
          {(actionType === 'update_stage' || actionType === 'create_campaign') && (
            <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                {actionType === 'update_stage'
                  ? 'Changing stages will affect lead tracking and reporting.'
                  : 'Starting a campaign will begin sending automated messages.'}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !isValid()}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm {metadata?.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ActionConfirmDialog;
