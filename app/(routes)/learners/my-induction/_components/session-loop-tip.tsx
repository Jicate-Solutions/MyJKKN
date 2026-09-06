'use client';

// One session-effectiveness loop tip for a weak session the resource person led:
// the AI improvement suggestion + its HONEST measured effect on the next-batch
// re-run (net of regression-to-the-mean). Rendered inside SessionsLedCard only for
// sessions that have a loop row.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import type { SessionLoopTip } from '@/lib/services/induction/induction-speakers-service';

function EffectBadge({ tip }: { tip: SessionLoopTip }) {
  if (tip.measure_status === 'measured' && tip.net_effect != null) {
    const real = tip.net_effect > 0.05;
    return (
      <Badge variant={real ? 'secondary' : 'outline'} className="text-xs font-normal">
        {real
          ? `+${tip.net_effect.toFixed(2)} above luck on re-run`
          : 'No real lift above luck yet'}
      </Badge>
    );
  }
  if (tip.measure_status === 'insufficient_rtm_data') {
    return (
      <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
        re-run in — need more re-runs to separate from luck
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
      awaiting next-batch re-run
    </Badge>
  );
}

export function SessionLoopTipCard({ tip }: { tip: SessionLoopTip }) {
  const [open, setOpen] = useState(false);
  const s = tip.suggestion;
  if (!s) return null;

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
      <div className="flex items-start gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium text-amber-800">AI tip to improve this session</div>
          {s.summary && <p className="text-muted-foreground mt-0.5">{s.summary}</p>}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <EffectBadge tip={tip} />
        {s.improvements && s.improvements.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide' : 'What to try'}
            {open ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
        )}
      </div>
      {open && s.improvements && (
        <ul className="mt-2 space-y-1.5">
          {s.improvements.map((imp, i) => (
            <li key={i} className="rounded border bg-background/60 p-1.5">
              <div className="font-medium">{imp.title}</div>
              <div className="text-muted-foreground">{imp.how}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
