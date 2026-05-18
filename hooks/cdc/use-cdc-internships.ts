'use client';

// hooks/cdc/use-cdc-internships.ts
// CDC Sprint 4 — React hook for corporate internship operations

import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { CdcInternshipService } from '@/lib/services/cdc/internship-service';
import type {
  InternshipAssignmentDetail,
  CdcInternshipFilters,
  CdcInternshipListResponse,
  CreateCorporateInternshipPayload,
  IssueCertificatePayload,
} from '@/types/cdc/internships';

export function useCdcInternships(initialFilters: CdcInternshipFilters = {}) {
  const [result, setResult] = useState<CdcInternshipListResponse>({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  const [filters, setFilters] = useState<CdcInternshipFilters>(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInternships = useCallback(async (overrides?: CdcInternshipFilters) => {
    setLoading(true);
    setError(null);
    try {
      const merged = { ...filters, ...overrides };
      const res = await CdcInternshipService.listInternships(merged);
      setResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load internships';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const updateFilters = useCallback((patch: Partial<CdcInternshipFilters>) => {
    setFilters(prev => ({ ...prev, ...patch, page: 1 }));
  }, []);

  return {
    internships: result.data,
    total: result.total,
    page: result.page,
    limit: result.limit,
    filters,
    loading,
    error,
    fetchInternships,
    updateFilters,
  };
}

export function useCdcInternshipDetail(id: string | null) {
  const [internship, setInternship] = useState<InternshipAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await CdcInternshipService.getInternship(id);
      setInternship(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load internship';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const updateStatus = useCallback(async (status: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const updated = await CdcInternshipService.updateStatus(id, status);
      setInternship(updated);
      toast.success(`Status updated to ${status}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const issueCertificate = useCallback(async (
    payload: IssueCertificatePayload,
    institutionId: string
  ) => {
    if (!id) return;
    setLoading(true);
    try {
      await CdcInternshipService.issueCertificate(id, payload, institutionId);
      // Reload to get updated certificate data
      const updated = await CdcInternshipService.getInternship(id);
      setInternship(updated);
      toast.success('Certificate issued successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to issue certificate';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  return {
    internship,
    loading,
    error,
    fetchDetail,
    updateStatus,
    issueCertificate,
  };
}

export function useCdcInternshipCreate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createInternship = useCallback(async (
    payload: CreateCorporateInternshipPayload,
    institutionId: string
  ): Promise<InternshipAssignmentDetail | null> => {
    setLoading(true);
    setError(null);
    try {
      const created = await CdcInternshipService.createCorporateInternship(payload, institutionId);
      toast.success('Corporate internship created');
      return created;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create internship';
      setError(msg);
      toast.error(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createInternship, loading, error };
}
