'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronDown,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Bell,
  MessageCircle,
  Mail,
  Phone,
  FileText,
  Calendar,
  UserPlus,
  Download,
  Zap,
  ArrowRight,
  Tag,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAvailableActions,
  useBulkAction,
} from '@/hooks/admission/use-insight-actions';
import { ActionConfirmDialog } from './action-confirm-dialog';
import type {
  InsightActionType,
  ActionParams,
  ActionContext,
  AvailableAction,
} from '@/lib/services/admission/insight-actions-service';

// ============================================================================
// TYPES
// ============================================================================

interface Lead {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  funnel_stage?: string;
  score?: number;
}

interface BulkActionPanelProps {
  leads: Lead[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  institutionId: string;
  userId?: string;
  onActionComplete?: (result: unknown) => void;
  className?: string;
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
  calendar: Calendar,
  'user-plus': UserPlus,
  download: Download,
  zap: Zap,
  'arrow-right': ArrowRight,
  tag: Tag,
  activity: Activity,
};

// ============================================================================
// BULK ACTION PANEL COMPONENT
// ============================================================================

export function BulkActionPanel({
  leads,
  selectedIds,
  onSelectionChange,
  institutionId,
  userId,
  onActionComplete,
  className,
}: BulkActionPanelProps) {
  const [selectedAction, setSelectedAction] = useState<InsightActionType | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [actionParams, setActionParams] = useState<ActionParams>({});

  const { data: availableActions } = useAvailableActions({ institution_id: institutionId });
  const bulkAction = useBulkAction();

  const selectedLeads = useMemo(
    () => leads.filter(lead => selectedIds.includes(lead.id)),
    [leads, selectedIds]
  );

  const allSelected = selectedIds.length === leads.length && leads.length > 0;
  const someSelected = selectedIds.length > 0 && selectedIds.length < leads.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(leads.map(lead => lead.id));
    }
  };

  const handleSelectLead = (leadId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, leadId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== leadId));
    }
  };

  const handleActionSelect = (action: AvailableAction) => {
    setSelectedAction(action.type);
    if (action.requires_confirmation) {
      setShowConfirmDialog(true);
    } else {
      executeAction(action.type, {});
    }
  };

  const executeAction = async (actionType: InsightActionType, params: ActionParams) => {
    const context: ActionContext = {
      institution_id: institutionId,
      source: 'manual',
      user_id: userId,
    };

    try {
      const result = await bulkAction.mutateAsync({
        actionType,
        leadIds: selectedIds,
        params,
        context,
      });

      onActionComplete?.(result);
      setShowConfirmDialog(false);
      setSelectedAction(null);
      setActionParams({});
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const handleConfirm = (params: ActionParams) => {
    if (selectedAction) {
      executeAction(selectedAction, params);
    }
  };

  if (leads.length === 0) {
    return null;
  }

  return (
    <>
      <Card className={cn('border-dashed', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                className="data-[state=indeterminate]:bg-primary"
                {...(someSelected && { 'data-state': 'indeterminate' })}
              />
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Bulk Actions
                </CardTitle>
                <CardDescription>
                  {selectedIds.length === 0
                    ? `${leads.length} leads available`
                    : `${selectedIds.length} of ${leads.length} selected`}
                </CardDescription>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectionChange([])}
                  className="text-muted-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" size="sm" disabled={bulkAction.isPending}>
                      {bulkAction.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 mr-2" />
                      )}
                      Actions
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      Apply to {selectedIds.length} leads
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {availableActions?.filter(a => a.supports_bulk).map(action => {
                      const IconComponent = iconMap[action.icon] || Activity;
                      return (
                        <DropdownMenuItem
                          key={action.type}
                          onClick={() => handleActionSelect(action)}
                          disabled={bulkAction.isPending}
                        >
                          <IconComponent className="h-4 w-4 mr-2" />
                          {action.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </CardHeader>

        {selectedIds.length > 0 && (
          <CardContent className="pt-0">
            <ScrollArea className="h-[120px]">
              <div className="space-y-1">
                {selectedLeads.map(lead => (
                  <div
                    key={lead.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={true}
                      onCheckedChange={(checked) => handleSelectLead(lead.id, !!checked)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lead.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.email || lead.phone || 'No contact info'}
                      </p>
                    </div>
                    {lead.funnel_stage && (
                      <Badge variant="secondary" className="text-xs">
                        {lead.funnel_stage.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {lead.score !== undefined && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          lead.score >= 80 && 'border-green-500 text-green-600',
                          lead.score >= 60 && lead.score < 80 && 'border-yellow-500 text-yellow-600',
                          lead.score < 60 && 'border-gray-400 text-gray-500'
                        )}
                      >
                        {lead.score}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        )}
      </Card>

      {/* Confirm Dialog */}
      {selectedAction && (
        <ActionConfirmDialog
          open={showConfirmDialog}
          onOpenChange={setShowConfirmDialog}
          actionType={selectedAction}
          leadCount={selectedIds.length}
          onConfirm={handleConfirm}
          isLoading={bulkAction.isPending}
        />
      )}
    </>
  );
}

// ============================================================================
// FLOATING BULK ACTION BAR (Alternative compact design)
// ============================================================================

interface FloatingBulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  onClear: () => void;
  onAction: (actionType: InsightActionType) => void;
  isLoading?: boolean;
  className?: string;
}

export function FloatingBulkActionBar({
  selectedCount,
  totalCount,
  onClear,
  onAction,
  isLoading,
  className,
}: FloatingBulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
        'bg-background border rounded-lg shadow-lg',
        'flex items-center gap-3 px-4 py-3',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{selectedCount}</Badge>
        <span className="text-sm text-muted-foreground">
          of {totalCount} selected
        </span>
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAction('send_whatsapp')}
          disabled={isLoading}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAction('send_email')}
          disabled={isLoading}
        >
          <Mail className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAction('schedule_followups')}
          disabled={isLoading}
        >
          <Calendar className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAction('assign_counselor')}
          disabled={isLoading}
        >
          <UserPlus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAction('export_list')}
          disabled={isLoading}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-6 w-px bg-border" />

      <Button variant="ghost" size="sm" onClick={onClear}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default BulkActionPanel;
