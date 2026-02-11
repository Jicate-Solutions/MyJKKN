// lib/services/solutions/rdif-service.ts
// RDIF (Research & Development Investment Fund) Readiness Service
// Focused service for RDIF readiness calculations and bridge status

import { BaseService } from '../base-service';
import type { SHRDIFPrerequisite } from './products-service';

// ============================================
// TYPES
// ============================================

export interface RDIFReadinessResult {
  score: number;
  total: number;
  percentage: number;
  prerequisites: SHRDIFPrerequisite[];
  metPrerequisites: SHRDIFPrerequisite[];
  unmetPrerequisites: SHRDIFPrerequisite[];
}

export interface ThreeYearBridgeStatus {
  currentYear: 1 | 2 | 3;
  yearLabel: string;
  description: string;
  scoreRange: { min: number; max: number };
  currentScore: number;
  nextMilestones: RDIFMilestone[];
  isEligible: boolean;
}

export interface RDIFMilestone {
  prerequisiteKey: string;
  label: string;
  description: string | null;
  targetDate: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================
// CONSTANTS
// ============================================

/**
 * The 9 RDIF prerequisites and their priority order
 * Based on JICATE/JKKN's current position (2 of 9 met: company status + Indian citizen control)
 */
export const RDIF_PREREQUISITE_KEYS = [
  'registered_company',
  'indian_control',
  'trl_4_plus',
  'ip_portfolio',
  'co_investment',
  'rd_track_record',
  'slfm_relationships',
  'dsir_recognition',
  'research_output',
] as const;

/**
 * Year boundaries for the 3-year bridge plan
 */
export const BRIDGE_YEAR_THRESHOLDS = {
  year1: { min: 0, max: 3, label: 'Year 1: Foundation', description: 'Establishing basics — company structure, initial IP, first TRL 4+ product' },
  year2: { min: 4, max: 6, label: 'Year 2: Growth', description: 'Building track record — R&D publications, DSIR recognition, SLFM relationships' },
  year3: { min: 7, max: 9, label: 'Year 3: Readiness', description: 'Full eligibility — VC connections, co-investment capital, complete portfolio' },
} as const;

// ============================================
// SERVICE CLASS
// ============================================

export class RDIFService extends BaseService {
  /**
   * Calculate comprehensive RDIF readiness score with breakdown
   */
  static async calculateRDIFScore(): Promise<RDIFReadinessResult> {
    const { data, error } = await this.supabase
      .from('sh_rdif_prerequisites')
      .select('*')
      .order('prerequisite_key', { ascending: true });

    if (error) throw new Error(`Failed to fetch RDIF prerequisites: ${error.message}`);

    const prerequisites = (data || []) as SHRDIFPrerequisite[];
    const metPrerequisites = prerequisites.filter((p) => p.is_met);
    const unmetPrerequisites = prerequisites.filter((p) => !p.is_met);
    const total = prerequisites.length;
    const score = metPrerequisites.length;

    return {
      score,
      total,
      percentage: total > 0 ? Math.round((score / total) * 100) : 0,
      prerequisites,
      metPrerequisites,
      unmetPrerequisites,
    };
  }

  /**
   * Determine which year of the 3-year bridge plan based on current score
   */
  static async getThreeYearBridgeStatus(): Promise<ThreeYearBridgeStatus> {
    const readiness = await this.calculateRDIFScore();
    const score = readiness.score;

    let currentYear: 1 | 2 | 3;
    let yearConfig: (typeof BRIDGE_YEAR_THRESHOLDS)[keyof typeof BRIDGE_YEAR_THRESHOLDS];

    if (score <= BRIDGE_YEAR_THRESHOLDS.year1.max) {
      currentYear = 1;
      yearConfig = BRIDGE_YEAR_THRESHOLDS.year1;
    } else if (score <= BRIDGE_YEAR_THRESHOLDS.year2.max) {
      currentYear = 2;
      yearConfig = BRIDGE_YEAR_THRESHOLDS.year2;
    } else {
      currentYear = 3;
      yearConfig = BRIDGE_YEAR_THRESHOLDS.year3;
    }

    // Calculate next milestones from unmet prerequisites
    const nextMilestones = await this.getNextMilestones();

    return {
      currentYear,
      yearLabel: yearConfig.label,
      description: yearConfig.description,
      scoreRange: { min: yearConfig.min, max: yearConfig.max },
      currentScore: score,
      nextMilestones,
      isEligible: score >= 7, // Minimum 7 of 9 to be considered eligible
    };
  }

  /**
   * Get the next milestones (unmet prerequisites) ordered by priority
   */
  static async getNextMilestones(): Promise<RDIFMilestone[]> {
    const { data, error } = await this.supabase
      .from('sh_rdif_prerequisites')
      .select('*')
      .eq('is_met', false)
      .order('prerequisite_key', { ascending: true });

    if (error) throw new Error(`Failed to fetch next milestones: ${error.message}`);

    const prerequisites = (data || []) as SHRDIFPrerequisite[];

    // Priority mapping — what's most critical to tackle first
    const priorityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
      trl_4_plus: 'critical',
      ip_portfolio: 'critical',
      rd_track_record: 'high',
      dsir_recognition: 'high',
      co_investment: 'high',
      slfm_relationships: 'medium',
      research_output: 'medium',
      registered_company: 'critical',
      indian_control: 'critical',
    };

    const milestones: RDIFMilestone[] = prerequisites.map((p) => ({
      prerequisiteKey: p.prerequisite_key,
      label: p.label,
      description: p.description,
      targetDate: p.target_date,
      priority: priorityMap[p.prerequisite_key] || 'medium',
    }));

    // Sort by priority: critical > high > medium > low
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    milestones.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return milestones;
  }
}

// Export singleton instance methods
export const rdifService = {
  calculateRDIFScore: RDIFService.calculateRDIFScore.bind(RDIFService),
  getThreeYearBridgeStatus: RDIFService.getThreeYearBridgeStatus.bind(RDIFService),
  getNextMilestones: RDIFService.getNextMilestones.bind(RDIFService),
  // Constants
  RDIF_PREREQUISITE_KEYS,
  BRIDGE_YEAR_THRESHOLDS,
};
