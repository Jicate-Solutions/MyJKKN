import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Student,
  StudentFilters,
  StudentListResponse,
  CreateStudentDto,
  UpdateStudentDto
} from '@/types/student';
import { StudentService } from '@/lib/services/student/student-service';
import { useState, useCallback, useEffect } from 'react';

export type StudentData = Student;

// Query key factory for students
export const studentKeys = {
  all: ['students'] as const,
  lists: () => [...studentKeys.all, 'list'] as const,
  list: (filters: StudentFilters) => [...studentKeys.lists(), filters] as const,
  details: () => [...studentKeys.all, 'detail'] as const,
  detail: (id: string) => [...studentKeys.details(), id] as const,
  byAdmission: (admissionId: string) =>
    [...studentKeys.all, 'byAdmission', admissionId] as const,
  stats: () => [...studentKeys.all, 'stats'] as const
};

// Get a list of students with filters
export function useStudents(filters: StudentFilters = {}) {
  return useQuery({
    queryKey: ['students', filters],
    queryFn: async () => {
      // Prepare query params
      const queryParams: Record<string, any> = {
        ...filters
      };

      // Format dates if present
      if (filters.created_from) {
        queryParams.created_from = filters.created_from.toISOString();
      }
      if (filters.created_to) {
        queryParams.created_to = filters.created_to.toISOString();
      }

      const result = await StudentService.getStudents(queryParams);
      return result;
    }
  });
}

// Get a single student by ID
export const useStudent = (id: string) => {
  return useQuery({
    queryKey: studentKeys.detail(id),
    queryFn: () => StudentService.getStudent(id),
    enabled: !!id
  });
};

// Get a student by admission ID
export const useStudentByAdmissionId = (admissionId: string) => {
  return useQuery({
    queryKey: studentKeys.byAdmission(admissionId),
    queryFn: () => StudentService.getStudentByAdmissionId(admissionId),
    enabled: !!admissionId
  });
};

// Create a new student
export const useCreateStudent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateStudentDto) => StudentService.createStudent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.stats() });
    }
  });
};

// Update an existing student
export const useUpdateStudent = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateStudentDto) =>
      StudentService.updateStudent(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.stats() });
      queryClient.setQueryData(studentKeys.detail(id), data);
    }
  });
};

// Delete a student
export const useDeleteStudent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => StudentService.deleteStudent(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.stats() });
      queryClient.removeQueries({ queryKey: studentKeys.detail(id) });
    }
  });
};

// Create a student from an admission
export const useCreateStudentFromAdmission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (admissionId: string) =>
      StudentService.createStudentFromAdmission(admissionId),
    onSuccess: (data, admissionId) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
        queryClient.invalidateQueries({ queryKey: studentKeys.stats() });
        queryClient.invalidateQueries({
          queryKey: studentKeys.byAdmission(admissionId)
        });
        queryClient.setQueryData(studentKeys.detail(data.id), data);
      }
    }
  });
};

// Get student statistics
export const useStudentStats = () => {
  return useQuery({
    queryKey: studentKeys.stats(),
    queryFn: () => StudentService.getStudentStats()
  });
};

// Add the promotion hook
export function useStudentsPromotion(options: { limit?: number } = {}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StudentFilters>({
    search: undefined,
    institution: undefined,
    department: undefined,
    program: undefined,
    semester: undefined,
    section: undefined,
    status: 'active', // Only show active students for promotion
    is_profile_complete: true, // Only show completed profiles
    page: 1,
    limit: options.limit || 10
  });
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: options.limit || 10,
    totalPages: 0
  });

  const queryClient = useQueryClient();

  // Fetch students with pagination and filtering
  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Clean the filters before sending to the API by removing undefined or empty string values
      const cleanedFilters = Object.entries(filters).reduce(
        (acc, [key, value]) => {
          if (value !== undefined && value !== '') {
            acc[key as keyof StudentFilters] = value;
          }
          return acc;
        },
        {} as StudentFilters
      );

      // The StudentService.getStudents method now includes semester and section relations
      const { data, metadata: responseMetadata } =
        await StudentService.getStudents(cleanedFilters);

      setStudents(data);
      setMetadata({
        total: responseMetadata.total,
        page: responseMetadata.page,
        limit: responseMetadata.limit,
        totalPages: Math.ceil(responseMetadata.total / responseMetadata.limit)
      });
    } catch (error) {
      console.error('Error fetching students:', error);
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Update filters
  const updateFilters = useCallback((newFilters: Partial<StudentFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  // Change page
  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  // Handle bulk promotion of students
  const bulkPromoteStudents = useCallback(
    async (studentIds: string[], semesterId: string, sectionId: string) => {
      try {
        setLoading(true);

        // Loop through each student and update their semester and section
        const updatePromises = studentIds.map((studentId) =>
          StudentService.updateStudent(studentId, {
            semester_id: semesterId,
            section_id: sectionId
          })
        );

        await Promise.all(updatePromises);

        // Invalidate all student queries to refresh data
        queryClient.invalidateQueries({ queryKey: studentKeys.all });

        // Refetch the current list
        await fetchStudents();

        return true;
      } catch (error) {
        console.error('Error promoting students:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [fetchStudents, queryClient]
  );

  // Fetch students when filters change
  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return {
    students,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchStudents,
    bulkPromoteStudents
  };
}
