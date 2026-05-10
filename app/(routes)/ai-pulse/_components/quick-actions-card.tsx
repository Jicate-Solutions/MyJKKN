// app/(routes)/ai-pulse/_components/quick-actions-card.tsx
// Created: 2026-05-06 — Wave B.1

import Link from 'next/link';
import { Send, ClipboardCheck, ExternalLink, Megaphone } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface QuickActionsCardProps {
  cycleId: string | null;
  hasTeam: boolean;
  // Permission flags resolved by the page (server-side via user_has_permission RPC).
  canSubmitDomainSync?: boolean;
  canSubmitQuiz?: boolean;
  canSubmitPublication?: boolean;
}

interface ActionDef {
  href: string;
  icon: typeof Send;
  label: string;
  hint: string;
  enabled: boolean;
  variant?: 'default' | 'outline' | 'secondary';
}

export function QuickActionsCard({
  cycleId,
  hasTeam,
  canSubmitDomainSync = false,
  canSubmitQuiz = false,
  canSubmitPublication = false,
}: QuickActionsCardProps) {
  const cycleSegment = cycleId ?? 'current';

  const actions: ActionDef[] = [
    {
      href: `/ai-pulse/submit/domain-sync?cycle=${cycleSegment}`,
      icon: Send,
      label: 'Submit Domain-Sync',
      hint: 'Upload your team\'s artifact for this cycle',
      enabled: canSubmitDomainSync && hasTeam && !!cycleId,
    },
    {
      href: `/ai-pulse/quiz/${cycleSegment}`,
      icon: ClipboardCheck,
      label: 'Take Quiz',
      hint: 'Complete the post-session quiz to earn engagement',
      enabled: canSubmitQuiz && !!cycleId,
      variant: 'outline',
    },
    {
      href: `/ai-pulse/submit/publication?cycle=${cycleSegment}`,
      icon: Megaphone,
      label: 'Submit Publication',
      hint: 'IG / GitHub Top-2 publication entry',
      enabled: canSubmitPublication && hasTeam && !!cycleId,
      variant: 'secondary',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick Actions</CardTitle>
        <CardDescription>
          {cycleId
            ? 'Submissions for this week\'s AI Pulse cycle'
            : 'No active cycle — check back when the next cycle opens'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map(({ href, icon: Icon, label, hint, enabled, variant }) => {
          const button = (
            <Button
              size="sm"
              variant={variant ?? 'default'}
              disabled={!enabled}
              className="w-full justify-start"
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
              <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-60" />
            </Button>
          );
          return (
            <div key={label} className="space-y-1">
              {enabled ? <Link href={href}>{button}</Link> : button}
              <p className="text-xs text-muted-foreground pl-1">{hint}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
