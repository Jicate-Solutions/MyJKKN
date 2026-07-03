// Loop Control Tower — shared display types.
export type Gate = 'on' | 'off' | 'half';
export type LoopTone = 'live' | 'early' | 'sched' | 'dark' | 'intake';

export interface LoopMetric {
  v: string;
  k: string;
  tone?: 'good' | 'warn' | 'mute';
}

export interface LoopCard {
  id: string;
  name: string;
  subid?: string;
  plain: string;
  cfg?: string;
  status: string;
  tone: LoopTone;
  gates: [Gate, Gate, Gate, Gate];
  metrics: LoopMetric[];
  note: string;
  noteTag?: string;
}

export interface LoopTier {
  title: string;
  gateLabel: string;
  blurb: string;
  loops: LoopCard[];
}
