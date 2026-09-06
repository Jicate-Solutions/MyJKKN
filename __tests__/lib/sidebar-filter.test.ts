import { describe, it, expect } from 'vitest';
import { filterMenuByEntityType } from '@/lib/sidebarMenuLink';

// Mock menu structure for testing
const mockMenu = [
  {
    href: '/organizations/programs',
    label: 'Programs',
    icon: 'BookOpen',
  },
  {
    href: '/organizations/degrees',
    label: 'Degrees',
    icon: 'GraduationCap',
  },
  {
    href: '/organizations/courses',
    label: 'Courses',
    icon: 'BookMarked',
  },
  {
    href: '/organizations/courses/mappings',
    label: 'Course Mappings',
    icon: 'Link',
  },
  {
    href: '/organizations/semesters',
    label: 'Semesters',
    icon: 'Calendar',
  },
];

describe('filterMenuByEntityType', () => {
  describe('for college institutions (entity_type: "institution")', () => {
    it('returns full menu without filtering', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'institution');
      expect(filtered).toHaveLength(mockMenu.length);
      expect(filtered).toEqual(mockMenu);
    });

    it('includes degrees link', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'institution');
      const degreesLink = filtered.find((item) => item.href === '/organizations/degrees');
      expect(degreesLink).toBeDefined();
    });

    it('includes course mappings link', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'institution');
      const mappingsLink = filtered.find(
        (item) => item.href === '/organizations/courses/mappings'
      );
      expect(mappingsLink).toBeDefined();
    });
  });

  describe('for school institutions (entity_type: "school")', () => {
    it('filters out degrees link', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'school');
      const degreesLink = filtered.find((item) => item.href === '/organizations/degrees');
      expect(degreesLink).toBeUndefined();
    });

    it('filters out course mappings link', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'school');
      const mappingsLink = filtered.find(
        (item) => item.href === '/organizations/courses/mappings'
      );
      expect(mappingsLink).toBeUndefined();
    });

    it('keeps programs link', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'school');
      const programsLink = filtered.find((item) => item.href === '/organizations/programs');
      expect(programsLink).toBeDefined();
    });

    it('keeps courses link', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'school');
      const coursesLink = filtered.find((item) => item.href === '/organizations/courses');
      expect(coursesLink).toBeDefined();
    });

    it('keeps semesters link', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'school');
      const semestersLink = filtered.find((item) => item.href === '/organizations/semesters');
      expect(semestersLink).toBeDefined();
    });

    it('returns correct count of filtered items', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'school');
      // Should have 5 - 2 = 3 items (removes degrees and course/mappings)
      expect(filtered).toHaveLength(3);
    });
  });

  describe('for admin_office institutions', () => {
    it('returns full menu without filtering', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'admin_office');
      expect(filtered).toHaveLength(mockMenu.length);
    });
  });

  describe('for company institutions', () => {
    it('returns full menu without filtering', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'company');
      expect(filtered).toHaveLength(mockMenu.length);
    });
  });

  describe('edge cases', () => {
    it('handles empty menu array', () => {
      const emptyMenu: any[] = [];
      const filtered = filterMenuByEntityType(emptyMenu, 'school');
      expect(filtered).toEqual([]);
    });

    it('handles null or undefined entity_type gracefully', () => {
      const filtered = filterMenuByEntityType(mockMenu, null as any);
      // Should handle gracefully without crashing
      expect(Array.isArray(filtered)).toBe(true);
    });

    it('preserves menu item order for non-filtered items', () => {
      const filtered = filterMenuByEntityType(mockMenu, 'school');
      const programsIndex = filtered.findIndex((item) => item.href === '/organizations/programs');
      const coursesIndex = filtered.findIndex((item) => item.href === '/organizations/courses');
      expect(programsIndex).toBeLessThan(coursesIndex);
    });
  });
});
