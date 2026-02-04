// lib/services/solutions/bugs-service.ts
// CRUD operations for sh_bug_reports

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  BugReport,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export type BugSeverity = 'critical' | 'high' | 'medium' | 'low';
export type BugStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface BugWithDetails extends BugReport {
  iteration?: {
    id: string;
    version: number;
    prototype_url?: string;
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
  };
}

export interface BugFilters extends PaginationParams {
  iteration_id?: string;
  phase_id?: string;
  severity?: BugSeverity;
  status?: BugStatus;
  reported_by?: string;
}

export interface CreateBugInput {
  iteration_id: string;
  reported_by: string;
  description: string;
  severity?: BugSeverity;
  screenshots_urls?: string[];
}

export interface UpdateBugInput {
  description?: string;
  severity?: BugSeverity;
  status?: BugStatus;
  resolved_by?: string;
  resolution_notes?: string;
  screenshots_urls?: string[];
}

// ============================================
// CONSTANTS
// ============================================

export const BUG_SEVERITY_LABELS: Record<BugSeverity, { label: string; color: string; description: string }> = {
  critical: {
    label: 'Critical',
    color: 'red',
    description: 'Blocks all work, must be fixed immediately',
  },
  high: {
    label: 'High',
    color: 'orange',
    description: 'Major functionality affected, fix soon',
  },
  medium: {
    label: 'Medium',
    color: 'yellow',
    description: 'Some functionality affected, schedule fix',
  },
  low: {
    label: 'Low',
    color: 'blue',
    description: 'Minor issue, fix when convenient',
  },
};

export const BUG_STATUS_LABELS: Record<BugStatus, { label: string; color: string; description: string }> = {
  open: {
    label: 'Open',
    color: 'red',
    description: 'Bug reported, awaiting action',
  },
  in_progress: {
    label: 'In Progress',
    color: 'yellow',
    description: 'Bug is being worked on',
  },
  resolved: {
    label: 'Resolved',
    color: 'green',
    description: 'Bug has been fixed',
  },
  closed: {
    label: 'Closed',
    color: 'gray',
    description: 'Bug verified fixed or not a bug',
  },
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

export class BugsService extends BaseService {
  /**
   * Get all bugs with optional filters and pagination
   */
  static async getBugs(filters?: BugFilters): Promise<BaseListResponse<BugWithDetails>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_bug_reports')
      .select(
        `
        *,
        iteration:sh_prototype_iterations(
          id,
          version,
          prototype_url,
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
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.iteration_id) {
      query = query.eq('iteration_id', filters.iteration_id);
    }

    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.reported_by) {
      query = query.eq('reported_by', filters.reported_by);
    }

    if (filters?.search) {
      const escaped = escapeSearchString(filters.search);
      query = query.or(`description.ilike.%${escaped}%,resolution_notes.ilike.%${escaped}%`);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch bugs: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as BugWithDetails[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single bug by ID
   */
  static async getBugById(id: string): Promise<BugWithDetails | null> {
    const { data, error } = await (this.supabase as any).from('sh_bug_reports')
      .select(
        `
        *,
        iteration:sh_prototype_iterations(
          id,
          version,
          prototype_url,
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
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch bug: ${error.message}`);
    }

    return data as BugWithDetails;
  }

  /**
   * Get bugs by phase ID (through iterations)
   */
  static async getBugsByPhase(phaseId: string): Promise<BugReport[]> {
    // First get all iteration IDs for the phase
    const { data: iterations, error: iterError } = await (this.supabase as any)
      .from('sh_prototype_iterations')
      .select('id')
      .eq('phase_id', phaseId);

    if (iterError) throw new Error(`Failed to fetch iterations: ${iterError.message}`);

    if (!iterations || iterations.length === 0) {
      return [];
    }

    const iterationIds = iterations.map((i: { id: string }) => i.id);

    const { data, error } = await (this.supabase as any).from('sh_bug_reports')
      .select('*')
      .in('iteration_id', iterationIds)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch bugs: ${error.message}`);
    return data as BugReport[];
  }

  /**
   * Get bugs by iteration ID
   */
  static async getBugsByIteration(iterationId: string): Promise<BugReport[]> {
    const { data, error } = await (this.supabase as any).from('sh_bug_reports')
      .select('*')
      .eq('iteration_id', iterationId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch bugs: ${error.message}`);
    return data as BugReport[];
  }

  /**
   * Create a bug report
   */
  static async createBug(input: CreateBugInput): Promise<BugReport> {
    const { data, error } = await (this.supabase as any).from('sh_bug_reports')
      .insert({
        iteration_id: input.iteration_id,
        reported_by: input.reported_by,
        description: input.description,
        severity: input.severity || 'medium',
        screenshots_urls: input.screenshots_urls || [],
        status: 'open',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create bug: ${error.message}`);
    return data as BugReport;
  }

  /**
   * Update a bug report
   */
  static async updateBug(id: string, input: UpdateBugInput): Promise<BugReport> {
    const updateData: Record<string, unknown> = { ...input };

    // Set resolved_at if status is being changed to resolved
    if (input.status === 'resolved' && !updateData.resolved_at) {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await (this.supabase as any).from('sh_bug_reports')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update bug: ${error.message}`);
    return data as BugReport;
  }

  /**
   * Resolve a bug
   */
  static async resolveBug(
    id: string,
    resolvedBy: string,
    resolutionNotes?: string
  ): Promise<BugReport> {
    const { data, error } = await (this.supabase as any).from('sh_bug_reports')
      .update({
        status: 'resolved',
        resolved_by: resolvedBy,
        resolution_notes: resolutionNotes,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to resolve bug: ${error.message}`);
    return data as BugReport;
  }

  /**
   * Close a bug
   */
  static async closeBug(id: string): Promise<BugReport> {
    const { data, error } = await (this.supabase as any).from('sh_bug_reports')
      .update({ status: 'closed' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to close bug: ${error.message}`);
    return data as BugReport;
  }

  /**
   * Reopen a bug
   */
  static async reopenBug(id: string): Promise<BugReport> {
    const { data, error } = await (this.supabase as any).from('sh_bug_reports')
      .update({
        status: 'open',
        resolved_by: null,
        resolution_notes: null,
        resolved_at: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to reopen bug: ${error.message}`);
    return data as BugReport;
  }

  /**
   * Delete a bug report
   */
  static async deleteBug(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_bug_reports')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete bug: ${error.message}`);
  }

  /**
   * Get bug statistics
   */
  static async getBugStats(): Promise<{
    total: number;
    bySeverity: Record<BugSeverity, number>;
    byStatus: Record<BugStatus, number>;
    openCritical: number;
    avgResolutionTimeHours: number | null;
  }> {
    const { data, error } = await (this.supabase as any).from('sh_bug_reports')
      .select('severity, status, created_at, resolved_at');

    if (error) throw new Error(`Failed to fetch bug stats: ${error.message}`);

    const severities: BugSeverity[] = ['critical', 'high', 'medium', 'low'];
    const statuses: BugStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

    const bySeverity = severities.reduce((acc, sev) => {
      acc[sev] = 0;
      return acc;
    }, {} as Record<BugSeverity, number>);

    const byStatus = statuses.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<BugStatus, number>);

    let openCritical = 0;
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    data?.forEach((bug: { severity: BugSeverity; status: BugStatus; created_at: string; resolved_at: string | null }) => {
      if (bug.severity) {
        bySeverity[bug.severity]++;
      }
      if (bug.status) {
        byStatus[bug.status]++;
      }
      if (bug.severity === 'critical' && (bug.status === 'open' || bug.status === 'in_progress')) {
        openCritical++;
      }
      if (bug.resolved_at && bug.created_at) {
        const created = new Date(bug.created_at).getTime();
        const resolved = new Date(bug.resolved_at).getTime();
        totalResolutionTime += (resolved - created) / (1000 * 60 * 60); // hours
        resolvedCount++;
      }
    });

    return {
      total: data?.length || 0,
      bySeverity,
      byStatus,
      openCritical,
      avgResolutionTimeHours: resolvedCount > 0
        ? Math.round((totalResolutionTime / resolvedCount) * 10) / 10
        : null,
    };
  }

  /**
   * Get open bugs count for a phase
   */
  static async getOpenBugCountForPhase(phaseId: string): Promise<number> {
    // First get all iteration IDs for the phase
    const { data: iterations, error: iterError } = await (this.supabase as any)
      .from('sh_prototype_iterations')
      .select('id')
      .eq('phase_id', phaseId);

    if (iterError) throw new Error(`Failed to fetch iterations: ${iterError.message}`);

    if (!iterations || iterations.length === 0) {
      return 0;
    }

    const iterationIds = iterations.map((i: { id: string }) => i.id);

    const { count, error } = await (this.supabase as any).from('sh_bug_reports')
      .select('*', { count: 'exact', head: true })
      .in('iteration_id', iterationIds)
      .in('status', ['open', 'in_progress']);

    if (error) throw new Error(`Failed to count bugs: ${error.message}`);
    return count || 0;
  }
}

// Export singleton instance methods
export const bugsService = {
  getBugs: BugsService.getBugs.bind(BugsService),
  getBugById: BugsService.getBugById.bind(BugsService),
  getBugsByPhase: BugsService.getBugsByPhase.bind(BugsService),
  getBugsByIteration: BugsService.getBugsByIteration.bind(BugsService),
  createBug: BugsService.createBug.bind(BugsService),
  updateBug: BugsService.updateBug.bind(BugsService),
  resolveBug: BugsService.resolveBug.bind(BugsService),
  closeBug: BugsService.closeBug.bind(BugsService),
  reopenBug: BugsService.reopenBug.bind(BugsService),
  deleteBug: BugsService.deleteBug.bind(BugsService),
  getBugStats: BugsService.getBugStats.bind(BugsService),
  getOpenBugCountForPhase: BugsService.getOpenBugCountForPhase.bind(BugsService),
  BUG_SEVERITY_LABELS,
  BUG_STATUS_LABELS,
};
