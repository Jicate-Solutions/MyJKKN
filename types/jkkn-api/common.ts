/**
 * Shared JKKN API types used across all modules.
 * Each module-specific file imports from here instead of re-declaring these.
 */

export interface JkknApiMetadata {
  page: number;
  limit: number;
  totalPages: number;
  total: number;
}

export interface JkknPaginatedResponse<T> {
  data: T[];
  metadata: JkknApiMetadata;
}

/** Common filter params supported by all paginated JKKN endpoints. */
export interface JkknBaseFilters {
  page?: number;
  limit?: number;
  search?: string;
}
