// Audit Discovery Service — safely executes saved parameter-discovery queries.
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §T4 (paginated discovery)
//
// Flow:
//   1. Load AuditParameterCatalogRow via AuditParameterCatalogService.getResolved
//      (institution override wins over system default, per thrash T2)
//   2. Validate discovery_query_sql at the TypeScript layer as a first line of
//      defence (fast rejection, clear error message). The DB function
//      audit_validate_discovery_sql re-runs the same checks server-side so
//      this is defence-in-depth.
//   3. Resolve cycle start/end dates via AuditCycleService.get
//   4. Call RPC audit_execute_discovery_query with bind params
//      ($1=institution_id, $2=cycle_start, $3=cycle_end)
//   5. Return { rows, total_count, page, page_size, sample }
//
// Security model — the client-facing SQL is author-supplied (super_admin seeded
// 36 Aassaan rows, or institution admins via override). We still treat it as
// untrusted because:
//   - is_system=false overrides could be mutated by a compromised admin account
//   - a catalog seed bug could slip in a dangerous query
// The DB-side SECURITY DEFINER function is the ground-truth gatekeeper.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AuditParameterCatalogRow } from '@/lib/types/audit';
import { AuditParameterCatalogService } from './audit-parameter-catalog-service';
import { AuditCycleService } from './audit-cycle-service';
import { getPolicyInt } from '@/lib/policies/get-policy';

// Director's standing rule (2026-04-29): policy decisions live in
// platform_policies, not in source. Constants below are *fallback only*.
// Source of truth = `audit.discovery.{max,default}_page_size` rows seeded
// in supabase/migrations/20260429000015_audit_faculty_page_size_policy.sql.
// NOTE: keys are not registered in lib/policies/keys.ts (deliberately
// excluded from this PR per worker contract); cast `as any` until Phase 2
// catalog cleanup adds them to POLICY_KEYS.
const AUDIT_DISCOVERY_MAX_PAGE_SIZE_KEY =
  'audit.discovery.max_page_size' as unknown as Parameters<typeof getPolicyInt>[0];
const AUDIT_DISCOVERY_DEFAULT_PAGE_SIZE_KEY =
  'audit.discovery.default_page_size' as unknown as Parameters<typeof getPolicyInt>[0];
const AUDIT_DISCOVERY_MAX_PAGE_SIZE_FALLBACK = 100;
const AUDIT_DISCOVERY_DEFAULT_PAGE_SIZE_FALLBACK = 100;

export interface DiscoveryQueryResult {
  rows: Array<Record<string, unknown>>;
  total_count: number;
  page: number;
  page_size: number;
  sample: Array<Record<string, unknown>>; // first 5 rows for summary previews
  warning?: string;
}

export interface RunQueryOptions {
  page?: number;      // 1-indexed
  page_size?: number; // max 100 per thrash T4
}

export class AuditDiscoveryService {
  private static supabase = createClientSupabaseClient();

  /**
   * Resolve { max, def } page-size limits from platform_policies.
   * Falls back to the legacy hardcoded 100/100 if the policy RPC fails.
   * Server-context only (API routes) — getPolicyInt uses next/headers cookies.
   */
  private static async getPageSizeLimits(): Promise<{ max: number; def: number }> {
    const [max, def] = await Promise.all([
      getPolicyInt(
        AUDIT_DISCOVERY_MAX_PAGE_SIZE_KEY,
        AUDIT_DISCOVERY_MAX_PAGE_SIZE_FALLBACK
      ),
      getPolicyInt(
        AUDIT_DISCOVERY_DEFAULT_PAGE_SIZE_KEY,
        AUDIT_DISCOVERY_DEFAULT_PAGE_SIZE_FALLBACK
      ),
    ]);
    return { max, def };
  }

  /**
   * Client-side mirror of the DB validator. Returned on the critical path so
   * we never round-trip an obviously unsafe query. The DB function
   * audit_validate_discovery_sql is still authoritative.
   *
   * Returns null on pass, or an error message on reject.
   */
  static validateDiscoverySql(sql: string | null | undefined): string | null {
    if (!sql || typeof sql !== 'string') {
      return 'discovery SQL is empty';
    }

    // Strip leading whitespace and line/block comments for the prefix check.
    const trimmed = sql.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/, '');
    if (!/^\s*SELECT\s/i.test(trimmed)) {
      return 'discovery SQL must start with SELECT';
    }

    // Whole-word check for write/DDL/privileged keywords.
    const forbiddenKeywords = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|CALL|DO|SET|RESET|COPY|VACUUM|ANALYZE|REFRESH)\b/i;
    if (forbiddenKeywords.test(sql)) {
      return 'discovery SQL contains a forbidden keyword (write/DDL/privileged operation)';
    }

    // Reserved-schema reference check.
    const reservedSchemas = /\b(auth\.|storage\.|pg_|information_schema\.)/i;
    if (reservedSchemas.test(sql)) {
      return 'discovery SQL references a reserved schema (auth/storage/pg_*/information_schema)';
    }

    // Single-statement only — reject embedded semicolons (trailing one allowed).
    const withoutTrailingSemi = sql.replace(/;\s*$/, '');
    if (/;/.test(withoutTrailingSemi)) {
      return 'discovery SQL must be a single statement (no embedded semicolons)';
    }

    return null;
  }

  /**
   * Execute a parameter's discovery query for a given institution + cycle.
   *
   * @throws Error with "discovery SQL rejected: ..." if whitelist fails
   * @throws Error if parameter / cycle not found or missing discovery_query_sql
   */
  static async runQuery(
    parameterCode: string,
    institutionId: string,
    cycleId: string,
    options: RunQueryOptions = {}
  ): Promise<DiscoveryQueryResult> {
    // Resolve parameter + cycle in parallel for latency
    const [parameter, cycle] = await Promise.all([
      AuditParameterCatalogService.getResolved(parameterCode, institutionId),
      AuditCycleService.get(cycleId),
    ]);

    if (!parameter) {
      throw new Error(`Audit parameter "${parameterCode}" not found for institution`);
    }
    if (!cycle) {
      throw new Error(`Audit cycle "${cycleId}" not found`);
    }
    if (!parameter.discovery_query_sql || !parameter.discovery_query_sql.trim()) {
      throw new Error(`Parameter "${parameterCode}" has no saved discovery query`);
    }

    // First-line validation (DB will re-validate, but we reject fast on the client path)
    const rejection = this.validateDiscoverySql(parameter.discovery_query_sql);
    if (rejection) {
      throw new Error(`discovery SQL rejected: ${rejection}`);
    }

    // Pagination clamp — mirrors the DB function's behaviour so UI stays in sync.
    // Limits resolved from platform_policies (substrate-extending: PR #595).
    const { max: maxPageSize, def: defaultPageSize } = await this.getPageSizeLimits();
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.max(
      1,
      Math.min(Math.floor(options.page_size ?? defaultPageSize), maxPageSize)
    );
    const offset = (page - 1) * pageSize;

    const { data, error } = await (this.supabase as any).rpc('audit_execute_discovery_query', {
      p_sql: parameter.discovery_query_sql,
      p_institution_id: institutionId,
      p_cycle_start: cycle.start_date,
      p_cycle_end: cycle.end_date,
      p_limit: pageSize,
      p_offset: offset,
    });

    if (error) {
      // Pass through the DB error message — it already includes a safe reason
      // (e.g., "discovery SQL rejected: …", "permission denied: …").
      throw new Error(error.message ?? 'discovery query execution failed');
    }

    // RPC returns a single row with (rows jsonb, total_count bigint)
    // Supabase returns TABLE(...) as an array of objects.
    const firstRow = Array.isArray(data) ? data[0] : data;
    const rows = (firstRow?.rows as Array<Record<string, unknown>> | undefined) ?? [];
    const totalCount = Number(firstRow?.total_count ?? 0);

    const result: DiscoveryQueryResult = {
      rows,
      total_count: totalCount,
      page,
      page_size: pageSize,
      sample: rows.slice(0, 5),
    };

    if (totalCount > maxPageSize && page === 1) {
      result.warning = `Query returned ${totalCount} rows; showing first ${pageSize}. Use pagination or Export-to-CSV for full data.`;
    }

    return result;
  }

  /**
   * Convenience method — preview the parameter's query metadata without
   * executing. Used by UI to render the "Run Query" button + description.
   */
  static async getQueryMetadata(
    parameterCode: string,
    institutionId: string
  ): Promise<{
    parameter: AuditParameterCatalogRow;
    has_sql: boolean;
    has_ai_prompt: boolean;
    sql_validation: string | null;
  }> {
    const parameter = await AuditParameterCatalogService.getResolved(parameterCode, institutionId);
    if (!parameter) {
      throw new Error(`Audit parameter "${parameterCode}" not found for institution`);
    }

    return {
      parameter,
      has_sql: Boolean(parameter.discovery_query_sql?.trim()),
      has_ai_prompt: Boolean(parameter.discovery_query_ai?.trim()),
      sql_validation: parameter.discovery_query_sql
        ? this.validateDiscoverySql(parameter.discovery_query_sql)
        : null,
    };
  }
}
