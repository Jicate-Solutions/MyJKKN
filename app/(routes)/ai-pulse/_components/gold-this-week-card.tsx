// app/(routes)/ai-pulse/_components/gold-this-week-card.tsx
// Created: 2026-06-12 — CARE R-move (audit pillar R scored 8/20: Gold existed
// only behind admin/NAAC surfaces; learners had no way to see who won).
//
// Server-rendered presentational card. Parent (my-pulse page) fetches via
// AiPulseLearnerService.getLatestGoldServer() and passes the result; renders
// nothing when null (no winners yet, or RLS hid the rows) — an empty
// recognition shell would be worse than none.

import { Trophy } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { AiPulseGoldWeek } from '@/lib/services/ai-pulse/learner-service';

interface GoldThisWeekCardProps {
  gold: AiPulseGoldWeek | null;
}

export function GoldThisWeekCard({ gold }: GoldThisWeekCardProps) {
  if (!gold || gold.winners.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
          <CardTitle className="text-base">Gold Standard — this week</CardTitle>
        </div>
        <CardDescription>
          Faculty-picked top work from {gold.cycle_name}
          {gold.demo_date ? ` (${gold.demo_date})` : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {gold.winners.map((w) => (
            <li key={w.department_name} className="text-sm">
              <span className="font-medium">{w.department_name}:</span>{' '}
              {w.team_names.join(', ')}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
