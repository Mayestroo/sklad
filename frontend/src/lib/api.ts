/**
 * API Client Wrapper for CRM Backend
 * Handles authorization header, tenant ID header, and locale context
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

  const response = await fetch(`${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, {
    headers,
    ...restOptions,
  });

  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    try {
      const errorText = await response.text();
      if (errorText) {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
      }
    } catch {
      // ignore parse error
    }

    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('crm_access_token');
        localStorage.removeItem('crm_refresh_token');
        localStorage.removeItem('crm_user');
        localStorage.removeItem('crm_company');
        window.dispatchEvent(new Event('crm_unauthorized'));
      }
    }

    throw new Error(errorMessage);
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
