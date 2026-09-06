'use client';

// Training gate panel — shown on the Senior Peer Mentor lane for an event where the
// mentor isn't trained yet. Renders the guide + the "I understand" self-ack, then
// reflects the wait for a coordinator to confirm. When trained, renders nothing.
// The mentor still SEES their sessions above/below; only attendance + feedback are
// locked (Director: "sees group but attendance + feedback locked until trained").
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  InductionVolunteerService, type MyTrainingStatus,
} from '@/lib/services/induction/induction-volunteer-service';
import { GraduationCap, CheckCircle2, Circle, Clock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const BRAND = '#0b6d41';

export function TrainingGatePanel({ status, onChanged }: { status: MyTrainingStatus; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  if (status.is_trained) return null;

  const selfDone = status.guide_read && status.self_ack;

  const ack = async () => {
    setSaving(true);
    try {
      await InductionVolunteerService.completeSelfTraining(status.event_id);
      toast.success('Thanks — your part is done. A coordinator will confirm your training.');
      onChanged();
    } catch (e: any) {
      toast.error(`Couldn't save: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-500/40 dark:bg-amber-950/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-amber-600" /> Finish your training to unlock your tools
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          As a Senior Peer Mentor you look after a group of freshers — helping them settle in,
          marking their attendance, and collecting their honest session feedback (using your phone
          for those who don&apos;t have one). A fresher&apos;s own rating always wins; be fair and never
          fill it in for them without asking. Keep what they share private.
        </p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2">
            {selfDone ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            Read this guide and confirm you understand your role
          </li>
          <li className="flex items-center gap-2">
            {status.admin_trained
              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : selfDone ? <Clock className="h-4 w-4 text-amber-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            A coordinator confirms your training
          </li>
        </ul>
        {!selfDone ? (
          <Button onClick={ack} disabled={saving} style={{ backgroundColor: BRAND }} className="text-white hover:opacity-90 h-auto whitespace-normal text-left">
            <ShieldCheck className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'I have read this and I understand my role'}
          </Button>
        ) : (
          <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <Clock className="h-4 w-4" /> Waiting for a coordinator to confirm your training. Your attendance and feedback tools unlock once they do.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
