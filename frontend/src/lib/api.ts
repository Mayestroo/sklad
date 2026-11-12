/**
 * API Client Wrapper for CRM Backend
 * Handles authorization header, tenant ID header, and locale context
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Thrown for every non-2xx response; `status` lets callers tell 401/403/404/409 apart. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface RequestOptions extends RequestInit {
  tenantId?: string;
  token?: string;
  locale?: string;
}

export async function apiFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { tenantId, token, locale = 'uz', headers: customHeaders, ...restOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept-Language': locale,
    ...(customHeaders as Record<string, string>),
  };

  if (tenantId) {
    headers['X-Tenant-Id'] = tenantId;
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Normalize endpoint: remove leading /api/ if present to prevent double /api/api
  let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (cleanEndpoint.startsWith('/api/')) {
    cleanEndpoint = cleanEndpoint.substring(4);
  }
  // Alias /counterparties to /sales/counterparties
  if (cleanEndpoint === '/counterparties' || cleanEndpoint.startsWith('/counterparties?')) {
    cleanEndpoint = cleanEndpoint.replace('/counterparties', '/sales/counterparties');
  }

  const response = await fetch(`${API_BASE_URL}${cleanEndpoint.startsWith('/') ? cleanEndpoint : `/${cleanEndpoint}`}`, {
    headers,
    ...restOptions,
  });

  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    try {
      const errorText = await response.text();
        const errorData = JSON.parse(errorText);
        if (errorData.details) {
          errorMessage = Array.isArray(errorData.details)
            ? errorData.details.join('; ')
            : String(errorData.details);
        } else if (errorData.message) {
          errorMessage = Array.isArray(errorData.message)
            ? errorData.message.join('; ')
            : errorData.message;
        }
    } catch {
      // ignore parse error
    }

    // Only an authenticated request can mean "session expired". A 401 from the
    // login form is a wrong password and must not wipe the stored session.
    if (response.status === 401 && token) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('crm_access_token');
        localStorage.removeItem('crm_refresh_token');
        localStorage.removeItem('crm_user');
        localStorage.removeItem('crm_company');
        window.dispatchEvent(new Event('crm_unauthorized'));
      }
    }

    throw new ApiError(response.status, errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  if (!text || !text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text as unknown as T;
  }
}
