import { describe, it, expect } from 'vitest';
import {
  parseSyllabusLookupQuery,
  keyMayRead,
  syllabusEtag,
  syllabusPdfFilename,
  toSyllabusApiMeta,
} from '@/lib/services/bos/syllabus-lookup';
import { supportedFormats, buildSyllabusHtml } from '@/lib/utils/bos/syllabus-pdf-html';
import type { BosCourseSyllabus } from '@/types/bos';

const COURSE_ID = '11111111-2222-4333-8444-555555555555';
const INST_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const base: BosCourseSyllabus = {
  id: '99999999-8888-4777-8666-555555555555',
  institutions_id: INST_ID,
  board_id: 'board',
  course_id: COURSE_ID,
  course_code: '24UCADSE12',
  course_name: 'Data Structures',
  version_number: 2,
  is_latest: true,
  is_archived: false,
  created_by: 'u',
  created_at: '2026-01-01T00:00:00Z',
  last_modified_at: '2026-08-30T10:11:12Z',
  academic_model: 'anna_univ',
};

const q = (s: string) => parseSyllabusLookupQuery(new URLSearchParams(s));

describe('parseSyllabusLookupQuery', () => {
  it('accepts course_id alone', () => {
    const r = q(`course_id=${COURSE_ID}`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.courseId).toBe(COURSE_ID);
  });

  it('rejects course_code without institution_id (code is not unique across CAS siblings / regulations)', () => {
    const r = q('course_code=24UCADSE12');
    expect(r.ok).toBe(false);
    if ('message' in r) expect(r.message).toMatch(/institution_id/);
  });

  it('accepts course_code with institution_id', () => {
    const r = q(`course_code=24ucadse12&institution_id=${INST_ID}`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.institutionId).toBe(INST_ID);
  });

  it('rejects when neither key is given', () => {
    expect(q('').ok).toBe(false);
  });

  it('rejects non-uuid ids and bad versions', () => {
    expect(q('course_id=abc').ok).toBe(false);
    expect(q(`course_id=${COURSE_ID}&regulation_id=r-2026`).ok).toBe(false);
    expect(q(`course_id=${COURSE_ID}&version=0`).ok).toBe(false);
    expect(q(`course_id=${COURSE_ID}&version=x`).ok).toBe(false);
  });

  it('parses version and include_archived', () => {
    const r = q(`course_id=${COURSE_ID}&version=3&include_archived=true`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query.version).toBe(3);
      expect(r.query.includeArchived).toBe(true);
    }
  });
});

describe('supportedFormats', () => {
  it('engineering without Fink data: no v35', () => {
    expect(supportedFormats(base)).toEqual(['official', 'meeting_summary', 'obe']);
  });

  it('engineering with any Fink/Capstone block: v35 offered', () => {
    expect(supportedFormats({ ...base, capstone_project: { options: [] } as never })).toContain('v35');
  });

  it('pharmacy models only render official', () => {
    expect(supportedFormats({ ...base, academic_model: 'pci_pharm' })).toEqual(['official']);
    expect(supportedFormats({ ...base, academic_model: 'mgr_pharmd' })).toEqual(['official']);
  });
});

describe('buildSyllabusHtml (print layout)', () => {
  const doc: BosCourseSyllabus = {
    ...base,
    course_objectives: { objectives: [{ number: 1, description: 'Understand orbits' }] },
    course_learning_outcomes: { clos: [{ clo_number: 1, description: 'Identify orbits', k_values: [] }] },
    course_content: { units: [{ unit_id: 'I', unit_title: 'ORBITS', hours: '9', chapters: [{ chapter_number: 1, title: '', sections: '', subtopics: [{ number: 1, title: "Kepler's Laws" }] }] }] },
    textbooks: { primary: [{ title: 'Satellite Communication, 2017', author: 'Dennis Roddy', publication_year: 2017 }], references: [] },
    web_resources: { resources: [] },
    pedagogy: { methods: [] },
    po_mappings: { mappings: [{ co_id: 'CO1', pos: { PO1: 'H', PO3: 'L' } }] },
  };
  const opts = { includeMappings: true, includeReferences: true, includePedagogy: true, forPrint: true as const };

  it('prints letterhead, regulation, unit hours and the CO-PO matrix; omits empty sections and never prints "undefined"', () => {
    const html = buildSyllabusHtml(doc, 'official', { ...opts, institution: { name: 'JKKN College of Engineering and Technology', city: 'Namakkal' }, regulationCode: 'R-2021' });
    expect(html).toContain('JKKN College of Engineering and Technology');
    expect(html).toContain('Regulation R-2021');
    expect(html).toContain('9 periods');
    expect(html).toContain("Kepler&#39;s Laws".replace('&#39;', "'"));
    expect(html).toContain('<th>PO1</th>');
    expect(html).toContain('H &ndash; High');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('Web Resources');
    expect(html).not.toContain('Pedagogy');
    expect(html).not.toContain('Chapter 1:');
    // year already inside the title is not repeated
    expect(html).toContain('Satellite Communication, 2017, Dennis Roddy</li>');
  });

  it('honours include_* flags', () => {
    const html = buildSyllabusHtml(doc, 'official', { ...opts, includeMappings: false, includeReferences: false });
    expect(html).not.toContain('PO / PSO Mapping');
    expect(html).not.toContain('Text Books');
  });

  it('keeps the legacy HTML for the non-print path', () => {
    const html = buildSyllabusHtml(doc, 'official', { ...opts, forPrint: false });
    expect(html).toMatch(/<title>[A-Za-z]+: 24UCADSE12<\/title>/);
    expect(html).not.toContain('letterhead');
  });
});

describe('keyMayRead', () => {
  it('super key reads everything, bound key only its own institution', () => {
    expect(keyMayRead(null, base)).toBe(true);
    expect(keyMayRead(INST_ID, base)).toBe(true);
    expect(keyMayRead('other', base)).toBe(false);
  });
});

describe('meta / etag / filename', () => {
  it('meta carries formats, pdf_path and a null pdf_url placeholder', () => {
    const m = toSyllabusApiMeta(base);
    expect(m.pdf_path).toBe(`/api/api-management/academic/syllabus/${base.id}/pdf?format=official`);
    expect(m.pdf_url).toBeNull();
    expect(m.institution_id).toBe(INST_ID);
    expect(m.formats).toContain('official');
  });

  it('etag changes with version, format and modification time', () => {
    const a = syllabusEtag(base, 'official');
    expect(a).not.toBe(syllabusEtag(base, 'obe'));
    expect(a).not.toBe(syllabusEtag({ ...base, version_number: 3 }, 'official'));
    expect(a).not.toBe(syllabusEtag({ ...base, last_modified_at: '2026-09-01T00:00:00Z' }, 'official'));
    expect(a.startsWith('"') && a.endsWith('"')).toBe(true);
  });

  it('filename is header-safe', () => {
    expect(syllabusPdfFilename('AB/CD 12"', 'official', 1)).toBe('AB_CD_12_-syllabus-official-v1.pdf');
  });
});
