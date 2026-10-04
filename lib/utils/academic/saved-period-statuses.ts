/**
 * Saved Present/Absent statuses of one period from a student_attendance row.
 *
 * Added: 2026-09-23 (BUG-005969 / BUG-004995 / BUG-004356 / BUG-006120) - the
 * mark page showed a marked period as all Present: the roster loader reset
 * every learner to 'Present' after the saved statuses were copied in, and the
 * copy merged the students of every slot saved that day. The page now applies
 * this per-period map once both the record and the roster have loaded.
 */

type Status = 'Present' | 'Absent'

interface SavedRecord {
  attendance_data?: Record<string, any> | null
}

const collect = (entries: any[]): Record<string, Status> => {
  const out: Record<string, Status> = {}
  for (const entry of entries) {
    if (!entry || !Array.isArray(entry.students)) continue
    for (const s of entry.students) {
      if (s?.student_id && s?.status) out[s.student_id] = s.status
    }
  }
  return out
}

/**
 * `periodId` is the slot key the page was opened with; entries are keyed by
 * slot_id but also carry `period_id`, so both are matched. With no period,
 * every entry is merged (the page's previous behaviour).
 */
export function savedStatusesForPeriod(
  record: SavedRecord | null | undefined,
  periodId: string | null | undefined
): Record<string, Status> {
  const data = record?.attendance_data
  if (!data || typeof data !== 'object') return {}
  if (!periodId) return collect(Object.values(data))
  if (data[periodId]) return collect([data[periodId]])
  return collect(Object.values(data).filter((e: any) => e?.period_id === periodId))
}
