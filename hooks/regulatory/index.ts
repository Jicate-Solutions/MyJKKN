// hooks/regulatory/index.ts
// Central export for all regulatory framework hooks
//
// ── Two-Tier Hook Architecture ──────────────────────────────────────────
//
// This module exposes two tiers of hooks:
//
// 1. CORE hooks (e.g. `useFrameworks`, `useSubmissions`)
//    Return paginated `{ data, metadata }` responses from the service layer.
//    These are the canonical data-fetching primitives.
//
// 2. ADAPTER hooks (e.g. `useRegulatoryFrameworks`, `useAllSubmissions`)
//    Return flat arrays for page convenience, often with direct Supabase
//    calls or post-processing that flattens joins.
//
// When building new pages, prefer core hooks for consistency; use adapters
// only when a flat array significantly simplifies the UI layer.
//
// Naming convention:
//   use{Entity}            → core   (paginated)
//   useRegulatory{Entity}  → adapter (flat array)
// ────────────────────────────────────────────────────────────────────────

// Frameworks (NAAC, NBA, NIRF, etc.)
export * from './use-frameworks'

// Metrics & metric values
export * from './use-metrics'

// Evidence / document uploads
export * from './use-evidence'

// Submissions & workflow
export * from './use-submissions'

// What-if simulations
export * from './use-simulations'

// Governing bodies & meetings (IQAC, BoS, etc.)
export * from './use-governance'

// Peer team visits
export * from './use-peer-visits'

// Syllabus management & CO-PO mapping
export * from './use-syllabi'

// Peer institution benchmarks (NAAC 6.5.3 peer comparison)
export * from './use-benchmarks'
