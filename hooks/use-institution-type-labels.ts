/**
 * Hook to provide localized labels for institution-related entities.
 * Used for dynamic text rendering based on context/entity type.
 */
export function useInstitutionTypeLabels() {
  const label = (entityType: string): string => {
    const labels: Record<string, string> = {
      'semester': 'Semester',
      'semesters': 'Semesters',
      'degree': 'Degree',
      'degrees': 'Degrees',
      'department': 'Department',
      'departments': 'Departments',
      'program': 'Program',
      'programs': 'Programs',
      'course': 'Course',
      'courses': 'Courses',
      'institution': 'Institution',
      'institutions': 'Institutions',
    };

    return labels[entityType] || entityType;
  };

  return {
    label,
  };
}
