'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntryWindowBadge } from './entry-window-badge';
import type { CiaRound } from '@/types/internal-marks';

interface RoundSelectorProps {
  rounds: CiaRound[];
  selectedRound: number | undefined;
  onRoundChange: (round: number) => void;
}

export function RoundSelector({
  rounds,
  selectedRound,
  onRoundChange,
}: RoundSelectorProps) {
  if (rounds.length === 0) return null;

  return (
    <Tabs
      value={selectedRound !== undefined ? String(selectedRound) : undefined}
      onValueChange={(v) => onRoundChange(Number(v))}
    >
      <TabsList>
        {rounds.map((round) => (
          <TabsTrigger
            key={round.round}
            value={String(round.round)}
            className='flex items-center gap-2'
          >
            <span>{round.round_name}</span>
            <EntryWindowBadge round={round} />
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
