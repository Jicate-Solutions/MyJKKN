// lib/api/client.ts
// Typed API client wrapper for hooks to call API routes
// Replaces raw fetch() calls with consistent error handling

// ============================================================================
// TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface PaginatedApiResponse<T> {
  success: boolean;
  data: T[];
  metadata: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
  message?: string;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string = 'UNKNOWN') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ============================================================================
// CLIENT
// ============================================================================

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const json = await res.json().catch(() => ({
    error: 'PARSE_ERROR',
    message: 'Failed to parse response',
  }));

  if (!res.ok) {
    throw new ApiError(
      json.message || json.error || `Request failed with status ${res.status}`,
      res.status,
      json.error || 'UNKNOWN'
    );
  }

  // Auto-unwrap API response envelope.
  // All API routes return { success: true, data: T } or { success: true, data: T[], metadata }.
  // Without unwrapping, React Query hooks expose the envelope as `data`, and components
  // crash when they access `data.someField` (which is really `data.data.someField`).
  //
  // Non-paginated: { success, data: T }             → returns T
  // Paginated:     { success, data: T[], metadata }  → returns { data: T[], metadata }
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    const { success: _s, ...rest } = json;
    const keys = Object.keys(rest);
    // If only `data` remains (non-paginated), unwrap to just the data value
    if (keys.length === 1 && keys[0] === 'data') {
      return rest.data as T;
    }
    // Otherwise keep structure minus `success` (preserves metadata, etc.)
    return rest as T;
  }

  return json as T;
}

/** Build URL with query parameters, skipping undefined/null values */
function buildUrl(base: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return base;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

export const apiClient = {
  /** GET request with optional query params */
  get<T>(url: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    return request<T>(buildUrl(url, params));
  },

  /** POST request with JSON body */
  post<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /** PUT request with JSON body */
  put<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /** PATCH request with JSON body */
  patch<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /** DELETE request */
  delete<T>(url: string): Promise<T> {
    return request<T>(url, { method: 'DELETE' });
  },
};
