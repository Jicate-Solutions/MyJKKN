'use client';

/**
 * PolicyAuditTimeline — vertical timeline of audit entries for a single policy.
 * Shows who, when, change_type badge, reason text, and expandable diff viewer.
 * Paginated via "Load more" button.
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Shield,
  Upload,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { usePolicyAuditLog } from '@/hooks/hr/use-policy-audit';
import type {
  HRPolicyAuditLogEntry,
  PolicyChangeType,
} from '@/types/hr-policy-audit';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PolicyAuditTimelineProps {
  policyKey: string;
  institutionId?: string;
  /** Max entries per page (default 20). */
  pageSize?: number;
  /** Compact mode hides the diff viewer (for inline embedding). */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PolicyAuditTimeline({
  policyKey,
  institutionId,
  pageSize = 20,
  compact = false,
}: PolicyAuditTimelineProps) {
  const { data, isLoading, error } = usePolicyAuditLog(
    policyKey,
    institutionId,
    { page_size: pageSize }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading audit history...
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load audit log: {error.message}
        </CardContent>
      </Card>
    );
  }

  const entries = data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Clock className="h-6 w-6 mx-auto mb-2" />
          No audit history for this policy yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border" />

      {entries.map((entry, idx) => (
        <TimelineEntry
          key={entry.id}
          entry={entry}
          isLast={idx === entries.length - 1}
          compact={compact}
        />
      ))}

      {(data?.total ?? 0) > entries.length && (
        <div className="pl-12 pt-2">
          <p className="text-xs text-muted-foreground">
            Showing {entries.length} of {data?.total} events.
            View the full audit log for complete history.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline entry
// ---------------------------------------------------------------------------

function TimelineEntry({
  entry,
  isLast,
  compact,
}: {
  entry: HRPolicyAuditLogEntry;
  isLast: boolean;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = entry.old_value !== null || entry.new_value !== null;

  return (
    <div className="relative flex gap-3 pb-4">
      {/* Dot */}
      <div className="relative z-10 flex-shrink-0 mt-1.5">
        <div
          className={`h-[10px] w-[10px] rounded-full border-2 ${dotColor(entry.action)}`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <ActionBadge action={entry.action} />
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(entry.edited_at)}
          </span>
        </div>

        <div className="mt-1 text-sm">
          <span className="font-medium">
            {entry.editor_name || entry.editor_email || 'Unknown user'}
          </span>
          {entry.editor_name && entry.editor_email && (
            <span className="text-xs text-muted-foreground ml-1">
              ({entry.editor_email})
            </span>
          )}
        </div>

        <p className="mt-1 text-sm text-muted-foreground italic">
          &ldquo;{entry.reason}&rdquo;
        </p>

        {/* Diff viewer */}
        {hasDiff && !compact && (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-7 px-2 text-xs"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3 mr-1" />
                ) : (
                  <ChevronRight className="h-3 w-3 mr-1" />
                )}
                {expanded ? 'Hide changes' : 'Show changes'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                <DiffPanel label="Before" value={entry.old_value} variant="old" />
                <DiffPanel label="After" value={entry.new_value} variant="new" />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionBadge({ action }: { action: PolicyChangeType }) {
  const config = ACTION_CONFIG[action] ?? {
    label: action,
    variant: 'outline' as const,
    icon: Edit3,
  };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="text-xs gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function DiffPanel({
  label,
  value,
  variant,
}: {
  label: string;
  value: unknown | null;
  variant: 'old' | 'new';
}) {
  const bg = variant === 'old' ? 'bg-red-50 dark:bg-red-950/20' : 'bg-green-50 dark:bg-green-950/20';
  const border = variant === 'old' ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800';

  return (
    <div className={`rounded-md border ${border} ${bg} p-2 overflow-auto max-h-[300px]`}>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <pre className="text-xs whitespace-pre-wrap break-all font-mono">
        {value === null ? '(empty)' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ACTION_CONFIG: Record<
  PolicyChangeType,
  {
    label: string;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
    icon: typeof Edit3;
  }
> = {
  edit_draft: { label: 'Draft edited', variant: 'secondary', icon: Edit3 },
  publish: { label: 'Published', variant: 'default', icon: Upload },
  unpublish: { label: 'Unpublished', variant: 'destructive', icon: EyeOff },
  classify_change: { label: 'Reclassified', variant: 'outline', icon: Shield },
  promote_to_global: { label: 'Promoted to global', variant: 'outline', icon: RefreshCw },
};

function dotColor(action: PolicyChangeType): string {
  switch (action) {
    case 'publish':
      return 'bg-green-500 border-green-500';
    case 'unpublish':
      return 'bg-red-500 border-red-500';
    case 'edit_draft':
      return 'bg-blue-500 border-blue-500';
    case 'classify_change':
      return 'bg-amber-500 border-amber-500';
    case 'promote_to_global':
      return 'bg-purple-500 border-purple-500';
    default:
      return 'bg-gray-400 border-gray-400';
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
