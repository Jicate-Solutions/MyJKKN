import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BillingReceipt,
  ReceiptFilters,
  ReceiptListResponse,
  CreateReceiptDto,
  UpdateReceiptDto
} from '@/types/billing-schedule';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { toast } from 'react-hot-toast';

export function useBillingReceipts(initialFilters: ReceiptFilters = {}) {
  const [filters, setFilters] = useState<ReceiptFilters>({
    page: 1,
    limit: 10,
    ...initialFilters
  });

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-receipts', filters],
    queryFn: () => BillingReceiptService.getBillingReceipts(filters),
    placeholderData: (previousData) => previousData
  });

  const updateFilters = useCallback((newFilters: Partial<ReceiptFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page || 1
    }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const fetchReceipts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
  }, [queryClient]);

  return {
    receipts: data?.data || [],
    metadata: data?.metadata || {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0
    },
    loading: isLoading,
    error: error?.message,
    filters,
    updateFilters,
    changePage,
    fetchReceipts
  };
}

export function useBillingReceipt(id: string) {
  return useQuery({
    queryKey: ['billing-receipt', id],
    queryFn: () => BillingReceiptService.getBillingReceipt(id),
    enabled: !!id
  });
}

export function useCreateBillingReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateReceiptDto) =>
      BillingReceiptService.createBillingReceipt(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
      toast.success('Receipt generated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate receipt');
    }
  });
}

export function useUpdateBillingReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateReceiptDto }) =>
      BillingReceiptService.updateBillingReceipt(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-receipt'] });
      toast.success('Receipt updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update receipt');
    }
  });
}

export function useDeleteBillingReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingReceiptService.deleteBillingReceipt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
      toast.success('Receipt deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete receipt');
    }
  });
}

export function usePrintReceipt() {
  return useMutation({
    mutationFn: (id: string) => BillingReceiptService.printReceipt(id),
    onSuccess: () => {
      toast.success('Receipt printed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to print receipt');
    }
  });
}

export function useEmailReceipt() {
  return useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      BillingReceiptService.emailReceipt(id, email),
    onSuccess: () => {
      toast.success('Receipt emailed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to email receipt');
    }
  });
}

export function useDownloadReceiptPDF() {
  return useMutation({
    mutationFn: (id: string) => BillingReceiptService.downloadReceiptPDF(id),
    onSuccess: () => {
      toast.success('Receipt PDF download started');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to download receipt PDF');
    }
  });
}

export function useBulkGenerateReceipts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (receipts: CreateReceiptDto[]) =>
      BillingReceiptService.bulkGenerateReceipts(receipts),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
      if (result.success.length > 0) {
        toast.success(
          `${result.success.length} receipts generated successfully`
        );
      }
      if (result.failed.length > 0) {
        toast.error(`Failed to generate ${result.failed.length} receipts`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate receipts');
    }
  });
}
