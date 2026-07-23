'use client';

// components/dashboard/udyog-student-card.tsx — the learner's own UDYOG
// application requirement, surfaced on the student dashboard (BUG-004075, 4a).
// Director decision (2026-06-22): the student self-serves — clicks the outbound
// portal link and records their own reference number. Self-hides when the learner
// has no UDYOG obligation, so it never clutters a dashboard for an unaffected student.
// Shared by the v2 dashboard (app/(routes)/dashboard/page.tsx) and the classic one.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, CheckCircle2 } from 'lucide-react';
import { useMyUdyog, useUdyogSelfAction } from '@/hooks/cdc/use-cdc-udyog-mine';

export function UdyogStudentCard() {
  const { data, isLoading, error } = useMyUdyog();
  const action = useUdyogSelfAction();
  const [reference, setReference] = useState('');

  const req = data?.requirements?.[0];
  // Render nothing until we know there's an actionable requirement.
  if (isLoading || error || !req) return null;

  const portalUrl = data?.portalUrl ?? '';
  const applied = req.status === 'applied';

  const openPortal = () => {
    if (!portalUrl) return;
    action.mutate({ id: req.id, action: 'direct' }); // best-effort "directed" stamp
    window.open(portalUrl, '_blank', 'noopener,noreferrer');
  };
  const markApplied = () => action.mutate({ id: req.id, action: 'apply', udyog_reference: reference });

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-amber-600" />
            UDYOG Application
          </CardTitle>
          {applied ? (
            <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline">Applied</Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200" variant="outline">
              {req.status === 'directed' ? 'In progress' : 'Action needed'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {req.programme?.name
            ? <>Required from your <span className="font-medium text-foreground">{req.programme.name}</span> enrolment.</>
            : <>You are required to apply via the UDYOG portal.</>}
        </p>

        {applied ? (
          <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-950/30">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Application recorded{req.udyog_reference ? <> — reference <span className="font-mono font-medium">{req.udyog_reference}</span></> : null}.</span>
          </div>
        ) : (
          <>
            {portalUrl ? (
              <Button type="button" variant="outline" className="w-full" onClick={openPortal} disabled={action.isPending}>
                <ExternalLink className="h-4 w-4 mr-1.5" /> Open UDYOG portal
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground rounded-md border border-border px-3 py-2">
                The UDYOG portal link isn&apos;t available yet — please contact the CDC office.
              </p>
            )}

            <div className="space-y-1.5 pt-1">
              <p className="text-xs text-muted-foreground">After you apply on UDYOG, enter your reference number:</p>
              <div className="flex gap-2">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UDYOG reference number"
                  disabled={action.isPending}
                />
                <Button type="button" onClick={markApplied} disabled={action.isPending || !reference.trim()}>
                  {action.isPending ? 'Saving…' : 'Mark applied'}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
