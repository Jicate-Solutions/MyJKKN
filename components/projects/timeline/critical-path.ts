/**
 * Critical-path engine (Decision F2.5)
 *
 * Pure functions — no React, no Supabase, no date-fns. Deterministic and unit-
 * testable. Walks `blocks` dependency edges over project tasks and computes the
 * longest duration chain via a forward + backward pass (classic CPM).
 *
 * Spec-vs-reality note: project_tasks has start_date/due_date (DATE columns),
 * NOT explicit "duration" or baseline columns. Duration is derived from
 * (due_date - start_date) in whole days, floored at 1 so a same-day task still
 * occupies the chain. Tasks missing either date contribute duration 0 and are
 * still walkable as edges (so a dateless task doesn't break the graph).
 *
 * Critical-path edges are `blocks` only — `relates_to` edges are informational
 * and are ignored here, matching the migration comment on
 * project_task_dependencies (F2.5).
 */

import type { ProjectTask, ProjectTaskDependency } from '@/types/projects';

/** One day in ms, for whole-day duration math. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD (or ISO) date string to a UTC-midnight epoch, or null. */
function toEpoch(date: string | null | undefined): number | null {
  if (!date) return null;
  // Take the date portion only so timezones never shift the day.
  const datePart = date.slice(0, 10);
  const ms = Date.parse(`${datePart}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whole-day inclusive duration of a task. A task running start..due where
 * start === due is 1 day. Missing either date → 0 (so it's a pass-through node).
 */
export function taskDurationDays(task: Pick<ProjectTask, 'start_date' | 'due_date'>): number {
  const start = toEpoch(task.start_date);
  const due = toEpoch(task.due_date);
  if (start === null || due === null) return 0;
  const span = Math.round((due - start) / MS_PER_DAY) + 1;
  return span > 0 ? span : 1;
}

interface CpmNode {
  id: string;
  duration: number;
  /** earliest finish (forward pass) */
  ef: number;
  /** latest finish (backward pass) */
  lf: number;
  /** predecessors: tasks this one depends on (must finish first) */
  preds: string[];
  /** successors: tasks that depend on this one */
  succs: string[];
}

export interface CriticalPathResult {
  /** Task ids on the critical path (zero total float). */
  criticalTaskIds: Set<string>;
  /**
   * Total float per task in days (ef-vs-lf slack). 0 ⇒ on the critical path.
   * Tasks not in the dependency graph are absent from the map.
   */
  floatByTask: Map<string, number>;
  /** Length of the longest chain in days. */
  criticalLengthDays: number;
}

/**
 * Compute the critical path over `blocks` edges.
 *
 * The dependency row `{ task_id, depends_on_task_id }` means task_id depends on
 * (is blocked by) depends_on_task_id — so depends_on_task_id is the predecessor.
 */
export function computeCriticalPath(
  tasks: Pick<ProjectTask, 'id' | 'start_date' | 'due_date'>[],
  dependencies: Pick<ProjectTaskDependency, 'task_id' | 'depends_on_task_id' | 'dependency_type'>[]
): CriticalPathResult {
  const empty: CriticalPathResult = {
    criticalTaskIds: new Set(),
    floatByTask: new Map(),
    criticalLengthDays: 0,
  };
  if (tasks.length === 0) return empty;

  const nodes = new Map<string, CpmNode>();
  for (const t of tasks) {
    nodes.set(t.id, {
      id: t.id,
      duration: taskDurationDays(t),
      ef: 0,
      lf: 0,
      preds: [],
      succs: [],
    });
  }

  // Only `blocks` edges drive the schedule. Skip edges that reference unknown
  // (e.g. cross-project or deleted) tasks so the graph stays well-formed.
  for (const dep of dependencies) {
    if (dep.dependency_type !== 'blocks') continue;
    const dependent = nodes.get(dep.task_id);
    const predecessor = nodes.get(dep.depends_on_task_id);
    if (!dependent || !predecessor) continue;
    dependent.preds.push(predecessor.id);
    predecessor.succs.push(dependent.id);
  }

  // Topological order via Kahn's algorithm (in-degree on preds). If a cycle
  // exists (data-integrity bug despite the self-dep CHECK), we bail to the
  // partial order we have — no infinite loop.
  const order = topoSort(nodes);

  // Forward pass: earliest finish = max(predecessor EF) + own duration.
  for (const id of order) {
    const n = nodes.get(id)!;
    let earliestStart = 0;
    for (const p of n.preds) {
      earliestStart = Math.max(earliestStart, nodes.get(p)!.ef);
    }
    n.ef = earliestStart + n.duration;
  }

  const projectEnd = Math.max(0, ...order.map((id) => nodes.get(id)!.ef));

  // Backward pass: latest finish = min(successor LF - successor duration),
  // seeded with projectEnd for terminal nodes.
  for (let i = order.length - 1; i >= 0; i--) {
    const n = nodes.get(order[i])!;
    if (n.succs.length === 0) {
      n.lf = projectEnd;
    } else {
      let latestFinish = Infinity;
      for (const s of n.succs) {
        const sn = nodes.get(s)!;
        latestFinish = Math.min(latestFinish, sn.lf - sn.duration);
      }
      n.lf = latestFinish;
    }
  }

  const floatByTask = new Map<string, number>();
  const criticalTaskIds = new Set<string>();
  for (const n of nodes.values()) {
    const float = n.lf - n.ef;
    floatByTask.set(n.id, float);
    // Float ~0 and the task participates in the graph (has an edge), and the
    // project actually has a non-zero longest chain.
    if (Math.abs(float) < 1e-9 && projectEnd > 0 && (n.preds.length > 0 || n.succs.length > 0)) {
      criticalTaskIds.add(n.id);
    }
  }

  return { criticalTaskIds, floatByTask, criticalLengthDays: projectEnd };
}

/** Kahn topological sort; returns best-effort order even with cycles. */
function topoSort(nodes: Map<string, CpmNode>): string[] {
  const inDegree = new Map<string, number>();
  for (const n of nodes.values()) inDegree.set(n.id, n.preds.length);

  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of nodes.get(id)!.succs) {
      const next = (inDegree.get(s) ?? 0) - 1;
      inDegree.set(s, next);
      if (next === 0) queue.push(s);
    }
  }

  // Cycle fallback: append any nodes the queue never reached so callers still
  // get every task (their CPM values stay at the seeded 0, which is safe).
  if (order.length < nodes.size) {
    for (const id of nodes.keys()) if (!order.includes(id)) order.push(id);
  }
  return order;
}
