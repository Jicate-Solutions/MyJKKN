'use client';

// OneMark — how a sitting went.
//
// Leads with the reasoning, not the score: the count sits small at the top, the
// explanation gets the space. Skipped questions are shown as "Not attempted"
// and never as wrong (decision 18). A sitting that was already submitted
// (decision 19) shows the same review with a banner saying so.

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SittingReview } from '@/lib/services/onemark/vault-service';
import { ItemFlagButton } from '../../../_components/item-flag-button';
import { Bilingual, LangSwitch, useLang, optionText } from './bilingual';

export function SittingReviewView({
  examName,
  review,
  onAgain,
  onExit,
}: {
  examName: string;
  review: SittingReview;
  onAgain?: () => void;
  onExit: () => void;
}) {
  const [lang, setLang] = useLang();
  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-10 border-b border-border pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{examName}</p>
          <LangSwitch lang={lang} onChange={setLang} />
        </div>
        {review.alreadySubmitted && (
          <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            This paper is submitted. Here is the result that stands — it cannot be sat again.
          </p>
        )}
        <p className="mt-3 text-base text-foreground">
          You answered <span className="font-semibold tabular-nums">{review.correct}</span> of{' '}
          <span className="tabular-nums">{review.answered}</span> correctly.
        </p>
        {review.skipped > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            You skipped <span className="tabular-nums">{review.skipped}</span>. Those are not
            counted either way — the answers are below so you can read them.
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          The useful part is below — what each answer was, and why.
        </p>
      </div>

      <ol className="space-y-10">
        {review.questions.map((q, i) => {
          const correct = q.isCorrect === true;
          const chosenKey = typeof q.chosen === 'string' ? q.chosen : q.chosen == null ? null : String(q.chosen);
          const answerKey = typeof q.correctAnswer === 'string' ? q.correctAnswer : String(q.correctAnswer ?? '');
          const chosenText = chosenKey ? optionText(q.options ?? [], q.optionsTa, chosenKey) : null;
          const answerText = optionText(q.options ?? [], q.optionsTa, answerKey);
          return (
            <li key={q.itemId}>
              <div className="mb-3 flex items-baseline gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span
                  className={cn(
                    'text-xs font-medium uppercase tracking-wide',
                    correct
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {correct ? 'Correct' : q.skipped ? 'Not attempted' : 'Look again'}
                </span>
              </div>

              <div className="mb-3 text-base leading-relaxed text-foreground">
                <Bilingual lang={lang} en={q.stem} ta={q.stemTa} />
              </div>

              {!correct && (
                <div className="mb-2 text-sm text-muted-foreground">
                  {chosenKey && (
                    <p>
                      You chose{' '}
                      <span className="text-foreground">
                        {chosenKey}
                        {chosenText?.en || chosenText?.ta ? ' — ' : ''}
                      </span>
                      <Bilingual
                        lang={lang}
                        en={chosenText?.en}
                        ta={chosenText?.ta}
                        className="inline text-foreground"
                      />
                    </p>
                  )}
                  <p>
                    The answer is <span className="text-foreground">{answerKey}</span>
                    {answerText.en || answerText.ta ? ' — ' : ''}
                    <Bilingual
                      lang={lang}
                      en={answerText.en}
                      ta={answerText.ta}
                      className="inline text-foreground"
                    />
                  </p>
                </div>
              )}

              {(q.explanation || q.explanationTa) && (
                <div className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
                  <Bilingual lang={lang} en={q.explanation} ta={q.explanationTa} />
                </div>
              )}

              <div className="mt-3">
                <ItemFlagButton itemId={q.itemId} existingFlag={null} />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-12 flex flex-wrap gap-3 border-t border-border pt-6">
        {onAgain && (
          <Button onClick={onAgain}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Sit another
          </Button>
        )}
        <Button variant="outline" onClick={onExit}>
          Back to subjects
        </Button>
      </div>
    </div>
  );
}
