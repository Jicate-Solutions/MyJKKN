'use client';

import { useState } from 'react';
import { Check, Copy, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { IssueStatusBadge, PriorityBadge, SeverityBadge } from '@/components/instasolver/badges';
import { ISSUE_PROGRESS_STEPS, ISSUE_STATUS_META } from '@/lib/instasolver/constants';
import type { Issue } from '@/types/instasolver';

function CopyReference({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 font-mono text-xs"
      aria-label={`Copy reference ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — the reference is on screen to read */
        }
      }}
    >
      {value}
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function Progress({ issue }: { issue: Issue }) {
  if (issue.status === 'rejected' || issue.status === 'withdrawn') {
    const m = ISSUE_STATUS_META[issue.status];
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3 text-sm">
        <XCircle className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{m.label}</span>
        <span className="text-muted-foreground">— {m.description}. This issue is closed.</span>
      </div>
    );
  }
  const current = ISSUE_PROGRESS_STEPS.indexOf(issue.status);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
      {ISSUE_PROGRESS_STEPS.map((s, i) => {
        const done = i < current || (issue.status === 'completed' && i === current);
        const active = i === current && issue.status !== 'completed';
        return (
          <li key={s} className="space-y-1.5" aria-current={active ? 'step' : undefined}>
            <div
              className={cn(
                'h-1.5 rounded-full',
                done ? 'bg-emerald-500' : active ? 'bg-primary' : 'bg-muted'
              )}
            />
            <p
              className={cn(
                'text-xs leading-tight',
                done || active ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {ISSUE_STATUS_META[s].label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function IssueHeader({ issue }: { issue: Issue }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="space-y-2">
          <CopyReference value={issue.reference_no} />
          <h1 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">{issue.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <IssueStatusBadge status={issue.status} />
            <SeverityBadge severity={issue.severity} />
            <PriorityBadge priority={issue.priority} />
          </div>
        </div>
        <Progress issue={issue} />
      </CardContent>
    </Card>
  );
}
