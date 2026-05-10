// app/(routes)/ai-pulse/_components/my-team-card.tsx
// Created: 2026-05-06 — Wave B.1

import { Users, Crown } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AiPulseTeamSummary } from '@/lib/services/ai-pulse/learner-service';

interface MyTeamCardProps {
  team: AiPulseTeamSummary | null;
}

export function MyTeamCard({ team }: MyTeamCardProps) {
  if (!team) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">My Team</CardTitle>
          </div>
          <CardDescription>
            You aren't on a team for this week's cycle yet. Your Class Incharge
            will assign you.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">
                {team.team_name || 'My Team'}
              </CardTitle>
            </div>
            <CardDescription>
              {team.member_count} {team.member_count === 1 ? 'member' : 'members'}
            </CardDescription>
          </div>
          {team.is_leader && (
            <Badge variant="default" className="gap-1">
              <Crown className="h-3 w-3" />
              Team Lead
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Your team submits Domain-Sync artifacts and presents at Lab Demo Day.
        </p>
      </CardContent>
    </Card>
  );
}
