'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { BillingInvoiceService } from '@/lib/services/billing/invoices/billing-invoice-service';
import type {
  BillingInvoice,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceFilters,
  InvoiceListResponse
} from '@/types/billing-schedule';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Hook for managing invoices list with filters and pagination
export function useBillingInvoices(initialFilters: InvoiceFilters = {}) {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });
  const [filters, setFilters] = useState<InvoiceFilters>(initialFilters);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await BillingInvoiceService.getBillingInvoices(filters);
      setInvoices(response.data);
      setMetadata(response.metadata);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch invoices';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const updateFilters = useCallback((newFilters: Partial<InvoiceFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  return {
    invoices,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchInvoices
  };
}

// Hook for single invoice
export function useBillingInvoice(id: string) {
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const data = await BillingInvoiceService.getBillingInvoice(id);
        setInvoice(data);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch invoice';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [id]);

  const refetch = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const data = await BillingInvoiceService.getBillingInvoice(id);
      setInvoice(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch invoice';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [id]);

  return { invoice, loading, error, refetch };
}

// Hook for creating invoice
export function useCreateBillingInvoice() {
  const [loading, setLoading] = useState(false);

  const createInvoice = useCallback(async (data: CreateInvoiceDto) => {
    try {
      setLoading(true);
      const invoice = await BillingInvoiceService.createBillingInvoice(data);
      toast.success('Invoice created successfully');
      return invoice;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create invoice';
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createInvoice, loading };
}

// Hook for updating invoice
export function useUpdateBillingInvoice() {
  const [loading, setLoading] = useState(false);

  const updateInvoice = useCallback(
    async (id: string, data: UpdateInvoiceDto) => {
      try {
        setLoading(true);
        const invoice = await BillingInvoiceService.updateBillingInvoice(
          id,
          data
        );
        toast.success('Invoice updated successfully');
        return invoice;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to update invoice';
        toast.error(errorMessage);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { updateInvoice, loading };
}

// Hook for deleting invoice
export function useDeleteBillingInvoice() {
  const [loading, setLoading] = useState(false);

  const deleteInvoice = useCallback(async (id: string) => {
    try {
      setLoading(true);
      await BillingInvoiceService.deleteBillingInvoice(id);
      toast.success('Invoice deleted successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to delete invoice';
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deleteInvoice, loading };
}

// Hook for sending invoice
export function useSendInvoice() {
  const [loading, setLoading] = useState(false);

  const sendInvoice = useCallback(async (id: string, email: string) => {
    try {
      setLoading(true);
      await BillingInvoiceService.sendInvoice(id, email);
      toast.success('Invoice sent successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send invoice';
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { sendInvoice, loading };
}

// Hook for downloading invoice PDF
export function useDownloadInvoicePDF() {
  const [loading, setLoading] = useState(false);

  const downloadPDF = useCallback(async (id: string) => {
    try {
      setLoading(true);
      await BillingInvoiceService.downloadInvoicePDF(id);
      toast.success('Invoice downloaded successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to download invoice';
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { downloadPDF, loading };
}

// Hook for bulk creating invoices
export function useBulkCreateInvoices() {
  const [loading, setLoading] = useState(false);

  const bulkCreateInvoices = useCallback(
    async (invoices: CreateInvoiceDto[]) => {
      try {
        setLoading(true);
        const result = await BillingInvoiceService.bulkCreateInvoices(invoices);

        if (result.success.length > 0) {
          toast.success(
            `${result.success.length} invoices created successfully`
          );
        }

        if (result.failed.length > 0) {
          toast.error(`${result.failed.length} invoices failed to create`);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to create invoices';
        toast.error(errorMessage);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { bulkCreateInvoices, loading };
}

// Hook for student invoices
export function useStudentInvoices(studentId: string) {
  return useQuery({
    queryKey: ['student-invoices', studentId],
    queryFn: () => BillingInvoiceService.getInvoicesByStudent(studentId),
    enabled: !!studentId
  });
}

export function useBillAutoInvoice(billId: string) {
  return useQuery({
    queryKey: ['bill-auto-invoice', billId],
    queryFn: () => BillingInvoiceService.getBillAutoInvoice(billId),
    enabled: !!billId
  });
}

export function useAutoGeneratedInvoices(institutionId?: string) {
  return useQuery({
    queryKey: ['auto-generated-invoices', institutionId],
    queryFn: () =>
      BillingInvoiceService.getAutoGeneratedInvoices(institutionId),
    enabled: !!institutionId
  });
}

// Alternative hook using React Query (primary)
export function useBillingInvoiceQuery(id: string) {
  return useQuery({
    queryKey: ['billing-invoice', id],
    queryFn: () => BillingInvoiceService.getBillingInvoice(id),
    enabled: !!id,
    retry: 1,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}
