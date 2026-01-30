// ============================================================================
// OKR Objective Service
// Handles CRUD operations for OKR Objectives
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  OKRObjective,
  OKRListResponse,
  OKRObjectiveFilters,
  CreateOKRObjectiveDTO,
  UpdateOKRObjectiveDTO,
  OKRCascadeNode
} from '@/types/okr';

export class OKRObjectiveService {
  // Get fresh client for each request to ensure auth token is current
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Validate UUID format to prevent "invalid input syntax for type uuid" errors
   */
  private static isValidUUID(id: string | undefined | null): boolean {
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || id.trim() === '') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  /**
   * Validate ID and throw descriptive error if invalid
   */
  private static validateId(id: string | undefined | null, fieldName: string = 'ID'): void {
    if (!this.isValidUUID(id)) {
      const actualValue = id === undefined ? 'undefined' : id === null ? 'null' : `"${id}"`;
      console.error(`[OKR] Invalid ${fieldName}: ${actualValue}`);
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  /**
   * Format error for logging (handles Supabase PostgrestError which doesn't serialize properly)
   */
  private static formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      if (e.message) return String(e.message);
      if (e.details) return String(e.details);
      if (e.hint) return String(e.hint);
      return JSON.stringify(error);
    }
    return String(error);
  }

  /**
   * Get all objectives with filters and pagination
   */
  static async getObjectives(
    filters: OKRObjectiveFilters = {}
  ): Promise<OKRListResponse<OKRObjective>> {
    try {
      // Validate UUID filters if provided
      if (filters.owner_id !== undefined) {
        this.validateId(filters.owner_id, 'owner_id filter');
      }
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter');
      }
      // Only validate department_id if it's a non-empty string (skip null/undefined for "all departments" mode)
      if (filters.department_id !== undefined && filters.department_id !== null && filters.department_id !== '') {
        this.validateId(filters.department_id, 'department_id filter');
      }
      if (filters.parent_objective_id !== undefined) {
        this.validateId(filters.parent_objective_id, 'parent_objective_id filter');
      }

      let query = (this.getSupabase() as any)
        .from('okr_objectives')
        .select(
          `
          *,
          owner:profiles!owner_id(id, email, full_name, avatar_url),
          parent_objective:okr_objectives!parent_objective_id(id, title),
          institution:institutions(id, name),
          department:departments(id, department_name),
          key_results:okr_key_results(*)
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (filters.owner_id) {
        query = query.eq('owner_id', filters.owner_id);
      }
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }
      if (filters.tier) {
        query = query.eq('tier', filters.tier);
      }
      if (filters.level) {
        query = query.eq('level', filters.level);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.cycle_type) {
        query = query.eq('cycle_type', filters.cycle_type);
      }
      if (filters.parent_objective_id) {
        query = query.eq('parent_objective_id', filters.parent_objective_id);
      }
      if (filters.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      query = query
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('[OKR] Error fetching objectives:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get single objective by ID
   */
  static async getObjectiveById(id: string): Promise<OKRObjective> {
    try {
      // Validate ID before making database call
      this.validateId(id, 'objective ID');

      // Verify auth state first
      const { data: { user }, error: authError } = await this.getSupabase().auth.getUser();
      if (authError || !user) {
        console.error('[OKR] Auth error or no user:', authError?.message || 'No user session');
        throw new Error('Authentication required. Please log in again.');
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('okr_objectives')
        .select(
          `
          *,
          owner:profiles!owner_id(id, email, full_name, avatar_url),
          parent_objective:okr_objectives!parent_objective_id(id, title, overall_progress),
          institution:institutions(id, name),
          department:departments(id, department_name),
          key_results:okr_key_results(*),
          dependencies:okr_dependencies(*),
          tasks:okr_tasks(*),
          risks:okr_risks(*)
        `
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('[OKR] Database error:', this.formatError(error));
        throw error;
      }

      if (!data) {
        console.warn('[OKR] Objective not found or no access. ID:', id, 'User:', user.id);
        throw new Error('Objective not found or you do not have permission to view it.');
      }

      return data;
    } catch (error) {
      console.error('[OKR] Error fetching objective:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create new objective
   */
  static async createObjective(
    input: CreateOKRObjectiveDTO
  ): Promise<OKRObjective> {
    try {
      // Get current user
      const {
        data: { user }
      } = await this.getSupabase().auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Log input for debugging
      console.log('[OKR] Creating objective with input:', JSON.stringify(input, null, 2));

      const insertData = {
        ...input,
        owner_id: user.id,
        created_by: user.id,
        status: 'draft',
        overall_progress: 0
      };

      console.log('[OKR] Insert data:', JSON.stringify(insertData, null, 2));

      const { data, error } = await (this.getSupabase() as any)
        .from('okr_objectives')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        // Log detailed Supabase error
        console.error('[OKR] Supabase error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      toast.success('Objective created successfully');
      return data;
    } catch (error: any) {
      // Extract meaningful error info
      const errorInfo = {
        message: error?.message || 'Unknown error',
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      };
      console.error('[OKR] Error creating objective:', errorInfo);
      toast.error(`Failed to create objective: ${errorInfo.message}`);
      throw error;
    }
  }

  /**
   * Update objective
   */
  static async updateObjective(
    id: string,
    input: UpdateOKRObjectiveDTO
  ): Promise<OKRObjective> {
    try {
      // Validate ID before making database call
      this.validateId(id, 'objective ID');

      // Verify auth state first
      const { data: { user }, error: authError } = await this.getSupabase().auth.getUser();
      if (authError || !user) {
        console.error('[OKR] Auth error or no user for update:', authError?.message || 'No user session');
        throw new Error('Authentication required. Please log in again.');
      }
      console.log('[OKR] Updating objective. User:', user.id, 'Objective ID:', id);

      const { data, error } = await (this.getSupabase() as any)
        .from('okr_objectives')
        .update({
          ...input,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        // Log as strings for visibility in console tools
        console.error('[OKR] OBJ UPDATE ERROR - message:', error.message);
        console.error('[OKR] OBJ UPDATE ERROR - code:', error.code);
        console.error('[OKR] OBJ UPDATE ERROR - details:', error.details);
        console.error('[OKR] OBJ UPDATE ERROR - hint:', error.hint);
        console.error('[OKR] OBJ UPDATE ERROR - stringified:', JSON.stringify(error));
        console.error('[OKR] OBJ UPDATE ERROR - keys:', Object.keys(error).join(', '));
        throw error;
      }

      toast.success('Objective updated successfully');
      return data;
    } catch (error: any) {
      // Comprehensive error logging - each property as separate log for visibility
      console.error('[OKR] OBJ CATCH - type:', error?.constructor?.name);
      console.error('[OKR] OBJ CATCH - keys:', error ? Object.keys(error).join(', ') : 'null');
      console.error('[OKR] OBJ CATCH - message:', error?.message);
      console.error('[OKR] OBJ CATCH - String():', String(error));
      toast.error(`Failed to update objective: ${error?.message || 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Archive objective (soft delete)
   */
  static async archiveObjective(id: string): Promise<void> {
    try {
      // Validate ID before making database call
      this.validateId(id, 'objective ID');

      const { error } = await (this.getSupabase() as any)
        .from('okr_objectives')
        .update({
          status: 'archived',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Objective archived successfully');
    } catch (error) {
      console.error('[OKR] Error archiving objective:', this.formatError(error));
      toast.error('Failed to archive objective');
      throw error;
    }
  }

  /**
   * Activate objective (move from draft to active)
   */
  static async activateObjective(id: string): Promise<OKRObjective> {
    try {
      // Validate ID before making database call
      this.validateId(id, 'objective ID');

      // Get current user for approval
      const {
        data: { user }
      } = await this.getSupabase().auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await (this.getSupabase() as any)
        .from('okr_objectives')
        .update({
          status: 'active',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Objective activated successfully');
      return data;
    } catch (error) {
      console.error('[OKR] Error activating objective:', this.formatError(error));
      toast.error('Failed to activate objective');
      throw error;
    }
  }

  /**
   * Get cascade tree for objectives
   */
  static async getCascadeTree(
    rootObjectiveId?: string
  ): Promise<OKRCascadeNode[]> {
    try {
      // Validate rootObjectiveId if provided
      if (rootObjectiveId !== undefined) {
        this.validateId(rootObjectiveId, 'root objective ID');
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('v_okr_cascade')
        .select('*')
        .order('depth', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;

      // Build tree structure
      const nodes = data || [];
      const nodeMap = new Map<string, OKRCascadeNode>();
      const roots: OKRCascadeNode[] = [];

      // First pass: create all nodes and transform owner data
      nodes.forEach((node: any) => {
        const transformedNode: OKRCascadeNode = {
          id: node.id,
          title: node.title,
          tier: node.tier,
          level: node.level,
          overall_progress: node.overall_progress,
          owner_id: node.owner_id,
          parent_objective_id: node.parent_objective_id,
          depth: node.depth,
          path: node.path,
          owner: node.owner_email ? {
            id: node.owner_id,
            email: node.owner_email,
            full_name: node.owner_name,
            avatar_url: node.owner_avatar
          } : undefined,
          children: []
        };
        nodeMap.set(node.id, transformedNode);
      });

      // Second pass: build tree
      nodes.forEach((node: any) => {
        const currentNode = nodeMap.get(node.id)!;
        if (node.parent_objective_id && nodeMap.has(node.parent_objective_id)) {
          nodeMap.get(node.parent_objective_id)!.children!.push(currentNode);
        } else if (!node.parent_objective_id) {
          roots.push(currentNode);
        }
      });

      // If root specified, filter to that branch
      if (rootObjectiveId) {
        const findNode = (
          nodes: OKRCascadeNode[]
        ): OKRCascadeNode | undefined => {
          for (const node of nodes) {
            if (node.id === rootObjectiveId) return node;
            const found = findNode(node.children || []);
            if (found) return found;
          }
          return undefined;
        };
        const rootNode = findNode(roots);
        return rootNode ? [rootNode] : [];
      }

      return roots;
    } catch (error) {
      console.error('[OKR] Error fetching cascade tree:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get objectives user can link to (parent objectives)
   * Hierarchy: organization -> institution -> department -> individual
   */
  static async getAvailableParentObjectives(
    institutionId: string | null,
    level: 'organization' | 'institution' | 'department' | 'individual'
  ): Promise<OKRObjective[]> {
    try {
      // Validate institution ID if provided (not required for organization level)
      if (institutionId !== null) {
        this.validateId(institutionId, 'institution ID');
      }

      // Organization OKRs have no parent (they are the top level)
      if (level === 'organization') {
        return [];
      }

      const supabase = this.getSupabase() as any;

      // Institution OKRs can link to organization level (group-wide OKRs)
      if (level === 'institution') {
        const { data, error } = await supabase
          .from('okr_objectives')
          .select('id, title, tier, level, overall_progress, institution_id')
          .eq('status', 'active')
          .eq('level', 'organization')
          .order('title', { ascending: true });

        if (error) throw error;
        return data || [];
      }

      // Department OKRs can link to organization or institution level
      if (level === 'department') {
        // institutionId is required for department level
        if (!institutionId) {
          console.warn('[OKR] getAvailableParentObjectives called with null institutionId for department level');
          // Return only organization-level OKRs if no institutionId provided
          const { data: orgData, error: orgError } = await supabase
            .from('okr_objectives')
            .select('id, title, tier, level, overall_progress, institution_id')
            .eq('status', 'active')
            .eq('level', 'organization');
          if (orgError) throw orgError;
          return orgData || [];
        }

        // Get organization-level OKRs (no institution_id filter needed)
        const { data: orgData, error: orgError } = await supabase
          .from('okr_objectives')
          .select('id, title, tier, level, overall_progress, institution_id')
          .eq('status', 'active')
          .eq('level', 'organization');

        if (orgError) throw orgError;

        // Get institution-level OKRs for this institution
        const { data: instData, error: instError } = await supabase
          .from('okr_objectives')
          .select('id, title, tier, level, overall_progress, institution_id')
          .eq('status', 'active')
          .eq('level', 'institution')
          .eq('institution_id', institutionId);

        if (instError) throw instError;

        // Combine and sort
        const combined = [...(orgData || []), ...(instData || [])];
        return combined.sort((a, b) => a.title.localeCompare(b.title));
      }

      // Individual OKRs can link to organization, institution, or department level
      if (level === 'individual') {
        // institutionId is required for individual level
        if (!institutionId) {
          console.warn('[OKR] getAvailableParentObjectives called with null institutionId for individual level');
          // Return only organization-level OKRs if no institutionId provided
          const { data: orgData, error: orgError } = await supabase
            .from('okr_objectives')
            .select('id, title, tier, level, overall_progress, institution_id')
            .eq('status', 'active')
            .eq('level', 'organization');
          if (orgError) throw orgError;
          return orgData || [];
        }

        // Get organization-level OKRs
        const { data: orgData, error: orgError } = await supabase
          .from('okr_objectives')
          .select('id, title, tier, level, overall_progress, institution_id')
          .eq('status', 'active')
          .eq('level', 'organization');

        if (orgError) throw orgError;

        // Get institution and department level OKRs for this institution
        const { data: instDeptData, error: instDeptError } = await supabase
          .from('okr_objectives')
          .select('id, title, tier, level, overall_progress, institution_id')
          .eq('status', 'active')
          .in('level', ['institution', 'department'])
          .eq('institution_id', institutionId);

        if (instDeptError) throw instDeptError;

        // Combine and sort
        const combined = [...(orgData || []), ...(instDeptData || [])];
        return combined.sort((a, b) => a.title.localeCompare(b.title));
      }

      return [];
    } catch (error) {
      console.error('[OKR] Error fetching parent objectives:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get organization-level objectives (group-wide OKRs)
   */
  static async getOrganizationObjectives(): Promise<OKRObjective[]> {
    try {
      const { data, error } = await (this.getSupabase() as any)
        .from('okr_objectives')
        .select(`
          *,
          owner:profiles!owner_id(id, email, full_name, avatar_url),
          key_results:okr_key_results(*)
        `)
        .eq('level', 'organization')
        .is('institution_id', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[OKR] Error fetching organization objectives:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get my objectives (current user)
   */
  static async getMyObjectives(
    filters: Omit<OKRObjectiveFilters, 'owner_id'> = {}
  ): Promise<OKRListResponse<OKRObjective>> {
    const {
      data: { user }
    } = await this.getSupabase().auth.getUser();
    if (!user) throw new Error('User not authenticated');

    return this.getObjectives({ ...filters, owner_id: user.id });
  }
}
