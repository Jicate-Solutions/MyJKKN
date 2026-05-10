// CascadePreview types
// Shared across all Director-grade policy edit UIs.
// Agent B wires the hook; these types define the contract.

export type CascadeScope = 'platform' | 'college' | 'cycle';

export interface AffectedCycle {
  cycleId: string;
  label: string;
  collegeId: string;
  collegeName: string;
  affectedLearners: number;
}

export interface AffectedAudience {
  hods: number;
  coordinators: number;
  learners: number;
  faculties: number;
}

export interface PolicyConsequence {
  /** Human-readable description of the impact */
  summary: string;
  /** Specific cycles affected */
  affectedCycles: AffectedCycle[];
  /** Audience who will be notified */
  notificationAudience: AffectedAudience;
  /** Any learners whose current in-flight state changes (e.g. blocked from posting) */
  blockedLearners?: number;
  /** Whether this is a blocking/critical change vs informational */
  severity: 'info' | 'warning' | 'critical';
}

export interface CascadePreviewData {
  consequences: PolicyConsequence[];
  /** ISO timestamp of preview computation */
  computedAt: string;
  /** Whether the computation is still loading */
  isLoading: boolean;
  /** Error message if preview failed */
  error?: string;
}

export interface ProposedChange {
  key: string;
  label: string;
  currentValue: unknown;
  proposedValue: unknown;
  unit?: string; // e.g. '%', 'hours', 'days'
}
