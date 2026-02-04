// lib/services/solutions/revenue-split-service.ts
// CRUD operations for sh_revenue_split_models and revenue split calculations

import { BaseService } from '../base-service';
import type { RevenueSplitModel, SolutionType, CohortTrack } from './types';

// ============================================
// TYPES
// ============================================

export type SplitType = 'software' | 'training_track_a' | 'training_track_b' | 'content';

export interface SplitConfig {
  [key: string]: number;
}

export interface CreateRevenueSplitModelInput {
  solution_type: SplitType;
  name: string;
  description?: string;
  split_config: SplitConfig;
  is_default?: boolean;
}

export interface UpdateRevenueSplitModelInput {
  name?: string;
  description?: string;
  split_config?: SplitConfig;
  is_default?: boolean;
}

export interface CalculatedSplit {
  recipientType: string;
  recipientName: string;
  percentage: number;
  amount: number;
  departmentId?: string;
  recipientId?: string;
}

export interface RevenueSplitCalculation {
  splits: CalculatedSplit[];
  totalAmount: number;
  hodDiscountApplied: number;
  referralBonusApplied: number;
}

// ============================================
// CONSTANTS - Default Revenue Split Configurations
// ============================================

/**
 * Default revenue split configurations by solution type
 *
 * Software: 40% JICATE, 40% Department, 20% Institution
 * Training Track A: 60% Cohort, 20% Council, 20% Infrastructure
 * Training Track B: 30% Cohort, 20% Dept, 30% JICATE, 20% Institution
 * Content: 60% Learners, 20% Council, 20% Infrastructure
 */
export const DEFAULT_REVENUE_SPLITS = {
  software: {
    jicate: 40,
    department: 40,
    institution: 20,
  },
  training_track_a: {
    cohort: 60,
    council: 20,
    infrastructure: 20,
  },
  training_track_b: {
    cohort: 30,
    department: 20,
    jicate: 30,
    institution: 20,
  },
  content: {
    learners: 60,
    council: 20,
    infrastructure: 20,
  },
} as const;

/**
 * Human-readable names for recipient types
 */
export const RECIPIENT_DISPLAY_NAMES: Record<string, string> = {
  jicate: 'JICATE',
  department: 'Department',
  institution: 'Institution',
  cohort: 'Cohort Members',
  council: 'Council',
  infrastructure: 'Infrastructure',
  learners: 'Production Learners',
  referral_bonus: 'Referral Bonus',
};

// ============================================
// SERVICE CLASS
// ============================================

export class RevenueSplitService extends BaseService {
  // ============================================
  // REVENUE SPLIT MODEL CRUD OPERATIONS
  // ============================================

  /**
   * Get all revenue split models
   */
  static async getRevenueSplitModels(): Promise<RevenueSplitModel[]> {
    const { data, error } = await (this.supabase as any).from('sh_revenue_split_models')
      .select('*')
      .order('solution_type');

    if (error) throw new Error(`Failed to fetch revenue split models: ${error.message}`);
    return data as RevenueSplitModel[];
  }

  /**
   * Get a single revenue split model by ID
   */
  static async getRevenueSplitModelById(id: string): Promise<RevenueSplitModel | null> {
    const { data, error } = await (this.supabase as any).from('sh_revenue_split_models')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch revenue split model: ${error.message}`);
    }

    return data as RevenueSplitModel;
  }

  /**
   * Get the default revenue split model for a solution type
   */
  static async getDefaultModelForType(solutionType: SplitType): Promise<RevenueSplitModel | null> {
    const { data, error } = await (this.supabase as any).from('sh_revenue_split_models')
      .select('*')
      .eq('solution_type', solutionType)
      .eq('is_default', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No default found - return null (caller can use DEFAULT_REVENUE_SPLITS)
        return null;
      }
      throw new Error(`Failed to fetch default split model: ${error.message}`);
    }

    return data as RevenueSplitModel;
  }

  /**
   * Get revenue split model by solution type (default or first available)
   */
  static async getModelBySolutionType(solutionType: SplitType): Promise<RevenueSplitModel | null> {
    // First try to get the default
    const defaultModel = await this.getDefaultModelForType(solutionType);
    if (defaultModel) return defaultModel;

    // If no default, get the first one for this type
    const { data, error } = await (this.supabase as any).from('sh_revenue_split_models')
      .select('*')
      .eq('solution_type', solutionType)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch split model: ${error.message}`);
    }

    return data as RevenueSplitModel;
  }

  /**
   * Create a new revenue split model
   */
  static async createRevenueSplitModel(input: CreateRevenueSplitModelInput): Promise<RevenueSplitModel> {
    // Validate that percentages sum to 100
    const total = Object.values(input.split_config).reduce((sum, val) => sum + val, 0);
    if (total !== 100) {
      throw new Error(`Revenue split percentages must total 100%, got ${total}%`);
    }

    // If setting as default, unset other defaults for this solution type
    if (input.is_default) {
      await (this.supabase as any).from('sh_revenue_split_models')
        .update({ is_default: false })
        .eq('solution_type', input.solution_type);
    }

    const { data, error } = await (this.supabase as any).from('sh_revenue_split_models')
      .insert({
        solution_type: input.solution_type,
        name: input.name,
        description: input.description,
        split_config: input.split_config,
        is_default: input.is_default || false,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create revenue split model: ${error.message}`);
    return data as RevenueSplitModel;
  }

  /**
   * Update a revenue split model
   */
  static async updateRevenueSplitModel(
    id: string,
    input: UpdateRevenueSplitModelInput
  ): Promise<RevenueSplitModel> {
    // Validate percentages if split_config is being updated
    if (input.split_config) {
      const total = Object.values(input.split_config).reduce((sum, val) => sum + val, 0);
      if (total !== 100) {
        throw new Error(`Revenue split percentages must total 100%, got ${total}%`);
      }
    }

    // If setting as default, unset other defaults for this solution type
    if (input.is_default) {
      const currentModel = await this.getRevenueSplitModelById(id);
      if (currentModel) {
        await (this.supabase as any).from('sh_revenue_split_models')
          .update({ is_default: false })
          .eq('solution_type', currentModel.solution_type)
          .neq('id', id);
      }
    }

    const { data, error } = await (this.supabase as any).from('sh_revenue_split_models')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update revenue split model: ${error.message}`);
    return data as RevenueSplitModel;
  }

  /**
   * Delete a revenue split model
   */
  static async deleteRevenueSplitModel(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_revenue_split_models')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete revenue split model: ${error.message}`);
  }

  // ============================================
  // REVENUE SPLIT CALCULATIONS
  // ============================================

  /**
   * Determine split type based on solution type and training track
   */
  static getSplitType(solutionType: SolutionType, track?: CohortTrack | null): SplitType {
    if (solutionType === 'software') return 'software';
    if (solutionType === 'content') return 'content';
    if (solutionType === 'training') {
      return track === 'track_a' ? 'training_track_a' : 'training_track_b';
    }
    return 'software'; // Default fallback
  }

  /**
   * Get the split configuration for a given type
   * Uses database model if available, otherwise falls back to defaults
   */
  static async getSplitConfig(splitType: SplitType): Promise<SplitConfig> {
    const model = await this.getModelBySolutionType(splitType);
    if (model?.split_config) {
      return model.split_config as SplitConfig;
    }
    return { ...DEFAULT_REVENUE_SPLITS[splitType] };
  }

  /**
   * Calculate revenue splits for a given amount
   *
   * @param amount - Total amount to split
   * @param splitType - Type of split to use
   * @param options - Optional adjustments (HOD discount, referral bonus)
   * @returns Calculated splits with amounts
   */
  static async calculateRevenueSplit(
    amount: number,
    splitType: SplitType,
    options?: {
      hodDiscount?: number;      // HOD discount percentage (0-10%)
      isFirstPhase?: boolean;    // Is this the first phase? (for referral bonus)
      hasReferral?: boolean;     // Does client have referral?
      departmentId?: string;     // Department for department share
      customSplitConfig?: SplitConfig; // Override split config
    }
  ): Promise<RevenueSplitCalculation> {
    // Get split config (use custom if provided, otherwise fetch from DB/defaults)
    const config = options?.customSplitConfig || await this.getSplitConfig(splitType);

    const splits: CalculatedSplit[] = [];
    let hodDiscountApplied = 0;
    let referralBonusApplied = 0;

    for (const [key, percentage] of Object.entries(config)) {
      let adjustedPercentage = percentage;
      let adjustedAmount = (amount * percentage) / 100;

      // Apply HOD discount (only from department share for software)
      if (
        key === 'department' &&
        options?.hodDiscount &&
        options.hodDiscount > 0 &&
        options.hodDiscount <= 10
      ) {
        hodDiscountApplied = (amount * options.hodDiscount) / 100;
        adjustedAmount -= hodDiscountApplied;
        adjustedPercentage = percentage - options.hodDiscount;
      }

      // Apply referral bonus (10% from department share on first phase)
      if (
        key === 'department' &&
        options?.isFirstPhase &&
        options?.hasReferral &&
        splitType === 'software'
      ) {
        referralBonusApplied = (amount * 10) / 100;
        adjustedAmount -= referralBonusApplied;
        adjustedPercentage -= 10;
      }

      splits.push({
        recipientType: key,
        recipientName: RECIPIENT_DISPLAY_NAMES[key] || key,
        percentage: adjustedPercentage,
        amount: Math.round(adjustedAmount * 100) / 100, // Round to 2 decimal places
        departmentId: key === 'department' ? options?.departmentId : undefined,
      });
    }

    // Add referral bonus as separate entry if applicable
    if (referralBonusApplied > 0) {
      splits.push({
        recipientType: 'referral_bonus',
        recipientName: RECIPIENT_DISPLAY_NAMES.referral_bonus,
        percentage: 10,
        amount: Math.round(referralBonusApplied * 100) / 100,
      });
    }

    return {
      splits,
      totalAmount: amount,
      hodDiscountApplied: Math.round(hodDiscountApplied * 100) / 100,
      referralBonusApplied: Math.round(referralBonusApplied * 100) / 100,
    };
  }

  /**
   * Calculate revenue split for a solution by ID
   * Automatically determines split type based on solution data
   */
  static async calculateRevenueSplitForSolution(
    solutionId: string,
    amount: number
  ): Promise<RevenueSplitCalculation> {
    // Get solution details
    const { data: solution, error } = await (this.supabase as any).from('sh_solutions')
      .select(`
        id,
        solution_type,
        hod_discount,
        lead_department_id,
        client:sh_clients(
          partner_status,
          referral_count
        )
      `)
      .eq('id', solutionId)
      .single();

    if (error) throw new Error(`Failed to fetch solution: ${error.message}`);

    // Determine split type
    let splitType: SplitType = this.getSplitType(solution.solution_type);

    // For training, we need to check the program track
    if (solution.solution_type === 'training') {
      const { data: program } = await (this.supabase as any).from('sh_training_programs')
        .select('track')
        .eq('solution_id', solutionId)
        .single();

      if (program?.track) {
        splitType = this.getSplitType('training', program.track);
      }
    }

    // Check if client has referral (partner_status is referral or referral_count > 0)
    const clientData = Array.isArray(solution.client) ? solution.client[0] : solution.client;
    const hasReferral = clientData?.partner_status === 'referral' || (clientData?.referral_count || 0) > 0;

    // Check if this is first phase for referral bonus
    const { count: phaseCount } = await (this.supabase as any).from('sh_solution_phases')
      .select('id', { count: 'exact', head: true })
      .eq('solution_id', solutionId);

    const isFirstPhase = (phaseCount || 0) <= 1;

    return this.calculateRevenueSplit(amount, splitType, {
      hodDiscount: solution.hod_discount || 0,
      isFirstPhase,
      hasReferral,
      departmentId: solution.lead_department_id,
    });
  }

  /**
   * Validate a split configuration
   * Returns true if valid, throws error if invalid
   */
  static validateSplitConfig(config: SplitConfig): boolean {
    const total = Object.values(config).reduce((sum, val) => sum + val, 0);
    if (total !== 100) {
      throw new Error(`Split percentages must total 100%, got ${total}%`);
    }

    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== 'number' || value < 0) {
        throw new Error(`Invalid percentage for ${key}: ${value}`);
      }
    }

    return true;
  }

  /**
   * Get a preview of splits without saving
   * Useful for showing users what the split would look like before confirming
   */
  static previewSplit(
    amount: number,
    splitType: SplitType,
    options?: {
      hodDiscount?: number;
      isFirstPhase?: boolean;
      hasReferral?: boolean;
    }
  ): RevenueSplitCalculation {
    const config = { ...DEFAULT_REVENUE_SPLITS[splitType] };

    const splits: CalculatedSplit[] = [];
    let hodDiscountApplied = 0;
    let referralBonusApplied = 0;

    for (const [key, percentage] of Object.entries(config)) {
      let adjustedPercentage = percentage;
      let adjustedAmount = (amount * percentage) / 100;

      if (
        key === 'department' &&
        options?.hodDiscount &&
        options.hodDiscount > 0 &&
        options.hodDiscount <= 10
      ) {
        hodDiscountApplied = (amount * options.hodDiscount) / 100;
        adjustedAmount -= hodDiscountApplied;
        adjustedPercentage = percentage - options.hodDiscount;
      }

      if (
        key === 'department' &&
        options?.isFirstPhase &&
        options?.hasReferral &&
        splitType === 'software'
      ) {
        referralBonusApplied = (amount * 10) / 100;
        adjustedAmount -= referralBonusApplied;
        adjustedPercentage -= 10;
      }

      splits.push({
        recipientType: key,
        recipientName: RECIPIENT_DISPLAY_NAMES[key] || key,
        percentage: adjustedPercentage,
        amount: Math.round(adjustedAmount * 100) / 100,
      });
    }

    if (referralBonusApplied > 0) {
      splits.push({
        recipientType: 'referral_bonus',
        recipientName: RECIPIENT_DISPLAY_NAMES.referral_bonus,
        percentage: 10,
        amount: Math.round(referralBonusApplied * 100) / 100,
      });
    }

    return {
      splits,
      totalAmount: amount,
      hodDiscountApplied: Math.round(hodDiscountApplied * 100) / 100,
      referralBonusApplied: Math.round(referralBonusApplied * 100) / 100,
    };
  }
}

// Export singleton instance methods
export const revenueSplitService = {
  // Model CRUD
  getRevenueSplitModels: RevenueSplitService.getRevenueSplitModels.bind(RevenueSplitService),
  getRevenueSplitModelById: RevenueSplitService.getRevenueSplitModelById.bind(RevenueSplitService),
  getDefaultModelForType: RevenueSplitService.getDefaultModelForType.bind(RevenueSplitService),
  getModelBySolutionType: RevenueSplitService.getModelBySolutionType.bind(RevenueSplitService),
  createRevenueSplitModel: RevenueSplitService.createRevenueSplitModel.bind(RevenueSplitService),
  updateRevenueSplitModel: RevenueSplitService.updateRevenueSplitModel.bind(RevenueSplitService),
  deleteRevenueSplitModel: RevenueSplitService.deleteRevenueSplitModel.bind(RevenueSplitService),

  // Calculations
  getSplitType: RevenueSplitService.getSplitType.bind(RevenueSplitService),
  getSplitConfig: RevenueSplitService.getSplitConfig.bind(RevenueSplitService),
  calculateRevenueSplit: RevenueSplitService.calculateRevenueSplit.bind(RevenueSplitService),
  calculateRevenueSplitForSolution: RevenueSplitService.calculateRevenueSplitForSolution.bind(RevenueSplitService),
  validateSplitConfig: RevenueSplitService.validateSplitConfig.bind(RevenueSplitService),
  previewSplit: RevenueSplitService.previewSplit.bind(RevenueSplitService),

  // Constants
  DEFAULT_REVENUE_SPLITS,
  RECIPIENT_DISPLAY_NAMES,
};
