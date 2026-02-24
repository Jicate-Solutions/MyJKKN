// lib/api/client.ts
// Thin fetch wrapper for internal API calls from React Query hooks.
// Handles: JSON parsing, error extraction, query param serialization.
// Browser cookies are sent automatically (same-origin fetch).

interface ApiError extends Error {
  status: number
  data?: any
}

function createApiError(message: string, status: number, data?: any): ApiError {
  const error = new Error(message) as ApiError
  error.status = status
  error.data = data
  return error
}

function buildUrl(path: string, params?: Record<string, any>): string {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }
  return url.toString()
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const data = await response.json()

  if (!response.ok) {
    throw createApiError(
      data?.error || `Request failed with status ${response.status}`,
      response.status,
      data
    )
  }

  // Unwrap { data: T } envelope for single responses
  // Return full response for paginated responses (has metadata)
  if (data && 'metadata' in data) {
    return data as T
  }
  return data?.data !== undefined ? data.data : data
}

export const apiClient = {
  async get<T>(path: string, options?: { params?: Record<string, any> }): Promise<T> {
    const url = buildUrl(path, options?.params)
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
    })
    return handleResponse<T>(response)
  },

  async post<T>(path: string, body?: any): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async patch<T>(path: string, body: any): Promise<T> {
    const response = await fetch(path, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
    return handleResponse<T>(response)
  },

  async delete(path: string): Promise<void> {
    const response = await fetch(path, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
    })
    if (!response.ok && response.status !== 204) {
      const data = await response.json().catch(() => ({}))
      throw createApiError(
        data?.error || `Delete failed with status ${response.status}`,
        response.status,
        data
      )
    }
  },
}
