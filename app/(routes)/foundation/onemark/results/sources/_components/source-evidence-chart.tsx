'use client';

// OneMark — the two halves of ruling (a), on one axis.
//
// A grouped horizontal bar per source: how often its questions turned up in the
// real board paper, and how often learners get its questions right in practice.
// Both are percentages of the same kind, so they share ONE axis — the thing that
// would make this chart a lie is a second y-scale, and there isn't one.
//
// Colour: categorical slots 1 and 2 of the reference palette, validated with
// scripts/validate_palette.js in both modes (worst adjacent CVD ΔE 24.7 light /
// 26.8 dark against an ≥8 target; normal-vision ΔE 33.6 / 31.8 against an ≥15
// floor — all six checks PASS). Identity is never colour alone: there is a
// legend, and every bar carries its number at the end.
//
// Sources with no live questions are absent from the CHART on purpose — a bar of
// nothing reads as a measurement of zero. They are all still in the table below.

import type { SourceChartDatum } from '@/lib/services/onemark/sources-analytics';

interface SourceEvidenceChartProps {
  data: SourceChartDatum[];
  /** null = every board year at once. */
  year: number | null;
}

const LABEL_W = 176;
const RIGHT_PAD = 52;
const VIEW_W = 760;
const ROW_H = 40;
const BAR_H = 12;
const BAR_GAP = 2; // the 2px surface gap between adjacent marks
const TOP_PAD = 26;
const BOTTOM_PAD = 26;
const TICKS = [0, 25, 50, 75, 100];

function truncate(s: string, max = 26): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function SourceEvidenceChart({ data, year }: SourceEvidenceChartProps) {
  if (data.length === 0) return null;

  const plotW = VIEW_W - LABEL_W - RIGHT_PAD;
  const height = TOP_PAD + data.length * ROW_H + BOTTOM_PAD;
  const x = (pct: number) => LABEL_W + (Math.max(0, Math.min(100, pct)) / 100) * plotW;

  return (
    <figure className="om-viz space-y-3">
      <style>{`
        .om-viz {
          --viz-series-1: #2a78d6;
          --viz-series-2: #eb6834;
          --viz-grid: #e4e4e0;
          --viz-axis: #b9b9b2;
          --viz-ink: #0b0b0b;
          --viz-ink-muted: #52514e;
          --viz-surface: transparent;
        }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .om-viz {
            --viz-series-1: #3987e5;
            --viz-series-2: #d95926;
            --viz-grid: #333330;
            --viz-axis: #4d4d48;
            --viz-ink: #ffffff;
            --viz-ink-muted: #c3c2b7;
          }
        }
        :root[data-theme="dark"] .om-viz {
          --viz-series-1: #3987e5;
          --viz-series-2: #d95926;
          --viz-grid: #333330;
          --viz-axis: #4d4d48;
          --viz-ink: #ffffff;
          --viz-ink-muted: #c3c2b7;
        }
        .om-viz .om-bar { transition: opacity 120ms ease; }
        .om-viz:hover .om-bar { opacity: 0.55; }
        .om-viz .om-bar:hover { opacity: 1; }
      `}</style>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs" style={{ color: 'var(--viz-ink-muted)' }}>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: 'var(--viz-series-1)' }}
          />
          Turned up in the board paper{year !== null ? ` (${year})` : ' (every year)'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: 'var(--viz-series-2)' }}
          />
          Answered correctly in practice
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VIEW_W} ${height}`}
          className="h-auto w-full min-w-[560px]"
          role="img"
          aria-label="Board hit rate and practice accuracy, per question source"
        >
          {TICKS.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={TOP_PAD - 8}
                y2={height - BOTTOM_PAD + 4}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text
                x={x(t)}
                y={height - BOTTOM_PAD + 18}
                textAnchor="middle"
                fontSize={10}
                fill="var(--viz-ink-muted)"
              >
                {t}%
              </text>
            </g>
          ))}
          <line
            x1={LABEL_W}
            x2={LABEL_W}
            y1={TOP_PAD - 8}
            y2={height - BOTTOM_PAD + 4}
            stroke="var(--viz-axis)"
            strokeWidth={1}
          />

          {data.map((d, i) => {
            const top = TOP_PAD + i * ROW_H;
            const yHit = top + (ROW_H - (BAR_H * 2 + BAR_GAP)) / 2;
            const yAcc = yHit + BAR_H + BAR_GAP;
            return (
              <g key={d.key}>
                <text
                  x={LABEL_W - 10}
                  y={top + ROW_H / 2 + 1}
                  textAnchor="end"
                  fontSize={11}
                  fill={d.source_active ? 'var(--viz-ink)' : 'var(--viz-ink-muted)'}
                  fontStyle={d.source_active ? 'normal' : 'italic'}
                >
                  {truncate(d.label)}
                </text>

                {d.hit_rate_pct !== null ? (
                  <>
                    <rect
                      className="om-bar"
                      x={LABEL_W}
                      y={yHit}
                      width={Math.max(2, x(d.hit_rate_pct) - LABEL_W)}
                      height={BAR_H}
                      rx={4}
                      fill="var(--viz-series-1)"
                    >
                      <title>{`${d.label} — turned up in the board paper: ${d.hit_rate_pct}% of ${d.items_active} live questions`}</title>
                    </rect>
                    <text
                      x={x(d.hit_rate_pct) + 6}
                      y={yHit + BAR_H - 2}
                      fontSize={10}
                      fill="var(--viz-ink-muted)"
                    >
                      {d.hit_rate_pct}%
                    </text>
                  </>
                ) : (
                  <text x={LABEL_W + 6} y={yHit + BAR_H - 2} fontSize={10} fill="var(--viz-ink-muted)">
                    no rate yet
                  </text>
                )}

                {d.accuracy_pct !== null ? (
                  <>
                    <rect
                      className="om-bar"
                      x={LABEL_W}
                      y={yAcc}
                      width={Math.max(2, x(d.accuracy_pct) - LABEL_W)}
                      height={BAR_H}
                      rx={4}
                      fill="var(--viz-series-2)"
                    >
                      <title>{`${d.label} — answered correctly in practice: ${d.accuracy_pct}%`}</title>
                    </rect>
                    <text
                      x={x(d.accuracy_pct) + 6}
                      y={yAcc + BAR_H - 2}
                      fontSize={10}
                      fill="var(--viz-ink-muted)"
                    >
                      {d.accuracy_pct}%
                    </text>
                  </>
                ) : (
                  <text x={LABEL_W + 6} y={yAcc + BAR_H - 2} fontSize={10} fill="var(--viz-ink-muted)">
                    never served
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <figcaption className="text-[11px] leading-relaxed" style={{ color: 'var(--viz-ink-muted)' }}>
        Sources with no live questions are left out of this chart and kept in the table below — a bar of nothing
        would read as a measurement of zero. A retired source is shown in italics.
      </figcaption>
    </figure>
  );
}
