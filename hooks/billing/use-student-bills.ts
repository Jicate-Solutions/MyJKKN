import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import { studentSearchKeys } from './use-student-search';
import type {
  StudentBill,
  CreateStudentBillDto,
  UpdateStudentBillDto,
  StudentBillFilters,
  BulkBillScheduleDto
} from '@/types/billing-schedule';

// Query Keys
export const studentBillKeys = {
  all: ['student-bills'] as const,
  lists: () => [...studentBillKeys.all, 'list'] as const,
  list: (filters: StudentBillFilters) =>
    [...studentBillKeys.lists(), filters] as const,
  details: () => [...studentBillKeys.all, 'detail'] as const,
  detail: (id: string) => [...studentBillKeys.details(), id] as const,
  byStudent: (studentId: string) =>
    [...studentBillKeys.all, 'by-student', studentId] as const,
  unpaidByStudent: (studentId: string) =>
    [...studentBillKeys.all, 'unpaid', studentId] as const,
  outstanding: (studentId: string) =>
    [...studentBillKeys.all, 'outstanding', studentId] as const
};

// Hook to fetch student bills with filters
export function useStudentBills(filters: StudentBillFilters = {}) {
  return useQuery({
    queryKey: studentBillKeys.list(filters),
    queryFn: () => StudentBillService.getStudentBills(filters),
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

// Hook to fetch a single student bill
export function useStudentBill(id: string) {
  return useQuery({
    queryKey: studentBillKeys.detail(id),
    queryFn: () => StudentBillService.getStudentBill(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000
  });
}

// Hook to fetch bills by student
export function useStudentBillsByStudent(studentId: string, status?: string) {
  return useQuery({
    queryKey: studentBillKeys.byStudent(studentId),
    queryFn: () =>
      StudentBillService.getStudentBillsByStudent(studentId, status),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000
  });
}

// Hook to fetch unpaid bills by student
export function useUnpaidBillsByStudent(studentId: string) {
  return useQuery({
    queryKey: studentBillKeys.unpaidByStudent(studentId),
    queryFn: () => StudentBillService.getUnpaidBillsByStudent(studentId),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000 // 2 minutes for more frequent updates
  });
}

// Hook to calculate student outstanding amount
export function useStudentOutstanding(studentId: string) {
  return useQuery({
    queryKey: studentBillKeys.outstanding(studentId),
    queryFn: () => StudentBillService.calculateStudentOutstanding(studentId),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000
  });
}

// Hook to create a student bill
export function useCreateStudentBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (billData: CreateStudentBillDto) =>
      StudentBillService.createStudentBill(billData),
    onSuccess: (data) => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: studentBillKeys.byStudent(data.student_id)
      });
      queryClient.invalidateQueries({
        queryKey: studentBillKeys.unpaidByStudent(data.student_id)
      });
      queryClient.invalidateQueries({
        queryKey: studentBillKeys.outstanding(data.student_id)
      });

      // Invalidate student billing summary and detail queries for real-time updates
      queryClient.invalidateQueries({
        queryKey: studentSearchKeys.summary(data.student_id)
      });
      queryClient.invalidateQueries({
        queryKey: studentSearchKeys.detail(data.student_id)
      });

      toast.success('Student bill created successfully');
    },
    onError: (error: any) => {
      console.error('Error creating student bill:', error);
      toast.error(error.message || 'Failed to create student bill');
    }
  });
}

// Hook to update a student bill
export function useUpdateStudentBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      billData
    }: {
      id: string;
      billData: UpdateStudentBillDto;
    }) => StudentBillService.updateStudentBill(id, billData),
    onSuccess: (data) => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: studentBillKeys.detail(data.id)
      });
      queryClient.invalidateQueries({
        queryKey: studentBillKeys.byStudent(data.student_id)
      });
      queryClient.invalidateQueries({
        queryKey: studentBillKeys.unpaidByStudent(data.student_id)
      });
      queryClient.invalidateQueries({
        queryKey: studentBillKeys.outstanding(data.student_id)
      });

      // Invalidate student billing summary and detail queries for real-time updates
      queryClient.invalidateQueries({
        queryKey: studentSearchKeys.summary(data.student_id)
      });
      queryClient.invalidateQueries({
        queryKey: studentSearchKeys.detail(data.student_id)
      });

      toast.success('Student bill updated successfully');
    },
    onError: (error: any) => {
      console.error('Error updating student bill:', error);
      toast.error(error.message || 'Failed to update student bill');
    }
  });
}

// Hook to delete a student bill
export function useDeleteStudentBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => StudentBillService.deleteStudentBill(id),
    onSuccess: (_, deletedId) => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      queryClient.removeQueries({
        queryKey: studentBillKeys.detail(deletedId)
      });

      // Invalidate student-specific queries for all students
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeys.all, 'by-student']
      });
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeys.all, 'unpaid']
      });
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeys.all, 'outstanding']
      });

      // Invalidate all student summaries and details for real-time updates
      queryClient.invalidateQueries({
        queryKey: studentSearchKeys.summaries()
      });
      queryClient.invalidateQueries({
        queryKey: studentSearchKeys.details()
      });

      toast.success('Student bill deleted successfully');
    },
    onError: (error: any) => {
      console.error('Error deleting student bill:', error);
      toast.error(error.message || 'Failed to delete student bill');
    }
  });
}

// Hook to bulk delete student bills
export function useBulkDeleteStudentBills() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) =>
      StudentBillService.bulkDeleteStudentBills(ids),
    onSuccess: (result) => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });

      // Remove individual bill queries
      result.success.forEach((id) => {
        queryClient.removeQueries({ queryKey: studentBillKeys.detail(id) });
      });

      // Invalidate student-specific queries for all students
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeys.all, 'by-student']
      });
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeys.all, 'unpaid']
      });
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeys.all, 'outstanding']
      });

      const successCount = result.success.length;
      const failedCount = result.failed.length;

      if (successCount > 0) {
        toast.success(`${successCount} student bill(s) deleted successfully`);
      }

      if (failedCount > 0) {
        toast.error(`Failed to delete ${failedCount} student bill(s)`);
      }
    },
    onError: (error: any) => {
      console.error('Error bulk deleting student bills:', error);
      toast.error(error.message || 'Failed to delete student bills');
    }
  });
}

// Hook to bulk create student bills
export function useBulkCreateStudentBills() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bulkData: BulkBillScheduleDto) =>
      StudentBillService.bulkCreateStudentBills(bulkData),
    onSuccess: (result) => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });

      // Invalidate student-specific queries for affected students
      result.success.forEach((studentId) => {
        queryClient.invalidateQueries({
          queryKey: studentBillKeys.byStudent(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentBillKeys.unpaidByStudent(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentBillKeys.outstanding(studentId)
        });
        
        // Invalidate student billing summary and detail queries for real-time updates
        queryClient.invalidateQueries({
          queryKey: studentSearchKeys.summary(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentSearchKeys.detail(studentId)
        });
      });

      const successCount = result.success.length;
      const failedCount = result.failed.length;

      if (successCount > 0) {
        toast.success(
          `Bills created for ${successCount} student(s) successfully`
        );
      }

      if (failedCount > 0) {
        toast.error(`Failed to create bills for ${failedCount} student(s)`);
      }
    },
    onError: (error: any) => {
      console.error('Error bulk creating student bills:', error);
      toast.error(error.message || 'Failed to create student bills');
    }
  });
}

// Hook to mark overdue bills
export function useMarkOverdueBills() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => StudentBillService.markOverdueBills(),
    onSuccess: (count) => {
      // Invalidate all bill-related queries
      queryClient.invalidateQueries({ queryKey: studentBillKeys.all });

      toast.success(`${count} bill(s) marked as overdue`);
    },
    onError: (error: any) => {
      console.error('Error marking overdue bills:', error);
      toast.error(error.message || 'Failed to mark overdue bills');
    }
  });
}

// Hook to update bill status
export function useUpdateBillStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      billId,
      status,
      balanceAmount
    }: {
      billId: string;
      status: string;
      balanceAmount?: number;
    }) => StudentBillService.updateBillStatus(billId, status, balanceAmount),
    onSuccess: (_, { billId }) => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: studentBillKeys.detail(billId)
      });

      // Invalidate student-specific queries for all students
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeys.all, 'by-student']
      });
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeys.all, 'unpaid']
      });
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeys.all, 'outstanding']
      });

      toast.success('Bill status updated successfully');
    },
    onError: (error: any) => {
      console.error('Error updating bill status:', error);
      toast.error(error.message || 'Failed to update bill status');
    }
  });
}
