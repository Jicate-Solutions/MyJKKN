// ============================================================================
// LOOP WIRING — how the loops actually feed each other
// ============================================================================
// Draws loop_registry + loop_edges as a literal diagram: three bands
// bottom-to-top (tier-3 goal loops → the MetaLoop → the Director), edges
// colored by what_flows, arrows for direction. Nothing here is illustrative —
// every node is a real registry row and every edge a real loop_edges row.
//
// SEAM DETECTION is the point of this view: a `measured_outcomes` edge whose
// source loop hasn't closed gate M is a lie — it claims to carry a measurement
// that was never taken. Those edges render in red, and everything reachable
// downstream of them (the rings that depend on that measurement) is dimmed,
// so a dark seam is visible at a glance instead of buried in a table.
//
// Pure server component (no interactivity, no client JS) — data assembled in
// ../page.tsx and passed straight through.
// ============================================================================

import type { LoopRegistryRow, LoopEdgeRow, LoopAuditRow, LoopConflictRow } from './types';

const MIN_VB_W = 1200;
const VB_H = 760;
const NODE_W = 150;
const NODE_H = 54;
const MARGIN_X = 60;
// Horizontal room per tier-3 node beyond the card itself, and breathing space
// between class groups. Every node gets a FULL card width + gap — the canvas
// grows with the fleet instead of squeezing cards into overlap.
const NODE_GAP = 18;
const GROUP_PAD = 28;

const DIRECTOR_CY = 66;
const METALOOP_CY = 258;
const TIER3_CY = 470;
const TIER3_LABEL_Y = TIER3_CY - NODE_H / 2 - 16;

// Canonical left-to-right group order for the tier-3 band. Any loop_class
// present in the data but not listed here is appended at the end, so a future
// class never silently disappears from the diagram.
const GROUP_ORDER = ['self_improving', 'cadence', 'intake', 'accountability'] as const;

const CLASS_LABEL: Record<string, string> = {
  self_improving: 'Self-improving',
  cadence: 'Cadence & rotation',
  intake: 'Intake (senses)',
  accountability: 'Accountability',
  infrastructure: 'Infrastructure',
};

const CLASS_FILL: Record<string, string> = {
  self_improving: 'fill-emerald-50 dark:fill-emerald-950/40',
  cadence: 'fill-cyan-50 dark:fill-cyan-950/40',
  intake: 'fill-slate-50 dark:fill-slate-900/40',
  accountability: 'fill-amber-50 dark:fill-amber-950/40',
  infrastructure: 'fill-muted',
};

const FLOW_COLOR: Record<LoopEdgeRow['what_flows'], string> = {
  measured_outcomes: 'stroke-emerald-500',
  decisions: 'stroke-violet-500',
  fuel: 'stroke-sky-500',
  escalations: 'stroke-amber-500',
};

const FLOW_LABEL: Record<LoopEdgeRow['what_flows'], string> = {
  measured_outcomes: 'measured outcomes',
  decisions: 'decisions',
  fuel: 'fuel',
  escalations: 'escalations',
};

type Point = { x: number; y: number };
type Center = { cx: number; cy: number };

function wrapTwoLines(name: string, maxChars = 20): [string, string] {
  if (name.length <= maxChars) return [name, ''];
  const words = name.split(' ');
  let line1 = '';
  let i = 0;
  while (i < words.length && `${line1} ${words[i]}`.trim().length <= maxChars) {
    line1 = `${line1} ${words[i]}`.trim();
    i++;
  }
  const rest = words.slice(i).join(' ');
  const line2 = rest.length > maxChars ? `${rest.slice(0, maxChars - 1)}…` : rest;
  return [line1 || name.slice(0, maxChars), line2];
}

function fmtAuditDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`;
}

// Connector points on each node's boundary, chosen by whether the relationship
// is mostly vertical (tier-to-tier — connect top/bottom) or mostly horizontal
// (sibling nodes in the same band — connect left/right).
function connectorPoints(from: Center, to: Center): { start: Point; end: Point; vertical: boolean } {
  const dy = to.cy - from.cy;
  const dx = to.cx - from.cx;
  const vertical = Math.abs(dy) >= Math.abs(dx);
  if (vertical) {
    return {
      start: { x: from.cx, y: from.cy + (dy >= 0 ? NODE_H / 2 : -NODE_H / 2) },
      end: { x: to.cx, y: to.cy + (dy >= 0 ? -NODE_H / 2 : NODE_H / 2) },
      vertical,
    };
  }
  return {
    start: { x: from.cx + (dx >= 0 ? NODE_W / 2 : -NODE_W / 2), y: from.cy },
    end: { x: to.cx + (dx >= 0 ? -NODE_W / 2 : NODE_W / 2), y: to.cy },
    vertical,
  };
}

function bezierD(start: Point, end: Point, vertical: boolean): string {
  if (vertical) {
    const midY = (start.y + end.y) / 2;
    return `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;
  }
  const midX = (start.x + end.x) / 2;
  return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
}

function LoopNode({ row, pos, dim }: { row: LoopRegistryRow; pos: Center; dim: boolean }) {
  const [line1, line2] = wrapTwoLines(row.name);
  const fill = CLASS_FILL[row.loop_class] ?? CLASS_FILL.infrastructure!;
  const x = pos.cx - NODE_W / 2;
  const y = pos.cy - NODE_H / 2;
  const gateKeys = ['g', 'a', 'm', 'f'] as const;
  return (
    <g className={dim ? 'opacity-50' : undefined}>
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={10}
        className={`stroke-border ${fill}`}
        strokeWidth={1.5}
      />
      <text x={pos.cx} y={y + 19} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
        {line1}
      </text>
      {line2 && (
        <text x={pos.cx} y={y + 31} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
          {line2}
        </text>
      )}
      {gateKeys.map((k, i) => {
        const g = row.gates?.[k] ?? 'off';
        const dotX = x + 24 + i * 20;
        const dotY = y + NODE_H - 10;
        const cls =
          g === 'on'
            ? 'fill-emerald-500 stroke-emerald-500'
            : g === 'half'
              ? 'fill-transparent stroke-amber-500'
              : 'fill-transparent stroke-muted-foreground/40';
        return (
          <circle
            key={k}
            cx={dotX}
            cy={dotY}
            r={3.5}
            className={cls}
            strokeWidth={1.5}
            strokeDasharray={g === 'half' ? '2,1.5' : undefined}
          />
        );
      })}
    </g>
  );
}

function LegendDot({ colorCls, label }: { colorCls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${colorCls}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function LoopWiring({
  registry,
  edges,
  audits,
  conflicts = [],
}: {
  registry: LoopRegistryRow[];
  edges: LoopEdgeRow[];
  audits: LoopAuditRow[];
  conflicts?: LoopConflictRow[];
}) {
  if (registry.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
        No loop_registry rows yet, so there is nothing to wire — this view draws
        directly from that table and loop_edges. Seed the registry, then this
        diagram fills in on its own.
      </div>
    );
  }

  const byKey = new Map(registry.map((r) => [r.loop_key, r]));
  const tier3Rows = registry.filter((r) => r.stack_tier === 3);
  const metaloopRow = registry.find((r) => r.stack_tier === 4) ?? null;
  const directorRow = registry.find((r) => r.stack_tier === 5) ?? null;

  // Group tier-3 rows by loop_class in canonical order; unlisted classes are
  // appended so nothing present in the data is ever silently dropped.
  const presentClasses = new Set(tier3Rows.map((r) => r.loop_class));
  const orderedClasses = [
    ...GROUP_ORDER.filter((c) => presentClasses.has(c)),
    ...[...presentClasses].filter((c) => !(GROUP_ORDER as readonly string[]).includes(c)),
  ];
  const groups = orderedClasses.map((cls) => ({
    cls,
    rows: tier3Rows.filter((r) => r.loop_class === cls),
  }));

  // Lay out tier-3 nodes. Width is DATA-DRIVEN: each class group's span is
  // proportional to how many loops it holds, and every node gets a full card
  // width + gap. Equal slices overlapped cards as soon as one class outgrew
  // the others (Director report 2026-07-11); now the canvas widens with the
  // fleet and scrolls horizontally inside its container — cards never shrink
  // or overlap.
  const slotW = NODE_W + NODE_GAP;
  const groupWidths = groups.map((g) => Math.max(g.rows.length, 1) * slotW + GROUP_PAD);
  const bandW = groupWidths.reduce((a, b) => a + b, 0);
  const vbW = Math.max(MIN_VB_W, bandW + MARGIN_X * 2);
  // Center the band when the minimum canvas is wider than the band itself.
  let cursorX = MARGIN_X + Math.max(0, (vbW - MARGIN_X * 2 - bandW) / 2);
  const positions = new Map<string, Center>();
  const groupLabelX = new Map<string, number>();
  groups.forEach((g, gi) => {
    const gw = groupWidths[gi];
    groupLabelX.set(g.cls, cursorX + gw / 2);
    const rowCount = g.rows.length || 1;
    const innerX0 = cursorX + (gw - rowCount * slotW) / 2;
    g.rows.forEach((r, ri) => {
      positions.set(r.loop_key, { cx: innerX0 + (ri + 0.5) * slotW, cy: TIER3_CY });
    });
    cursorX += gw;
  });
  if (metaloopRow) positions.set(metaloopRow.loop_key, { cx: vbW / 2, cy: METALOOP_CY });
  if (directorRow) positions.set(directorRow.loop_key, { cx: vbW / 2, cy: DIRECTOR_CY });

  // ── Seam detection ──────────────────────────────────────────────────────
  // A measured_outcomes edge is dark when its source loop hasn't closed gate
  // M — it's promising a measurement it never took. Everything reachable
  // downstream of that edge (the rings that consume the "measurement") is
  // marked dimmed, so the blindness is visible past the immediate edge.
  const darkEdges = edges.filter((e) => {
    if (e.what_flows !== 'measured_outcomes') return false;
    const from = byKey.get(e.from_key);
    // Both endpoints must be rendered nodes — an edge referencing a
    // deactivated loop is skipped by the render path below, so it must not
    // raise a phantom seam naming a raw key either (review 2026-07-10, #4).
    if (!from || !byKey.get(e.to_key)) return false;
    return from.gates?.m !== 'on';
  });
  const darkEdgeKeys = new Set(darkEdges.map((e) => `${e.from_key}->${e.to_key}`));

  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!adjacency.has(e.from_key)) adjacency.set(e.from_key, []);
    adjacency.get(e.from_key)!.push(e.to_key);
  }
  // Dimmed = strictly-downstream consumers of the missing measurement. Seam
  // SOURCES are excluded — a reciprocal edge (director→metaloop, decisions)
  // must not pull the seam's own origin into the "runs blind" set, which
  // both inflated the banner count and greyed the very node to fix
  // (review 2026-07-10, #1, two-lens).
  const darkSources = new Set(darkEdges.map((e) => e.from_key));
  const dimmed = new Set<string>();
  const stack = darkEdges.map((e) => e.to_key);
  const seen = new Set<string>();
  while (stack.length) {
    const key = stack.pop()!;
    if (seen.has(key) || darkSources.has(key)) continue;
    seen.add(key);
    dimmed.add(key);
    for (const next of adjacency.get(key) ?? []) stack.push(next);
  }

  const seamFromNames = [...new Set(darkEdges.map((e) => byKey.get(e.from_key)?.name ?? e.from_key))];

  // Nodes named in an OPEN loop_conflicts row get a red dashed outline —
  // drawn as an overlay so the node card itself stays untouched.
  const conflictKeys = new Set(conflicts.flatMap((c) => c.loops));

  return (
    <section aria-label="Loop wiring — how the loops feed each other">
      <div className="mb-2">
        <h2 className="text-base font-semibold">Loop Wiring — how outcomes, decisions, fuel, and escalations actually flow</h2>
        <p className="text-[13px] text-muted-foreground">
          Every arrow below is a real loop_edges row, not an illustration. Dashed = draft, not yet wired for real.
        </p>
      </div>

      {seamFromNames.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-400/70 bg-amber-50/60 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="mr-1 font-bold">⚠ Open seam:</span>
          {seamFromNames.join(', ')} emit no measured outcomes — {dimmed.size} ring
          {dimmed.size === 1 ? '' : 's'} above run blind. Closing Measure+Verdict there turns the lights on.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
        {/* Natural pixel width (not w-full): a viewBox-scaled svg re-squeezes
            everything the layout just spaced out. The parent is overflow-x-auto,
            so a wide fleet scrolls instead of shrinking. */}
        <svg viewBox={`0 0 ${vbW} ${VB_H}`} className="h-auto" style={{ width: vbW, minWidth: '100%' }}>
          <defs>
            <marker id="loop-wiring-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" className="fill-foreground/50" />
            </marker>
          </defs>

          {groups.map((g) => (
            <text
              key={g.cls}
              x={groupLabelX.get(g.cls)}
              y={TIER3_LABEL_Y}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-wide"
            >
              {CLASS_LABEL[g.cls] ?? g.cls}
            </text>
          ))}

          {/* Edges drawn first so nodes sit visually on top of them. */}
          {edges.map((e, i) => {
            const from = positions.get(e.from_key);
            const to = positions.get(e.to_key);
            if (!from || !to) return null; // an edge referencing an inactive/unknown key — skip, don't crash
            const { start, end, vertical } = connectorPoints(from, to);
            const isSeam = darkEdgeKeys.has(`${e.from_key}->${e.to_key}`);
            const colorCls = isSeam ? 'stroke-red-500' : FLOW_COLOR[e.what_flows];
            const dashed = isSeam || e.is_draft;
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            return (
              <g key={`${e.from_key}-${e.to_key}-${i}`}>
                <path
                  d={bezierD(start, end, vertical)}
                  fill="none"
                  className={colorCls}
                  strokeWidth={isSeam ? 2.5 : 1.75}
                  strokeDasharray={dashed ? '6,4' : undefined}
                  markerEnd="url(#loop-wiring-arrow)"
                />
                {isSeam ? (
                  <text x={midX} y={midY - 6} textAnchor="middle" className="fill-red-500 text-[13px] font-bold">
                    ⚠
                  </text>
                ) : (
                  vertical && (
                    <text x={midX} y={midY - 4} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                      {FLOW_LABEL[e.what_flows]}
                    </text>
                  )
                )}
              </g>
            );
          })}

          {directorRow && positions.get(directorRow.loop_key) && (
            <LoopNode row={directorRow} pos={positions.get(directorRow.loop_key)!} dim={dimmed.has(directorRow.loop_key)} />
          )}
          {metaloopRow && positions.get(metaloopRow.loop_key) && (
            <LoopNode row={metaloopRow} pos={positions.get(metaloopRow.loop_key)!} dim={dimmed.has(metaloopRow.loop_key)} />
          )}
          {tier3Rows.map(
            (r) =>
              positions.get(r.loop_key) && (
                <LoopNode key={r.loop_key} row={r} pos={positions.get(r.loop_key)!} dim={dimmed.has(r.loop_key)} />
              ),
          )}
          {[...conflictKeys].map((k) => {
            const p = positions.get(k);
            if (!p) return null;
            return (
              <rect
                key={`conflict-${k}`}
                x={p.cx - NODE_W / 2 - 3}
                y={p.cy - NODE_H / 2 - 3}
                width={NODE_W + 6}
                height={NODE_H + 6}
                rx={12}
                fill="none"
                className="stroke-red-500"
                strokeWidth={1.75}
                strokeDasharray="5,3"
              />
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/20 px-4 py-2.5 text-[12px] text-muted-foreground">
        <LegendDot colorCls="bg-emerald-500" label="measured outcomes" />
        <LegendDot colorCls="bg-violet-500" label="decisions" />
        <LegendDot colorCls="bg-sky-500" label="fuel" />
        <LegendDot colorCls="bg-amber-500" label="escalations" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-muted-foreground/60" />
          dashed = draft edge
        </span>
        <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-red-500" />
          ⚠ = measured-outcomes edge from a loop whose Measure gate isn&apos;t on — a dark seam
        </span>
        <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
          <span className="inline-block h-3 w-4 rounded border border-dashed border-red-500" />
          red dashed outline = in an open conflict
        </span>
      </div>

      {audits.length === 0 && (
        <p className="mt-3 text-[11.5px] text-muted-foreground/70">
          No loop_audits rows yet — the &quot;tested&quot; badges on the Tower chips will appear once a sim/walk/full
          audit is recorded against a loop_key.
        </p>
      )}
    </section>
  );
}
