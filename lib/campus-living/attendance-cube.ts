/**
 * Hostel attendance cube — pure aggregation, no database, no React.
 *
 * fn_cl_attendance_breakdown returns one small cube (date × block × institution ×
 * department). Every table, chart, heatmap, ranking and CSV on
 * /campus-living/attendance is a function over it, so a cross-filter click
 * re-aggregates instantly and the whole thing is unit-testable.
 *
 * Presence rules match fn_cl_attendance_is_present / counts_in_pct:
 *   present = present + late_entry;  denominator = present + late_entry + absent;
 *   on_leave and medical leave the denominator (an approved absence is not absence).
 */
import type {
  AttendanceBreakdown,
  AttendanceCubeRow,
} from '@/types/campus-living/attendance-analytics';

export type Dimension = 'institution' | 'department' | 'block' | 'date';

export interface CubeFilter {
  institutionId?: string | null;
  departmentId?: string | null;
  blockId?: string | null;
}

export interface Counts {
  marks: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  medical: number;
  /** present + late — what the rate counts as "there". */
  attended: number;
  denom: number;
  /** null when nothing counted (no division by zero, never a fake 0%). */
  pct: number | null;
}

export interface GroupRow extends Counts {
  key: string;
  label: string;
  /** Institution name for a department row, else null. */
  parentLabel: string | null;
  /** null when the caller cannot read allocations (residents_visible = false). */
  residents: number | null;
  marked: number | null;
  notMarked: number | null;
  learners: number;
  atRisk: number;
}

export const UNKNOWN = '__unknown__';

const round1 = (n: number) => Math.round(n * 10) / 10;

export function emptyCounts(): Counts {
  return { marks: 0, present: 0, late: 0, absent: 0, onLeave: 0, medical: 0, attended: 0, denom: 0, pct: null };
}

function addRow(c: Counts, r: AttendanceCubeRow): void {
  c.marks += r.m;
  c.present += r.pr;
  c.late += r.la;
  c.absent += r.ab;
  c.onLeave += r.ol;
  c.medical += r.me;
}

export function finalize(c: Counts): Counts {
  c.attended = c.present + c.late;
  c.denom = c.attended + c.absent;
  c.pct = c.denom > 0 ? round1((100 * c.attended) / c.denom) : null;
  return c;
}

type Dimmed = { b: string | null; i: string | null; p: string | null };

function matches(x: Dimmed, f: CubeFilter): boolean {
  if (f.institutionId && x.i !== f.institutionId) return false;
  if (f.departmentId && x.p !== f.departmentId) return false;
  if (f.blockId && x.b !== f.blockId) return false;
  return true;
}

export function filterCube(rows: AttendanceCubeRow[], f: CubeFilter): AttendanceCubeRow[] {
  return rows.filter((r) => matches(r, f));
}

function dimKey(dim: Exclude<Dimension, 'date'>, r: Dimmed): string {
  switch (dim) {
    case 'institution': return r.i ?? UNKNOWN;
    case 'department': return r.p ?? UNKNOWN;
    case 'block': return r.b ?? UNKNOWN;
  }
}

function labeller(data: AttendanceBreakdown) {
  const inst = new Map(data.institutions.map((x) => [x.id, x.name]));
  const dept = new Map(data.departments.map((x) => [x.id, x]));
  const block = new Map(data.blocks.map((x) => [x.id, x]));
  return {
    institution: (k: string) => inst.get(k) ?? 'Unknown institution',
    department: (k: string) => dept.get(k)?.name ?? 'Unknown department',
    departmentParent: (k: string) => {
      const i = dept.get(k)?.institution_id;
      return i ? inst.get(i) ?? null : null;
    },
    block: (k: string) => block.get(k)?.name ?? 'Unknown block',
  };
}

/**
 * Group the (filtered) cube by one dimension. Residents / marked / at-risk are
 * joined on the same key from the residents and risk cells, under the same
 * filter. A date group has no resident count.
 */
export function groupBy(data: AttendanceBreakdown, dim: Dimension, f: CubeFilter = {}): GroupRow[] {
  const L = labeller(data);
  const groups = new Map<string, GroupRow>();
  const get = (key: string): GroupRow => {
    let g = groups.get(key);
    if (!g) {
      const tracked = data.residents_visible && dim !== 'date';
      g = {
        ...emptyCounts(),
        key,
        label: dim === 'date' ? key : key === UNKNOWN ? `Unknown ${dim}` : L[dim](key),
        parentLabel: dim === 'department' && key !== UNKNOWN ? L.departmentParent(key) : null,
        residents: tracked ? 0 : null,
        marked: tracked ? 0 : null,
        notMarked: null,
        learners: 0,
        atRisk: 0,
      };
      groups.set(key, g);
    }
    return g;
  };

  for (const r of data.cube) {
    if (!matches(r, f)) continue;
    addRow(get(dim === 'date' ? r.d : dimKey(dim, r)), r);
  }
  if (dim !== 'date') {
    for (const r of data.residents) {
      if (!matches(r, f) || !data.residents_visible) continue;
      const g = get(dimKey(dim, r));
      g.residents = (g.residents ?? 0) + r.residents;
      g.marked = (g.marked ?? 0) + r.marked;
    }
    for (const r of data.risk) {
      if (!matches(r, f)) continue;
      const g = get(dimKey(dim, r));
      g.learners += r.learners;
      g.atRisk += r.at_risk;
    }
  }

  const rows = [...groups.values()].map((g) => {
    finalize(g);
    g.notMarked = g.residents === null || g.marked === null ? null : Math.max(0, g.residents - g.marked);
    return g;
  });
  return dim === 'date'
    ? rows.sort((a, b) => a.key.localeCompare(b.key))
    : rows.sort((a, b) => a.label.localeCompare(b.label));
}

/** The single "overall" row for the current filter. */
export function totals(data: AttendanceBreakdown, f: CubeFilter = {}): GroupRow {
  const t: GroupRow = {
    ...emptyCounts(),
    key: 'all',
    label: 'Overall',
    parentLabel: null,
    residents: data.residents_visible ? 0 : null,
    marked: data.residents_visible ? 0 : null,
    notMarked: null,
    learners: 0,
    atRisk: 0,
  };
  for (const r of data.cube) if (matches(r, f)) addRow(t, r);
  if (data.residents_visible) {
    for (const r of data.residents) {
      if (!matches(r, f)) continue;
      t.residents = (t.residents ?? 0) + r.residents;
      t.marked = (t.marked ?? 0) + r.marked;
    }
  }
  for (const r of data.risk) {
    if (!matches(r, f)) continue;
    t.learners += r.learners;
    t.atRisk += r.at_risk;
  }
  finalize(t);
  t.notMarked = t.residents === null || t.marked === null ? null : Math.max(0, t.residents - t.marked);
  return t;
}

/** Best / worst by rate. Rows with fewer than `minDenom` counted marks are not ranked (3 marks is noise). */
export function rank(rows: GroupRow[], n = 5, minDenom = 10): { best: GroupRow[]; worst: GroupRow[] } {
  const ranked = rows.filter((r) => r.pct !== null && r.denom >= minDenom);
  const byBest = [...ranked].sort(
    (a, b) => (b.pct as number) - (a.pct as number) || b.denom - a.denom || a.label.localeCompare(b.label),
  );
  const byWorst = [...ranked].sort(
    (a, b) => (a.pct as number) - (b.pct as number) || b.denom - a.denom || a.label.localeCompare(b.label),
  );
  return { best: byBest.slice(0, n), worst: byWorst.slice(0, n) };
}

export function statusMix(c: Counts): { key: string; label: string; value: number }[] {
  return [
    { key: 'present', label: 'Present', value: c.present },
    { key: 'late', label: 'Late entry', value: c.late },
    { key: 'absent', label: 'Absent', value: c.absent },
    { key: 'onLeave', label: 'On leave', value: c.onLeave },
    { key: 'medical', label: 'Medical', value: c.medical },
  ].filter((s) => s.value > 0);
}

// ── Trend & heatmap ───────────────────────────────────────────────────

/** Monday of the week containing an ISO date, in UTC (no local-time drift). */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

export function bucketFor(from: string, to: string): 'day' | 'week' {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return days > 31 ? 'week' : 'day';
}

export interface TrendData {
  buckets: string[];
  series: { key: string; label: string }[];
  /** points[i][seriesKey] = pct for that bucket, null when nothing counted. */
  points: Array<Record<string, number | string | null>>;
}

/** Rate per bucket for each institution (or department), under the filter. */
export function trendBy(
  data: AttendanceBreakdown,
  dim: 'institution' | 'department',
  f: CubeFilter = {},
): TrendData {
  const L = labeller(data);
  const bucket = bucketFor(data.range.from, data.range.to);
  const acc = new Map<string, Map<string, Counts>>();
  const seriesLabel = new Map<string, string>();
  const buckets = new Set<string>();

  for (const r of data.cube) {
    if (!matches(r, f)) continue;
    const b = bucket === 'week' ? weekStart(r.d) : r.d;
    const k = dimKey(dim, r);
    buckets.add(b);
    if (!seriesLabel.has(k)) seriesLabel.set(k, k === UNKNOWN ? `Unknown ${dim}` : L[dim](k));
    let byBucket = acc.get(k);
    if (!byBucket) acc.set(k, (byBucket = new Map()));
    let c = byBucket.get(b);
    if (!c) byBucket.set(b, (c = emptyCounts()));
    addRow(c, r);
  }

  const sorted = [...buckets].sort();
  const series = [...seriesLabel.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const points = sorted.map((b) => {
    const p: Record<string, number | string | null> = { bucket: b };
    for (const s of series) {
      const c = acc.get(s.key)?.get(b);
      p[s.key] = c ? finalize(c).pct : null;
    }
    return p;
  });
  return { buckets: sorted, series, points };
}

export interface HeatmapData {
  bucket: 'day' | 'week';
  columns: string[];
  rows: { key: string; label: string }[];
  /** cells[rowKey][column] */
  cells: Record<string, Record<string, { pct: number | null; denom: number }>>;
}

export function heatmap(
  data: AttendanceBreakdown,
  dim: 'institution' | 'department',
  f: CubeFilter = {},
): HeatmapData {
  const trend = trendBy(data, dim, f);
  const bucket = bucketFor(data.range.from, data.range.to);
  // Denominators per cell, so the tooltip can say how much evidence a colour has.
  const denoms: Record<string, Record<string, number>> = {};
  for (const r of data.cube) {
    if (!matches(r, f)) continue;
    const b = bucket === 'week' ? weekStart(r.d) : r.d;
    const k = dimKey(dim, r);
    denoms[k] ??= {};
    denoms[k][b] = (denoms[k][b] ?? 0) + r.pr + r.la + r.ab;
  }
  const cells: HeatmapData['cells'] = {};
  for (const s of trend.series) {
    cells[s.key] = {};
    for (const p of trend.points) {
      const b = p.bucket as string;
      cells[s.key][b] = { pct: p[s.key] as number | null, denom: denoms[s.key]?.[b] ?? 0 };
    }
  }
  return { bucket, columns: trend.buckets, rows: trend.series, cells };
}

// ── Drill-down tree ───────────────────────────────────────────────────

export interface TreeNode {
  id: string;
  name: string;
  level: 'institution' | 'department' | 'block';
  /** "Institution › Department" — parents' names, so a leaf can name its own path (a parent's label would be painted over by its children). */
  trail: string;
  pct: number | null;
  size: number;
  /** Filter to apply when the node is clicked. */
  filter: CubeFilter;
  children?: TreeNode[];
}

/** Institution → department → block, sized by counted marks, coloured by rate. */
export function treeFor(data: AttendanceBreakdown, f: CubeFilter = {}): TreeNode[] {
  const L = labeller(data);
  const orNull = (k: string) => (k === UNKNOWN ? null : k);
  const tree = new Map<string, Map<string, Map<string, Counts>>>();
  for (const r of data.cube) {
    if (!matches(r, f)) continue;
    const i = r.i ?? UNKNOWN;
    const p = r.p ?? UNKNOWN;
    const b = r.b ?? UNKNOWN;
    let d1 = tree.get(i);
    if (!d1) tree.set(i, (d1 = new Map()));
    let d2 = d1.get(p);
    if (!d2) d1.set(p, (d2 = new Map()));
    let c = d2.get(b);
    if (!c) d2.set(b, (c = emptyCounts()));
    addRow(c, r);
  }

  const sum = (cs: Counts[]): Counts => {
    const t = emptyCounts();
    for (const c of cs) {
      t.marks += c.marks;
      t.present += c.present;
      t.late += c.late;
      t.absent += c.absent;
      t.onLeave += c.onLeave;
      t.medical += c.medical;
    }
    return finalize(t);
  };

  const out: TreeNode[] = [];
  for (const [i, depts] of tree) {
    const deptNodes: TreeNode[] = [];
    const instCounts: Counts[] = [];
    for (const [p, blocks] of depts) {
      const blockNodes: TreeNode[] = [];
      const deptCounts: Counts[] = [];
      for (const [b, c] of blocks) {
        finalize(c);
        deptCounts.push(c);
        if (c.denom === 0) continue;
        blockNodes.push({
          id: `${i}|${p}|${b}`,
          name: b === UNKNOWN ? 'Unknown block' : L.block(b),
          level: 'block',
          trail: `${i === UNKNOWN ? 'Unknown institution' : L.institution(i)} › ${p === UNKNOWN ? 'Unknown department' : L.department(p)}`,
          pct: c.pct,
          size: c.denom,
          filter: { institutionId: orNull(i), departmentId: orNull(p), blockId: orNull(b) },
        });
      }
      const dc = sum(deptCounts);
      instCounts.push(dc);
      if (dc.denom === 0) continue;
      deptNodes.push({
        id: `${i}|${p}`,
        name: p === UNKNOWN ? 'Unknown department' : L.department(p),
        level: 'department',
        trail: i === UNKNOWN ? 'Unknown institution' : L.institution(i),
        pct: dc.pct,
        size: dc.denom,
        filter: { institutionId: orNull(i), departmentId: orNull(p) },
        children: blockNodes,
      });
    }
    const ic = sum(instCounts);
    if (ic.denom === 0) continue;
    out.push({
      id: i,
      name: i === UNKNOWN ? 'Unknown institution' : L.institution(i),
      level: 'institution',
      trail: '',
      pct: ic.pct,
      size: ic.denom,
      filter: { institutionId: orNull(i) },
      children: deptNodes.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Cross-filter ──────────────────────────────────────────────────────

/**
 * Click on a bar / row / cell: set that dimension, or clear it if it is already
 * the active value. Picking a department implies its institution; picking an
 * institution drops a department that belongs to a different one.
 */
export function toggleFilter(
  prev: CubeFilter,
  dim: Exclude<Dimension, 'date'>,
  key: string,
  data: AttendanceBreakdown,
): CubeFilter {
  if (key === UNKNOWN) return prev;
  if (dim === 'institution') {
    if (prev.institutionId === key) return { ...prev, institutionId: null, departmentId: null };
    const deptOk = prev.departmentId
      ? data.departments.find((d) => d.id === prev.departmentId)?.institution_id === key
      : true;
    return { ...prev, institutionId: key, departmentId: deptOk ? prev.departmentId : null };
  }
  if (dim === 'department') {
    if (prev.departmentId === key) return { ...prev, departmentId: null };
    const inst = data.departments.find((d) => d.id === key)?.institution_id ?? prev.institutionId ?? null;
    return { ...prev, departmentId: key, institutionId: inst };
  }
  return { ...prev, blockId: prev.blockId === key ? null : key };
}

export const hasFilter = (f: CubeFilter): boolean => !!(f.institutionId || f.departmentId || f.blockId);

// ── CSV ───────────────────────────────────────────────────────────────

/** RFC 4180 field, with a leading quote against spreadsheet formula injection. */
export function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [headers, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n');
}

export function groupRowsToCsv(rows: GroupRow[], dim: Dimension, withTotal?: GroupRow): string {
  const first =
    dim === 'date' ? 'Date' : dim === 'institution' ? 'Institution' : dim === 'department' ? 'Department' : 'Block';
  const headers = [
    first,
    ...(dim === 'department' ? ['Institution'] : []),
    'Residents', 'Marked', 'Not marked', 'Marks', 'Present', 'Late entry', 'Absent', 'On leave', 'Medical',
    'Attendance %', 'At-risk learners',
  ];
  const line = (r: GroupRow) => [
    r.label,
    ...(dim === 'department' ? [r.parentLabel ?? ''] : []),
    r.residents, r.marked, r.notMarked, r.marks, r.present, r.late, r.absent, r.onLeave, r.medical,
    r.pct, dim === 'date' ? null : r.atRisk,
  ];
  return toCsv(headers, [...rows.map(line), ...(withTotal ? [line(withTotal)] : [])]);
}

// ── Scope helpers ─────────────────────────────────────────────────────

/** Today in IST as yyyy-MM-dd — a UTC midnight must not roll the dashboard back a day. */
export function istToday(now: number = Date.now()): string {
  return new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export type Period = 'day' | '7d' | '30d' | '90d' | 'custom';

/** Range for a period preset. `day` and `custom` use the supplied values. */
export function periodRange(
  period: Period,
  today: string,
  day: string,
  custom: { from: string; to: string },
): { from: string; to: string } {
  switch (period) {
    case 'day': return { from: day, to: day };
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case '90d': return { from: addDays(today, -89), to: today };
    case 'custom': return custom.to < custom.from ? { from: custom.to, to: custom.from } : custom;
  }
}
