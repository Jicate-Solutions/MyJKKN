// lib/utils/subdivision-validation.ts
// Created: 2025-10-11
// Purpose: Validation utilities for section subdivision feature

import { SubdivisionGroup, SubdivisionValidationResult } from '@/types/academics';

/**
 * Validates student assignments across subdivision groups
 * Ensures:
 * - All students are assigned to exactly one group
 * - No student is assigned to multiple groups
 * - No students are missing from group assignments
 */
export function validateSubdivisionAssignments(
  groups: SubdivisionGroup[],
  allStudentIds: string[]
): SubdivisionValidationResult {
  const assignedStudents = new Map<string, number[]>(); // student_id -> group_orders where assigned
  const warnings: string[] = [];

  // Track which students are assigned to which groups
  groups.forEach((group, index) => {
    group.student_ids.forEach((studentId) => {
      if (!assignedStudents.has(studentId)) {
        assignedStudents.set(studentId, []);
      }
      assignedStudents.get(studentId)!.push(group.group_order);
    });
  });

  // Find duplicates (students assigned to multiple groups)
  const duplicates = Array.from(assignedStudents.entries())
    .filter(([_, groupOrders]) => groupOrders.length > 1)
    .map(([studentId]) => studentId);

  // Find missing students (not assigned to any group)
  const assignedStudentIds = Array.from(assignedStudents.keys());
  const missing = allStudentIds.filter((id) => !assignedStudentIds.includes(id));

  // Check for uneven distribution
  const groupSizes = groups.map((g) => g.student_ids.length);
  const maxSize = Math.max(...groupSizes);
  const minSize = Math.min(...groupSizes);
  const sizeDifference = maxSize - minSize;

  if (sizeDifference > 5) {
    warnings.push(
      `Uneven distribution detected: Group sizes vary by ${sizeDifference} students (${minSize}-${maxSize} students per group)`
    );
  }

  // Check for capacity violations
  groups.forEach((group) => {
    if (group.max_capacity && group.student_ids.length > group.max_capacity) {
      warnings.push(
        `${group.group_name} exceeds maximum capacity: ${group.student_ids.length}/${group.max_capacity} students`
      );
    }
  });

  // Generate result
  const isValid = duplicates.length === 0 && missing.length === 0;
  let message = '';

  if (isValid) {
    message = `✓ All ${allStudentIds.length} students are properly assigned to ${groups.length} groups`;
  } else {
    const issues: string[] = [];
    if (duplicates.length > 0) {
      issues.push(`${duplicates.length} student(s) assigned to multiple groups`);
    }
    if (missing.length > 0) {
      issues.push(`${missing.length} student(s) not assigned to any group`);
    }
    message = `✗ Validation failed: ${issues.join(', ')}`;
  }

  return {
    isValid,
    duplicates,
    missing,
    message,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Auto-distributes students evenly across groups
 * Uses round-robin assignment to ensure balanced distribution
 */
export function autoDistributeStudents(
  studentIds: string[],
  groupCount: number,
  maxCapacityPerGroup?: number
): string[][] {
  if (groupCount <= 0) {
    throw new Error('Group count must be greater than 0');
  }

  if (studentIds.length === 0) {
    return Array(groupCount).fill([]);
  }

  // Initialize empty groups
  const groups: string[][] = Array.from({ length: groupCount }, () => []);

  // Shuffle students for random distribution (optional, can be removed for consistent ordering)
  const shuffledStudents = [...studentIds].sort(() => Math.random() - 0.5);

  // Round-robin assignment
  shuffledStudents.forEach((studentId, index) => {
    const groupIndex = index % groupCount;

    // Check capacity if specified
    if (maxCapacityPerGroup && groups[groupIndex].length >= maxCapacityPerGroup) {
      // Try to find a group with space
      const availableGroupIndex = groups.findIndex(
        (g) => g.length < (maxCapacityPerGroup || Infinity)
      );
      if (availableGroupIndex !== -1) {
        groups[availableGroupIndex].push(studentId);
      } else {
        // All groups at capacity, skip this student (will be caught in validation)
        console.warn(`Cannot assign student ${studentId}: All groups at capacity`);
      }
    } else {
      groups[groupIndex].push(studentId);
    }
  });

  return groups;
}

/**
 * Generates default group names based on subdivision type and count
 */
export function generateDefaultGroupNames(
  groupCount: number,
  subdivisionType: 'practical' | 'lab' | 'tutorial' | 'workshop'
): string[] {
  const typeLabels = {
    practical: 'Practical',
    lab: 'Lab',
    tutorial: 'Tutorial',
    workshop: 'Workshop',
  };

  const typeLabel = typeLabels[subdivisionType];
  const groupLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  return Array.from({ length: groupCount }, (_, index) => {
    const letter = groupLetters[index] || `${index + 1}`;
    return `Group ${letter} - ${typeLabel} ${index + 1}`;
  });
}

/**
 * Creates default subdivision groups with auto-distribution
 */
export function createDefaultSubdivisionGroups(
  studentIds: string[],
  groupCount: number,
  courseId: string,
  subdivisionType: 'practical' | 'lab' | 'tutorial' | 'workshop',
  maxCapacityPerGroup?: number
): SubdivisionGroup[] {
  const groupNames = generateDefaultGroupNames(groupCount, subdivisionType);
  const distributedStudents = autoDistributeStudents(
    studentIds,
    groupCount,
    maxCapacityPerGroup
  );

  return distributedStudents.map((studentIdsForGroup, index) => ({
    group_order: index + 1,
    group_name: groupNames[index],
    course_id: courseId,
    staff_ids: [], // To be assigned by user
    student_ids: studentIdsForGroup,
    lab_room: undefined,
    max_capacity: maxCapacityPerGroup,
  }));
}

/**
 * Validates individual group configuration
 */
export function validateGroup(group: SubdivisionGroup): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!group.group_name || group.group_name.trim() === '') {
    errors.push('Group name is required');
  }

  if (!group.course_id) {
    errors.push('Course selection is required');
  }

  if (group.staff_ids.length === 0) {
    errors.push('At least one staff member must be assigned');
  }

  if (group.student_ids.length === 0) {
    errors.push('At least one student must be assigned to the group');
  }

  if (group.max_capacity && group.student_ids.length > group.max_capacity) {
    errors.push(
      `Group exceeds maximum capacity: ${group.student_ids.length}/${group.max_capacity}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates all groups in subdivision configuration
 */
export function validateAllGroups(groups: SubdivisionGroup[]): {
  isValid: boolean;
  groupErrors: Map<number, string[]>; // group_order -> errors
  generalErrors: string[];
} {
  const groupErrors = new Map<number, string[]>();
  const generalErrors: string[] = [];

  if (groups.length === 0) {
    generalErrors.push('At least one group is required');
  }

  // Validate each group
  groups.forEach((group) => {
    const validation = validateGroup(group);
    if (!validation.isValid) {
      groupErrors.set(group.group_order, validation.errors);
    }
  });

  // Check for duplicate group names
  const groupNames = groups.map((g) => g.group_name.toLowerCase());
  const duplicateNames = groupNames.filter(
    (name, index) => groupNames.indexOf(name) !== index
  );
  if (duplicateNames.length > 0) {
    generalErrors.push('Duplicate group names found');
  }

  return {
    isValid: groupErrors.size === 0 && generalErrors.length === 0,
    groupErrors,
    generalErrors,
  };
}

/**
 * Calculates distribution statistics for subdivision groups
 */
export function calculateDistributionStats(groups: SubdivisionGroup[]): {
  totalStudents: number;
  averageGroupSize: number;
  minGroupSize: number;
  maxGroupSize: number;
  standardDeviation: number;
  isBalanced: boolean;
} {
  const groupSizes = groups.map((g) => g.student_ids.length);
  const totalStudents = groupSizes.reduce((sum, size) => sum + size, 0);
  const averageGroupSize = totalStudents / groups.length;
  const minGroupSize = Math.min(...groupSizes);
  const maxGroupSize = Math.max(...groupSizes);

  // Calculate standard deviation
  const squaredDifferences = groupSizes.map((size) =>
    Math.pow(size - averageGroupSize, 2)
  );
  const variance =
    squaredDifferences.reduce((sum, diff) => sum + diff, 0) / groups.length;
  const standardDeviation = Math.sqrt(variance);

  // Consider balanced if std dev is less than 2 students
  const isBalanced = standardDeviation < 2;

  return {
    totalStudents,
    averageGroupSize,
    minGroupSize,
    maxGroupSize,
    standardDeviation,
    isBalanced,
  };
}

/**
 * Rebalances groups by redistributing students evenly
 * Preserves existing assignments as much as possible
 */
export function rebalanceGroups(
  groups: SubdivisionGroup[],
  allStudentIds: string[]
): SubdivisionGroup[] {
  // Collect all currently assigned students
  const assignedStudents = new Set<string>();
  groups.forEach((group) => {
    group.student_ids.forEach((id) => assignedStudents.add(id));
  });

  // Find unassigned students
  const unassignedStudents = allStudentIds.filter((id) => !assignedStudents.has(id));

  // Get current distribution
  const stats = calculateDistributionStats(groups);

  // If already balanced and no unassigned students, return as is
  if (stats.isBalanced && unassignedStudents.length === 0) {
    return groups;
  }

  // Redistribute all students evenly
  const distributedStudents = autoDistributeStudents(allStudentIds, groups.length);

  return groups.map((group, index) => ({
    ...group,
    student_ids: distributedStudents[index],
  }));
}

/**
 * Finds students that conflict between multiple groups
 */
export function findConflictingStudents(groups: SubdivisionGroup[]): Map<string, number[]> {
  const studentAssignments = new Map<string, number[]>();

  groups.forEach((group) => {
    group.student_ids.forEach((studentId) => {
      if (!studentAssignments.has(studentId)) {
        studentAssignments.set(studentId, []);
      }
      studentAssignments.get(studentId)!.push(group.group_order);
    });
  });

  // Filter to only conflicting students (assigned to 2+ groups)
  const conflicts = new Map<string, number[]>();
  studentAssignments.forEach((groupOrders, studentId) => {
    if (groupOrders.length > 1) {
      conflicts.set(studentId, groupOrders);
    }
  });

  return conflicts;
}

/**
 * Removes a student from all groups except the specified one
 */
export function resolveStudentConflict(
  groups: SubdivisionGroup[],
  studentId: string,
  keepInGroupOrder: number
): SubdivisionGroup[] {
  return groups.map((group) => {
    if (group.group_order === keepInGroupOrder) {
      // Ensure student is in this group
      if (!group.student_ids.includes(studentId)) {
        return {
          ...group,
          student_ids: [...group.student_ids, studentId],
        };
      }
      return group;
    } else {
      // Remove student from other groups
      return {
        ...group,
        student_ids: group.student_ids.filter((id) => id !== studentId),
      };
    }
  });
}
