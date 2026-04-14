// lib/services/solutions/deployments-service.ts
// CRUD operations for sh_phase_deployments

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  PhaseDeployment,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export type DeploymentEnvironment = 'staging' | 'production';
export type DeploymentStatus = 'active' | 'inactive' | 'failed' | 'rolling_back';

export interface DeploymentWithPhase extends PhaseDeployment {
  phase?: {
    id: string;
    title: string;
    solution?: {
      id: string;
      title: string;
      solution_code: string;
      client?: {
        id: string;
        name: string;
      };
    };
  };
}

export interface DeploymentFilters extends PaginationParams {
  phase_id?: string;
  environment?: DeploymentEnvironment;
  status?: DeploymentStatus;
  deployed_by?: string;
}

export interface CreateDeploymentInput {
  phase_id: string;
  environment: DeploymentEnvironment;
  version?: string;
  vercel_url?: string;
  supabase_project_id?: string;
  custom_domain?: string;
  deployed_date: string;
  deployed_by: string;
  notes?: string;
}

export interface UpdateDeploymentInput {
  version?: string;
  vercel_url?: string;
  supabase_project_id?: string;
  custom_domain?: string;
  status?: DeploymentStatus;
  notes?: string;
}

// ============================================
// CONSTANTS
// ============================================

export const DEPLOYMENT_ENVIRONMENTS: Array<{ value: DeploymentEnvironment; label: string; description: string }> = [
  {
    value: 'staging',
    label: 'Staging',
    description: 'Pre-production testing environment',
  },
  {
    value: 'production',
    label: 'Production',
    description: 'Live production environment',
  },
];

export const DEPLOYMENT_STATUS_LABELS: Record<DeploymentStatus, { label: string; color: string; description: string }> = {
  active: {
    label: 'Active',
    color: 'green',
    description: 'Deployment is live and running',
  },
  inactive: {
    label: 'Inactive',
    color: 'gray',
    description: 'Deployment has been deactivated',
  },
  failed: {
    label: 'Failed',
    color: 'red',
    description: 'Deployment failed',
  },
  rolling_back: {
    label: 'Rolling Back',
    color: 'yellow',
    description: 'Deployment is being rolled back',
  },
};

// ============================================
// SERVICE CLASS
// ============================================

export class DeploymentsService extends BaseService {
  /**
   * Get all deployments with optional filters and pagination
   */
  static async getDeployments(filters?: DeploymentFilters): Promise<BaseListResponse<DeploymentWithPhase>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase.from('sh_phase_deployments')
      .select(
        `
        *,
        phase:sh_solution_phases(
          id,
          title,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        )
      `,
        { count: 'exact' }
      )
      .order('deployed_date', { ascending: false });

    // Apply filters
    if (filters?.phase_id) {
      query = query.eq('phase_id', filters.phase_id);
    }

    if (filters?.environment) {
      query = query.eq('environment', filters.environment);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.deployed_by) {
      query = query.eq('deployed_by', filters.deployed_by);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch deployments: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as DeploymentWithPhase[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single deployment by ID
   */
  static async getDeploymentById(id: string): Promise<DeploymentWithPhase | null> {
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .select(
        `
        *,
        phase:sh_solution_phases(
          id,
          title,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch deployment: ${error.message}`);
    }

    return data as DeploymentWithPhase;
  }

  /**
   * Get deployments by phase ID
   */
  static async getDeploymentsByPhase(phaseId: string): Promise<PhaseDeployment[]> {
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .select('*')
      .eq('phase_id', phaseId)
      .order('deployed_date', { ascending: false });

    if (error) throw new Error(`Failed to fetch deployments: ${error.message}`);
    return data as PhaseDeployment[];
  }

  /**
   * Get latest deployment for a phase and environment
   */
  static async getLatestDeployment(
    phaseId: string,
    environment: DeploymentEnvironment
  ): Promise<PhaseDeployment | null> {
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .select('*')
      .eq('phase_id', phaseId)
      .eq('environment', environment)
      .order('deployed_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to get latest deployment: ${error.message}`);
    return data as PhaseDeployment | null;
  }

  /**
   * Create a deployment record
   */
  static async createDeployment(input: CreateDeploymentInput): Promise<PhaseDeployment> {
    // Deactivate previous active deployments in same environment
    await this.supabase.from('sh_phase_deployments')
      .update({ status: 'inactive' })
      .eq('phase_id', input.phase_id)
      .eq('environment', input.environment)
      .eq('status', 'active');

    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .insert({
        phase_id: input.phase_id,
        environment: input.environment,
        version: input.version,
        vercel_url: input.vercel_url,
        supabase_project_id: input.supabase_project_id,
        custom_domain: input.custom_domain,
        deployed_date: input.deployed_date,
        deployed_by: input.deployed_by,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create deployment: ${error.message}`);

    // Update phase status to 'live' if this is a production deployment
    if (input.environment === 'production') {
      await this.supabase.from('sh_solution_phases')
        .update({
          status: 'live',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.phase_id);
    }

    return data as PhaseDeployment;
  }

  /**
   * Update a deployment record
   */
  static async updateDeployment(id: string, input: UpdateDeploymentInput): Promise<PhaseDeployment> {
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update deployment: ${error.message}`);
    return data as PhaseDeployment;
  }

  /**
   * Deactivate a deployment
   */
  static async deactivateDeployment(id: string): Promise<PhaseDeployment> {
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .update({ status: 'inactive' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to deactivate deployment: ${error.message}`);
    return data as PhaseDeployment;
  }

  /**
   * Rollback to a previous deployment
   */
  static async rollbackDeployment(
    phaseId: string,
    environment: DeploymentEnvironment,
    targetDeploymentId: string
  ): Promise<PhaseDeployment> {
    // Get the target deployment
    const target = await this.getDeploymentById(targetDeploymentId);
    if (!target) {
      throw new Error('Target deployment not found');
    }

    // Deactivate current active deployment
    await this.supabase.from('sh_phase_deployments')
      .update({ status: 'inactive' })
      .eq('phase_id', phaseId)
      .eq('environment', environment)
      .eq('status', 'active');

    // Reactivate target deployment
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .update({ status: 'active' })
      .eq('id', targetDeploymentId)
      .select()
      .single();

    if (error) throw new Error(`Failed to rollback deployment: ${error.message}`);

    // No need to update phase URL - deployment info is in sh_phase_deployments

    return data as PhaseDeployment;
  }

  /**
   * Delete a deployment record
   */
  static async deleteDeployment(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_phase_deployments')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete deployment: ${error.message}`);
  }

  /**
   * Get deployment statistics
   */
  static async getDeploymentStats(): Promise<{
    total: number;
    byEnvironment: Record<DeploymentEnvironment, number>;
    byStatus: Record<DeploymentStatus, number>;
    activeProduction: number;
    deploymentsThisMonth: number;
  }> {
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .select('environment, status, deployed_date');

    if (error) throw new Error(`Failed to fetch deployment stats: ${error.message}`);

    const environments: DeploymentEnvironment[] = ['staging', 'production'];
    const statuses: DeploymentStatus[] = ['active', 'inactive', 'failed', 'rolling_back'];

    const byEnvironment = environments.reduce((acc, env) => {
      acc[env] = 0;
      return acc;
    }, {} as Record<DeploymentEnvironment, number>);

    const byStatus = statuses.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<DeploymentStatus, number>);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let activeProduction = 0;
    let deploymentsThisMonth = 0;

    data?.forEach((deployment: { environment: DeploymentEnvironment; status: DeploymentStatus; deployed_date: string }) => {
      if (deployment.environment) {
        byEnvironment[deployment.environment]++;
      }
      if (deployment.status) {
        byStatus[deployment.status]++;
      }
      if (deployment.environment === 'production' && deployment.status === 'active') {
        activeProduction++;
      }
      if (deployment.deployed_date && new Date(deployment.deployed_date) >= startOfMonth) {
        deploymentsThisMonth++;
      }
    });

    return {
      total: data?.length || 0,
      byEnvironment,
      byStatus,
      activeProduction,
      deploymentsThisMonth,
    };
  }

  /**
   * Get active deployment URL for a phase
   */
  static async getActiveDeploymentUrl(
    phaseId: string,
    environment: DeploymentEnvironment
  ): Promise<string | null> {
    const { data, error } = await this.supabase.from('sh_phase_deployments')
      .select('custom_domain, vercel_url')
      .eq('phase_id', phaseId)
      .eq('environment', environment)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to get deployment URL: ${error.message}`);
    if (!data) return null;

    return data.custom_domain || data.vercel_url || null;
  }

  /**
   * Check if phase has any active deployments
   */
  static async hasActiveDeployments(phaseId: string): Promise<boolean> {
    const { count, error } = await this.supabase.from('sh_phase_deployments')
      .select('*', { count: 'exact', head: true })
      .eq('phase_id', phaseId)
      .eq('status', 'active');

    if (error) throw new Error(`Failed to check deployments: ${error.message}`);
    return (count || 0) > 0;
  }
}

// Export singleton instance methods
export const deploymentsService = {
  getDeployments: DeploymentsService.getDeployments.bind(DeploymentsService),
  getDeploymentById: DeploymentsService.getDeploymentById.bind(DeploymentsService),
  getDeploymentsByPhase: DeploymentsService.getDeploymentsByPhase.bind(DeploymentsService),
  getLatestDeployment: DeploymentsService.getLatestDeployment.bind(DeploymentsService),
  createDeployment: DeploymentsService.createDeployment.bind(DeploymentsService),
  updateDeployment: DeploymentsService.updateDeployment.bind(DeploymentsService),
  deactivateDeployment: DeploymentsService.deactivateDeployment.bind(DeploymentsService),
  rollbackDeployment: DeploymentsService.rollbackDeployment.bind(DeploymentsService),
  deleteDeployment: DeploymentsService.deleteDeployment.bind(DeploymentsService),
  getDeploymentStats: DeploymentsService.getDeploymentStats.bind(DeploymentsService),
  getActiveDeploymentUrl: DeploymentsService.getActiveDeploymentUrl.bind(DeploymentsService),
  hasActiveDeployments: DeploymentsService.hasActiveDeployments.bind(DeploymentsService),
  DEPLOYMENT_ENVIRONMENTS,
  DEPLOYMENT_STATUS_LABELS,
};
