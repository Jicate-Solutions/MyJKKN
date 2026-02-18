'use client';

/**
 * Solutions Hub - Products & TRL Hooks
 * Purpose: React Query hooks for products CRUD, TRL management,
 *          validations, and RDIF readiness tracking
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  productsService,
  PRODUCT_STATUSES,
  TRL_LEVELS,
  DOMAIN_LABELS,
  SECTOR_LABELS,
  PATENT_STATUS_LABELS,
  VALIDATION_TYPE_LABELS,
  type ProductFilters as ServiceProductFilters,
  type ProductWithValidations,
  type UpdateProductInput as ServiceUpdateProductInput,
  type CreateProductInput as ServiceCreateProductInput,
  type CreateValidationInput as ServiceCreateValidationInput,
  type UpdateValidationInput as ServiceUpdateValidationInput,
  type UpdatePrerequisiteInput as ServiceUpdatePrerequisiteInput,
  type SHProduct,
  type SHProductValidation,
  type SHRDIFPrerequisite,
  type ProductStats,
  type ProductStatus,
  type ProductDomain,
  type RDIFSector,
  type PatentStatus,
  type ValidationType,
  type ValidationStatus,
} from '@/lib/services/solutions/products-service';
import {
  rdifService,
  RDIF_PREREQUISITE_KEYS,
  BRIDGE_YEAR_THRESHOLDS,
  type RDIFReadinessResult,
  type ThreeYearBridgeStatus,
  type RDIFMilestone,
} from '@/lib/services/solutions/rdif-service';

// ============================================
// RE-EXPORT TYPES & CONSTANTS
// ============================================

export type {
  ProductWithValidations,
  SHProduct,
  SHProductValidation,
  SHRDIFPrerequisite,
  ProductStats,
  ProductStatus,
  ProductDomain,
  RDIFSector,
  PatentStatus,
  ValidationType,
  ValidationStatus,
  RDIFReadinessResult,
  ThreeYearBridgeStatus,
  RDIFMilestone,
};

export {
  PRODUCT_STATUSES,
  TRL_LEVELS,
  DOMAIN_LABELS,
  SECTOR_LABELS,
  PATENT_STATUS_LABELS,
  VALIDATION_TYPE_LABELS,
  RDIF_PREREQUISITE_KEYS,
  BRIDGE_YEAR_THRESHOLDS,
};

export interface ProductFilters extends ServiceProductFilters {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface CreateProductInput {
  title: string;
  description?: string;
  current_trl?: number;
  target_trl?: number;
  originating_solution_ids?: string[];
  lead_department_id?: string;
  domain?: ProductDomain;
  sector?: RDIFSector;
  patent_status?: PatentStatus;
  status?: ProductStatus;
  development_budget?: number;
  tags?: string[];
  notes?: string;
  created_by?: string;
}

export interface UpdateProductInput extends ServiceUpdateProductInput {}

export interface CreateValidationInput {
  product_id: string;
  trl_level: number;
  validation_type: ValidationType;
  title: string;
  evidence_description?: string;
  evidence_url?: string;
  validated_by?: string;
  validator_affiliation?: string;
  is_external?: boolean;
  validation_date?: string;
  created_by?: string;
}

export interface UpdateValidationInput extends ServiceUpdateValidationInput {}

export interface UpdatePrerequisiteInput extends ServiceUpdatePrerequisiteInput {}

// ============================================
// QUERY HOOKS - PRODUCTS
// ============================================

/**
 * Fetch all products with optional filters
 */
export function useProducts(filters?: ProductFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.products.list(filters),
    queryFn: () => productsService.getProducts(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single product by ID with validations
 */
export function useProduct(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.products.detail(id),
    queryFn: () => productsService.getProductById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch product statistics (dashboard data)
 */
export function useProductStats() {
  return useQuery({
    queryKey: solutionsHubKeys.products.stats(),
    queryFn: () => productsService.getProductStats(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch products with retained IP (originating from client solutions)
 */
export function useRetainedIPSolutions() {
  return useQuery({
    queryKey: solutionsHubKeys.products.retainedIP(),
    queryFn: () => productsService.getRetainedIPSolutions(),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch TRL history for a specific product
 */
export function useTRLHistory(productId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.products.trlHistory(productId),
    queryFn: () => productsService.getTRLHistory(productId),
    enabled: !!productId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// QUERY HOOKS - VALIDATIONS
// ============================================

/**
 * Fetch validations for a specific product
 */
export function useProductValidations(productId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.products.validations(productId),
    queryFn: () => productsService.getValidations(productId),
    enabled: !!productId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// QUERY HOOKS - RDIF
// ============================================

/**
 * Fetch the 9 RDIF prerequisites with status
 */
export function useRDIFPrerequisites() {
  return useQuery({
    queryKey: solutionsHubKeys.products.rdifPrerequisites(),
    queryFn: () => productsService.getPrerequisites(),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch comprehensive RDIF readiness score with breakdown
 */
export function useRDIFReadinessScore() {
  return useQuery({
    queryKey: solutionsHubKeys.products.rdifScore(),
    queryFn: () => rdifService.calculateRDIFScore(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch the 3-year bridge plan status
 */
export function useThreeYearBridgeStatus() {
  return useQuery({
    queryKey: solutionsHubKeys.products.bridgeStatus(),
    queryFn: () => rdifService.getThreeYearBridgeStatus(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch next RDIF milestones (unmet prerequisites by priority)
 */
export function useNextRDIFMilestones() {
  return useQuery({
    queryKey: solutionsHubKeys.products.nextMilestones(),
    queryFn: () => rdifService.getNextMilestones(),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS - PRODUCTS
// ============================================

/**
 * Create a new product
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      productsService.createProduct(input as ServiceCreateProductInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.products.all });
    },
  });
}

/**
 * Update an existing product
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      productsService.updateProduct(id, input),
    onSuccess: (data: SHProduct) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.products.all });
      if (data?.id) {
        queryClient.setQueryData(
          solutionsHubKeys.products.detail(data.id),
          (old: ProductWithValidations | undefined) => old ? { ...old, ...data } : data
        );
      }
    },
  });
}

/**
 * Delete a product
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productsService.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.products.all });
    },
  });
}

/**
 * Archive a product (soft delete)
 */
export function useArchiveProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productsService.archiveProduct(id),
    onSuccess: (data: SHProduct) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.products.all });
      if (data?.id) {
        queryClient.setQueryData(
          solutionsHubKeys.products.detail(data.id),
          (old: ProductWithValidations | undefined) => old ? { ...old, ...data } : data
        );
      }
    },
  });
}

/**
 * Update product status
 */
export function useUpdateProductStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProductStatus }) =>
      productsService.updateProductStatus(id, status),
    onSuccess: (data: SHProduct) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.products.all });
      if (data?.id) {
        queryClient.setQueryData(
          solutionsHubKeys.products.detail(data.id),
          (old: ProductWithValidations | undefined) => old ? { ...old, ...data } : data
        );
      }
    },
  });
}

// ============================================
// MUTATION HOOKS - TRL
// ============================================

/**
 * Update TRL level for a product
 */
export function useUpdateTRL() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      productId,
      newTRL,
      assessedBy,
    }: {
      productId: string;
      newTRL: number;
      assessedBy?: string;
    }) => productsService.updateTRL(productId, newTRL, assessedBy),
    onSuccess: (data: SHProduct) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.products.all });
      if (data?.id) {
        queryClient.setQueryData(
          solutionsHubKeys.products.detail(data.id),
          (old: ProductWithValidations | undefined) => old ? { ...old, ...data } : data
        );
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.products.trlHistory(data.id),
        });
      }
    },
  });
}

// ============================================
// MUTATION HOOKS - VALIDATIONS
// ============================================

/**
 * Add validation evidence for a product
 */
export function useAddValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateValidationInput) =>
      productsService.addValidation(input as ServiceCreateValidationInput),
    onSuccess: (data: SHProductValidation) => {
      if (data?.product_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.products.validations(data.product_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.products.detail(data.product_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.products.trlHistory(data.product_id),
        });
      }
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.products.all });
    },
  });
}

/**
 * Update a validation
 */
export function useUpdateValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateValidationInput }) =>
      productsService.updateValidation(id, input),
    onSuccess: (data: SHProductValidation) => {
      if (data?.product_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.products.validations(data.product_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.products.detail(data.product_id),
        });
      }
    },
  });
}

/**
 * Delete a validation
 */
export function useDeleteValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, productId }: { id: string; productId: string }) =>
      productsService.deleteValidation(id),
    onSuccess: (_data: void, variables: { id: string; productId: string }) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.products.validations(variables.productId),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.products.detail(variables.productId),
      });
    },
  });
}

// ============================================
// MUTATION HOOKS - RDIF PREREQUISITES
// ============================================

/**
 * Update a single RDIF prerequisite
 */
export function useUpdatePrerequisite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: UpdatePrerequisiteInput }) =>
      productsService.updatePrerequisite(key, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.products.rdifPrerequisites(),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.products.rdifScore(),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.products.bridgeStatus(),
      });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.products.nextMilestones(),
      });
    },
  });
}
