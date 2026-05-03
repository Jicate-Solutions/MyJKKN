import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitFullName, mapFacultyToStaffUpdate } from './field-mapper';

test('splitFullName splits on first whitespace', () => {
  assert.deepEqual(splitFullName('Dr. John Smith'), { first_name: 'Dr.', last_name: 'John Smith' });
  assert.deepEqual(splitFullName('Madonna'),         { first_name: 'Madonna', last_name: '' });
  assert.deepEqual(splitFullName('  '),              { first_name: '', last_name: '' });
});

test('mapFacultyToStaffUpdate copies extended fields, defaults nulls cleanly', () => {
  const out = mapFacultyToStaffUpdate({
    slug: 'dr-john-smith',
    designation: 'Professor',
    qualification: 'Ph.D., M.Tech',
    experience_years: 15,
    qualifications: [{ degree: 'Ph.D.', institution: 'IIT Madras', year: 2010 }],
    badges: [{ label: 'Senior Member', color: '#ef4444' }],
  });
  assert.equal(out.slug, 'dr-john-smith');
  assert.equal(out.qualification_summary, 'Ph.D., M.Tech');
  assert.equal(out.experience_years, 15);
  assert.equal(out.qualifications.length, 1);
  assert.equal(out.has_extended_profile, true);
});

test('mapFacultyToStaffUpdate defaults missing fields safely', () => {
  const out = mapFacultyToStaffUpdate({});
  assert.equal(out.has_extended_profile, true);
  assert.equal(out.status, 'draft');
  assert.equal(out.display_order, 0);
  assert.deepEqual(out.publications, []);
  assert.deepEqual(out.faqs, []);
  assert.equal(out.slug, null);
});
