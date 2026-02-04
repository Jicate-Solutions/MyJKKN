'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
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
  Loader2,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InsightActionType } from '@/lib/services/admission/insight-actions-service';
import { useActionMetadata } from '@/hooks/admission/use-insight-actions';

// ============================================================================
// TYPES
// ============================================================================

interface ActionButtonProps {
  actionType: InsightActionType;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
  showTooltip?: boolean;
  className?: string;
  count?: number; // Number of items this action will affect
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

const colorMap: Record<string, string> = {
  blue: 'text-blue-600 hover:bg-blue-50',
  green: 'text-green-600 hover:bg-green-50',
  purple: 'text-purple-600 hover:bg-purple-50',
  indigo: 'text-indigo-600 hover:bg-indigo-50',
  orange: 'text-orange-600 hover:bg-orange-50',
  pink: 'text-pink-600 hover:bg-pink-50',
  gray: 'text-gray-600 hover:bg-gray-50',
  yellow: 'text-yellow-600 hover:bg-yellow-50',
  teal: 'text-teal-600 hover:bg-teal-50',
  emerald: 'text-emerald-600 hover:bg-emerald-50',
  red: 'text-red-600 hover:bg-red-50',
};

// ============================================================================
// ACTION BUTTON COMPONENT
// ============================================================================

export function ActionButton({
  actionType,
  onClick,
  disabled = false,
  loading = false,
  variant = 'outline',
  size = 'default',
  showLabel = true,
  showTooltip = true,
  className,
  count,
}: ActionButtonProps) {
  const { data: metadata } = useActionMetadata(actionType);

  const IconComponent = iconMap[metadata?.icon || 'activity'] || Activity;
  const colorClass = colorMap[metadata?.color || 'gray'] || colorMap.gray;

  const buttonContent = (
    <>
      {loading ? (
        <Loader2 className={cn('h-4 w-4 animate-spin', showLabel && 'mr-2')} />
      ) : (
        <IconComponent className={cn('h-4 w-4', showLabel && 'mr-2')} />
      )}
      {showLabel && (
        <span>
          {metadata?.label || actionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          {count !== undefined && count > 1 && ` (${count})`}
        </span>
      )}
    </>
  );

  const button = (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        variant === 'ghost' && colorClass,
        className
      )}
    >
      {buttonContent}
    </Button>
  );

  if (showTooltip && !showLabel) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{metadata?.label || actionType.replace(/_/g, ' ')}</p>
            {metadata?.description && (
              <p className="text-xs text-muted-foreground">{metadata.description}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

// ============================================================================
// QUICK ACTION BUTTONS (Preset combinations)
// ============================================================================

interface QuickActionButtonsProps {
  leadId?: string;
  leadIds?: string[];
  onAction: (actionType: InsightActionType) => void;
  loading?: InsightActionType | null;
  className?: string;
  showLabels?: boolean;
  actions?: InsightActionType[];
}

export function QuickActionButtons({
  leadId,
  leadIds,
  onAction,
  loading,
  className,
  showLabels = false,
  actions = ['send_whatsapp', 'send_email', 'schedule_followups', 'add_tag'],
}: QuickActionButtonsProps) {
  const count = leadIds?.length || (leadId ? 1 : 0);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {actions.map(actionType => (
        <ActionButton
          key={actionType}
          actionType={actionType}
          onClick={() => onAction(actionType)}
          loading={loading === actionType}
          disabled={loading !== null && loading !== actionType}
          variant="ghost"
          size="sm"
          showLabel={showLabels}
          count={count > 1 ? count : undefined}
        />
      ))}
    </div>
  );
}

// ============================================================================
// INSIGHT ACTION BUTTON (For use with insight cards)
// ============================================================================

interface InsightActionButtonProps {
  actionType: InsightActionType;
  insightId: string;
  leadIds: string[];
  institutionId: string;
  onExecute: (result: unknown) => void;
  className?: string;
}

export function InsightActionButton({
  actionType,
  insightId,
  leadIds,
  institutionId,
  onExecute,
  className,
}: InsightActionButtonProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const { data: metadata } = useActionMetadata(actionType);

  const handleClick = async () => {
    setIsExecuting(true);
    try {
      // This will be connected to the actual execution in the parent component
      onExecute({ actionType, insightId, leadIds });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={isExecuting}
      className={cn('gap-2', className)}
    >
      {isExecuting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        (() => {
          const IconComponent = iconMap[metadata?.icon || 'activity'] || Activity;
          return <IconComponent className="h-4 w-4" />;
        })()
      )}
      {metadata?.label || actionType.replace(/_/g, ' ')}
      {leadIds.length > 0 && (
        <span className="ml-1 text-xs bg-primary/10 px-1.5 py-0.5 rounded-full">
          {leadIds.length}
        </span>
      )}
    </Button>
  );
}

export default ActionButton;
