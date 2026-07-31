import { describe, it, expect } from 'vitest';
import {
  ACADEMIC_YEAR_UNSPECIFIED,
  buildReportScope,
  buildReportPage,
  EXPORT_PAGE,
} from '@/lib/services/billing/reports/report-filter-params';

describe('buildReportScope', () => {
  it('maps an empty filter object to all-null params', () => {
    const s = buildReportScope({});
    expect(s).toEqual({
      p_institution_ids: null,
      p_academic_year_id: null,
      p_academic_year_unspecified: false,
      p_item_category_id: null,
      p_degree_id: null,
      p_department_id: null,
      p_program_id: null,
      p_semester_id: null,
      p_section_id: null,
      p_schemes: null,
      p_accommodation_codes: null,
      p_student_id: null,
      p_date_from: null,
      p_date_to: null,
    });
  });

  it('wraps a single institution id in an array (the RPC takes uuid[])', () => {
    expect(buildReportScope({ institution_id: 'inst-1' }).p_institution_ids).toEqual(['inst-1']);
  });

  it('translates the Unspecified sentinel into a boolean flag, not an id', () => {
    const s = buildReportScope({ academic_year_id: ACADEMIC_YEAR_UNSPECIFIED });
    expect(s.p_academic_year_id).toBeNull();
    expect(s.p_academic_year_unspecified).toBe(true);
  });

  it('passes a real academic year through as an id with the flag off', () => {
    const s = buildReportScope({ academic_year_id: 'ay-1' });
    expect(s.p_academic_year_id).toBe('ay-1');
    expect(s.p_academic_year_unspecified).toBe(false);
  });

  it('normalises an empty scheme array to null (means "no restriction")', () => {
    expect(buildReportScope({ schemes: [] }).p_schemes).toBeNull();
  });

  it('passes multiple selected schemes through unchanged', () => {
    expect(buildReportScope({ schemes: ['first_graduate', 'pmss'] }).p_schemes)
      .toEqual(['first_graduate', 'pmss']);
  });

  it('normalises an empty accommodation array to null (means "no restriction")', () => {
    expect(buildReportScope({ accommodation_codes: [] }).p_accommodation_codes).toBeNull();
  });

  it('passes multiple selected accommodation codes through unchanged', () => {
    expect(buildReportScope({ accommodation_codes: ['hostel', 'pg'] }).p_accommodation_codes)
      .toEqual(['hostel', 'pg']);
  });

  it('carries every hierarchy level', () => {
    const s = buildReportScope({
      degree_id: 'dg', department_id: 'dp', program_id: 'pg',
      semester_id: 'sm', section_id: 'sc', item_category_id: 'ct',
    });
    expect([s.p_degree_id, s.p_department_id, s.p_program_id, s.p_semester_id, s.p_section_id, s.p_item_category_id])
      .toEqual(['dg', 'dp', 'pg', 'sm', 'sc', 'ct']);
  });

  it('converts empty strings to null so a cleared select does not filter', () => {
    expect(buildReportScope({ degree_id: '', date_from: '' }).p_degree_id).toBeNull();
  });
});

describe('buildReportPage', () => {
  it('page 1 starts at offset 0', () => {
    expect(buildReportPage(1, 50)).toEqual({ p_limit: 50, p_offset: 0 });
  });

  it('page 3 of 50 starts at offset 100', () => {
    expect(buildReportPage(3, 50)).toEqual({ p_limit: 50, p_offset: 100 });
  });

  it('clamps a page below 1 to the first page', () => {
    expect(buildReportPage(0, 50)).toEqual({ p_limit: 50, p_offset: 0 });
  });

  it('EXPORT_PAGE requests all rows', () => {
    expect(EXPORT_PAGE).toEqual({ p_limit: null, p_offset: 0 });
  });
});
