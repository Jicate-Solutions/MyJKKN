import { describe, it, expect } from 'vitest';
import {
  INSTITUTION_TYPE_LABELS,
  getLabel,
  type InstitutionTypeLabel,
} from '@/lib/constants/institution-type-labels';

describe('Institution Type Labels', () => {
  describe('INSTITUTION_TYPE_LABELS constant', () => {
    it('provides label mappings for colleges (institution)', () => {
      const institutionLabels = INSTITUTION_TYPE_LABELS.institution;
      expect(institutionLabels.degree).toBe('Degree');
      expect(institutionLabels.program).toBe('Program');
      expect(institutionLabels.semester).toBe('Semester');
      expect(institutionLabels.course).toBe('Course');
      expect(institutionLabels.department).toBe('Department');
    });

    it('provides label mappings for schools', () => {
      const schoolLabels = INSTITUTION_TYPE_LABELS.school;
      expect(schoolLabels.degree).toBe('Stream');
      expect(schoolLabels.program).toBe('Class');
      expect(schoolLabels.semester).toBe('Term');
      expect(schoolLabels.course).toBe('Subject');
      expect(schoolLabels.department).toBe('Wing');
    });

    it('provides label mappings for admin offices', () => {
      const adminOfficeLabels = INSTITUTION_TYPE_LABELS.admin_office;
      expect(adminOfficeLabels).toBeDefined();
      expect(adminOfficeLabels.program).toBeDefined();
    });

    it('provides label mappings for companies', () => {
      const companyLabels = INSTITUTION_TYPE_LABELS.company;
      expect(companyLabels).toBeDefined();
      expect(companyLabels.program).toBeDefined();
    });
  });

  describe('getLabel utility function', () => {
    it('returns correct label for college institution type', () => {
      expect(getLabel('institution', 'program')).toBe('Program');
      expect(getLabel('institution', 'course')).toBe('Course');
      expect(getLabel('institution', 'semester')).toBe('Semester');
    });

    it('returns correct label for school institution type', () => {
      expect(getLabel('school', 'program')).toBe('Class');
      expect(getLabel('school', 'course')).toBe('Subject');
      expect(getLabel('school', 'semester')).toBe('Term');
    });

    it('returns correct label for admin_office institution type', () => {
      expect(getLabel('admin_office', 'program')).toBe('Program');
    });

    it('returns correct label for company institution type', () => {
      expect(getLabel('company', 'program')).toBe('Program');
    });

    it('returns default label when key is not found', () => {
      const result = getLabel('institution', 'unknown_key' as InstitutionTypeLabel);
      expect(result).toBeDefined();
    });

    it('handles edge cases with empty strings', () => {
      const result = getLabel('institution', 'program');
      expect(result).not.toBe('');
    });
  });

  describe('Label differentiation between colleges and schools', () => {
    it('distinguishes college and school terminology clearly', () => {
      const collegeDegree = getLabel('institution', 'degree');
      const schoolDegree = getLabel('school', 'degree');
      expect(collegeDegree).not.toBe(schoolDegree);
      expect(collegeDegree).toBe('Degree');
      expect(schoolDegree).toBe('Stream');
    });

    it('distinguishes program and class terminology', () => {
      const collegeProgram = getLabel('institution', 'program');
      const schoolProgram = getLabel('school', 'program');
      expect(collegeProgram).toBe('Program');
      expect(schoolProgram).toBe('Class');
    });

    it('distinguishes semester and term terminology', () => {
      const collegeSemester = getLabel('institution', 'semester');
      const schoolSemester = getLabel('school', 'semester');
      expect(collegeSemester).toBe('Semester');
      expect(schoolSemester).toBe('Term');
    });

    it('distinguishes course and subject terminology', () => {
      const collegeCourse = getLabel('institution', 'course');
      const schoolCourse = getLabel('school', 'course');
      expect(collegeCourse).toBe('Course');
      expect(schoolCourse).toBe('Subject');
    });

    it('distinguishes department and wing terminology', () => {
      const collegeDept = getLabel('institution', 'department');
      const schoolDept = getLabel('school', 'department');
      expect(collegeDept).toBe('Department');
      expect(schoolDept).toBe('Wing');
    });
  });
});
