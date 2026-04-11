// lib/services/startup-studio/kpi-service.ts
// CRUD + analytics for KPI definitions, measurements, and impact reports

import { BaseService } from '../base-service';
import type {
  KpiDefinition,
  KpiMeasurement,
  ImpactReport,
  KpiDashboardData,
  KpiFilters,
  CreateKpiDefinitionInput,
  UpdateKpiDefinitionInput,
  RecordMeasurementInput,
  CreateImpactReportInput,
  UpdateImpactReportInput,
  ImpactReportFilters,
  FrameworkCompliance,
} from '@/types/startup-studio';

const KPI_SELECT = '*';

const MEASUREMENT_SELECT = '*';

const REPORT_SELECT = '*';

export class KpiService extends BaseService {
  // ============================================
  // KPI DEFINITIONS
  // ============================================

  /**
   * List KPI definitions with optional filters
   */
  static async getKpiDefinitions(filters: KpiFilters = {}): Promise<KpiDefinition[]> {
    let query = this.supabase
      .from('ss_kpi_definitions')
      .select(KPI_SELECT)
      .eq('is_active', true)
      .order('framework', { ascending: true })
      .order('code', { ascending: true });

    if (filters.framework) {
      query = query.eq('framework', filters.framework);
    }

    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    if (filters.search) {
      const searchTerm = this.sanitize(filters.search);
      query = query.or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch KPI definitions: ' + error.message);
    return (data || []) as KpiDefinition[];
  }

  /**
   * Get a single KPI definition with its latest measurement
   */
  static async getKpiDefinition(id: string): Promise<KpiDefinition & { latest_measurement?: KpiMeasurement }> {
    const { data: kpi, error } = await this.supabase
      .from('ss_kpi_definitions')
      .select(KPI_SELECT)
      .eq('id', id)
      .single();

    if (error) throw new Error('Failed to fetch KPI definition: ' + error.message);

    // Fetch latest measurement for this KPI
    const { data: measurement } = await this.supabase
      .from('ss_kpi_measurements')
      .select(MEASUREMENT_SELECT)
      .eq('kpi_id', id)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ...(kpi as KpiDefinition),
      latest_measurement: measurement as KpiMeasurement | undefined,
    };
  }

  /**
   * Create a new KPI definition
   */
  static async createKpiDefinition(input: CreateKpiDefinitionInput): Promise<KpiDefinition> {
    const { data, error } = await this.supabase
      .from('ss_kpi_definitions')
      .insert({
        name: input.name,
        code: input.code,
        description: input.description || null,
        framework: input.framework,
        category: input.category,
        data_type: input.data_type,
        unit: input.unit || null,
        measurement_method: input.measurement_method || null,
        target_value: input.target_value ?? null,
        target_period: input.target_period || null,
        collection_frequency: input.collection_frequency || 'quarterly',
        source_table: input.source_table || null,
        source_query: input.source_query || null,
        is_auto_calculated: input.is_auto_calculated ?? false,
        relevant_to: input.relevant_to || [],
        is_active: input.is_active ?? true,
        institution_id: input.institution_id || null,
      })
      .select(KPI_SELECT)
      .single();

    if (error) throw new Error('Failed to create KPI definition: ' + error.message);
    return data as KpiDefinition;
  }

  /**
   * Update an existing KPI definition
   */
  static async updateKpiDefinition(id: string, input: UpdateKpiDefinitionInput): Promise<KpiDefinition> {
    // Strip protected fields
    const { id: _id, created_at: _ca, ...safeUpdates } = input as any;

    const { data, error } = await this.supabase
      .from('ss_kpi_definitions')
      .update(safeUpdates)
      .eq('id', id)
      .select(KPI_SELECT)
      .single();

    if (error) throw new Error('Failed to update KPI definition: ' + error.message);
    return data as KpiDefinition;
  }

  // ============================================
  // KPI MEASUREMENTS
  // ============================================

  /**
   * Record a measurement for a KPI.
   * Automatically captures previous_value from the most recent existing measurement.
   */
  static async recordMeasurement(
    kpiId: string,
    input: RecordMeasurementInput
  ): Promise<KpiMeasurement> {
    // Fetch the most recent measurement to capture previous_value
    const { data: latestMeasurement } = await this.supabase
      .from('ss_kpi_measurements')
      .select('value')
      .eq('kpi_id', kpiId)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousValue = latestMeasurement?.value ?? null;

    // Also fetch the KPI definition to get institution_id if not provided
    const { data: kpiDef } = await this.supabase
      .from('ss_kpi_definitions')
      .select('institution_id')
      .eq('id', kpiId)
      .single();

    const { data, error } = await this.supabase
      .from('ss_kpi_measurements')
      .insert({
        kpi_id: kpiId,
        period_start: input.period_start,
        period_end: input.period_end,
        value: input.value,
        previous_value: previousValue,
        notes: input.notes || null,
        data_source: input.data_source || null,
        verified: false,
        verified_by: null,
        institution_id: input.institution_id || kpiDef?.institution_id || null,
      })
      .select(MEASUREMENT_SELECT)
      .single();

    if (error) throw new Error('Failed to record KPI measurement: ' + error.message);
    return data as KpiMeasurement;
  }

  // ============================================
  // KPI DASHBOARD
  // ============================================

  /**
   * Get KPI dashboard data: KPIs grouped by framework with latest values
   */
  static async getKpiDashboard(institutionId?: string): Promise<KpiDashboardData> {
    // Fetch all active KPI definitions
    let kpiQuery = this.supabase
      .from('ss_kpi_definitions')
      .select(KPI_SELECT)
      .eq('is_active', true)
      .order('framework')
      .order('code');

    if (institutionId) {
      kpiQuery = kpiQuery.eq('institution_id', institutionId);
    }

    const { data: kpis, error: kpiError } = await kpiQuery;
    if (kpiError) throw new Error('Failed to fetch KPIs for dashboard: ' + kpiError.message);

    const allKpis = (kpis || []) as KpiDefinition[];

    // Fetch latest measurements for all KPIs
    let measQuery = this.supabase
      .from('ss_kpi_measurements')
      .select(MEASUREMENT_SELECT)
      .order('period_end', { ascending: false });

    if (institutionId) {
      measQuery = measQuery.eq('institution_id', institutionId);
    }

    const { data: measurements, error: measError } = await measQuery;
    if (measError) throw new Error('Failed to fetch measurements for dashboard: ' + measError.message);

    // Build a map of kpi_id -> latest measurement
    const latestMeasMap = new Map<string, KpiMeasurement>();
    for (const m of (measurements || []) as KpiMeasurement[]) {
      if (!latestMeasMap.has(m.kpi_id)) {
        latestMeasMap.set(m.kpi_id, m);
      }
    }

    // Group KPIs by framework with their latest values
    const byFramework: Record<string, Array<KpiDefinition & { latest_value?: number; latest_period_end?: string }>> = {};
    let measured = 0;
    let unmeasured = 0;

    for (const kpi of allKpis) {
      if (!byFramework[kpi.framework]) {
        byFramework[kpi.framework] = [];
      }
      const latest = latestMeasMap.get(kpi.id);
      byFramework[kpi.framework].push({
        ...kpi,
        latest_value: latest ? Number(latest.value) : undefined,
        latest_period_end: latest?.period_end,
      });

      if (latest) {
        measured++;
      } else {
        unmeasured++;
      }
    }

    const total = allKpis.length;
    const compliancePct = total > 0 ? Math.round((measured / total) * 100) : 0;

    return {
      kpis_by_framework: byFramework,
      overall_compliance: {
        total,
        measured,
        unmeasured,
        compliance_pct: compliancePct,
      },
    };
  }

  /**
   * Get framework-specific compliance metrics
   */
  static async getFrameworkCompliance(
    framework: string,
    institutionId?: string
  ): Promise<FrameworkCompliance> {
    let kpiQuery = this.supabase
      .from('ss_kpi_definitions')
      .select('id')
      .eq('framework', framework)
      .eq('is_active', true);

    if (institutionId) {
      kpiQuery = kpiQuery.eq('institution_id', institutionId);
    }

    const { data: kpis, error: kpiError } = await kpiQuery;
    if (kpiError) throw new Error('Failed to fetch KPIs for compliance: ' + kpiError.message);

    const kpiIds = (kpis || []).map((k: any) => k.id);
    const total = kpiIds.length;

    if (total === 0) {
      return { total: 0, measured: 0, unmeasured: 0, compliance_pct: 0 };
    }

    // Check which KPIs have at least one measurement
    let measQuery = this.supabase
      .from('ss_kpi_measurements')
      .select('kpi_id')
      .in('kpi_id', kpiIds);

    if (institutionId) {
      measQuery = measQuery.eq('institution_id', institutionId);
    }

    const { data: measurements, error: measError } = await measQuery;
    if (measError) throw new Error('Failed to fetch measurements for compliance: ' + measError.message);

    const measuredKpiIds = new Set((measurements || []).map((m: any) => m.kpi_id));
    const measured = measuredKpiIds.size;
    const unmeasured = total - measured;

    return {
      total,
      measured,
      unmeasured,
      compliance_pct: Math.round((measured / total) * 100),
    };
  }

  // ============================================
  // IMPACT REPORTS
  // ============================================

  /**
   * List impact reports with optional filters
   */
  static async getImpactReports(filters: ImpactReportFilters = {}): Promise<ImpactReport[]> {
    let query = this.supabase
      .from('ss_impact_reports')
      .select(REPORT_SELECT)
      .order('created_at', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.report_type) {
      query = query.eq('report_type', filters.report_type);
    }

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch impact reports: ' + error.message);
    return (data || []) as ImpactReport[];
  }

  /**
   * Get a single impact report
   */
  static async getImpactReport(id: string): Promise<ImpactReport> {
    const { data, error } = await this.supabase
      .from('ss_impact_reports')
      .select(REPORT_SELECT)
      .eq('id', id)
      .single();

    if (error) throw new Error('Failed to fetch impact report: ' + error.message);
    return data as ImpactReport;
  }

  /**
   * Create a new impact report
   */
  static async createImpactReport(input: CreateImpactReportInput): Promise<ImpactReport> {
    const { data, error } = await this.supabase
      .from('ss_impact_reports')
      .insert({
        report_title: input.report_title,
        report_type: input.report_type,
        target_audience: input.target_audience,
        period_start: input.period_start || null,
        period_end: input.period_end || null,
        executive_summary: input.executive_summary || null,
        startup_highlights: input.startup_highlights || [],
        kpi_snapshot: input.kpi_snapshot || {},
        report_url: input.report_url || null,
        infographic_url: input.infographic_url || null,
        status: input.status || 'draft',
        approved_by: input.approved_by || null,
        published_at: input.published_at || null,
        institution_id: input.institution_id || null,
      })
      .select(REPORT_SELECT)
      .single();

    if (error) throw new Error('Failed to create impact report: ' + error.message);
    return data as ImpactReport;
  }

  /**
   * Update an existing impact report
   */
  static async updateImpactReport(id: string, input: UpdateImpactReportInput): Promise<ImpactReport> {
    // Strip protected fields
    const { id: _id, created_at: _ca, ...safeUpdates } = input as any;

    // Auto-set published_at if status transitions to 'published'
    if (safeUpdates.status === 'published' && !safeUpdates.published_at) {
      safeUpdates.published_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('ss_impact_reports')
      .update(safeUpdates)
      .eq('id', id)
      .select(REPORT_SELECT)
      .single();

    if (error) throw new Error('Failed to update impact report: ' + error.message);
    return data as ImpactReport;
  }
}

export const kpiService = {
  getKpiDefinitions: KpiService.getKpiDefinitions.bind(KpiService),
  getKpiDefinition: KpiService.getKpiDefinition.bind(KpiService),
  createKpiDefinition: KpiService.createKpiDefinition.bind(KpiService),
  updateKpiDefinition: KpiService.updateKpiDefinition.bind(KpiService),
  recordMeasurement: KpiService.recordMeasurement.bind(KpiService),
  getKpiDashboard: KpiService.getKpiDashboard.bind(KpiService),
  getFrameworkCompliance: KpiService.getFrameworkCompliance.bind(KpiService),
  getImpactReports: KpiService.getImpactReports.bind(KpiService),
  getImpactReport: KpiService.getImpactReport.bind(KpiService),
  createImpactReport: KpiService.createImpactReport.bind(KpiService),
  updateImpactReport: KpiService.updateImpactReport.bind(KpiService),
};
