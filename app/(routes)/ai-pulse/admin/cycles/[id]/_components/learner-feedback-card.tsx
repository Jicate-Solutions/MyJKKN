'use client';

/**
 * AI Pulse — Learner Feedback Card (Champion Console, per-cycle)
 *
 * CARE E-move (audit 2026-06-12, pillar E scored 6/20, E5 "voice changes the
 * system" = 0). Surfaces the anonymous "what should change next week?" answers
 * learners attach to their quiz submission (engagement_signals.feedback_text).
 *
 * Anonymous BY DESIGN — text only, no profile join. The Champion answers the
 * themes via the cycle's "You said, we changed" field, which closes the loop
 * on My Pulse.
 *
 * Pattern: sibling publication-metrics-card (per-cycle read card) + the
 * dept-heatmap client-side attendance read.
 */

import { useQuery } from '@tanstack/react-query';
import { MessageSquareQuote, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface LearnerFeedbackCardProps {
  cycleId: string;
}

async function fetchFeedback(cycleId: string): Promise<string[]> {
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase
    .from('ai_pulse_live_attendance')
    .select('engagement_signals')
    .eq('event_id', cycleId)
    .eq('day_type', 'live_session');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ engagement_signals: any }>)
    .map((r) => r.engagement_signals?.feedback_text)
    .filter(
      (t): t is string => typeof t === 'string' && t.trim().length > 0,
    );
}

export function LearnerFeedbackCard({ cycleId }: LearnerFeedbackCardProps) {
  const { data: feedback, isLoading } = useQuery<string[], Error>({
    queryKey: ['ai-pulse', 'learner-feedback', cycleId],
    queryFn: () => fetchFeedback(cycleId),
    enabled: !!cycleId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4" aria-hidden />
          Learner feedback
          {feedback && feedback.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({feedback.length})
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Anonymous &ldquo;what should change next week?&rdquo; answers from the
          quiz. Answer the themes in the &ldquo;You said, we changed&rdquo;
          field above — it shows on every learner&apos;s My Pulse.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading feedback…
          </div>
        ) : !feedback || feedback.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No feedback submitted for this cycle yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {feedback.map((text, i) => (
              <li
                key={i}
                className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
              >
                {text}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
