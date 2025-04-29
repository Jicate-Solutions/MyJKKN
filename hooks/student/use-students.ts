import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Student,
  StudentFilters,
  StudentListResponse,
  CreateStudentDto,
  UpdateStudentDto
} from '@/types/student';
import { StudentService } from '@/lib/services/student/student-service';

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
