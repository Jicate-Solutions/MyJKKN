/**
 * Section names for My Classes cards.
 *
 * Added: 2026-09-23 (BUG-006200) - A year-level timetable keeps its sections in
 * `section_ids`, so the to-one `sections` join is null and the card showed no
 * section. Two cohorts of one year (e.g. BDS 4 Year: A-H and TROIZ A-H) then
 * rendered as identical cards. Fill the blank names from a batched lookup.
 */

interface PeriodSectionFields {
  section_ids?: string[] | null
  sections?: { id: string | null; name: string }[] | null
  section_name?: string | null
}

const idsOf = (p: PeriodSectionFields): string[] => {
  const ids = p.section_ids?.length ? p.section_ids : (p.sections ?? []).map((s) => s.id)
  return ids.filter(Boolean) as string[]
}

// Empty, or a subdivision label (" - Group A") built on an empty section name.
const needsName = (p: PeriodSectionFields) => !p.section_name || p.section_name.startsWith(' - ')

export function sectionIdsNeedingNames(periods: PeriodSectionFields[]): string[] {
  const ids = new Set<string>()
  for (const p of periods) {
    if (needsName(p)) idsOf(p).forEach((id) => ids.add(id))
  }
  return Array.from(ids)
}

export function fillPeriodSectionNames(
  periods: PeriodSectionFields[],
  nameById: Map<string, string>
): void {
  for (const p of periods) {
    for (const s of p.sections ?? []) {
      if (!s.name && s.id && nameById.has(s.id)) s.name = nameById.get(s.id)!
    }
    if (!needsName(p)) continue
    const names = idsOf(p)
      .map((id) => nameById.get(id))
      .filter(Boolean)
    if (names.length === 0) continue
    p.section_name = names.join(', ') + (p.section_name ?? '')
  }
}
