'use client';

/**
 * Severity Matrix Picker — 5×5 likelihood × impact grid.
 *
 * Clicking a cell sets likelihood (row) + impact (column). Each cell is
 * color-coded by its RAG band (likelihood × impact → red/amber/green) so the
 * picker doubles as a heat-map. The selected cell is ringed.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3 (matrix severity).
 */

import { cn } from '@/lib/utils';
import { ragFromMatrix } from '@/types/projects-risks';

const SCALE = [1, 2, 3, 4, 5] as const;

const RAG_CELL: Record<string, string> = {
  red: 'bg-red-500/80 hover:bg-red-500 text-white',
  amber: 'bg-amber-400/80 hover:bg-amber-400 text-amber-950',
  green: 'bg-green-500/70 hover:bg-green-500 text-white',
};

interface SeverityMatrixProps {
  likelihood: number | null;
  impact: number | null;
  onChange: (likelihood: number, impact: number) => void;
  /** Render read-only (no hover/click) — e.g. inside a detail view. */
  readOnly?: boolean;
}

export function SeverityMatrix({
  likelihood,
  impact,
  onChange,
  readOnly = false,
}: SeverityMatrixProps) {
  return (
    <div className="inline-block">
      <div className="flex">
        {/* Left axis label */}
        <div className="flex items-center justify-center pr-1">
          <span className="-rotate-180 text-[10px] font-medium uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
            Likelihood
          </span>
        </div>

        <div>
          {/* Grid: rows are likelihood (5 at top → 1 at bottom), cols are impact 1→5 */}
          <div className="grid grid-cols-5 gap-1">
            {[...SCALE].reverse().map((l) =>
              SCALE.map((i) => {
                const rag = ragFromMatrix(l, i);
                const isSelected = likelihood === l && impact === i;
                return (
                  <button
                    key={`${l}-${i}`}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChange(l, i)}
                    aria-label={`Likelihood ${l}, Impact ${i} — ${rag}, score ${l * i}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded text-xs font-semibold transition-colors',
                      RAG_CELL[rag],
                      readOnly && 'cursor-default',
                      isSelected &&
                        'ring-2 ring-offset-2 ring-foreground ring-offset-background',
                    )}
                  >
                    {l * i}
                  </button>
                );
              }),
            )}
          </div>

          {/* Bottom axis: impact scale */}
          <div className="mt-1 grid grid-cols-5 gap-1">
            {SCALE.map((i) => (
              <div
                key={i}
                className="text-center text-[10px] font-medium text-muted-foreground"
              >
                {i}
              </div>
            ))}
          </div>
          <div className="mt-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Impact
          </div>
        </div>
      </div>
    </div>
  );
}
