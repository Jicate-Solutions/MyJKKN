'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImsSupplierService } from '@/lib/services/ims/supplier-service';
import { ImsUnitService } from '@/lib/services/ims/unit-service';
import { ImsUnitConversionService } from '@/lib/services/ims/unit-conversion-service';
import type {
  ImsSupplierFilters,
  CreateImsSupplierDto,
  UpdateImsSupplierDto,
  ImsUnitFilters,
  CreateImsUnitDto,
  UpdateImsUnitDto,
  ImsUnitConversionFilters,
  CreateImsUnitConversionDto,
  UpdateImsUnitConversionDto,
} from '@/types/ims';

// ─── Suppliers ───────────────────────────────────────────

export function useImsSuppliers(filters: ImsSupplierFilters) {
  return useQuery({
    queryKey: ['ims-suppliers', filters],
    queryFn: () => ImsSupplierService.getSuppliers(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 10 * 60 * 1000,
  });
}

export function useImsSuppliersForSelect(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-suppliers-select', storeId],
    queryFn: () => ImsSupplierService.getSuppliersForSelect(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateImsSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateImsSupplierDto) => ImsSupplierService.createSupplier(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['ims-suppliers-select'] });
    },
  });
}

export function useUpdateImsSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateImsSupplierDto }) =>
      ImsSupplierService.updateSupplier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-suppliers'] });
    },
  });
}

export function useDeleteImsSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsSupplierService.deleteSupplier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['ims-suppliers-select'] });
    },
  });
}

export function useToggleImsSupplierActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      ImsSupplierService.toggleSupplierActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-suppliers'] });
    },
  });
}

// ─── Units ───────────────────────────────────────────────

export function useImsUnits(filters?: ImsUnitFilters) {
  return useQuery({
    queryKey: ['ims-units', filters],
    queryFn: () => ImsUnitService.getUnits(filters),
    staleTime: 10 * 60 * 1000,
  });
}

export function useImsUnitsForSelect() {
  return useQuery({
    queryKey: ['ims-units-select'],
    queryFn: () => ImsUnitService.getUnitsForSelect(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateImsUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateImsUnitDto) => ImsUnitService.createUnit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-units'] });
      queryClient.invalidateQueries({ queryKey: ['ims-units-select'] });
    },
  });
}

export function useUpdateImsUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateImsUnitDto }) =>
      ImsUnitService.updateUnit(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-units'] });
    },
  });
}

export function useDeleteImsUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsUnitService.deleteUnit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-units'] });
      queryClient.invalidateQueries({ queryKey: ['ims-units-select'] });
    },
  });
}

// ─── Unit Conversions ────────────────────────────────────

export function useImsUnitConversions(filters?: ImsUnitConversionFilters) {
  return useQuery({
    queryKey: ['ims-unit-conversions', filters],
    queryFn: () => ImsUnitConversionService.getConversions(filters),
    enabled: !!(filters?.store_id),
    staleTime: 30 * 60 * 1000,
  });
}

export function useCreateImsUnitConversion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateImsUnitConversionDto) =>
      ImsUnitConversionService.createConversion(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-unit-conversions'] });
    },
  });
}

export function useUpdateImsUnitConversion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateImsUnitConversionDto }) =>
      ImsUnitConversionService.updateConversion(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-unit-conversions'] });
    },
  });
}

export function useDeleteImsUnitConversion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ImsUnitConversionService.deleteConversion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-unit-conversions'] });
    },
  });
}
