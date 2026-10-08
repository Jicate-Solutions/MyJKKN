'use client';

// Status, severity, priority and triage-reason badges. Labels and colours come
// from lib/instasolver/constants.ts only.

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  ISSUE_STATUS_META,
  PRIORITY_META,
  REQUIREMENT_STATUS_META,
  SEVERITY_META,
  TONE_BADGE_CLASS,
  TRIAGE_REASON_META,
  type Tone
} from '@/lib/instasolver/constants';
import type { IssueStatus, Priority, RequirementStatus, Severity, TriageReason } from '@/types/instasolver';

function ToneBadge({
  tone,
  label,
  description,
  className
}: {
  tone: Tone;
  label: string;
  description?: string;
  className?: string;
}) {
  const badge = (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', TONE_BADGE_CLASS[tone], className)}>
      {label}
    </Badge>
  );
  if (!description) return badge;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function IssueStatusBadge({ status, className }: { status: IssueStatus; className?: string }) {
  const m = ISSUE_STATUS_META[status];
  return <ToneBadge tone={m.tone} label={m.label} description={m.description} className={className} />;
}

export function RequirementStatusBadge({ status, className }: { status: RequirementStatus; className?: string }) {
  const m = REQUIREMENT_STATUS_META[status];
  return <ToneBadge tone={m.tone} label={m.label} description={m.description} className={className} />;
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const m = SEVERITY_META[severity];
  return <ToneBadge tone={m.tone} label={m.label} description={`Severity: ${m.description}`} className={className} />;
}

export function PriorityBadge({ priority, className }: { priority: Priority | null; className?: string }) {
  if (!priority) {
    return <ToneBadge tone="muted" label="Not set" description="Priority is set by the CAO at triage" className={className} />;
  }
  const m = PRIORITY_META[priority];
  return <ToneBadge tone={m.tone} label={m.label} description={`Priority: ${m.description}`} className={className} />;
}

export function TriageReasonChip({ reason }: { reason: TriageReason }) {
  const m = TRIAGE_REASON_META[reason];
  return (
    <ToneBadge
      tone={m.tone}
      label={m.label}
      description={`${m.description} (${m.weight})`}
      className="text-[11px] px-1.5 py-0"
    />
  );
}
