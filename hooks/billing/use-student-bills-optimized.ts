import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import { studentSearchKeysOptimized } from './use-student-search-optimized';
import type {
  StudentBill,
  CreateStudentBillDto,
  UpdateStudentBillDto,
  StudentBillFilters,
  BulkBillScheduleDto
} from '@/types/billing-schedule';

// Optimized Query Keys with better segmentation
export const studentBillKeysOptimized = {
  all: ['student-bills'] as const,
  lists: () => [...studentBillKeysOptimized.all, 'list'] as const,
  list: (filters: StudentBillFilters) =>
    [...studentBillKeysOptimized.lists(), filters] as const,
  details: () => [...studentBillKeysOptimized.all, 'detail'] as const,
  detail: (id: string) => [...studentBillKeysOptimized.details(), id] as const,
  // Separate keys for different student-specific queries
  byStudent: (studentId: string) =>
    [...studentBillKeysOptimized.all, 'by-student', studentId] as const,
  unpaidByStudent: (studentId: string) =>
    [...studentBillKeysOptimized.all, 'unpaid', studentId] as const,
  outstanding: (studentId: string) =>
    [...studentBillKeysOptimized.all, 'outstanding', studentId] as const,
  // Institution-level keys for bulk operations
  byInstitution: (institutionId: string) =>
    [...studentBillKeysOptimized.all, 'by-institution', institutionId] as const
};

// Smart retry configuration
const getBillRetryConfig = (failureCount: number, error: any) => {
  // Don't retry for validation errors
  if (error?.message?.includes('validation') || error?.status === 400) {
    return false;
  }

  // Don't retry for not found errors
  if (error?.message?.includes('not found') || error?.status === 404) {
    return false;
  }

  // Retry up to 2 times for other errors
  return failureCount < 2;
};

// Enhanced error logging
const logBillError = (operation: string, error: any, context?: any) => {
  console.error(`Student bills ${operation} failed:`, {
    message: error?.message,
    status: error?.status,
    context,
    timestamp: new Date().toISOString()
  });
};

// OPTIMIZED: Hook to fetch student bills with enhanced performance
export function useStudentBillsOptimized(filters: StudentBillFilters = {}) {
  return useQuery({
    queryKey: studentBillKeysOptimized.list(filters),
    queryFn: () => StudentBillService.getStudentBills(filters),
    retry: getBillRetryConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

// OPTIMIZED: Hook to fetch a single student bill
export function useStudentBillOptimized(id: string) {
  return useQuery({
    queryKey: studentBillKeysOptimized.detail(id),
    queryFn: () => StudentBillService.getStudentBill(id),
    enabled: !!id,
    retry: getBillRetryConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000, // Keep individual bills longer
    refetchOnWindowFocus: false
  });
}

// OPTIMIZED: Hook to fetch bills by student with better caching
export function useStudentBillsByStudentOptimized(
  studentId: string,
  status?: string
) {
  return useQuery({
    queryKey: status
      ? [...studentBillKeysOptimized.byStudent(studentId), 'status', status]
      : studentBillKeysOptimized.byStudent(studentId),
    queryFn: () =>
      StudentBillService.getStudentBillsByStudent(studentId, status),
    enabled: !!studentId,
    retry: getBillRetryConfig,
    staleTime: 3 * 60 * 1000, // Shorter stale time for student-specific data
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

// OPTIMIZED: Hook to fetch unpaid bills by student
export function useUnpaidBillsByStudentOptimized(studentId: string) {
  return useQuery({
    queryKey: studentBillKeysOptimized.unpaidByStudent(studentId),
    queryFn: () => StudentBillService.getUnpaidBillsByStudent(studentId),
    enabled: !!studentId,
    retry: getBillRetryConfig,
    staleTime: 2 * 60 * 1000, // Shorter for unpaid bills (more dynamic)
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true // Important for payment status
  });
}

// OPTIMIZED: Hook to calculate student outstanding amount with timeout protection
export function useStudentOutstandingOptimized(studentId: string) {
  return useQuery({
    queryKey: studentBillKeysOptimized.outstanding(studentId),
    queryFn: async () => {
      // Add timeout protection for complex calculations
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Outstanding calculation timeout')),
          8000
        )
      );

      const calculationPromise =
        StudentBillService.calculateStudentOutstanding(studentId);

      try {
        return await Promise.race([calculationPromise, timeoutPromise]);
      } catch (error) {
        if ((error as Error).message === 'Outstanding calculation timeout') {
          console.warn(
            `Outstanding calculation timeout for student ${studentId}, using fallback`
          );
          // Fallback: sum balance amounts directly
          const filters: StudentBillFilters = {
            student_id: studentId,
            limit: 1000
          };
          const response = await StudentBillService.getStudentBills(filters);
          return response.data
            .filter((bill) =>
              ['unpaid', 'partially_paid', 'overdue'].includes(bill.status)
            )
            .reduce((sum, bill) => sum + (bill.balance_amount || 0), 0);
        }
        throw error;
      }
    },
    enabled: !!studentId,
    retry: (failureCount, error) => {
      if (error?.message?.includes('timeout')) {
        return false; // Don't retry timeouts
      }
      return getBillRetryConfig(failureCount, error);
    },
    staleTime: 60 * 1000, // 1 minute - outstanding amounts change frequently
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true
  });
}

// OPTIMIZED: Hook to create a student bill with smart invalidation
export function useCreateStudentBillOptimized() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (billData: CreateStudentBillDto) =>
      StudentBillService.createStudentBill(billData),
    onSuccess: (data) => {
      // Smart invalidation - only invalidate what's necessary
      const studentId = data.student_id;
      const institutionId = data.institution_id;

      // Invalidate student-specific queries
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.byStudent(studentId)
      });
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.unpaidByStudent(studentId)
      });
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.outstanding(studentId)
      });

      // Invalidate only relevant summary data
      queryClient.invalidateQueries({
        queryKey: studentSearchKeysOptimized.summary(studentId)
      });

      // Invalidate filtered lists that might include this bill
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.lists(),
        predicate: (query) => {
          // Check if this is a filtered query (3 elements) or just a list query (2 elements)
          const queryKey = query.queryKey as unknown as any[];
          if (queryKey.length < 3) return true;

          const filters = queryKey[2] as StudentBillFilters | undefined;
          return (
            !filters ||
            filters.student_id === studentId ||
            filters.institution_id === institutionId ||
            !filters.student_id // General lists
          );
        }
      });

      toast.success('Student bill created successfully');
    },
    onError: (error: any) => {
      logBillError('create', error);
      toast.error(error.message || 'Failed to create student bill');
    }
  });
}

// OPTIMIZED: Hook to update a student bill with minimal invalidation
export function useUpdateStudentBillOptimized() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      billData
    }: {
      id: string;
      billData: UpdateStudentBillDto;
    }) => StudentBillService.updateStudentBill(id, billData),
    onSuccess: (data, { billData }) => {
      const studentId = data.student_id;

      // Update specific bill in cache
      queryClient.setQueryData(studentBillKeysOptimized.detail(data.id), data);

      // Invalidate student-specific queries
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.byStudent(studentId)
      });

      // Only invalidate unpaid bills if status changed
      if (billData.status) {
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.unpaidByStudent(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.outstanding(studentId)
        });
      }

      // Only invalidate summary if amount or status changed
      if (billData.final_amount || billData.status || billData.balance_amount) {
        queryClient.invalidateQueries({
          queryKey: studentSearchKeysOptimized.summary(studentId)
        });
      }

      toast.success('Student bill updated successfully');
    },
    onError: (error: any) => {
      logBillError('update', error);
      toast.error(error.message || 'Failed to update student bill');
    }
  });
}

// OPTIMIZED: Hook to delete a student bill with precise invalidation
export function useDeleteStudentBillOptimized() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Get bill data before deletion for smart invalidation
      const bill = queryClient.getQueryData<StudentBill>(
        studentBillKeysOptimized.detail(id)
      );

      await StudentBillService.deleteStudentBill(id);
      return { deletedId: id, studentId: bill?.student_id };
    },
    onSuccess: ({ deletedId, studentId }) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: studentBillKeysOptimized.detail(deletedId)
      });

      if (studentId) {
        // Invalidate student-specific queries
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.byStudent(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.unpaidByStudent(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.outstanding(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentSearchKeysOptimized.summary(studentId)
        });
      }

      // Invalidate lists selectively
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.lists()
      });

      toast.success('Student bill deleted successfully');
    },
    onError: (error: any) => {
      logBillError('delete', error);
      toast.error(error.message || 'Failed to delete student bill');
    }
  });
}

// OPTIMIZED: Hook to bulk delete student bills with batched invalidation
export function useBulkDeleteStudentBillsOptimized() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) =>
      StudentBillService.bulkDeleteStudentBills(ids),
    onSuccess: (result) => {
      // Remove successful deletions from cache
      result.success.forEach((id) => {
        queryClient.removeQueries({
          queryKey: studentBillKeysOptimized.detail(id)
        });
      });

      // Invalidate all student-specific queries (bulk operation affects multiple students)
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeysOptimized.all, 'by-student']
      });
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeysOptimized.all, 'unpaid']
      });
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeysOptimized.all, 'outstanding']
      });
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.lists()
      });

      // Invalidate summaries
      queryClient.invalidateQueries({
        queryKey: studentSearchKeysOptimized.summaries()
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
      logBillError('bulk delete', error);
      toast.error(error.message || 'Failed to delete student bills');
    }
  });
}

// OPTIMIZED: Hook to bulk create student bills with optimized invalidation
export function useBulkCreateStudentBillsOptimized() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bulkData: BulkBillScheduleDto) =>
      StudentBillService.bulkCreateStudentBills(bulkData),
    onSuccess: (result) => {
      // Get unique student IDs
      const studentIds = [...new Set(result.success)];

      // Invalidate student-specific queries for affected students
      studentIds.forEach((studentId) => {
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.byStudent(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.unpaidByStudent(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.outstanding(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentSearchKeysOptimized.summary(studentId)
        });
      });

      // Invalidate lists for affected institutions
      // Note: Since we don't have institutionId in the result,
      // we'll rely on the general list invalidation below

      // Invalidate general lists
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.lists()
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
      logBillError('bulk create', error);
      toast.error(error.message || 'Failed to create student bills');
    }
  });
}

// OPTIMIZED: Hook to mark overdue bills with selective invalidation
export function useMarkOverdueBillsOptimized() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => StudentBillService.markOverdueBills(),
    onSuccess: (count) => {
      // Invalidate queries that depend on bill status
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.lists(),
        predicate: (query) => {
          // Check if this is a filtered query (3 elements) or just a list query (2 elements)
          const queryKey = query.queryKey as unknown as any[];
          if (queryKey.length < 3) return true;

          const filters = queryKey[2] as StudentBillFilters | undefined;
          // Only invalidate queries that filter by status or don't filter by status
          return (
            !filters?.status ||
            filters.status.includes('overdue') ||
            filters.status.includes('unpaid')
          );
        }
      });

      // Invalidate unpaid and outstanding queries (overdue bills affect these)
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeysOptimized.all, 'unpaid']
      });
      queryClient.invalidateQueries({
        queryKey: [...studentBillKeysOptimized.all, 'outstanding']
      });

      toast.success(`${count} bill(s) marked as overdue`);
    },
    onError: (error: any) => {
      logBillError('mark overdue', error);
      toast.error(error.message || 'Failed to mark overdue bills');
    }
  });
}

// OPTIMIZED: Hook to update bill status with minimal invalidation
export function useUpdateBillStatusOptimized() {
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
    onSuccess: (_, { billId, status, balanceAmount }) => {
      // Get the bill data to find student ID
      const billData = queryClient.getQueryData<StudentBill>(
        studentBillKeysOptimized.detail(billId)
      );

      if (billData) {
        const studentId = billData.student_id;

        // Update the specific bill in cache
        queryClient.setQueryData(studentBillKeysOptimized.detail(billId), {
          ...billData,
          status,
          balance_amount: balanceAmount
        });

        // Invalidate student-specific status-dependent queries
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.unpaidByStudent(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentBillKeysOptimized.outstanding(studentId)
        });
        queryClient.invalidateQueries({
          queryKey: studentSearchKeysOptimized.summary(studentId)
        });
      }

      // Invalidate lists that filter by status
      queryClient.invalidateQueries({
        queryKey: studentBillKeysOptimized.lists()
      });

      toast.success('Bill status updated successfully');
    },
    onError: (error: any) => {
      logBillError('update status', error);
      toast.error(error.message || 'Failed to update bill status');
    }
  });
}

// Smart cache utilities for external use
export const useStudentBillCacheUtils = () => {
  const queryClient = useQueryClient();

  return {
    // Prefetch unpaid bills for a student (useful before payment page)
    prefetchUnpaidBills: (studentId: string) => {
      queryClient.prefetchQuery({
        queryKey: studentBillKeysOptimized.unpaidByStudent(studentId),
        queryFn: () => StudentBillService.getUnpaidBillsByStudent(studentId),
        staleTime: 2 * 60 * 1000
      });
    },

    // Update bill in cache after payment
    updateBillAfterPayment: (
      billId: string,
      updatedData: Partial<StudentBill>
    ) => {
      queryClient.setQueryData(
        studentBillKeysOptimized.detail(billId),
        (oldData: StudentBill | undefined) =>
          oldData ? { ...oldData, ...updatedData } : undefined
      );
    },

    // Clear stale bill data
    clearStaleBillData: () => {
      queryClient.removeQueries({
        queryKey: studentBillKeysOptimized.all,
        stale: true
      });
    }
  };
};
