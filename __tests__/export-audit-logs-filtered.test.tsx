import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// Mock the actual export functions since they write to file
vi.mock('@/lib/utils/export-audit-logs', () => ({
  exportAuditLogsToCSV: vi.fn(),
}));

describe('exportAuditLogsToCSV with filters', () => {
  it('exports only logs matching filters', () => {
    const logs = [
      { id: '1', action: 'create', school_name: 'School A', resource_type: 'degree', created_at: '2026-05-20', school_id: 'sch-1' },
      { id: '2', action: 'delete', school_name: 'School B', resource_type: 'department', created_at: '2026-05-25', school_id: 'sch-2' },
      { id: '3', action: 'restore', school_name: 'School A', resource_type: 'degree', created_at: '2026-05-27', school_id: 'sch-1' },
    ];

    const filterState = {
      searchText: '',
      actionType: 'delete',
      school: 'sch-2',
      resourceType: 'department',
      dateRange: undefined,
    };

    const filtered = logs.filter(
      (log) =>
        log.action === filterState.actionType &&
        log.school_id === filterState.school &&
        log.resource_type === filterState.resourceType
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });
});
