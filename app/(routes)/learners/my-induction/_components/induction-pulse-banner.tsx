'use client';

// Live Pulse banner (fresher side) — when a resource person opens an in-session
// pulse for a session this fresher is enrolled in (their batch), this surfaces a
// prominent "rate now" call. Tapping scrolls to that session's rating card (the
// existing SessionRatingCard, which writes via fn_induction_submit_feedback — the
// SAME write path, so the pulse adds urgency, not a new submission route).
// Polls fn_induction_session_pulse_for_learner every 15s so it appears within
// seconds, and hides a pulse once answered (one rating per session).
import { useEffect, useState } from 'react';
import { Radio, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  InductionPulseService,
  type OpenPulseForLearner,
} from '@/lib/services/induction/induction-pulse-service';

const BRAND = '#0b6d41';

export function InductionPulseBanner() {
  const [pulses, setPulses] = useState<OpenPulseForLearner[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      InductionPulseService.getMyOpenPulses()
        .then((p) => { if (alive) setPulses(p); })
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // show only open pulses the fresher has NOT already answered (rate once)
  const open = pulses.filter((p) => !p.already_answered);
  if (open.length === 0) return null;

  function goRate(sessionId: string) {
    const el = document.getElementById(`isession-${sessionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2');
      setTimeout(() => el.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2'), 2500);
    }
  }

  return (
    <Card className="border-emerald-600/40 bg-emerald-600/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-600 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
          </span>
          <h2 className="text-sm font-semibold" style={{ color: BRAND }}>
            Live pulse — your resource person wants quick feedback
          </h2>
        </div>
        <ul className="space-y-2">
          {open.map((p) => (
            <li key={p.pulse_id}>
              <Button
                type="button"
                onClick={() => goRate(p.session_id)}
                className="w-full justify-between bg-emerald-600 hover:bg-emerald-700"
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <Radio className="h-4 w-4 shrink-0" />
                  <span className="truncate">{p.title || 'Session'}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm shrink-0">
                  Rate now <ChevronRight className="h-4 w-4" />
                </span>
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Takes ~10 seconds. Only you see your answer — your resource person sees totals only.
        </p>
      </CardContent>
    </Card>
  );
}
