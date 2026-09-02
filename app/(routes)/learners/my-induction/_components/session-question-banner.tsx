'use client';

/**
 * SessionQuestionBanner — discovery for the learner's own view.
 *
 * Mirrors session-poll-banner.tsx: poll for the boards this learner can take part in
 * (15s, so a board switched on mid-session appears without a reload) and render the
 * SHARED SessionQuestionBoard for each. All the board behaviour lives in that shared
 * component; this file only answers "which boards are mine right now".
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SessionQuestionBoard } from '@/components/session-questions/session-question-board';
import {
  SessionQuestionService,
  type LearnerQuestionBoard,
} from '@/lib/services/session-questions/session-question-service';

const DISCOVERY_MS = 15000;

export function SessionQuestionBanner() {
  const [boards, setBoards] = useState<LearnerQuestionBoard[]>([]);

  const load = useCallback(async () => {
    try { setBoards(await SessionQuestionService.myBoards()); } catch { /* silent — banner just stays hidden */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, DISCOVERY_MS);
    return () => clearInterval(t);
  }, [load]);

  if (boards.length === 0) return null;

  return (
    <div className="space-y-4">
      {boards.map((b) => (
        <Card key={b.board_id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Questions{b.title ? ` — ${b.title}` : ''}
              {b.day_number ? <span className="ml-2 text-xs font-normal text-muted-foreground">Day {b.day_number}</span> : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SessionQuestionBoard boardId={b.board_id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
