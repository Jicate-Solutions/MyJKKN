'use client';

/**
 * AnswerFeedback
 * A subtle "Looks wrong?" control under each Max-lane answer.
 *
 * Pilot decision #4: flagging LOGS the answer for admin review only — there is
 * NO user-facing alert and the answer is NOT changed or retracted. A user can
 * only flag an answer to a question they themselves asked (enforced server-side
 * by fn_ai_flag_answer, which pins auth.uid() and checks ai_jobs.requested_by).
 */

import { useState } from 'react';
import { Flag, Check, Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type FlagState = 'idle' | 'sending' | 'done' | 'error';

export function AnswerFeedback({ jobId }: { jobId: string }) {
  const [state, setState] = useState<FlagState>('idle');

  const flag = async () => {
    if (state === 'sending' || state === 'done') return;
    setState('sending');
    try {
      const supabase = createClientSupabaseClient();
      // fn not yet in generated types (ships with the pilot-polish migration).
      const { data, error } = await (supabase as any).rpc('fn_ai_flag_answer', {
        p_job_id: jobId,
        p_note: null,
      });
      if (error || (data && (data as { ok?: boolean }).ok === false)) {
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <Check className="h-3 w-3" />
        Reported — thanks, we’ll review it.
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={flag}
      disabled={state === 'sending'}
      className={cn(
        'mt-1.5 inline-flex items-center gap-1 text-[10px] transition-colors disabled:opacity-50',
        state === 'error'
          ? 'text-destructive hover:text-destructive/80'
          : 'text-muted-foreground/60 hover:text-amber-600 dark:hover:text-amber-400',
      )}
      aria-label="Report this answer as looking wrong"
    >
      {state === 'sending' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Flag className="h-3 w-3" />
      )}
      {state === 'error' ? 'Couldn’t report — tap to retry' : 'Looks wrong?'}
    </button>
  );
}

export default AnswerFeedback;
