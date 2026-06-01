import { describe, it, expect } from 'vitest';
import {
  computeCriticalPath,
  taskDurationDays,
} from '@/components/projects/timeline/critical-path';
import type { ProjectTask, ProjectTaskDependency } from '@/types/projects';

/** Minimal task factory — only the fields the CPM engine reads. */
function task(id: string, start: string | null, due: string | null): ProjectTask {
  return {
    id,
    project_id: 'p1',
    phase_id: null,
    milestone_id: null,
    title: id,
    description: null,
    task_type: 'task',
    status_key: 'todo',
    priority_id: null,
    owner_staff_id: null,
    start_date: start,
    due_date: due,
    completed_at: null,
    estimated_hours: null,
    actual_hours: null,
    story_points: null,
    sprint_id: null,
    order_index: 0,
    is_blocked: false,
    is_overdue: false,
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: null,
  };
}

function blocks(taskId: string, dependsOn: string): ProjectTaskDependency {
  return {
    id: `${dependsOn}->${taskId}`,
    task_id: taskId,
    depends_on_task_id: dependsOn,
    dependency_type: 'blocks',
    created_at: '2026-01-01T00:00:00Z',
    created_by: null,
  };
}

describe('taskDurationDays', () => {
  it('counts inclusive whole days', () => {
    expect(taskDurationDays({ start_date: '2026-01-01', due_date: '2026-01-01' })).toBe(1);
    expect(taskDurationDays({ start_date: '2026-01-01', due_date: '2026-01-05' })).toBe(5);
  });

  it('returns 0 when either date is missing', () => {
    expect(taskDurationDays({ start_date: null, due_date: '2026-01-05' })).toBe(0);
    expect(taskDurationDays({ start_date: '2026-01-01', due_date: null })).toBe(0);
  });
});

describe('computeCriticalPath', () => {
  it('returns empty result for no tasks', () => {
    const r = computeCriticalPath([], []);
    expect(r.criticalTaskIds.size).toBe(0);
    expect(r.criticalLengthDays).toBe(0);
  });

  it('picks the longer of two parallel chains as critical', () => {
    // A (5d) -> C (2d)  and  B (1d) -> C. Longest chain = A->C = 7 days.
    const tasks = [
      task('A', '2026-01-01', '2026-01-05'), // 5d
      task('B', '2026-01-01', '2026-01-01'), // 1d
      task('C', '2026-01-10', '2026-01-11'), // 2d
    ];
    const deps = [blocks('C', 'A'), blocks('C', 'B')];
    const r = computeCriticalPath(tasks, deps);

    expect(r.criticalLengthDays).toBe(7); // 5 + 2
    expect(r.criticalTaskIds.has('A')).toBe(true);
    expect(r.criticalTaskIds.has('C')).toBe(true);
    // B has slack (4 days of float) → not critical.
    expect(r.criticalTaskIds.has('B')).toBe(false);
    expect(r.floatByTask.get('B')).toBe(4);
    expect(r.floatByTask.get('A')).toBe(0);
  });

  it('ignores relates_to edges (only blocks drives the schedule)', () => {
    const tasks = [
      task('A', '2026-01-01', '2026-01-03'),
      task('B', '2026-01-01', '2026-01-10'),
    ];
    const relatesOnly: ProjectTaskDependency = {
      id: 'rel',
      task_id: 'B',
      depends_on_task_id: 'A',
      dependency_type: 'relates_to',
      created_at: '2026-01-01T00:00:00Z',
      created_by: null,
    };
    const r = computeCriticalPath(tasks, [relatesOnly]);
    // No blocks edge → no critical path participants.
    expect(r.criticalTaskIds.size).toBe(0);
  });

  it('survives a dependency cycle without hanging', () => {
    const tasks = [
      task('A', '2026-01-01', '2026-01-02'),
      task('B', '2026-01-03', '2026-01-04'),
    ];
    // A blocks B and B blocks A — a cycle (shouldn't happen, but be safe).
    const deps = [blocks('B', 'A'), blocks('A', 'B')];
    const r = computeCriticalPath(tasks, deps);
    expect(r.floatByTask.size).toBe(2); // returns, doesn't loop
  });

  it('handles a dependent task that has no dates (duration 0 pass-through)', () => {
    const tasks = [
      task('A', '2026-01-01', '2026-01-05'), // 5d
      task('B', null, null), // dateless successor
    ];
    const r = computeCriticalPath(tasks, [blocks('B', 'A')]);
    expect(r.criticalLengthDays).toBe(5);
    expect(r.criticalTaskIds.has('A')).toBe(true);
  });
});
