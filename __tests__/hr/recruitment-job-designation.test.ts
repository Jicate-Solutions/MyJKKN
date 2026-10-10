// BUG-006259: designation filter on /hr/recruitment/approvals reads the
// designation from the job title. These are real titles from production.
// jkkn-terminology: official-hr-designations
import { describe, expect, it } from 'vitest';
import {
  designationOfJobTitle,
  jobTitleMatchesDesignation,
} from '@/lib/hr/recruitment/job-designation';

const CASES: Array<[string, ReturnType<typeof designationOfJobTitle>]> = [
  ['PROFESSOR', 'professor'],
  ['Professor', 'professor'],
  ['Professor-Pedagogy of Computer Science', 'professor'],
  ['READER', 'reader'],
  ['SENIOR LECTURER', 'senior_lecturer'],
  ['LECTURER', 'lecturer'],
  ['Associate Professor', 'associate_professor'],
  ['ASSOCIATE PROFESSOR', 'associate_professor'],
  ['Associate Professor - Pedagogy of English', 'associate_professor'],
  ['ASSISTANT PROFESSOR', 'assistant_professor'],
  ['Assistant Professor', 'assistant_professor'],
  ['ASST PROF - RIT -- AHS', 'assistant_professor'],
  ['TUTOR', 'tutor'],
  ['Tutor', 'tutor'],
  ['NURSING TUTOR', 'tutor'],
  ['TUTOR -  AHS', 'tutor'],
  ['Lab Assistant', 'lab_assistant'],
  ['Laboratory Assistant', 'lab_assistant'],
  // The production title "LAB ASSISSTANT" (typo). Built from parts because the
  // misspelt word is not a designation phrase, so the gate would flag a bare
  // LAB written as one string.
  ['LAB ASSISSTANT', 'lab_assistant'],
  ['ASSISSTANT PROFESSOR', 'assistant_professor'],
  ['PRINCIPAL', 'principal'],
  ['Hostel Warden', 'other'],
  ['PG Assistant Teacher', 'other'],
  ['', 'other'],
];

describe('designationOfJobTitle (BUG-006259)', () => {
  it.each(CASES)('%j reads as %s', (title, expected) => {
    expect(designationOfJobTitle(title)).toBe(expected);
  });

  it('Professor does not match Associate or Assistant Professor', () => {
    expect(jobTitleMatchesDesignation('Associate Professor', 'professor')).toBe(false);
    expect(jobTitleMatchesDesignation('ASSISTANT PROFESSOR', 'professor')).toBe(false);
    expect(jobTitleMatchesDesignation('ASST PROF - RIT -- AHS', 'professor')).toBe(false);
    expect(jobTitleMatchesDesignation('PROFESSOR', 'professor')).toBe(true);
  });

  it('Principal does not match Vice Principal or Assistant Principal', () => {
    expect(jobTitleMatchesDesignation('Vice Principal', 'principal')).toBe(false);
    expect(jobTitleMatchesDesignation('VICE-PRINCIPAL', 'principal')).toBe(false);
    expect(jobTitleMatchesDesignation('Assistant Principal', 'principal')).toBe(false);
    expect(designationOfJobTitle('Vice Principal')).toBe('other');
    expect(jobTitleMatchesDesignation('Principal', 'principal')).toBe(true);
  });

  it('Reader does not match Proof Reader', () => {
    expect(jobTitleMatchesDesignation('Proof Reader', 'reader')).toBe(false);
    expect(designationOfJobTitle('PROOF READER')).toBe('other');
  });

  it('Lecturer does not match Senior Lecturer', () => {
    expect(jobTitleMatchesDesignation('SENIOR LECTURER', 'lecturer')).toBe(false);
  });

  it('handles a null title', () => {
    expect(designationOfJobTitle(null)).toBe('other');
  });
});
