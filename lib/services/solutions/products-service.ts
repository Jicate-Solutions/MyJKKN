// lib/services/solutions/products-service.ts
// CRUD operations for sh_products, sh_product_validations tables
// TRL (Technology Readiness Level) & Product Development Tracking

import { BaseService, type BaseListResponse } from '../base-service';
import type { PaginationParams } from './types';

// ============================================
// TYPES
// Product/TRL-specific types are defined locally here because they are
// unique to the products & RDIF module (not shared with general solutions types).
// General solutions types live in @/types/solutions and ./types.
// ============================================

export type ProductDomain =
  | 'health_tech'
  | 'edu_tech'
  | 'pharma_tech'
  | 'dental_tech'
  | 'nursing_tech'
  | 'construction_tech'
  | 'other';

export type RDIFSector =
  | 'health_technologies'
  | 'digital_economy'
  | 'energy'
  | 'agriculture'
  | 'defence'
  | 'space'
  | 'telecom';

export type PatentStatus =
  | 'none'
  | 'provisional_filed'
  | 'full_filed'
  | 'granted'
  | 'rejected';

export type ProductStatus =
  | 'concept'
  | 'prototype'
  | 'lab_validated'
  | 'field_validated'
  | 'market_ready'
  | 'deployed'
  | 'archived';

export type ValidationStatus = 'pending' | 'verified' | 'rejected';

export type ValidationType =
  | 'internal_review'
  | 'lab_test'
  | 'field_test'
  | 'external_review'
  | 'user_validation'
  | 'publication'
  | 'patent';

export interface SHProduct {
  id: string;
  product_code: string;
  title: string;
  description: string | null;
  current_trl: number;
  target_trl: number | null;
  trl_assessed_at: string | null;
  trl_assessed_by: string | null;
  originating_solution_ids: string[] | null;
  lead_department_id: string | null;
  domain: ProductDomain | null;
  sector: RDIFSector | null;
  patent_status: PatentStatus;
  patent_number: string | null;
  patent_filed_at: string | null;
  status: ProductStatus;
  rdif_readiness_score: number;
  development_budget: number;
  development_spent: number;
  tags: string[] | null;
  notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SHProductValidation {
  id: string;
  product_id: string;
  trl_level: number;
  validation_type: ValidationType;
  title: string;
  evidence_description: string | null;
  evidence_url: string | null;
  validated_by: string | null;
  validator_affiliation: string | null;
  is_external: boolean;
  validation_date: string | null;
  status: ValidationStatus;
  created_at: string;
  created_by: string | null;
}

export interface SHRDIFPrerequisite {
  id: string;
  prerequisite_key: string;
  label: string;
  description: string | null;
  is_met: boolean;
  evidence: string | null;
  evidence_url: string | null;
  target_date: string | null;
  updated_at: string;
  updated_by: string | null;
}

// ============================================
// FILTER & INPUT TYPES
// ============================================

export interface ProductFilters extends PaginationParams {
  status?: ProductStatus;
  domain?: ProductDomain;
  sector?: RDIFSector;
  min_trl?: number;
  max_trl?: number;
  patent_status?: PatentStatus;
  lead_department_id?: string;
}

export interface ProductWithValidations extends SHProduct {
  validations?: SHProductValidation[];
  department?: {
    id: string;
    name: string;
    code: string;
  };
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

export interface UpdateProductInput {
  title?: string;
  description?: string;
  current_trl?: number;
  target_trl?: number;
  originating_solution_ids?: string[];
  lead_department_id?: string;
  domain?: ProductDomain;
  sector?: RDIFSector;
  patent_status?: PatentStatus;
  patent_number?: string;
  patent_filed_at?: string;
  status?: ProductStatus;
  development_budget?: number;
  development_spent?: number;
  tags?: string[];
  notes?: string;
  metadata?: Record<string, any>;
}

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

export interface UpdateValidationInput {
  title?: string;
  evidence_description?: string;
  evidence_url?: string;
  validated_by?: string;
  validator_affiliation?: string;
  is_external?: boolean;
  validation_date?: string;
  status?: ValidationStatus;
}

export interface UpdatePrerequisiteInput {
  is_met?: boolean;
  evidence?: string;
  evidence_url?: string;
  target_date?: string;
  updated_by?: string;
}

export interface ProductStats {
  total: number;
  byStatus: Record<ProductStatus, number>;
  byDomain: Record<ProductDomain, number>;
  averageTRL: number;
  totalBudget: number;
  totalSpent: number;
}

// ============================================
// CONSTANTS
// ============================================

export const PRODUCT_STATUSES: Array<{ value: ProductStatus; label: string; description: string }> = [
  { value: 'concept', label: 'Concept', description: 'Initial idea or concept phase' },
  { value: 'prototype', label: 'Prototype', description: 'Working prototype developed' },
  { value: 'lab_validated', label: 'Lab Validated', description: 'Validated in laboratory environment' },
  { value: 'field_validated', label: 'Field Validated', description: 'Validated in field/real environment' },
  { value: 'market_ready', label: 'Market Ready', description: 'Ready for market deployment' },
  { value: 'deployed', label: 'Deployed', description: 'Deployed and in use' },
  { value: 'archived', label: 'Archived', description: 'No longer actively developed' },
];

export const TRL_LEVELS: Array<{ level: number; label: string; description: string }> = [
  { level: 1, label: 'TRL 1', description: 'Basic principles observed' },
  { level: 2, label: 'TRL 2', description: 'Technology concept formulated' },
  { level: 3, label: 'TRL 3', description: 'Experimental proof of concept' },
  { level: 4, label: 'TRL 4', description: 'Technology validated in lab' },
  { level: 5, label: 'TRL 5', description: 'Technology validated in relevant environment' },
  { level: 6, label: 'TRL 6', description: 'Technology demonstrated in relevant environment' },
  { level: 7, label: 'TRL 7', description: 'System prototype demonstration in operational environment' },
  { level: 8, label: 'TRL 8', description: 'System complete and qualified' },
  { level: 9, label: 'TRL 9', description: 'Actual system proven in operational environment' },
];

export const DOMAIN_LABELS: Record<ProductDomain, string> = {
  health_tech: 'Health Tech',
  edu_tech: 'Edu Tech',
  pharma_tech: 'Pharma Tech',
  dental_tech: 'Dental Tech',
  nursing_tech: 'Nursing Tech',
  construction_tech: 'Construction Tech',
  other: 'Other',
};

export const PATENT_STATUS_LABELS: Record<PatentStatus, string> = {
  none: 'None',
  provisional_filed: 'Provisional Filed',
  full_filed: 'Full Filed',
  granted: 'Granted',
  rejected: 'Rejected',
};

export const VALIDATION_TYPE_LABELS: Record<ValidationType, string> = {
  internal_review: 'Internal Review',
  lab_test: 'Lab Test',
  field_test: 'Field Test',
  external_review: 'External Review',
  user_validation: 'User Validation',
  publication: 'Publication',
  patent: 'Patent',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeSearchString(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

// ============================================
// SERVICE CLASS
// ============================================

export class ProductsService extends BaseService {
  // ============================================
  // PRODUCTS CRUD
  // ============================================

  /**
   * Generate product code in format: JKKN-PRD-YYYY-XXX
   */
  private static async generateProductCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JKKN-PRD-${year}-`;

    const { data, error } = await this.supabase
      .from('sh_products')
      .select('product_code')
      .like('product_code', `${prefix}%`)
      .order('product_code', { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastCode = data[0].product_code;
      const lastNumber = parseInt(lastCode.replace(prefix, ''), 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${String(nextNumber).padStart(3, '0')}`;
  }

  /**
   * Get all products with optional filters and pagination
   */
  static async getProducts(
    filters?: ProductFilters
  ): Promise<BaseListResponse<ProductWithValidations>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('sh_products')
      .select(
        `
        *,
        department:departments(id, name:department_name, code:department_code)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.domain) {
      query = query.eq('domain', filters.domain);
    }

    if (filters?.sector) {
      query = query.eq('sector', filters.sector);
    }

    if (filters?.patent_status) {
      query = query.eq('patent_status', filters.patent_status);
    }

    if (filters?.lead_department_id) {
      query = query.eq('lead_department_id', filters.lead_department_id);
    }

    if (filters?.min_trl !== undefined) {
      query = query.gte('current_trl', filters.min_trl);
    }

    if (filters?.max_trl !== undefined) {
      query = query.lte('current_trl', filters.max_trl);
    }

    if (filters?.search) {
      const escaped = escapeSearchString(filters.search);
      query = query.or(`title.ilike.%${escaped}%,product_code.ilike.%${escaped}%`);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch products: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as ProductWithValidations[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single product by ID with validations
   */
  static async getProductById(id: string): Promise<ProductWithValidations | null> {
    const { data, error } = await this.supabase
      .from('sh_products')
      .select(
        `
        *,
        department:departments(id, name:department_name, code:department_code)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch product: ${error.message}`);
    }

    // Get validations
    const { data: validations } = await this.supabase
      .from('sh_product_validations')
      .select('*')
      .eq('product_id', id)
      .order('trl_level', { ascending: true })
      .order('created_at', { ascending: false });

    return {
      ...data,
      validations: validations || [],
    } as ProductWithValidations;
  }

  /**
   * Create a new product
   */
  static async createProduct(input: CreateProductInput): Promise<SHProduct> {
    const productCode = await this.generateProductCode();

    const { data, error } = await this.supabase
      .from('sh_products')
      .insert({
        product_code: productCode,
        title: input.title,
        description: input.description || null,
        current_trl: input.current_trl || 1,
        target_trl: input.target_trl || null,
        originating_solution_ids: input.originating_solution_ids || null,
        lead_department_id: input.lead_department_id || null,
        domain: input.domain || null,
        sector: input.sector || null,
        patent_status: input.patent_status || 'none',
        status: input.status || 'concept',
        development_budget: input.development_budget || 0,
        development_spent: 0,
        rdif_readiness_score: 0,
        tags: input.tags || null,
        notes: input.notes || null,
        metadata: {},
        created_by: input.created_by || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create product: ${error.message}`);
    return data as SHProduct;
  }

  /**
   * Update an existing product
   */
  static async updateProduct(id: string, input: UpdateProductInput): Promise<SHProduct> {
    const { data, error } = await this.supabase
      .from('sh_products')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update product: ${error.message}`);
    return data as SHProduct;
  }

  /**
   * Delete a product (hard delete - use updateProduct with status='archived' for soft delete)
   */
  static async deleteProduct(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_products').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete product: ${error.message}`);
  }

  /**
   * Archive a product (soft delete)
   */
  static async archiveProduct(id: string): Promise<SHProduct> {
    return this.updateProduct(id, { status: 'archived' });
  }

  // ============================================
  // TRL MANAGEMENT
  // ============================================

  /**
   * Update the TRL level for a product
   */
  static async updateTRL(
    productId: string,
    newTRL: number,
    assessedBy?: string
  ): Promise<SHProduct> {
    if (newTRL < 1 || newTRL > 9) {
      throw new Error('TRL level must be between 1 and 9');
    }

    const { data, error } = await this.supabase
      .from('sh_products')
      .update({
        current_trl: newTRL,
        trl_assessed_at: new Date().toISOString(),
        trl_assessed_by: assessedBy || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update TRL: ${error.message}`);
    return data as SHProduct;
  }

  /**
   * Get TRL history for a product (via validations)
   */
  static async getTRLHistory(productId: string): Promise<SHProductValidation[]> {
    const { data, error } = await this.supabase
      .from('sh_product_validations')
      .select('*')
      .eq('product_id', productId)
      .order('trl_level', { ascending: true })
      .order('validation_date', { ascending: true });

    if (error) throw new Error(`Failed to fetch TRL history: ${error.message}`);
    return (data || []) as SHProductValidation[];
  }

  // ============================================
  // VALIDATIONS
  // ============================================

  /**
   * Get validations for a product
   */
  static async getValidations(productId: string): Promise<SHProductValidation[]> {
    const { data, error } = await this.supabase
      .from('sh_product_validations')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch validations: ${error.message}`);
    return (data || []) as SHProductValidation[];
  }

  /**
   * Add a new TRL validation evidence
   */
  static async addValidation(input: CreateValidationInput): Promise<SHProductValidation> {
    if (input.trl_level < 1 || input.trl_level > 9) {
      throw new Error('TRL level must be between 1 and 9');
    }

    const { data, error } = await this.supabase
      .from('sh_product_validations')
      .insert({
        product_id: input.product_id,
        trl_level: input.trl_level,
        validation_type: input.validation_type,
        title: input.title,
        evidence_description: input.evidence_description || null,
        evidence_url: input.evidence_url || null,
        validated_by: input.validated_by || null,
        validator_affiliation: input.validator_affiliation || null,
        is_external: input.is_external || false,
        validation_date: input.validation_date || null,
        status: 'pending' as ValidationStatus,
        created_by: input.created_by || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add validation: ${error.message}`);
    return data as SHProductValidation;
  }

  /**
   * Update a validation
   */
  static async updateValidation(
    id: string,
    input: UpdateValidationInput
  ): Promise<SHProductValidation> {
    const { data, error } = await this.supabase
      .from('sh_product_validations')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update validation: ${error.message}`);
    return data as SHProductValidation;
  }

  /**
   * Delete a validation
   */
  static async deleteValidation(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('sh_product_validations')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete validation: ${error.message}`);
  }

  // ============================================
  // RDIF PREREQUISITES
  // ============================================

  /**
   * Get all 9 RDIF prerequisites with status
   */
  static async getPrerequisites(): Promise<SHRDIFPrerequisite[]> {
    const { data, error } = await this.supabase
      .from('sh_rdif_prerequisites')
      .select('*')
      .order('prerequisite_key', { ascending: true });

    if (error) throw new Error(`Failed to fetch RDIF prerequisites: ${error.message}`);
    return (data || []) as SHRDIFPrerequisite[];
  }

  /**
   * Update a single RDIF prerequisite
   */
  static async updatePrerequisite(
    key: string,
    input: UpdatePrerequisiteInput
  ): Promise<SHRDIFPrerequisite> {
    const { data, error } = await this.supabase
      .from('sh_rdif_prerequisites')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('prerequisite_key', key)
      .select()
      .single();

    if (error) throw new Error(`Failed to update RDIF prerequisite: ${error.message}`);
    return data as SHRDIFPrerequisite;
  }

  /**
   * Calculate overall RDIF readiness score (count of is_met)
   */
  static async getRDIFReadinessScore(): Promise<{ score: number; total: number; prerequisites: SHRDIFPrerequisite[] }> {
    const prerequisites = await this.getPrerequisites();
    const score = prerequisites.filter((p) => p.is_met).length;
    return {
      score,
      total: prerequisites.length,
      prerequisites,
    };
  }

  // ============================================
  // DASHBOARD STATS
  // ============================================

  /**
   * Get product statistics for dashboard
   */
  static async getProductStats(): Promise<ProductStats> {
    const { data, error } = await this.supabase
      .from('sh_products')
      .select('status, domain, current_trl, development_budget, development_spent');

    if (error) throw new Error(`Failed to fetch product stats: ${error.message}`);

    const allStatuses: ProductStatus[] = [
      'concept',
      'prototype',
      'lab_validated',
      'field_validated',
      'market_ready',
      'deployed',
      'archived',
    ];

    const allDomains: ProductDomain[] = [
      'health_tech',
      'edu_tech',
      'pharma_tech',
      'dental_tech',
      'nursing_tech',
      'construction_tech',
      'other',
    ];

    const byStatus = allStatuses.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<ProductStatus, number>);

    const byDomain = allDomains.reduce((acc, domain) => {
      acc[domain] = 0;
      return acc;
    }, {} as Record<ProductDomain, number>);

    let totalTRL = 0;
    let totalBudget = 0;
    let totalSpent = 0;
    const activeProducts = data?.filter((p) => p.status !== 'archived') || [];

    data?.forEach((product) => {
      if (product.status) {
        byStatus[product.status as ProductStatus]++;
      }
      if (product.domain) {
        byDomain[product.domain as ProductDomain]++;
      }
      totalBudget += Number(product.development_budget) || 0;
      totalSpent += Number(product.development_spent) || 0;
    });

    // Only accumulate TRL from active (non-archived) products for average calculation
    activeProducts.forEach((product) => {
      totalTRL += product.current_trl || 0;
    });

    return {
      total: data?.length || 0,
      byStatus,
      byDomain,
      averageTRL: activeProducts.length > 0
        ? Math.round((totalTRL / activeProducts.length) * 10) / 10
        : 0,
      totalBudget,
      totalSpent,
    };
  }

  /**
   * Get solutions where retained_ip = true (products originating from client solutions)
   */
  static async getRetainedIPSolutions(): Promise<SHProduct[]> {
    const { data, error } = await this.supabase
      .from('sh_products')
      .select('*')
      .not('originating_solution_ids', 'is', null)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch retained IP solutions: ${error.message}`);
    return (data || []) as SHProduct[];
  }

  /**
   * Update product status
   */
  static async updateProductStatus(id: string, status: ProductStatus): Promise<SHProduct> {
    const { data, error } = await this.supabase
      .from('sh_products')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update product status: ${error.message}`);
    return data as SHProduct;
  }
}

// Export singleton instance methods
export const productsService = {
  // Products CRUD
  getProducts: ProductsService.getProducts.bind(ProductsService),
  getProductById: ProductsService.getProductById.bind(ProductsService),
  createProduct: ProductsService.createProduct.bind(ProductsService),
  updateProduct: ProductsService.updateProduct.bind(ProductsService),
  deleteProduct: ProductsService.deleteProduct.bind(ProductsService),
  archiveProduct: ProductsService.archiveProduct.bind(ProductsService),
  updateProductStatus: ProductsService.updateProductStatus.bind(ProductsService),
  // TRL Management
  updateTRL: ProductsService.updateTRL.bind(ProductsService),
  getTRLHistory: ProductsService.getTRLHistory.bind(ProductsService),
  // Validations
  getValidations: ProductsService.getValidations.bind(ProductsService),
  addValidation: ProductsService.addValidation.bind(ProductsService),
  updateValidation: ProductsService.updateValidation.bind(ProductsService),
  deleteValidation: ProductsService.deleteValidation.bind(ProductsService),
  // RDIF Prerequisites
  getPrerequisites: ProductsService.getPrerequisites.bind(ProductsService),
  updatePrerequisite: ProductsService.updatePrerequisite.bind(ProductsService),
  getRDIFReadinessScore: ProductsService.getRDIFReadinessScore.bind(ProductsService),
  // Dashboard Stats
  getProductStats: ProductsService.getProductStats.bind(ProductsService),
  getRetainedIPSolutions: ProductsService.getRetainedIPSolutions.bind(ProductsService),
  // Constants
  PRODUCT_STATUSES,
  TRL_LEVELS,
  DOMAIN_LABELS,
  PATENT_STATUS_LABELS,
  VALIDATION_TYPE_LABELS,
};
