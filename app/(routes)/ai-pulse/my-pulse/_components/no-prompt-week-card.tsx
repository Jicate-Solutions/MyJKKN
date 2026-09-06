// app/(routes)/ai-pulse/my-pulse/_components/no-prompt-week-card.tsx
// Created: 2026-08-13 — honest empty state for the AI Pulse week switcher.
//
// The week switcher used to hide any week that had no AI starter for the
// reader, so sessions they actually attended simply vanished from the picker.
// Director's decision (2026-08-13): show every attended week and say plainly
// when there is no prompt for it.
//
// Rendered by ../page.tsx in place of <DomainStarterCard> whenever the selected
// cycle came back from fn_ai_pulse_switchable_cycles with has_prompt = false.
// DomainStarterCard renders nothing in exactly that case, so the two never
// appear together — has_prompt mirrors the same read fn the card queries.
//
// Deliberately a plain server component: static copy, no data, no interaction.

import { Sparkles } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function NoPromptWeekCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-base text-muted-foreground">
            No AI starter for this week
          </CardTitle>
        </div>
        <CardDescription>
          Nothing was written for your programme in this week&apos;s AI Pulse.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This week is still here because you joined the live session — it is
          not hidden and nothing is missing from your record. There simply was
          no prompt pack for your programme that week. Pick another week above
          to see one.
        </p>
      </CardContent>
    </Card>
  );
}
