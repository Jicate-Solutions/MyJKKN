// app/(routes)/audit/care/_components/care-score-sheet.tsx
// The 20-item CARE scoring sheet, grouped by pillar, 0–4 anchored buttons +
// per-item evidence note. Shared by the owner page (per-item save) and the
// participant page (local state, single submit) — the parent owns persistence.

'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  PILLAR_LABELS,
  PILLAR_ORDER,
  SCORE_ANCHORS,
  pillarFromCode,
  type CarePillar,
} from '@/lib/services/audit/care-scoring-service';
import type { CareSnapshotParameter } from '@/lib/services/audit/care-audit-service';

export interface SheetValue {
  score?: number;
  evidence_note?: string;
}

const PILLAR_QUESTIONS: Record<CarePillar, string> = {
  C: 'Does every participant know what this is, what success looks like, and why it matters?',
  A: 'Is effort acknowledged frequently, specifically, and informally — not just outcomes, formally?',
  R: 'Are there visible, attainable, distributed ways to be seen for progress and achievement?',
  E: 'Do participants have real choices, real ownership, and real authority within the initiative?',
};

const PILLAR_COLORS: Record<CarePillar, string> = {
  C: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  A: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
  R: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  E: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

export function CareScoreSheet({
  parameters,
  values,
  onScore,
  onNote,
  disabled = false,
}: {
  parameters: CareSnapshotParameter[];
  values: Record<string, SheetValue>;
  onScore: (code: string, score: number) => void;
  /** Called on note blur — parents persist then (owner) or buffer (participant). */
  onNote: (code: string, note: string) => void;
  disabled?: boolean;
}) {
  const byPillar = PILLAR_ORDER.map((pillar) => ({
    pillar,
    items: parameters
      .filter((p) => pillarFromCode(p.code) === pillar)
      .sort((a, b) => a.code.localeCompare(b.code)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {byPillar.map(({ pillar, items }) => {
        const scored = items.filter((i) => values[i.code]?.score !== undefined);
        const total = scored.reduce((sum, i) => sum + (values[i.code]!.score ?? 0), 0);
        return (
          <div key={pillar} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn('text-xs font-semibold', PILLAR_COLORS[pillar])}>
                {pillar} — {PILLAR_LABELS[pillar]}
              </Badge>
              <span className="text-xs text-muted-foreground italic">
                {PILLAR_QUESTIONS[pillar]}
              </span>
              <span className="ml-auto text-xs font-medium tabular-nums">
                {scored.length === items.length ? `${total}/20` : `${scored.length}/${items.length} scored`}
              </span>
            </div>
            <div className="rounded-md border divide-y">
              {items.map((item) => (
                <ScoreItem
                  key={item.code}
                  item={item}
                  value={values[item.code]}
                  onScore={(s) => onScore(item.code, s)}
                  onNote={(n) => onNote(item.code, n)}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreItem({
  item,
  value,
  onScore,
  onNote,
  disabled,
}: {
  item: CareSnapshotParameter;
  value: SheetValue | undefined;
  onScore: (score: number) => void;
  onNote: (note: string) => void;
  disabled: boolean;
}) {
  const [note, setNote] = useState(value?.evidence_note ?? '');
  const [noteOpen, setNoteOpen] = useState(!!value?.evidence_note);
  const evidenceHint = item.evidence_required?.[0]?.label;

  return (
    <div className="p-3 space-y-2" data-care-item={item.code}>
      <div className="flex items-start gap-3">
        <span className="font-mono text-[11px] text-muted-foreground w-16 flex-shrink-0 pt-0.5">
          {item.code.replace('CARE-', '')}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{item.name}</div>
          <p className="text-xs text-muted-foreground">{item.description}</p>
          {evidenceHint && (
            <p className="text-[11px] text-muted-foreground mt-1">
              <span className="font-medium">Evidence to look for:</span> {evidenceHint}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pl-16">
        {[0, 1, 2, 3, 4].map((s) => {
          const anchor = SCORE_ANCHORS[s]!;
          const active = value?.score === s;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              title={anchor.hint}
              onClick={() => onScore(s)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/30 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
              )}
            >
              <span className="tabular-nums font-semibold">{s}</span>
              <span className="ml-1 hidden sm:inline">{anchor.label}</span>
            </button>
          );
        })}
        {!disabled && (
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-1 self-center"
          >
            {noteOpen ? 'Hide note' : value?.evidence_note ? 'Edit note' : '+ Evidence note'}
          </button>
        )}
      </div>

      {(noteOpen || (disabled && value?.evidence_note)) && (
        <div className="pl-16">
          {disabled ? (
            <p className="text-xs text-muted-foreground border-l-2 pl-2">{value?.evidence_note}</p>
          ) : (
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => onNote(note)}
              rows={2}
              placeholder="What evidence supports this score? Score what exists and is verifiable, not what is intended."
              className="text-xs"
            />
          )}
        </div>
      )}
    </div>
  );
}
