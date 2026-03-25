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

describe('computeAttendanceDiff (exported helper)', () => {
  it('detects changed statuses between old and new student arrays', async () => {
    const { computeAttendanceDiff } = await import(
      '../../../lib/services/academic/attendance-core-service'
    )

    const oldStudents = [
      { student_id: 's1', status: 'Absent', section_id: 'sec1', marked_at: '' },
      { student_id: 's2', status: 'Present', section_id: 'sec1', marked_at: '' },
      { student_id: 's3', status: 'OnDuty', section_id: 'sec1', marked_at: '' },
    ]
    const newStudents = [
      { student_id: 's1', status: 'Present', section_id: 'sec1', marked_at: '' }, // changed
      { student_id: 's2', status: 'Present', section_id: 'sec1', marked_at: '' }, // unchanged
      { student_id: 's3', status: 'Absent', section_id: 'sec1', marked_at: '' },  // OnDuty → skip
    ]

    const diff = computeAttendanceDiff(oldStudents, newStudents)

    expect(diff).toHaveLength(1)
    expect(diff[0]).toEqual({
      student_id: 's1',
      old_status: 'Absent',
      new_status: 'Present',
    })
  })

  it('returns empty array when nothing changed', async () => {
    const { computeAttendanceDiff } = await import(
      '../../../lib/services/academic/attendance-core-service'
    )
    const students = [
      { student_id: 's1', status: 'Present', section_id: 'sec1', marked_at: '' },
    ]
    const diff = computeAttendanceDiff(students, students)
    expect(diff).toEqual([])
  })

  it('skips students whose new status is OnDuty (Absent → OnDuty)', async () => {
    const { computeAttendanceDiff } = await import(
      '../../../lib/services/academic/attendance-core-service'
    )
    const oldStudents = [
      { student_id: 's1', status: 'Absent', section_id: 'sec1', marked_at: '' },
      { student_id: 's2', status: 'Present', section_id: 'sec1', marked_at: '' },
    ]
    const newStudents = [
      { student_id: 's1', status: 'OnDuty', section_id: 'sec1', marked_at: '' }, // Absent → OnDuty: skip
      { student_id: 's2', status: 'Absent', section_id: 'sec1', marked_at: '' }, // Present → Absent: include
    ]
    const diff = computeAttendanceDiff(oldStudents, newStudents)
    expect(diff).toHaveLength(1)
    expect(diff[0].student_id).toBe('s2')
    expect(diff[0].old_status).toBe('Present')
    expect(diff[0].new_status).toBe('Absent')
  })
})
