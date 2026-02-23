// ============================================================================
// Master Seeding Function for Regulatory Framework Engine
// Seeds all frameworks, criteria, metrics, and data connectors
// Order: data connectors first (metrics reference them), then frameworks
// ============================================================================

import { dataConnectors } from './data-connectors'
import { naacBinaryFrameworks, getNaacBinaryCriteria, getNaacBinaryMetrics } from './naac-binary-2024'
import { naacOldFramework, naacOldCriteria, naacOldMetrics } from './naac-old-2022'
import { nirfFrameworks, nirfDisciplines, getNirfCriteria, getNirfMetrics } from './nirf-2025'
import { nbaFrameworks, nbaSarCriteria, nbaSarMetrics } from './nba-sar'
import { aicteFramework, aicteCriteria, aicteMetrics, ugcAisheFramework, ugcAisheCriteria, ugcAisheMetrics } from './aicte-ugc'

import type { FrameworkSeed, CriteriaSeed, MetricSeed } from './naac-binary-2024'
import type { DataConnectorSeed } from './data-connectors'

interface SeedResult {
  data_connectors: number
  frameworks: number
  criteria: number
  metrics: number
  errors: string[]
}

/**
 * Seeds the entire regulatory framework engine database.
 * Designed to be idempotent — uses ON CONFLICT DO NOTHING for safe re-runs.
 *
 * @param supabase - Supabase client (admin/service_role for bypassing RLS)
 * @returns SeedResult with counts of inserted records
 */
export async function seedRegulatoryEngine(supabase: any): Promise<SeedResult> {
  const result: SeedResult = {
    data_connectors: 0,
    frameworks: 0,
    criteria: 0,
    metrics: 0,
    errors: [],
  }

  try {
    // ── Step 1: Seed Data Connectors ──
    // Must be first because metrics reference connector IDs
    console.log('[Seed] Inserting data connectors...')
    for (const dc of dataConnectors) {
      const { error } = await (supabase as any).from('regulatory_data_connectors').upsert(
        {
          id: dc.id,
          name: dc.name,
          description: dc.description,
          source_module: dc.source_module,
          source_tables: dc.source_tables,
          query_template: dc.query_template,
          output_type: dc.output_type,
          output_columns: dc.output_columns,
          is_active: dc.is_active,
        },
        { onConflict: 'id' }
      )
      if (error) {
        result.errors.push(`DC ${dc.id}: ${error.message}`)
      } else {
        result.data_connectors++
      }
    }
    console.log(`[Seed] Data connectors: ${result.data_connectors}/${dataConnectors.length}`)

    // ── Step 2: Seed Frameworks ──
    console.log('[Seed] Inserting frameworks...')
    const allFrameworks = getAllFrameworks()
    const frameworkIdMap: Record<string, string> = {} // code -> uuid

    for (const fw of allFrameworks) {
      const { data, error } = await (supabase as any).from('regulatory_frameworks').upsert(
        {
          code: fw.code,
          name: fw.name,
          body: fw.body,
          framework_type: fw.framework_type,
          institution_type: fw.institution_type,
          version: fw.version,
          year_type: fw.year_type,
          total_max_score: fw.total_max_score,
          description: fw.description,
          status: fw.status,
          submission_portal_url: fw.submission_portal_url,
          metadata: fw.metadata,
        },
        { onConflict: 'code' }
      ).select('id, code')

      if (error) {
        result.errors.push(`Framework ${fw.code}: ${error.message}`)
      } else if (data && data.length > 0) {
        frameworkIdMap[fw.code] = data[0].id
        result.frameworks++
      }
    }
    console.log(`[Seed] Frameworks: ${result.frameworks}/${allFrameworks.length}`)

    // ── Step 3: Seed Criteria ──
    console.log('[Seed] Inserting criteria...')
    const allCriteriaByFramework = getAllCriteriaByFramework()
    const criteriaIdMap: Record<string, string> = {} // "frameworkCode:criteriaCode" -> uuid

    for (const { frameworkCode, criteria } of allCriteriaByFramework) {
      const frameworkId = frameworkIdMap[frameworkCode]
      if (!frameworkId) {
        result.errors.push(`No framework ID for ${frameworkCode}`)
        continue
      }

      // Insert parent criteria first (those without parent_criteria_code)
      const parents = criteria.filter(c => !c.parent_criteria_code)
      const children = criteria.filter(c => !!c.parent_criteria_code)

      for (const cr of parents) {
        const { data, error } = await (supabase as any).from('regulatory_criteria').upsert(
          {
            framework_id: frameworkId,
            parent_criteria_id: null,
            code: cr.code,
            name: cr.name,
            description: cr.description,
            weight: cr.weight,
            max_score: cr.max_score,
            sort_order: cr.sort_order,
            is_qualitative: cr.is_qualitative,
            evidence_required: cr.evidence_required,
          },
          { onConflict: 'framework_id,code' }
        ).select('id, code')

        if (error) {
          result.errors.push(`Criteria ${frameworkCode}:${cr.code}: ${error.message}`)
        } else if (data && data.length > 0) {
          criteriaIdMap[`${frameworkCode}:${cr.code}`] = data[0].id
          result.criteria++
        }
      }

      // Now insert children with parent references
      for (const cr of children) {
        const parentId = criteriaIdMap[`${frameworkCode}:${cr.parent_criteria_code}`]
        const { data, error } = await (supabase as any).from('regulatory_criteria').upsert(
          {
            framework_id: frameworkId,
            parent_criteria_id: parentId || null,
            code: cr.code,
            name: cr.name,
            description: cr.description,
            weight: cr.weight,
            max_score: cr.max_score,
            sort_order: cr.sort_order,
            is_qualitative: cr.is_qualitative,
            evidence_required: cr.evidence_required,
          },
          { onConflict: 'framework_id,code' }
        ).select('id, code')

        if (error) {
          result.errors.push(`Criteria ${frameworkCode}:${cr.code}: ${error.message}`)
        } else if (data && data.length > 0) {
          criteriaIdMap[`${frameworkCode}:${cr.code}`] = data[0].id
          result.criteria++
        }
      }
    }
    console.log(`[Seed] Criteria: ${result.criteria}`)

    // ── Step 4: Seed Metrics ──
    console.log('[Seed] Inserting metrics...')
    const allMetricsByFramework = getAllMetricsByFramework()

    for (const { frameworkCode, metrics } of allMetricsByFramework) {
      for (const m of metrics) {
        const criteriaId = criteriaIdMap[`${frameworkCode}:${m.criteria_code}`]
        if (!criteriaId) {
          result.errors.push(`No criteria ID for ${frameworkCode}:${m.criteria_code} (metric ${m.code})`)
          continue
        }

        const { error } = await (supabase as any).from('regulatory_metrics').upsert(
          {
            criteria_id: criteriaId,
            code: m.code,
            name: m.name,
            description: m.description,
            data_type: m.data_type,
            is_auto_calculable: m.is_auto_calculable,
            requires_evidence: m.requires_evidence,
            data_connector_id: m.data_connector_code,
            sort_order: m.sort_order,
            metadata: { ...m.metadata, max_marks: m.max_marks },
          },
          { onConflict: 'criteria_id,code' }
        )

        if (error) {
          result.errors.push(`Metric ${frameworkCode}:${m.code}: ${error.message}`)
        } else {
          result.metrics++
        }
      }
    }
    console.log(`[Seed] Metrics: ${result.metrics}`)

  } catch (error: any) {
    result.errors.push(`Fatal: ${error.message}`)
  }

  console.log(`[Seed] Complete. DC: ${result.data_connectors}, FW: ${result.frameworks}, CR: ${result.criteria}, M: ${result.metrics}, Errors: ${result.errors.length}`)
  return result
}

// ── HELPER: Collect all frameworks ──

function getAllFrameworks(): FrameworkSeed[] {
  return [
    // NAAC Binary 2024 (3 variants)
    ...naacBinaryFrameworks,
    // NAAC Old 2022
    naacOldFramework,
    // NIRF 2025 (7 variants)
    ...nirfFrameworks,
    // NBA SAR (2 variants)
    ...nbaFrameworks,
    // AICTE + UGC-AISHE
    aicteFramework,
    ugcAisheFramework,
  ]
}

// ── HELPER: Collect all criteria grouped by framework ──

function getAllCriteriaByFramework(): { frameworkCode: string; criteria: CriteriaSeed[] }[] {
  const result: { frameworkCode: string; criteria: CriteriaSeed[] }[] = []

  // NAAC Binary 2024 — 3 variants
  const institutionTypes = [
    { code: 'NAAC_BINARY_2024_UNIVERSITY', type: 'university' as const },
    { code: 'NAAC_BINARY_2024_AUTONOMOUS', type: 'autonomous' as const },
    { code: 'NAAC_BINARY_2024_AFFILIATED', type: 'affiliated' as const },
  ]
  for (const { code, type } of institutionTypes) {
    result.push({ frameworkCode: code, criteria: getNaacBinaryCriteria(type) })
  }

  // NAAC Old 2022
  result.push({ frameworkCode: 'NAAC_2022_REVISED', criteria: naacOldCriteria })

  // NIRF 2025 — 7 disciplines
  for (const discipline of nirfDisciplines) {
    const fw = nirfFrameworks.find(f => f.code.includes(discipline.toUpperCase())) ||
               nirfFrameworks.find(f => {
                 const map: Record<string, string> = {
                   overall: 'NIRF_2025_OVERALL',
                   engineering: 'NIRF_2025_ENGINEERING',
                   pharmacy_a: 'NIRF_2025_PHARMACY_A',
                   pharmacy_b: 'NIRF_2025_PHARMACY_B',
                   colleges: 'NIRF_2025_COLLEGES',
                   dental: 'NIRF_2025_DENTAL',
                   medical: 'NIRF_2025_MEDICAL',
                 }
                 return f.code === map[discipline]
               })
    if (fw) {
      result.push({ frameworkCode: fw.code, criteria: getNirfCriteria(discipline) })
    }
  }

  // NBA SAR (same criteria for both Engineering and Pharmacy)
  result.push({ frameworkCode: 'NBA_SAR_ENGINEERING', criteria: nbaSarCriteria })
  result.push({ frameworkCode: 'NBA_SAR_PHARMACY', criteria: nbaSarCriteria })

  // AICTE + UGC-AISHE
  result.push({ frameworkCode: 'AICTE_MANDATORY_DISCLOSURE_2025', criteria: aicteCriteria })
  result.push({ frameworkCode: 'UGC_AISHE_2025', criteria: ugcAisheCriteria })

  return result
}

// ── HELPER: Collect all metrics grouped by framework ──

function getAllMetricsByFramework(): { frameworkCode: string; metrics: MetricSeed[] }[] {
  const result: { frameworkCode: string; metrics: MetricSeed[] }[] = []

  // NAAC Binary 2024 — 3 variants
  result.push({ frameworkCode: 'NAAC_BINARY_2024_UNIVERSITY', metrics: getNaacBinaryMetrics('university') })
  result.push({ frameworkCode: 'NAAC_BINARY_2024_AUTONOMOUS', metrics: getNaacBinaryMetrics('autonomous') })
  result.push({ frameworkCode: 'NAAC_BINARY_2024_AFFILIATED', metrics: getNaacBinaryMetrics('affiliated') })

  // NAAC Old 2022
  result.push({ frameworkCode: 'NAAC_2022_REVISED', metrics: naacOldMetrics })

  // NIRF 2025 — 7 disciplines
  const disciplineMap: Record<string, string> = {
    overall: 'NIRF_2025_OVERALL',
    engineering: 'NIRF_2025_ENGINEERING',
    pharmacy_a: 'NIRF_2025_PHARMACY_A',
    pharmacy_b: 'NIRF_2025_PHARMACY_B',
    colleges: 'NIRF_2025_COLLEGES',
    dental: 'NIRF_2025_DENTAL',
    medical: 'NIRF_2025_MEDICAL',
  }
  for (const discipline of nirfDisciplines) {
    result.push({ frameworkCode: disciplineMap[discipline], metrics: getNirfMetrics(discipline) })
  }

  // NBA SAR
  result.push({ frameworkCode: 'NBA_SAR_ENGINEERING', metrics: nbaSarMetrics })
  result.push({ frameworkCode: 'NBA_SAR_PHARMACY', metrics: nbaSarMetrics }) // Same metrics, different framework

  // AICTE + UGC-AISHE
  result.push({ frameworkCode: 'AICTE_MANDATORY_DISCLOSURE_2025', metrics: aicteMetrics })
  result.push({ frameworkCode: 'UGC_AISHE_2025', metrics: ugcAisheMetrics })

  return result
}

// ── RE-EXPORT for convenience ──

export { dataConnectors } from './data-connectors'
export { naacBinaryFrameworks, getNaacBinaryCriteria, getNaacBinaryMetrics } from './naac-binary-2024'
export { naacOldFramework, naacOldCriteria, naacOldMetrics } from './naac-old-2022'
export { nirfFrameworks, nirfDisciplines, getNirfCriteria, getNirfMetrics, getAllNirfData } from './nirf-2025'
export { nbaFrameworks, nbaSarCriteria, nbaSarMetrics } from './nba-sar'
export { aicteFramework, aicteCriteria, aicteMetrics, ugcAisheFramework, ugcAisheCriteria, ugcAisheMetrics } from './aicte-ugc'

export type { FrameworkSeed, CriteriaSeed, MetricSeed } from './naac-binary-2024'
export type { DataConnectorSeed } from './data-connectors'
