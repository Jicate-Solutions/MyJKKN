// Shared types for the W3-M10 promotion-suggestions page + client island.

export interface PromotionSuggestionRow {
  id: string;
  policy_key: string;
  suggested_at: string;
  snapshot_value: unknown;
  snapshot_classification: string;
  identical_institution_count: number;
  identical_days: number;
}
