// Canonical types for the regulatory module. Service-specific types live in their service files.

// ============================================================================
// TABLE 15: regulatory_peer_benchmarks (NAAC 6.5.3 peer comparison)
// ============================================================================

/** Database row for regulatory_peer_benchmarks (peer institution comparison) */
export interface RegulatoryPeerBenchmarkRow {
  id: string
  institution_id: string
  framework_id: string
  academic_year: string
  /** Name of the peer institution: "PSG College of Technology" */
  peer_institution_name: string
  /** Peer's NIRF rank (if available) */
  peer_institution_nirf_rank: number | null
  /** Peer's NAAC grade (if available) */
  peer_institution_naac_grade: string | null
  /** Which metric is being compared */
  metric_code: string
  /** Our institution's value for this metric */
  our_value: number | null
  /** Peer institution's value for this metric */
  peer_value: number | null
  /**
   * Auto-computed by PostgreSQL GENERATED ALWAYS AS (our_value - peer_value) STORED.
   * Positive = we lead, negative = we lag.
   * READ-ONLY -- do not include in Insert or Update.
   */
  readonly gap: number | null
  /** Source of peer data: "NIRF portal", "peer website", "manual" */
  data_source: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Insert DTO for regulatory_peer_benchmarks */
export interface RegulatoryPeerBenchmarkInsert {
  institution_id: string
  framework_id: string
  academic_year: string
  peer_institution_name: string
  peer_institution_nirf_rank?: number | null
  peer_institution_naac_grade?: string | null
  metric_code: string
  our_value?: number | null
  peer_value?: number | null
  data_source?: string | null
  notes?: string | null
  created_by?: string | null
}

/** Update DTO for regulatory_peer_benchmarks */
export interface RegulatoryPeerBenchmarkUpdate {
  id: string
  peer_institution_name?: string
  peer_institution_nirf_rank?: number | null
  peer_institution_naac_grade?: string | null
  metric_code?: string
  our_value?: number | null
  peer_value?: number | null
  data_source?: string | null
  notes?: string | null
}

// ============================================================================
// FILTER INTERFACES
// ============================================================================

/** Filters for querying regulatory peer benchmarks */
export interface RegulatoryPeerBenchmarkFilters {
  /** Filter by framework */
  framework_id?: string
  /** Filter by institution */
  institution_id?: string
  /** Filter by academic year */
  academic_year?: string
  /** Filter by peer institution name (partial match) */
  peer_institution_name?: string
  /** Filter by specific metric code */
  metric_code?: string
  page?: number
  limit?: number
}

// ============================================================================
// AGGREGATE / COMPUTED TYPES
// ============================================================================

/** Peer benchmark gap analysis summary (aggregated per peer institution) */
export interface PeerBenchmarkSummary {
  peer_institution_name: string
  peer_institution_nirf_rank: number | null
  peer_institution_naac_grade: string | null
  /** Number of metrics compared */
  metrics_compared: number
  /** Number of metrics where we lead (gap > 0) */
  metrics_leading: number
  /** Number of metrics where we lag (gap < 0) */
  metrics_lagging: number
  /** Average gap across all compared metrics */
  avg_gap: number
}
