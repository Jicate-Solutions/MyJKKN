// lib/services/solutions/clusters.ts
// Solutions Clusters — client-side mapping from institution name → cluster
// Announced at Cluster Council meeting on 2026-03-19
// Three clusters group Solutions Departments by institutional alignment

export type SolutionsCluster = 'health' | 'tech' | 'arts_professional';

export const CLUSTER_LABELS: Record<SolutionsCluster, string> = {
  health: 'Health Solutions',
  tech: 'Tech Solutions',
  arts_professional: 'Arts & Professional Solutions',
};

export const CLUSTER_DESCRIPTIONS: Record<SolutionsCluster, string> = {
  health: 'Dental College, Pharmacy College, Nursing College, Allied Health Sciences College',
  tech: 'Engineering & Technology College, CS department from Arts & Science',
  arts_professional: 'Commerce, English, TFD, VisCom, MBA, and remaining Arts & Science departments',
};

/**
 * Map an institution name to its Solutions Cluster.
 *
 * Matching is case-insensitive partial match against known institution keywords.
 * Note: Arts & Science is split in reality (CS → tech, rest → arts_professional),
 * but since we map by institution (not department), the whole institution maps to
 * arts_professional. The UI agent can handle the CS override at the department level.
 */
export function getClusterForInstitution(institutionName: string): SolutionsCluster {
  const name = institutionName.toLowerCase();
  if (name.includes('dental')) return 'health';
  if (name.includes('pharmacy')) return 'health';
  if (name.includes('nursing')) return 'health';
  if (name.includes('allied health')) return 'health';
  if (name.includes('engineering')) return 'tech';
  // Arts & Science institution maps to arts_professional as a whole
  // (CS department override is handled at the UI layer if needed)
  return 'arts_professional';
}

/**
 * Get the display color for a cluster.
 * Used for charts, badges, and tier indicators.
 */
export function getClusterColor(cluster: SolutionsCluster): string {
  switch (cluster) {
    case 'health': return '#ef4444';           // red
    case 'tech': return '#3b82f6';             // blue
    case 'arts_professional': return '#8b5cf6'; // purple
  }
}

/**
 * All valid cluster values for validation.
 */
export const VALID_CLUSTERS: SolutionsCluster[] = ['health', 'tech', 'arts_professional'];
