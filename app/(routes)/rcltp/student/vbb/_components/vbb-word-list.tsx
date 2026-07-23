'use client';

// =============================================================================
// RCLTP VBB — vocabulary word list (Phase 4b SHELL)
// =============================================================================
// The 5,000-word Vocabulary Building Blocks list is MyJKKN-gated content. Until
// that content lands, getWords() returns an empty set and we show an HONEST
// "word list coming soon (awaiting MyJKKN content)" shell — we NEVER invent
// words, definitions, or scores. When real words exist, we list them simply
// (word + optional definition/example). This is presentation only; the import
// pipeline (RcltpVbbService.importWordList) is stubbed server-side.
// =============================================================================

import { BookA, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { RcltpVbbWord } from '@/types/rcltp';

export function VbbWordList({ words }: { words: RcltpVbbWord[] }) {
  // Honest MyJKKN-gated empty state — the expected state until content lands.
  if (words.length === 0) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center gap-3 p-10 text-center'>
          <div className='flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary'>
            <Sparkles className='h-6 w-6' aria-hidden='true' />
          </div>
          <div className='space-y-1'>
            <p className='text-base font-semibold'>
              Vocabulary Building Blocks — word list coming soon
            </p>
            <p className='mx-auto max-w-md text-sm text-muted-foreground'>
              Your vocabulary words are being prepared (awaiting MyJKKN content). Once the word
              list is published, your weekly words and progress will appear here. We only ever
              show real words — never placeholders.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Real words exist — list them simply (word + definition/example when present).
  return (
    <ul className='space-y-3'>
      {words.map((w) => (
        <li key={w.id}>
          <Card>
            <CardContent className='space-y-2 p-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <BookA className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
                <span className='text-base font-semibold'>{w.word}</span>
                {w.stage && (
                  <Badge variant='outline' className='capitalize'>
                    {w.stage}
                  </Badge>
                )}
              </div>
              {w.definition && (
                <p className='text-sm text-muted-foreground'>{w.definition}</p>
              )}
              {w.context_example && (
                <p className='text-sm italic text-muted-foreground'>
                  &ldquo;{w.context_example}&rdquo;
                </p>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
