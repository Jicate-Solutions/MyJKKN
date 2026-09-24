/**
 * BUG-006200 (2026-09-23, DR. VIJAYTHIYAGARAJAN J, HOD, Dental): "SECTIONS NOT
 * SHOWING IF THE SAME YEAR CONTAINS TWO TIMETABLES". BDS 4 Year has two
 * cohorts - DRAV (sections A-H) and TROIZ (TROIZ A-H) - each on its own
 * year-level timetable. My Classes showed two identical "4222 Oral Surgery
 * Theory / DCH 4 Year P2 / 4 Year" cards with no section chip, because
 * section_name came only from the timetable's to-one `sections` join, which is
 * null when the timetable lists its sections in section_ids.
 */
import { describe, it, expect } from 'vitest';
import { fillPeriodSectionNames } from '@/lib/utils/academic/fill-period-section-names';

const names = new Map([
  ['drav-a', 'A'],
  ['drav-b', 'B'],
  ['troiz-a', 'TROIZ A'],
  ['troiz-b', 'TROIZ B']
]);

const card = (sectionIds: string[], extra: Record<string, any> = {}) => ({
  section_ids: sectionIds,
  sections: [{ id: sectionIds[0], name: '' }],
  section_name: '',
  ...extra
});

describe('fillPeriodSectionNames', () => {
  it('names the sections of a year-level timetable so the two cohorts differ', () => {
    const drav = card(['drav-a', 'drav-b']);
    const troiz = card(['troiz-a', 'troiz-b']);
    fillPeriodSectionNames([drav, troiz], names);
    expect(drav.section_name).toBe('A, B');
    expect(troiz.section_name).toBe('TROIZ A, TROIZ B');
    expect(troiz.sections).toEqual([{ id: 'troiz-a', name: 'TROIZ A' }]);
  });

  it('keeps a name the timetable join already supplied', () => {
    const p = card(['drav-a'], { section_name: 'A', sections: [{ id: 'drav-a', name: 'A' }] });
    fillPeriodSectionNames([p], new Map([['drav-a', 'Renamed']]));
    expect(p.section_name).toBe('A');
    expect(p.sections[0].name).toBe('A');
  });

  it('prefixes a subdivision group whose timetable section name was blank', () => {
    const p = card(['troiz-a'], { section_name: ' - Group A' });
    fillPeriodSectionNames([p], names);
    expect(p.section_name).toBe('TROIZ A - Group A');
  });

  it('falls back to the sections array when section_ids is empty', () => {
    const p = { section_ids: [], sections: [{ id: 'drav-b', name: '' }], section_name: '' };
    fillPeriodSectionNames([p], names);
    expect(p.section_name).toBe('B');
  });

  it('leaves the card blank when no id resolves', () => {
    const p = card(['unknown']);
    fillPeriodSectionNames([p], names);
    expect(p.section_name).toBe('');
  });

  it('collects the ids that still need a lookup', async () => {
    const { sectionIdsNeedingNames } = await import('@/lib/utils/academic/fill-period-section-names');
    const ids = sectionIdsNeedingNames([
      card(['drav-a', 'drav-b']),
      card(['troiz-a'], { section_name: 'TROIZ A', sections: [{ id: 'troiz-a', name: 'TROIZ A' }] })
    ]);
    expect(ids.sort()).toEqual(['drav-a', 'drav-b']);
  });
});
