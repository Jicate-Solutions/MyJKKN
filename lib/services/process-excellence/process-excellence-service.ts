// lib/services/process-excellence/process-excellence-service.ts
// Process Excellence Service - TIMWOOD waste tracking, value-add analysis, SLA monitoring

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  ProcessDefinition,
  ProcessInstance,
  WasteIncident,
  ProcessAudit,
  ProcessMetrics,
  ProcessDefinitionFilters,
  ProcessInstanceFilters,
  WasteIncidentFilters,
  ProcessAuditFilters,
  ProcessMetricsFilters,
  ProcessDefinitionListResponse,
  ProcessInstanceListResponse,
  WasteIncidentListResponse,
  ProcessAuditListResponse,
  ProcessExcellenceDashboard,
  WasteAnalytics,
  CreateProcessDefinitionDto,
  UpdateProcessDefinitionDto,
  StartProcessInstanceDto,
  CreateWasteIncidentDto,
  UpdateWasteIncidentDto,
  CreateProcessAuditDto,
  UpdateProcessAuditDto,
  StageHistory,
  WasteCategory,
  SLAStatus
} from '@/types/process-excellence';

export class ProcessExcellenceService {
  private static supabase: any = createClientSupabaseClient();

  /**
   * SECURITY: Validate institution access
   * Ensures user has permission to access the requested institution's data
   * @throws Error if institution_id is invalid or user lacks access
   */
  private static async validateInstitutionAccess(
    institutionId: string
  ): Promise<void> {
    if (!institutionId || institutionId.trim() === '') {
      throw new Error('Institution ID is required');
    }

    // Get current user
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Check user's institution access
    const { data: access, error } = await this.supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (error || !access) {
      console.error('[process-excellence] Access denied:', { userId: user.id, institutionId });
      throw new Error('Access denied: Institution not accessible to user');
    }
  }

  // =============================================
  // Process Definitions
  // =============================================

  static async getProcessDefinitions(
    filters: ProcessDefinitionFilters
  ): Promise<ProcessDefinitionListResponse> {
    try {
      let query = this.supabase
        .from('process_definitions')
        .select(
          `
          *,
          institution:institutions(id, name)
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.search) {
        // SECURITY FIX: Sanitize search to prevent SQL injection
        const sanitizedSearch = sanitizeSearch(filters.search);
        query = query.or(
          `name.ilike.%${sanitizedSearch}%,description.ilike.%${sanitizedSearch}%`
        );
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'name';
      const sortDirection = filters.sortDirection || 'asc';
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error('[process-excellence] Error fetching definitions:', error);
        throw new Error(`Failed to fetch process definitions: ${error.message}`);
      }

      return {
        data: (data as unknown as ProcessDefinition[]) || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      console.error('[process-excellence] Error in getProcessDefinitions:', error);
      throw error;
    }
  }

  static async getProcessDefinition(id: string, institutionId?: string): Promise<ProcessDefinition> {
    try {
      let query = this.supabase
        .from('process_definitions')
        .select(
          `
          *,
          institution:institutions(id, name)
        `
        )
        .eq('id', id);

      // SECURITY: Filter by institution_id if provided to prevent cross-institution access
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query.single();

      if (error) {
        console.error('[process-excellence] Error fetching definition:', error);
        // SECURITY: Don't expose internal error details
        if (error.code === 'PGRST116') {
          throw new Error('Process definition not found or access denied');
        }
        throw new Error('Failed to fetch process definition');
      }

      if (!data) {
        throw new Error('Process definition not found');
      }

      return data as unknown as ProcessDefinition;
    } catch (error) {
      console.error('[process-excellence] Error in getProcessDefinition:', error);
      throw error;
    }
  }

  static async createProcessDefinition(
    definition: CreateProcessDefinitionDto
  ): Promise<ProcessDefinition> {
    try {
      const user = (await this.supabase.auth.getUser()).data.user;

      const { data, error } = await this.supabase
        .from('process_definitions')
        .insert({
          ...definition,
          created_by: user?.id,
          updated_by: user?.id
        })
        .select(
          `
          *,
          institution:institutions(id, name)
        `
        )
        .single();

      if (error) {
        console.error('[process-excellence] Error creating definition:', error);
        if (error.code === '23505') {
          throw new Error('A process with this name already exists in this institution');
        }
        throw new Error(`Failed to create process definition: ${error.message}`);
      }

      return data as unknown as ProcessDefinition;
    } catch (error) {
      console.error('[process-excellence] Error in createProcessDefinition:', error);
      throw error;
    }
  }

  static async updateProcessDefinition(
    id: string,
    updates: UpdateProcessDefinitionDto
  ): Promise<ProcessDefinition> {
    try {
      const user = (await this.supabase.auth.getUser()).data.user;

      const { data, error } = await this.supabase
        .from('process_definitions')
        .update({
          ...updates,
          updated_by: user?.id
        })
        .eq('id', id)
        .select(
          `
          *,
          institution:institutions(id, name)
        `
        )
        .single();

      if (error) {
        console.error('[process-excellence] Error updating definition:', error);
        throw new Error(`Failed to update process definition: ${error.message}`);
      }

      return data as unknown as ProcessDefinition;
    } catch (error) {
      console.error('[process-excellence] Error in updateProcessDefinition:', error);
      throw error;
    }
  }

  static async deleteProcessDefinition(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('process_definitions')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[process-excellence] Error deleting definition:', error);
        throw new Error(`Failed to delete process definition: ${error.message}`);
      }
    } catch (error) {
      console.error('[process-excellence] Error in deleteProcessDefinition:', error);
      throw error;
    }
  }

  // =============================================
  // Process Instances
  // =============================================

  static async getProcessInstances(
    filters: ProcessInstanceFilters
  ): Promise<ProcessInstanceListResponse> {
    try {
      let query = this.supabase
        .from('process_instances')
        .select(
          `
          *,
          process:process_definitions(
            id, name, category, sla_hours, target_value_add_ratio,
            institution:institutions(id, name)
          )
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (filters.process_id) {
        query = query.eq('process_id', filters.process_id);
      }

      if (filters.reference_type) {
        query = query.eq('reference_type', filters.reference_type);
      }

      if (filters.sla_status) {
        query = query.eq('sla_status', filters.sla_status);
      }

      if (filters.is_completed !== undefined) {
        if (filters.is_completed) {
          query = query.not('completed_at', 'is', null);
        } else {
          query = query.is('completed_at', null);
        }
      }

      if (filters.started_from) {
        query = query.gte('started_at', filters.started_from);
      }

      if (filters.started_to) {
        query = query.lte('started_at', filters.started_to);
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'started_at';
      const sortDirection = filters.sortDirection || 'desc';
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error('[process-excellence] Error fetching instances:', error);
        throw new Error(`Failed to fetch process instances: ${error.message}`);
      }

      return {
        data: (data as unknown as ProcessInstance[]) || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      console.error('[process-excellence] Error in getProcessInstances:', error);
      throw error;
    }
  }

  static async getProcessInstance(id: string, institutionId?: string): Promise<ProcessInstance> {
    try {
      let query = this.supabase
        .from('process_instances')
        .select(
          `
          *,
          process:process_definitions!inner(*, institution_id)
        `
        )
        .eq('id', id);

      const { data, error } = await query.single();

      if (error) {
        console.error('[process-excellence] Error fetching instance:', error);
        // SECURITY: Don't expose internal error details
        if (error.code === 'PGRST116') {
          throw new Error('Process instance not found or access denied');
        }
        throw new Error('Failed to fetch process instance');
      }

      if (!data) {
        throw new Error('Process instance not found');
      }

      // SECURITY: Verify institution access if institutionId provided
      if (institutionId && (data.process as any)?.institution_id !== institutionId) {
        throw new Error('Process instance not found or access denied');
      }

      return data as unknown as ProcessInstance;
    } catch (error) {
      console.error('[process-excellence] Error in getProcessInstance:', error);
      throw error;
    }
  }

  static async startProcessInstance(
    params: StartProcessInstanceDto
  ): Promise<ProcessInstance> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await this.supabase
        .from('process_instances')
        .insert({
          ...params,
          started_at: now,
          current_stage: 'initiated',
          stage_history: [
            {
              stage: 'initiated',
              started_at: now,
              completed_at: null,
              duration_hours: null
            }
          ]
        })
        .select(
          `
          *,
          process:process_definitions(*)
        `
        )
        .single();

      if (error) {
        console.error('[process-excellence] Error starting instance:', error);
        if (error.code === '23505') {
          throw new Error('A process instance already exists for this reference');
        }
        throw new Error(`Failed to start process instance: ${error.message}`);
      }

      return data as unknown as ProcessInstance;
    } catch (error) {
      console.error('[process-excellence] Error in startProcessInstance:', error);
      throw error;
    }
  }

  static async advanceStage(
    instanceId: string,
    newStage: string,
    isValueAdd?: boolean,
    institutionId?: string
  ): Promise<ProcessInstance> {
    try {
      // RACE CONDITION FIX: Use a transaction-like approach with optimistic locking
      // Get current instance with version check
      let query = this.supabase
        .from('process_instances')
        .select('*, process:process_definitions!inner(institution_id)')
        .eq('id', instanceId);

      const { data: instance, error: fetchError } = await query.single();

      if (fetchError || !instance) {
        throw new Error('Process instance not found');
      }

      // SECURITY: Verify institution access
      if (institutionId && (instance.process as any)?.institution_id !== institutionId) {
        throw new Error('Access denied');
      }

      const now = new Date().toISOString();
      // Create a new copy to avoid mutation issues
      const history = JSON.parse(JSON.stringify(instance.stage_history || [])) as StageHistory[];

      // Close current stage
      const lastStage = history[history.length - 1];
      if (lastStage && !lastStage.completed_at) {
        lastStage.completed_at = now;
        lastStage.duration_hours =
          (new Date(now).getTime() - new Date(lastStage.started_at).getTime()) /
          (1000 * 60 * 60);
      }

      // Add new stage
      history.push({
        stage: newStage,
        started_at: now,
        completed_at: null,
        duration_hours: null,
        is_value_add: isValueAdd
      });

      // Use the original updated_at as optimistic lock
      let updateQuery = this.supabase
        .from('process_instances')
        .update({
          current_stage: newStage,
          stage_history: history
        })
        .eq('id', instanceId);

      // Add optimistic locking by checking updated_at hasn't changed
      if (instance.updated_at) {
        updateQuery = updateQuery.eq('updated_at', instance.updated_at);
      }

      const { data, error } = await updateQuery
        .select(
          `
          *,
          process:process_definitions(*)
        `
        )
        .single();

      if (error) {
        console.error('[process-excellence] Error advancing stage:', error);
        throw new Error(`Failed to advance stage: ${error.message}`);
      }

      return data as unknown as ProcessInstance;
    } catch (error) {
      console.error('[process-excellence] Error in advanceStage:', error);
      throw error;
    }
  }

  static async completeProcess(instanceId: string): Promise<ProcessInstance> {
    try {
      // Get current instance with process details
      const { data: instance, error: fetchError } = await this.supabase
        .from('process_instances')
        .select('*, process:process_definitions(*)')
        .eq('id', instanceId)
        .single();

      if (fetchError || !instance) {
        throw new Error('Process instance not found');
      }

      const now = new Date().toISOString();
      const history = (instance.stage_history as StageHistory[]) || [];
      const process = instance.process as ProcessDefinition;

      // Close final stage
      const lastStage = history[history.length - 1];
      if (lastStage && !lastStage.completed_at) {
        lastStage.completed_at = now;
        lastStage.duration_hours =
          (new Date(now).getTime() - new Date(lastStage.started_at).getTime()) /
          (1000 * 60 * 60);
      }

      // Calculate metrics
      const totalHours = history.reduce(
        (sum, s) => sum + (s.duration_hours || 0),
        0
      );

      // Get value-add stages from process definition
      const valueAddStageNames = (process?.stages || [])
        .filter((s) => s.is_value_add)
        .map((s) => s.name);

      const valueAddHours = history
        .filter(
          (s) => valueAddStageNames.includes(s.stage) || s.is_value_add === true
        )
        .reduce((sum, s) => sum + (s.duration_hours || 0), 0);

      const valueAddRatio =
        totalHours > 0 ? (valueAddHours / totalHours) * 100 : 0;

      // Check SLA
      let slaStatus: SLAStatus = 'on_track';
      if (process?.sla_hours) {
        if (totalHours > process.sla_hours) {
          slaStatus = 'breached';
        } else if (totalHours > process.sla_hours * 0.8) {
          slaStatus = 'at_risk';
        }
      }

      const { data, error } = await this.supabase
        .from('process_instances')
        .update({
          completed_at: now,
          current_stage: 'completed',
          stage_history: history,
          total_cycle_hours: parseFloat(totalHours.toFixed(2)),
          value_add_hours: parseFloat(valueAddHours.toFixed(2)),
          value_add_ratio: parseFloat(valueAddRatio.toFixed(2)),
          sla_status: slaStatus
        })
        .eq('id', instanceId)
        .select(
          `
          *,
          process:process_definitions(*)
        `
        )
        .single();

      if (error) {
        console.error('[process-excellence] Error completing process:', error);
        throw new Error(`Failed to complete process: ${error.message}`);
      }

      return data as unknown as ProcessInstance;
    } catch (error) {
      console.error('[process-excellence] Error in completeProcess:', error);
      throw error;
    }
  }

  static async getInstanceByReference(
    referenceType: string,
    referenceId: string
  ): Promise<ProcessInstance | null> {
    try {
      const { data, error } = await this.supabase
        .from('process_instances')
        .select(
          `
          *,
          process:process_definitions(*)
        `
        )
        .eq('reference_type', referenceType)
        .eq('reference_id', referenceId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(`Failed to fetch process instance: ${error.message}`);
      }

      return data as unknown as ProcessInstance;
    } catch (error) {
      console.error('[process-excellence] Error in getInstanceByReference:', error);
      throw error;
    }
  }

  // =============================================
  // Waste Incidents
  // =============================================

  static async getWasteIncidents(
    filters: WasteIncidentFilters
  ): Promise<WasteIncidentListResponse> {
    try {
      let query = this.supabase
        .from('waste_incidents')
        .select(
          `
          *,
          process:process_definitions(id, name, category),
          reporter:profiles!waste_incidents_reported_by_fkey(id, full_name, email),
          institution:institutions(id, name)
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.process_id) {
        query = query.eq('process_id', filters.process_id);
      }

      if (filters.process_instance_id) {
        query = query.eq('process_instance_id', filters.process_instance_id);
      }

      if (filters.waste_category) {
        query = query.eq('waste_category', filters.waste_category);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.reported_from) {
        query = query.gte('reported_at', filters.reported_from);
      }

      if (filters.reported_to) {
        query = query.lte('reported_at', filters.reported_to);
      }

      if (filters.search) {
        // SECURITY FIX: Sanitize search to prevent SQL injection
        const sanitizedSearch = sanitizeSearch(filters.search);
        query = query.or(
          `description.ilike.%${sanitizedSearch}%,root_cause.ilike.%${sanitizedSearch}%`
        );
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'reported_at';
      const sortDirection = filters.sortDirection || 'desc';
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error('[process-excellence] Error fetching waste incidents:', error);
        throw new Error(`Failed to fetch waste incidents: ${error.message}`);
      }

      return {
        data: (data as unknown as WasteIncident[]) || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      console.error('[process-excellence] Error in getWasteIncidents:', error);
      throw error;
    }
  }

  static async getWasteIncident(id: string): Promise<WasteIncident> {
    try {
      const { data, error } = await this.supabase
        .from('waste_incidents')
        .select(
          `
          *,
          process:process_definitions(id, name, category),
          process_instance:process_instances(id, current_stage, sla_status),
          reporter:profiles!waste_incidents_reported_by_fkey(id, full_name, email),
          institution:institutions(id, name)
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        console.error('[process-excellence] Error fetching waste incident:', error);
        throw new Error(`Failed to fetch waste incident: ${error.message}`);
      }

      if (!data) {
        throw new Error('Waste incident not found');
      }

      return data as unknown as WasteIncident;
    } catch (error) {
      console.error('[process-excellence] Error in getWasteIncident:', error);
      throw error;
    }
  }

  static async reportWaste(
    incident: CreateWasteIncidentDto
  ): Promise<WasteIncident> {
    try {
      const user = (await this.supabase.auth.getUser()).data.user;

      const { data, error } = await this.supabase
        .from('waste_incidents')
        .insert({
          ...incident,
          reported_by: user?.id,
          status: 'open'
        })
        .select(
          `
          *,
          process:process_definitions(id, name, category),
          reporter:profiles!waste_incidents_reported_by_fkey(id, full_name, email),
          institution:institutions(id, name)
        `
        )
        .single();

      if (error) {
        console.error('[process-excellence] Error reporting waste:', error);
        throw new Error(`Failed to report waste incident: ${error.message}`);
      }

      return data as unknown as WasteIncident;
    } catch (error) {
      console.error('[process-excellence] Error in reportWaste:', error);
      throw error;
    }
  }

  static async updateWasteIncident(
    id: string,
    updates: UpdateWasteIncidentDto
  ): Promise<WasteIncident> {
    try {
      const user = (await this.supabase.auth.getUser()).data.user;

      const updateData: Record<string, unknown> = { ...updates };

      // If resolving, set resolved_at and resolved_by
      if (updates.status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolved_by = user?.id;
      }

      const { data, error } = await this.supabase
        .from('waste_incidents')
        .update(updateData)
        .eq('id', id)
        .select(
          `
          *,
          process:process_definitions(id, name, category),
          reporter:profiles!waste_incidents_reported_by_fkey(id, full_name, email),
          institution:institutions(id, name)
        `
        )
        .single();

      if (error) {
        console.error('[process-excellence] Error updating waste incident:', error);
        throw new Error(`Failed to update waste incident: ${error.message}`);
      }

      return data as unknown as WasteIncident;
    } catch (error) {
      console.error('[process-excellence] Error in updateWasteIncident:', error);
      throw error;
    }
  }

  static async deleteWasteIncident(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('waste_incidents')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[process-excellence] Error deleting waste incident:', error);
        throw new Error(`Failed to delete waste incident: ${error.message}`);
      }
    } catch (error) {
      console.error('[process-excellence] Error in deleteWasteIncident:', error);
      throw error;
    }
  }

  // =============================================
  // Process Audits
  // =============================================

  static async getProcessAudits(
    filters: ProcessAuditFilters
  ): Promise<ProcessAuditListResponse> {
    try {
      let query = this.supabase
        .from('process_audits')
        .select(
          `
          *,
          process:process_definitions(id, name, category),
          auditor:profiles!process_audits_auditor_id_fkey(id, full_name, email),
          institution:institutions(id, name)
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.process_id) {
        query = query.eq('process_id', filters.process_id);
      }

      if (filters.auditor_id) {
        query = query.eq('auditor_id', filters.auditor_id);
      }

      if (filters.abcd_rating) {
        query = query.eq('abcd_rating', filters.abcd_rating);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.period_from) {
        query = query.gte('audit_period_start', filters.period_from);
      }

      if (filters.period_to) {
        query = query.lte('audit_period_end', filters.period_to);
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'created_at';
      const sortDirection = filters.sortDirection || 'desc';
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error('[process-excellence] Error fetching audits:', error);
        throw new Error(`Failed to fetch process audits: ${error.message}`);
      }

      return {
        data: (data as unknown as ProcessAudit[]) || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      console.error('[process-excellence] Error in getProcessAudits:', error);
      throw error;
    }
  }

  static async getProcessAudit(id: string): Promise<ProcessAudit> {
    try {
      const { data, error } = await this.supabase
        .from('process_audits')
        .select(
          `
          *,
          process:process_definitions(id, name, category, stages, sla_hours, target_value_add_ratio),
          auditor:profiles!process_audits_auditor_id_fkey(id, full_name, email),
          institution:institutions(id, name)
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        console.error('[process-excellence] Error fetching audit:', error);
        throw new Error(`Failed to fetch process audit: ${error.message}`);
      }

      if (!data) {
        throw new Error('Process audit not found');
      }

      return data as unknown as ProcessAudit;
    } catch (error) {
      console.error('[process-excellence] Error in getProcessAudit:', error);
      throw error;
    }
  }

  static async createProcessAudit(
    audit: CreateProcessAuditDto
  ): Promise<ProcessAudit> {
    try {
      const user = (await this.supabase.auth.getUser()).data.user;

      // Generate audit metrics using database function
      const { data: metricsResult, error: metricsError } = await this.supabase
        .rpc('generate_process_audit_metrics', {
          p_institution_id: audit.institution_id,
          p_process_id: audit.process_id,
          p_period_start: audit.audit_period_start,
          p_period_end: audit.audit_period_end
        });

      if (metricsError) {
        console.warn('[process-excellence] Could not generate metrics:', metricsError);
      }

      const metrics = metricsResult || {
        total_instances: 0,
        avg_cycle_hours: null,
        avg_value_add_ratio: null,
        sla_compliance_rate: null,
        waste_breakdown: {}
      };

      const { data, error } = await this.supabase
        .from('process_audits')
        .insert({
          ...audit,
          auditor_id: audit.auditor_id || user?.id,
          total_instances: metrics.total_instances,
          avg_cycle_hours: metrics.avg_cycle_hours,
          avg_value_add_ratio: metrics.avg_value_add_ratio,
          sla_compliance_rate: metrics.sla_compliance_rate,
          waste_breakdown: metrics.waste_breakdown,
          status: 'draft'
        })
        .select(
          `
          *,
          process:process_definitions(id, name, category),
          auditor:profiles!process_audits_auditor_id_fkey(id, full_name, email),
          institution:institutions(id, name)
        `
        )
        .single();

      if (error) {
        console.error('[process-excellence] Error creating audit:', error);
        throw new Error(`Failed to create process audit: ${error.message}`);
      }

      return data as unknown as ProcessAudit;
    } catch (error) {
      console.error('[process-excellence] Error in createProcessAudit:', error);
      throw error;
    }
  }

  static async updateProcessAudit(
    id: string,
    updates: UpdateProcessAuditDto
  ): Promise<ProcessAudit> {
    try {
      const updateData: Record<string, unknown> = { ...updates };

      // If finalizing, set finalized_at
      if (updates.status === 'finalized') {
        updateData.finalized_at = new Date().toISOString();
      }

      const { data, error } = await this.supabase
        .from('process_audits')
        .update(updateData)
        .eq('id', id)
        .select(
          `
          *,
          process:process_definitions(id, name, category),
          auditor:profiles!process_audits_auditor_id_fkey(id, full_name, email),
          institution:institutions(id, name)
        `
        )
        .single();

      if (error) {
        console.error('[process-excellence] Error updating audit:', error);
        throw new Error(`Failed to update process audit: ${error.message}`);
      }

      return data as unknown as ProcessAudit;
    } catch (error) {
      console.error('[process-excellence] Error in updateProcessAudit:', error);
      throw error;
    }
  }

  static async deleteProcessAudit(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('process_audits')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[process-excellence] Error deleting audit:', error);
        throw new Error(`Failed to delete process audit: ${error.message}`);
      }
    } catch (error) {
      console.error('[process-excellence] Error in deleteProcessAudit:', error);
      throw error;
    }
  }

  // =============================================
  // Metrics & Analytics
  // =============================================

  static async getProcessMetrics(
    filters: ProcessMetricsFilters
  ): Promise<ProcessMetrics[]> {
    try {
      // Get completed instances with process details
      let query = this.supabase
        .from('process_instances')
        .select(
          `
          *,
          process:process_definitions!inner(id, name, category, institution_id)
        `
        )
        .not('completed_at', 'is', null);

      if (filters.period_start) {
        query = query.gte('started_at', filters.period_start);
      }

      if (filters.period_end) {
        query = query.lte('started_at', filters.period_end);
      }

      const { data: instances, error: instancesError } = await query;

      if (instancesError) {
        throw new Error(`Failed to fetch instances: ${instancesError.message}`);
      }

      // Get waste incidents
      const { data: wasteData, error: wasteError } = await this.supabase
        .from('waste_incidents')
        .select('process_id')
        .eq('institution_id', filters.institution_id);

      if (wasteError) {
        console.warn('[process-excellence] Could not fetch waste data:', wasteError);
      }

      // Group by process
      const metricsMap = new Map<string, ProcessMetrics>();

      instances?.forEach((inst: any) => {
        const process = inst.process;
        if (process.institution_id !== filters.institution_id) return;
        if (filters.process_id && process.id !== filters.process_id) return;
        if (filters.category && process.category !== filters.category) return;

        if (!metricsMap.has(process.id)) {
          metricsMap.set(process.id, {
            process_id: process.id,
            process_name: process.name,
            category: process.category,
            total_instances: 0,
            completed_instances: 0,
            in_progress_instances: 0,
            avg_cycle_time: 0,
            value_add_ratio: 0,
            sla_compliance: 0,
            waste_count: 0,
            abcd_distribution: { A: 0, B: 0, C: 0, D: 0 }
          });
        }

        const metrics = metricsMap.get(process.id)!;
        metrics.total_instances++;
        metrics.completed_instances++;
        metrics.avg_cycle_time += inst.total_cycle_hours || 0;
        metrics.value_add_ratio += inst.value_add_ratio || 0;
        if (inst.sla_status !== 'breached') metrics.sla_compliance++;
      });

      // Calculate averages and add waste counts
      metricsMap.forEach((metrics, processId) => {
        if (metrics.completed_instances > 0) {
          metrics.avg_cycle_time /= metrics.completed_instances;
          metrics.value_add_ratio /= metrics.completed_instances;
          metrics.sla_compliance =
            (metrics.sla_compliance / metrics.completed_instances) * 100;
        }

        // Count waste incidents for this process
        metrics.waste_count =
          wasteData?.filter((w: any) => w.process_id === processId).length || 0;
      });

      return Array.from(metricsMap.values());
    } catch (error) {
      console.error('[process-excellence] Error in getProcessMetrics:', error);
      throw error;
    }
  }

  static async getWasteAnalytics(
    institutionId: string,
    processId?: string
  ): Promise<WasteAnalytics> {
    try {
      let query = this.supabase
        .from('waste_incidents')
        .select('*, process:process_definitions(id, name)')
        .eq('institution_id', institutionId);

      if (processId) {
        query = query.eq('process_id', processId);
      }

      const { data: incidents, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch waste incidents: ${error.message}`);
      }

      const allIncidents = incidents || [];
      const totalIncidents = allIncidents.length;
      const resolvedIncidents = allIncidents.filter(
        (i: any) => i.status === 'resolved'
      ).length;

      // Calculate by category
      const byCategory: Record<
        WasteCategory,
        { count: number; time_lost: number; cost_impact: number; percentage: number }
      > = {
        T: { count: 0, time_lost: 0, cost_impact: 0, percentage: 0 },
        I: { count: 0, time_lost: 0, cost_impact: 0, percentage: 0 },
        M: { count: 0, time_lost: 0, cost_impact: 0, percentage: 0 },
        W: { count: 0, time_lost: 0, cost_impact: 0, percentage: 0 },
        O1: { count: 0, time_lost: 0, cost_impact: 0, percentage: 0 },
        O2: { count: 0, time_lost: 0, cost_impact: 0, percentage: 0 },
        D: { count: 0, time_lost: 0, cost_impact: 0, percentage: 0 },
        TU: { count: 0, time_lost: 0, cost_impact: 0, percentage: 0 }
      };

      let totalTimeLost = 0;
      let totalCostImpact = 0;

      allIncidents.forEach((incident: any) => {
        const cat = incident.waste_category as WasteCategory;
        byCategory[cat].count++;
        byCategory[cat].time_lost += incident.estimated_time_lost_hours || 0;
        byCategory[cat].cost_impact += incident.estimated_cost_impact || 0;
        totalTimeLost += incident.estimated_time_lost_hours || 0;
        totalCostImpact += incident.estimated_cost_impact || 0;
      });

      // Calculate percentages
      Object.keys(byCategory).forEach((cat) => {
        const category = cat as WasteCategory;
        byCategory[category].percentage =
          totalIncidents > 0
            ? (byCategory[category].count / totalIncidents) * 100
            : 0;
      });

      // Group by process
      const byProcessMap = new Map<
        string,
        { process_id: string; process_name: string; incident_count: number; time_lost: number }
      >();

      allIncidents.forEach((incident: any) => {
        if (!incident.process_id) return;

        if (!byProcessMap.has(incident.process_id)) {
          byProcessMap.set(incident.process_id, {
            process_id: incident.process_id,
            process_name: incident.process?.name || 'Unknown',
            incident_count: 0,
            time_lost: 0
          });
        }

        const processData = byProcessMap.get(incident.process_id)!;
        processData.incident_count++;
        processData.time_lost += incident.estimated_time_lost_hours || 0;
      });

      return {
        total_incidents: totalIncidents,
        resolved_incidents: resolvedIncidents,
        resolution_rate:
          totalIncidents > 0 ? (resolvedIncidents / totalIncidents) * 100 : 0,
        total_time_lost: totalTimeLost,
        total_cost_impact: totalCostImpact,
        by_category: byCategory,
        by_process: Array.from(byProcessMap.values()),
        trend_data: [] // Would need time-series aggregation
      };
    } catch (error) {
      console.error('[process-excellence] Error in getWasteAnalytics:', error);
      throw error;
    }
  }

  static async getDashboard(
    institutionId: string
  ): Promise<ProcessExcellenceDashboard> {
    try {
      // Get process definitions count
      const { count: totalProcesses } = await this.supabase
        .from('process_definitions')
        .select('*', { count: 'exact', head: true })
        .eq('institution_id', institutionId)
        .eq('is_active', true);

      // Get active instances
      const { data: activeInstances, count: activeCount } = await this.supabase
        .from('process_instances')
        .select('sla_status, process:process_definitions!inner(institution_id)', {
          count: 'exact'
        })
        .is('completed_at', null);

      const institutionActiveInstances =
        activeInstances?.filter(
          (i: any) => i.process?.institution_id === institutionId
        ) || [];

      // Get completed instances for metrics
      const { data: completedInstances } = await this.supabase
        .from('process_instances')
        .select(
          'value_add_ratio, sla_status, process:process_definitions!inner(institution_id)'
        )
        .not('completed_at', 'is', null);

      const institutionCompleted =
        completedInstances?.filter(
          (i: any) => i.process?.institution_id === institutionId
        ) || [];

      // Calculate SLA compliance
      const slaCompliance =
        institutionCompleted.length > 0
          ? (institutionCompleted.filter((i: any) => i.sla_status !== 'breached')
              .length /
              institutionCompleted.length) *
            100
          : 100;

      // Calculate average value-add ratio
      const avgValueAdd =
        institutionCompleted.length > 0
          ? institutionCompleted.reduce(
              (sum: number, i: any) => sum + (i.value_add_ratio || 0),
              0
            ) / institutionCompleted.length
          : 0;

      // Get waste incidents
      const { count: totalWaste } = await this.supabase
        .from('waste_incidents')
        .select('*', { count: 'exact', head: true })
        .eq('institution_id', institutionId);

      const { count: openWaste } = await this.supabase
        .from('waste_incidents')
        .select('*', { count: 'exact', head: true })
        .eq('institution_id', institutionId)
        .eq('status', 'open');

      // Get waste breakdown
      const { data: wasteBreakdown } = await this.supabase
        .from('waste_incidents')
        .select(
          'waste_category, estimated_time_lost_hours, estimated_cost_impact'
        )
        .eq('institution_id', institutionId);

      const wasteByCategory = new Map<
        WasteCategory,
        { count: number; total_hours_lost: number; total_cost_impact: number }
      >();

      (wasteBreakdown || []).forEach((w: any) => {
        const cat = w.waste_category as WasteCategory;
        if (!wasteByCategory.has(cat)) {
          wasteByCategory.set(cat, {
            count: 0,
            total_hours_lost: 0,
            total_cost_impact: 0
          });
        }
        const data = wasteByCategory.get(cat)!;
        data.count++;
        data.total_hours_lost += w.estimated_time_lost_hours || 0;
        data.total_cost_impact += w.estimated_cost_impact || 0;
      });

      // Get SLA distribution
      const slaDistribution = {
        on_track: institutionActiveInstances.filter(
          (i: any) => i.sla_status === 'on_track'
        ).length,
        at_risk: institutionActiveInstances.filter(
          (i: any) => i.sla_status === 'at_risk'
        ).length,
        breached: institutionActiveInstances.filter(
          (i: any) => i.sla_status === 'breached'
        ).length
      };

      // Get recent audits
      const { data: recentAudits } = await this.supabase
        .from('process_audits')
        .select(
          `
          *,
          process:process_definitions(id, name, category),
          auditor:profiles!process_audits_auditor_id_fkey(id, full_name, email)
        `
        )
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Get process metrics
      const metrics = await this.getProcessMetrics({
        institution_id: institutionId
      });

      return {
        summary: {
          total_processes: totalProcesses || 0,
          active_instances: institutionActiveInstances.length,
          sla_compliance_rate: parseFloat(slaCompliance.toFixed(2)),
          avg_value_add_ratio: parseFloat(avgValueAdd.toFixed(2)),
          total_waste_incidents: totalWaste || 0,
          open_waste_incidents: openWaste || 0
        },
        process_metrics: metrics,
        waste_breakdown: Array.from(wasteByCategory.entries()).map(
          ([category, data]) => ({
            category,
            label:
              {
                T: 'Transportation',
                I: 'Inventory',
                M: 'Motion',
                W: 'Waiting',
                O1: 'Over-production',
                O2: 'Over-processing',
                D: 'Defects',
                TU: 'Talent Under-utilization'
              }[category] || category,
            ...data
          })
        ),
        sla_distribution: slaDistribution,
        recent_audits: (recentAudits as unknown as ProcessAudit[]) || [],
        trending_processes: [] // Would need historical comparison
      };
    } catch (error) {
      console.error('[process-excellence] Error in getDashboard:', error);
      throw error;
    }
  }
}
