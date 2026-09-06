'use client';

// Senior Peer Mentor entry card on /learners/my-induction. Self-scoping: renders
// NOTHING unless the viewing student is an active Senior Peer Mentor with an
// assigned group (fn_induction_my_volunteer_sessions returns their covered
// sessions). Gives a final-year mentor a one-tap route to their duties lane
// (/my-induction-feedback) right where they already land as a student — the
// discoverable entry point paired with the sidebar link.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCheck, ArrowRight } from 'lucide-react';
import { InductionVolunteerService } from '@/lib/services/induction/induction-volunteer-service';

const BRAND = '#0b6d41';

export function SeniorPeerMentorCard() {
  const [state, setState] = useState<{ groupSize: number; sessions: number } | null | 'loading'>('loading');

  useEffect(() => {
    InductionVolunteerService.myVolunteerSessions()
      .then((rows) => {
        const owned = rows.filter((s) => s.group_size > 0);
        if (owned.length === 0) { setState(null); return; }
        // group_size is the mentor's roster on each session; take the max as their headcount.
        const groupSize = Math.max(...owned.map((s) => s.group_size));
        setState({ groupSize, sessions: owned.length });
      })
      .catch(() => setState(null));
  }, []);

  // Invisible while loading and for any student who isn't a mentor.
  if (state === 'loading' || state === null) return null;

  return (
    <Card className="border-l-4" style={{ borderLeftColor: BRAND }}>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: `${BRAND}1a` }}>
            <UserCheck className="h-5 w-5" style={{ color: BRAND }} />
          </div>
          <div className="min-w-0">
            <div className="font-medium">You&apos;re a Senior Peer Mentor</div>
            <div className="text-sm text-muted-foreground">
              {state.groupSize} fresher{state.groupSize === 1 ? '' : 's'} assigned to you across{' '}
              {state.sessions} session{state.sessions === 1 ? '' : 's'} — mark their attendance and collect feedback.
            </div>
          </div>
        </div>
        <Button asChild style={{ backgroundColor: BRAND }} className="text-white hover:opacity-90 shrink-0">
          <Link href="/my-induction-feedback">
            Open my group <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
