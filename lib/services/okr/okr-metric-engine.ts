// ============================================================================
// OKR Metric Engine - Universal Auto-Metrics System
// Handles all metric source types: DB, Edge Functions, External APIs
// Goal: Zero manual data entry for OKR metrics
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// Types
// ============================================================================

export type MetricSourceType = 'db_query' | 'db_function' | 'edge_function' | 'external_api' | 'computed';
export type MetricValueType = 'number' | 'percentage' | 'currency' | 'count' | 'ratio' | 'duration' | 'score';
export type MetricScope = 'individual' | 'section' | 'department' | 'program' | 'institution' | 'organization';
export type MetricRefreshFrequency = 'realtime' | 'minute_5' | 'minute_15' | 'hourly' | 'daily' | 'weekly' | 'on_demand';

export interface MetricRegistryEntry {
  id: string;
  metric_key: string;
  display_name: string;
  description: string | null;
  module: string;
  category: string;
  applicable_roles: string[];
  applicable_scopes: MetricScope[];
  requires_context: Record<string, boolean>;
  source_type: MetricSourceType;
  source_config: Record<string, unknown>;
  value_type: MetricValueType;
  unit: string;
  precision: number;
  min_value: number | null;
  max_value: number | null;
  default_baseline: number;
  default_target: number | null;
  refresh_frequency: MetricRefreshFrequency;
  cache_duration_seconds: number;
  icon: string | null;
  color: string | null;
  display_format: string | null;
  chart_type: string;
  is_active: boolean;
  is_system: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface MetricContext {
  profile_id?: string;
  institution_id?: string;
  department_id?: string;
  section_id?: string;
  program_id?: string;
  semester_id?: string;
  scope?: MetricScope;
  start_date?: string;
  end_date?: string;
  [key: string]: unknown;
}

export interface MetricResult {
  value: number | null;
  raw_data?: Record<string, unknown>;
  source_type: MetricSourceType;
  executed_at: string;
  was_cached: boolean;
  execution_duration_ms?: number;
  error?: string;
}

export interface MetricFilter {
  module?: string;
  category?: string;
  roles?: string[];
  scopes?: MetricScope[];
  tags?: string[];
  search?: string;
  is_active?: boolean;
}

export interface ExternalApiCredentials {
  id: string;
  api_name: string;
  display_name: string;
  auth_type: 'api_key' | 'oauth2' | 'basic' | 'bearer' | 'custom';
  auth_config: Record<string, unknown>;
  base_url: string;
  default_headers: Record<string, string>;
  rate_limit_per_minute: number;
  timeout_seconds: number;
  is_active: boolean;
}

export interface BulkMetricSyncResult {
  total: number;
  synced: number;
  failed: number;
  cached: number;
  results: Array<{
    metric_key: string;
    value: number | null;
    error?: string;
    was_cached: boolean;
  }>;
}

// ============================================================================
// Metric Engine Service
// ============================================================================

export class OKRMetricEngine {
  private static supabase = createClientSupabaseClient();

  // ==========================================================================
  // Registry Operations
  // ==========================================================================

  /**
   * Get all available metrics from the registry
   */
  static async getAvailableMetrics(filter?: MetricFilter): Promise<MetricRegistryEntry[]> {
    try {
      let query = (this.supabase as any)
        .from('okr_metric_registry')
        .select('*')
        .eq('is_active', true);

      if (filter?.module) {
        query = query.eq('module', filter.module);
      }
      if (filter?.category) {
        query = query.eq('category', filter.category);
      }
      if (filter?.roles && filter.roles.length > 0) {
        query = query.overlaps('applicable_roles', filter.roles);
      }
      if (filter?.scopes && filter.scopes.length > 0) {
        query = query.overlaps('applicable_scopes', filter.scopes);
      }
      if (filter?.tags && filter.tags.length > 0) {
        query = query.overlaps('tags', filter.tags);
      }
      if (filter?.search) {
        // Escape special characters that could break the .or() query
        const escapedSearch = filter.search.replace(/[%,()]/g, '\\$&');
        query = query.or(`display_name.ilike.%${escapedSearch}%,description.ilike.%${escapedSearch}%,metric_key.ilike.%${escapedSearch}%`);
      }

      const { data, error } = await query.order('module').order('display_name');

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR Metric Engine] Error fetching metrics:', error?.message);
      throw error;
    }
  }

  /**
   * Get a specific metric by key
   */
  static async getMetricByKey(metricKey: string): Promise<MetricRegistryEntry | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_metric_registry')
        .select('*')
        .eq('metric_key', metricKey)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error: any) {
      console.error('[OKR Metric Engine] Error fetching metric:', error?.message);
      throw error;
    }
  }

  /**
   * Get metrics grouped by module
   */
  static async getMetricsByModule(): Promise<Record<string, MetricRegistryEntry[]>> {
    try {
      const metrics = await this.getAvailableMetrics();
      return metrics.reduce((acc, metric) => {
        if (!acc[metric.module]) {
          acc[metric.module] = [];
        }
        acc[metric.module].push(metric);
        return acc;
      }, {} as Record<string, MetricRegistryEntry[]>);
    } catch (error: any) {
      console.error('[OKR Metric Engine] Error grouping metrics:', error?.message);
      throw error;
    }
  }

  /**
   * Get metrics applicable to a user's role
   */
  static async getMetricsForRole(role: string, scope?: MetricScope): Promise<MetricRegistryEntry[]> {
    return this.getAvailableMetrics({
      roles: [role],
      scopes: scope ? [scope] : undefined,
    });
  }

  // ==========================================================================
  // Metric Execution
  // ==========================================================================

  /**
   * Execute a metric and get its current value
   * @param metricKey - The metric key to execute
   * @param context - The context for metric execution
   * @param visitedMetrics - (Internal) Set of visited metrics for circular dependency detection
   */
  static async executeMetric(
    metricKey: string,
    context: MetricContext,
    visitedMetrics?: Set<string>
  ): Promise<MetricResult> {
    const startTime = Date.now();

    try {
      // Get metric configuration
      const metric = await this.getMetricByKey(metricKey);
      if (!metric) {
        return {
          value: null,
          source_type: 'db_query',
          executed_at: new Date().toISOString(),
          was_cached: false,
          error: `Metric not found: ${metricKey}`,
        };
      }

      // Validate required context
      const missingContext = this.validateContext(metric, context);
      if (missingContext.length > 0) {
        return {
          value: null,
          source_type: metric.source_type,
          executed_at: new Date().toISOString(),
          was_cached: false,
          error: `Missing required context: ${missingContext.join(', ')}`,
        };
      }

      // Check cache first (unless realtime)
      if (metric.refresh_frequency !== 'realtime') {
        const cachedValue = await this.getCachedValue(metricKey, context);
        if (cachedValue !== null) {
          return {
            value: cachedValue,
            source_type: metric.source_type,
            executed_at: new Date().toISOString(),
            was_cached: true,
            execution_duration_ms: Date.now() - startTime,
          };
        }
      }

      // Execute based on source type
      let result: MetricResult;

      switch (metric.source_type) {
        case 'db_function':
          result = await this.executeDbFunction(metric, context);
          break;
        case 'db_query':
          result = await this.executeDbQuery(metric, context);
          break;
        case 'edge_function':
          result = await this.executeEdgeFunction(metric, context);
          break;
        case 'external_api':
          result = await this.executeExternalApi(metric, context);
          break;
        case 'computed':
          // Pass visitedMetrics to enable circular dependency detection across nested metrics
          result = await this.executeComputedMetric(metric, context, visitedMetrics);
          break;
        default:
          result = {
            value: null,
            source_type: metric.source_type,
            executed_at: new Date().toISOString(),
            was_cached: false,
            error: `Unknown source type: ${metric.source_type}`,
          };
      }

      // Cache successful results
      if (result.value !== null && !result.error && metric.refresh_frequency !== 'realtime') {
        await this.cacheValue(metricKey, context, result.value, metric.cache_duration_seconds);
      }

      // Log execution
      await this.logExecution(metricKey, context, result, Date.now() - startTime);

      result.execution_duration_ms = Date.now() - startTime;
      return result;

    } catch (error: any) {
      console.error('[OKR Metric Engine] Execution error:', error?.message);
      return {
        value: null,
        source_type: 'db_query',
        executed_at: new Date().toISOString(),
        was_cached: false,
        execution_duration_ms: Date.now() - startTime,
        error: error?.message || 'Unknown error',
      };
    }
  }

  /**
   * Execute a database function
   * Note: All wrapper functions use standardized 4-param signature:
   * (p_profile_id, p_institution_id, p_start_date, p_end_date)
   */
  private static async executeDbFunction(metric: MetricRegistryEntry, context: MetricContext): Promise<MetricResult> {
    try {
      const config = metric.source_config as { function_name: string; params?: Record<string, string> };

      // Call the RPC function with standardized 4 parameters
      // Wrapper functions handle conversion to underlying function signatures
      const { data, error } = await (this.supabase as any)
        .rpc(config.function_name, {
          p_profile_id: context.profile_id || null,
          p_institution_id: context.institution_id || null,
          p_start_date: context.start_date || null,
          p_end_date: context.end_date || null,
        });

      if (error) throw error;

      return {
        value: typeof data === 'number' ? data : (data?.[0]?.value ?? data ?? null),
        source_type: 'db_function',
        executed_at: new Date().toISOString(),
        was_cached: false,
      };
    } catch (error: any) {
      return {
        value: null,
        source_type: 'db_function',
        executed_at: new Date().toISOString(),
        was_cached: false,
        error: error?.message,
      };
    }
  }

  /**
   * Execute a raw database query
   * Note: Actual query substitution happens server-side in execute_metric function
   */
  private static async executeDbQuery(metric: MetricRegistryEntry, context: MetricContext): Promise<MetricResult> {
    try {
      // Execute via RPC - the SQL function handles variable substitution
      const { data, error } = await (this.supabase as any)
        .rpc('execute_metric', {
          p_metric_key: metric.metric_key,
          p_context: context,
        });

      if (error) throw error;

      const result = data?.[0];
      return {
        value: result?.value ?? null,
        raw_data: result?.raw_data,
        source_type: 'db_query',
        executed_at: new Date().toISOString(),
        was_cached: result?.was_cached ?? false,
        error: result?.error,
      };
    } catch (error: any) {
      return {
        value: null,
        source_type: 'db_query',
        executed_at: new Date().toISOString(),
        was_cached: false,
        error: error?.message,
      };
    }
  }

  /**
   * Execute a Supabase Edge Function
   */
  private static async executeEdgeFunction(metric: MetricRegistryEntry, context: MetricContext): Promise<MetricResult> {
    try {
      const config = metric.source_config as {
        function_name: string;
        method?: string;
        params?: Record<string, unknown>;
      };

      // Prepare params with context substitution
      const params = this.substituteObjectVariables(config.params || {}, context);

      const { data, error } = await (this.supabase as any).functions.invoke(config.function_name, {
        body: {
          ...params,
          context,
        },
      });

      if (error) throw error;

      return {
        value: data?.value ?? null,
        raw_data: data,
        source_type: 'edge_function',
        executed_at: new Date().toISOString(),
        was_cached: false,
      };
    } catch (error: any) {
      return {
        value: null,
        source_type: 'edge_function',
        executed_at: new Date().toISOString(),
        was_cached: false,
        error: error?.message,
      };
    }
  }

  /**
   * Execute an external API call
   */
  private static async executeExternalApi(metric: MetricRegistryEntry, context: MetricContext): Promise<MetricResult> {
    try {
      const config = metric.source_config as {
        endpoint: string;
        method?: string;
        headers?: Record<string, string>;
        params?: Record<string, unknown>;
        body?: Record<string, unknown>;
        response_path?: string;
        auth_ref?: string;
      };

      // Get API credentials if referenced
      let authHeaders: Record<string, string> = {};
      let timeoutMs = 30000; // Default 30 seconds
      if (config.auth_ref) {
        const credentials = await this.getApiCredentials(config.auth_ref);
        if (credentials) {
          authHeaders = await this.buildAuthHeaders(credentials);
          timeoutMs = (credentials.timeout_seconds || 30) * 1000;
        }
      }

      // Build URL with parameter substitution
      let url = this.substituteVariables(config.endpoint, context);

      // Add query params if GET
      if (config.params && config.method?.toUpperCase() !== 'POST') {
        const params = new URLSearchParams();
        const substitutedParams = this.substituteObjectVariables(config.params, context);
        Object.entries(substitutedParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        });
        url += `?${params.toString()}`;
      }

      // Make the request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method: config.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...config.headers,
            ...authHeaders,
          },
          body: config.method?.toUpperCase() === 'POST' && config.body
            ? JSON.stringify(this.substituteObjectVariables(config.body, context))
            : undefined,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Extract value using response path
      let value = data;
      if (config.response_path) {
        const pathParts = config.response_path.split('.');
        for (const part of pathParts) {
          value = value?.[part];
        }
      }

      return {
        value: typeof value === 'number' ? value : parseFloat(value) || null,
        raw_data: data,
        source_type: 'external_api',
        executed_at: new Date().toISOString(),
        was_cached: false,
      };
    } catch (error: any) {
      return {
        value: null,
        source_type: 'external_api',
        executed_at: new Date().toISOString(),
        was_cached: false,
        error: error?.name === 'AbortError' ? 'Request timed out' : error?.message,
      };
    }
  }

  /**
   * Execute a computed metric (combines other metrics)
   * @param metric - The computed metric to execute
   * @param context - The execution context
   * @param visitedMetrics - Set of already visited metrics for circular dependency detection
   */
  private static async executeComputedMetric(
    metric: MetricRegistryEntry,
    context: MetricContext,
    visitedMetrics?: Set<string>
  ): Promise<MetricResult> {
    try {
      // Initialize visited set if not provided (first call in the chain)
      const visited = visitedMetrics ?? new Set<string>();

      // Detect circular dependencies
      if (visited.has(metric.metric_key)) {
        throw new Error(`Circular dependency detected: ${metric.metric_key}`);
      }
      visited.add(metric.metric_key);

      const config = metric.source_config as {
        formula: string;
        dependencies: string[];
      };

      // Execute all dependencies
      const dependencyValues: Record<string, number> = {};
      for (const dep of config.dependencies) {
        // Check if dependency would create a cycle
        if (visited.has(dep)) {
          throw new Error(`Circular dependency detected: ${dep}`);
        }
        // Pass visitedMetrics to enable detection across nested computed metrics
        const result = await this.executeMetric(dep, context, visited);
        if (result.error || result.value === null) {
          throw new Error(`Dependency failed: ${dep}`);
        }
        dependencyValues[dep] = result.value;
      }

      // Evaluate formula (simple expression evaluator)
      const value = this.evaluateFormula(config.formula, dependencyValues);

      return {
        value,
        raw_data: dependencyValues,
        source_type: 'computed',
        executed_at: new Date().toISOString(),
        was_cached: false,
      };
    } catch (error: any) {
      return {
        value: null,
        source_type: 'computed',
        executed_at: new Date().toISOString(),
        was_cached: false,
        error: error?.message,
      };
    }
  }

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Sync all metrics for a user
   */
  static async syncAllMetricsForUser(
    profileId: string,
    institutionId: string,
    role: string
  ): Promise<BulkMetricSyncResult> {
    const result: BulkMetricSyncResult = {
      total: 0,
      synced: 0,
      failed: 0,
      cached: 0,
      results: [],
    };

    try {
      // Get all applicable metrics
      const metrics = await this.getMetricsForRole(role, 'individual');
      result.total = metrics.length;

      const context: MetricContext = {
        profile_id: profileId,
        institution_id: institutionId,
        scope: 'individual',
      };

      // Execute each metric
      for (const metric of metrics) {
        const metricResult = await this.executeMetric(metric.metric_key, context);

        result.results.push({
          metric_key: metric.metric_key,
          value: metricResult.value,
          error: metricResult.error,
          was_cached: metricResult.was_cached,
        });

        if (metricResult.error) {
          result.failed++;
        } else if (metricResult.was_cached) {
          result.cached++;
        } else {
          result.synced++;
        }
      }

      return result;
    } catch (error: any) {
      console.error('[OKR Metric Engine] Bulk sync error:', error?.message);
      throw error;
    }
  }

  /**
   * Sync all auto-tracked Key Results for a user's OKRs
   */
  static async syncUserOKRMetrics(profileId: string): Promise<{
    synced: number;
    failed: number;
    results: Array<{ kr_id: string; metric_key: string; value: number | null; error?: string }>;
  }> {
    const results: Array<{ kr_id: string; metric_key: string; value: number | null; error?: string }> = [];

    try {
      // Get all auto-tracked KRs for this user's active objectives
      const { data: keyResults, error } = await (this.supabase as any)
        .from('okr_key_results')
        .select(`
          id,
          data_source_config,
          objective:okr_objectives!inner(id, status, owner_id, institution_id)
        `)
        .eq('data_source', 'auto')
        .eq('objective.status', 'active')
        .eq('objective.owner_id', profileId);

      if (error) throw error;

      for (const kr of keyResults || []) {
        const config = kr.data_source_config as { metric_key?: string } | null;
        if (!config?.metric_key) continue;

        const context: MetricContext = {
          profile_id: profileId,
          institution_id: kr.objective?.institution_id,
          scope: 'individual',
        };

        const metricResult = await this.executeMetric(config.metric_key, context);

        // Update the KR with new value
        if (metricResult.value !== null && !metricResult.error) {
          await (this.supabase as any)
            .from('okr_key_results')
            .update({
              current_value: metricResult.value,
              last_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', kr.id);
        }

        results.push({
          kr_id: kr.id,
          metric_key: config.metric_key,
          value: metricResult.value,
          error: metricResult.error,
        });
      }

      return {
        synced: results.filter(r => !r.error && r.value !== null).length,
        failed: results.filter(r => r.error).length,
        results,
      };
    } catch (error: any) {
      console.error('[OKR Metric Engine] KR sync error:', error?.message);
      throw error;
    }
  }

  // ==========================================================================
  // Cache Operations
  // ==========================================================================

  private static async getCachedValue(metricKey: string, context: MetricContext): Promise<number | null> {
    try {
      const cacheKey = this.generateCacheKey(metricKey, context);

      const { data, error } = await (this.supabase as any)
        .rpc('get_cached_metric_value', {
          p_metric_key: metricKey,
          p_cache_key: cacheKey,
        });

      if (error) return null;
      return data;
    } catch {
      return null;
    }
  }

  private static async cacheValue(
    metricKey: string,
    context: MetricContext,
    value: number,
    ttlSeconds: number
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(metricKey, context);

      await (this.supabase as any).rpc('set_cached_metric_value', {
        p_metric_key: metricKey,
        p_cache_key: cacheKey,
        p_profile_id: context.profile_id || null,
        p_institution_id: context.institution_id || null,
        p_scope: context.scope || 'individual',
        p_context_hash: this.hashContext(context),
        p_value: value,
        p_raw_data: null,
        p_ttl_seconds: ttlSeconds,
      });
    } catch (error: any) {
      console.warn('[OKR Metric Engine] Cache write failed:', error?.message);
    }
  }

  /**
   * Invalidate cache for a metric
   * @returns true if cache was invalidated successfully, false if it failed
   */
  static async invalidateCache(metricKey: string, context?: MetricContext): Promise<boolean> {
    try {
      let query = (this.supabase as any)
        .from('okr_metric_cache')
        .delete()
        .eq('metric_key', metricKey);

      if (context?.profile_id) {
        query = query.eq('profile_id', context.profile_id);
      }
      if (context?.institution_id) {
        query = query.eq('institution_id', context.institution_id);
      }

      const { error } = await query;
      if (error) {
        console.warn('[OKR Metric Engine] Cache invalidation failed:', error.message);
        return false;
      }
      return true;
    } catch (error: any) {
      console.warn('[OKR Metric Engine] Cache invalidation failed:', error?.message);
      return false;
    }
  }

  /**
   * Clean expired cache entries
   */
  static async cleanExpiredCache(): Promise<number> {
    try {
      const { data, error } = await (this.supabase as any)
        .rpc('clean_expired_metric_cache');

      if (error) throw error;
      return data || 0;
    } catch (error: any) {
      console.error('[OKR Metric Engine] Cache cleanup failed:', error?.message);
      return 0;
    }
  }

  // ==========================================================================
  // External API Credentials
  // ==========================================================================

  private static async getApiCredentials(apiName: string): Promise<ExternalApiCredentials | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_external_api_credentials')
        .select('*')
        .eq('api_name', apiName)
        .eq('is_active', true)
        .single();

      if (error) return null;
      return data;
    } catch {
      return null;
    }
  }

  private static async buildAuthHeaders(credentials: ExternalApiCredentials): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...credentials.default_headers };

    switch (credentials.auth_type) {
      case 'api_key':
        const headerName = (credentials.auth_config as { header_name?: string }).header_name || 'X-API-Key';
        headers[headerName] = (credentials.auth_config as { api_key?: string }).api_key || '';
        break;
      case 'bearer':
        headers['Authorization'] = `Bearer ${(credentials.auth_config as { token?: string }).token || ''}`;
        break;
      case 'basic':
        const { username, password } = credentials.auth_config as { username?: string; password?: string };
        const encoded = btoa(`${username}:${password}`);
        headers['Authorization'] = `Basic ${encoded}`;
        break;
      // OAuth2 would need token refresh logic - handled separately
    }

    return headers;
  }

  // ==========================================================================
  // Metric Registry Management
  // ==========================================================================

  /**
   * Register a new metric in the registry
   */
  static async registerMetric(metric: Omit<MetricRegistryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<MetricRegistryEntry> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_metric_registry')
        .insert(metric)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('[OKR Metric Engine] Registration failed:', error?.message);
      throw error;
    }
  }

  /**
   * Update an existing metric
   */
  static async updateMetric(
    metricKey: string,
    updates: Partial<MetricRegistryEntry>
  ): Promise<MetricRegistryEntry> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_metric_registry')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('metric_key', metricKey)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('[OKR Metric Engine] Update failed:', error?.message);
      throw error;
    }
  }

  /**
   * Deactivate a metric (soft delete)
   */
  static async deactivateMetric(metricKey: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('okr_metric_registry')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('metric_key', metricKey)
        .eq('is_system', false); // Can't deactivate system metrics

      if (error) throw error;
    } catch (error: any) {
      console.error('[OKR Metric Engine] Deactivation failed:', error?.message);
      throw error;
    }
  }

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  private static validateContext(metric: MetricRegistryEntry, context: MetricContext): string[] {
    const missing: string[] = [];
    const required = metric.requires_context || {};

    for (const [key, isRequired] of Object.entries(required)) {
      if (isRequired && !context[key]) {
        missing.push(key);
      }
    }

    return missing;
  }

  private static substituteVariables(template: string, context: MetricContext): string {
    let result = template;
    for (const [key, value] of Object.entries(context)) {
      // Escape special regex characters in the key to prevent regex injection
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeholder = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
      result = result.replace(placeholder, value?.toString() || '');
    }
    return result;
  }

  private static substituteObjectVariables(
    obj: Record<string, unknown>,
    context: MetricContext
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.substituteVariables(value, context);
      } else if (Array.isArray(value)) {
        // Handle arrays - recursively process each element
        result[key] = value.map(item => {
          if (typeof item === 'string') {
            return this.substituteVariables(item, context);
          } else if (typeof item === 'object' && item !== null) {
            return this.substituteObjectVariables(item as Record<string, unknown>, context);
          }
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.substituteObjectVariables(value as Record<string, unknown>, context);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private static generateCacheKey(metricKey: string, context: MetricContext): string {
    return `${metricKey}:${this.hashContext(context)}`;
  }

  private static hashContext(context: MetricContext): string {
    // Simple hash for cache key generation
    const str = JSON.stringify(context);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private static evaluateFormula(formula: string, values: Record<string, number>): number {
    // Simple formula evaluator - supports basic math operations
    // Replace metric keys with values
    let expression = formula;
    for (const [key, value] of Object.entries(values)) {
      expression = expression.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value.toString());
    }

    // Safe arithmetic evaluator — no eval/Function()
    try {
      if (!/^[\d\s+\-*/().]+$/.test(expression)) {
        throw new Error('Invalid formula expression');
      }
      return this.safeEvaluateArithmetic(expression);
    } catch {
      throw new Error(`Failed to evaluate formula: ${formula}`);
    }
  }

  /**
   * Safe arithmetic evaluator using recursive descent parsing.
   * Supports: +, -, *, /, parentheses, decimals. No eval/Function().
   */
  private static safeEvaluateArithmetic(expr: string): number {
    const tokens = expr.match(/(\d+\.?\d*|[+\-*/()])/g) || [];
    let pos = 0;

    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    const parseNumber = (): number => {
      const token = peek();
      if (token === '(') {
        consume(); // '('
        const val = parseAddSub();
        consume(); // ')'
        return val;
      }
      if (token === '-') {
        consume();
        return -parseNumber();
      }
      return parseFloat(consume());
    };

    const parseMulDiv = (): number => {
      let left = parseNumber();
      while (peek() === '*' || peek() === '/') {
        const op = consume();
        const right = parseNumber();
        left = op === '*' ? left * right : left / (right || 1);
      }
      return left;
    };

    const parseAddSub = (): number => {
      let left = parseMulDiv();
      while (peek() === '+' || peek() === '-') {
        const op = consume();
        const right = parseMulDiv();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    };

    const result = parseAddSub();
    if (isNaN(result) || !isFinite(result)) return 0;
    return result;
  }

  private static async logExecution(
    metricKey: string,
    context: MetricContext,
    result: MetricResult,
    durationMs: number
  ): Promise<void> {
    try {
      await (this.supabase as any)
        .from('okr_metric_execution_log')
        .insert({
          metric_key: metricKey,
          profile_id: context.profile_id || null,
          institution_id: context.institution_id || null,
          scope: context.scope || 'individual',
          context_params: context,
          execution_duration_ms: durationMs,
          source_type: result.source_type,
          raw_result: result.raw_data || null,
          computed_value: result.value,
          is_success: !result.error,
          error_message: result.error || null,
          was_cached: result.was_cached,
        });
    } catch (error: any) {
      // Don't fail the metric execution if logging fails
      console.warn('[OKR Metric Engine] Logging failed:', error?.message);
    }
  }
}

// Export convenience functions
export const getAvailableMetrics = OKRMetricEngine.getAvailableMetrics.bind(OKRMetricEngine);
export const executeMetric = OKRMetricEngine.executeMetric.bind(OKRMetricEngine);
export const syncUserOKRMetrics = OKRMetricEngine.syncUserOKRMetrics.bind(OKRMetricEngine);
export const registerMetric = OKRMetricEngine.registerMetric.bind(OKRMetricEngine);
