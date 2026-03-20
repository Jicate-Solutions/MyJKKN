import { mock, describe, it, expect, beforeEach } from 'bun:test'

// ─── Mock Supabase BEFORE importing ──────────────────────────────────────────
const mockData = [
  {
    id: 'audit-1',
    attendance_id: 'att-1',
    period_id: 'period-slot-1',
    student_id: 'student-1',
    old_status: 'Absent',
    new_status: 'Present',
    edited_by: 'user-1',
    edited_by_name: 'Admin John',
    edited_by_role: 'super_admin',
    edited_at: '2026-03-20T10:42:00Z',
    institution_id: 'inst-1',
    attendance_date: '2026-03-20',
    student_name: 'Ravi Kumar',
    roll_number: '21CS001',
  },
]

const mockSelect = mock(() => ({
  eq: mock(() => ({
    order: mock(() => Promise.resolve({ data: mockData, error: null })),
  })),
}))
const mockFrom = mock(() => ({ select: mockSelect }))

await mock.module('@/lib/supabase/client', () => ({
  createClientSupabaseClient: mock(() => ({ from: mockFrom })),
}))

// ─── Import AFTER mocks ───────────────────────────────────────────────────────
const { AttendanceCoreService } = await import(
  '../../../lib/services/academic/attendance-core-service'
)

describe('AttendanceCoreService.getAttendanceAuditLog', () => {
  it('returns audit entries for a given attendance_id', async () => {
    const result = await AttendanceCoreService.getAttendanceAuditLog('att-1')
    expect(result).toHaveLength(1)
    expect(result[0].student_name).toBe('Ravi Kumar')
    expect(result[0].old_status).toBe('Absent')
    expect(result[0].new_status).toBe('Present')
  })

  it('returns empty array when supabase returns empty data', async () => {
    mockSelect.mockImplementationOnce(() => ({
      eq: mock(() => ({
        order: mock(() => Promise.resolve({ data: [], error: null })),
      })),
    }))
    const result = await AttendanceCoreService.getAttendanceAuditLog('att-no-edits')
    expect(result).toEqual([])
  })

  it('throws when supabase returns an error', async () => {
    mockSelect.mockImplementationOnce(() => ({
      eq: mock(() => ({
        order: mock(() =>
          Promise.resolve({ data: null, error: new Error('DB error') })
        ),
      })),
    }))
    await expect(
      AttendanceCoreService.getAttendanceAuditLog('att-bad')
    ).rejects.toThrow()
  })
})
