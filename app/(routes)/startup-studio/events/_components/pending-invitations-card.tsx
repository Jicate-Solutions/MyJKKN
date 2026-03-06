'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Check, X } from 'lucide-react';
import {
  useMyPendingInvitations,
  useRespondToInvitation,
} from '@/hooks/startup-studio/use-event-registrations';

export function PendingInvitationsCard() {
  const { data: invitations, isLoading } = useMyPendingInvitations();
  const respond = useRespondToInvitation();
  const [respondingId, setRespondingId] = useState<string | null>(null);

  if (isLoading) return null;
  if (!invitations || invitations.length === 0) return null;

  const handleRespond = (memberId: string, accept: boolean) => {
    setRespondingId(memberId);
    respond.mutate(
      { memberId, accept },
      { onSettled: () => setRespondingId(null) }
    );
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Pending Team Invitations
          <Badge variant="secondary" className="ml-auto">{invitations.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {invitations.map((inv) => (
          <div
            key={inv.member_id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-background rounded-lg border"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{inv.event_name}</p>
              <p className="text-xs text-muted-foreground">
                Team: <span className="font-medium">{inv.team_name}</span>
                {inv.team_code && (
                  <span className="ml-1 font-mono text-primary">({inv.team_code})</span>
                )}
              </p>
              {inv.invited_by_name && (
                <p className="text-xs text-muted-foreground">Invited by {inv.invited_by_name}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={respondingId === inv.member_id}
                onClick={() => handleRespond(inv.member_id, false)}
              >
                {respondingId === inv.member_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Decline
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                disabled={respondingId === inv.member_id}
                onClick={() => handleRespond(inv.member_id, true)}
              >
                {respondingId === inv.member_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Accept
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
