import { globalToast } from '../context/ToastContext';

// When served from the same origin (Staging/Release), use empty base (relative paths).
// In dev mode, use the VITE_API_URL env variable. There is no hardcoded fallback —
// a missing VITE_API_URL in a non-same-origin build will surface as obvious 404s
// during development instead of silently leaking tokens to the wrong origin.
const isSameOrigin = window.location.pathname.startsWith('/user');
const VITE_API_URL = (import.meta as any).env?.VITE_API_URL as string | undefined;
const API_BASE = isSameOrigin ? '' : (VITE_API_URL || '');
if (!isSameOrigin && !VITE_API_URL) {
  // eslint-disable-next-line no-console
  console.warn('[modularca-userui] VITE_API_URL is not set; API calls will be sent to the current origin.');
}

/**
 * Single chokepoint for reading the access token. Today this reads from
 * localStorage; flipping the SPA to HttpOnly cookie auth becomes a one-line
 * change here once the backend cookie scheme is enabled.
 */
export function getToken(): string | null {
  return localStorage.getItem('authToken');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}

function getExpiry(): number {
  const exp = localStorage.getItem('expiresAt');
  return exp ? new Date(exp).getTime() : 0;
}

function setTokens(token: string, expiresAt: string, refreshToken: string) {
  localStorage.setItem('authToken', token);
  localStorage.setItem('expiresAt', expiresAt);
  localStorage.setItem('refreshToken', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('expiresAt');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('mfaSetupRequired');
}

/**
 * Reads the CSRF double-submit cookie set by the backend. Centralized so every
 * helper uses the same regex and decoding rules.
 */
function readCsrfCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function buildAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const csrf = readCsrfCookie();
  if (csrf) headers['X-CSRF-Token'] = csrf;
  return headers;
}

async function refreshIfNeeded(): Promise<string | null> {
  const token = getToken();
  const expiry = getExpiry();
  const now = Date.now();

  // If token expires within 5 minutes, refresh it
  if (token && expiry > 0 && expiry - now < 5 * 60 * 1000) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return token;

    try {
      const refreshCsrf = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]*)/);
      const refreshCsrfHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (refreshCsrf) refreshCsrfHeaders['X-CSRF-Token'] = decodeURIComponent(refreshCsrf[1]);

      const resp = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: refreshCsrfHeaders,
        body: JSON.stringify({ refreshToken }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setTokens(data.token, data.expiresAt, data.refreshToken);
        return data.token;
      }
    } catch {
      // Refresh failed — use existing token
    }
  }

  return token;
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await refreshIfNeeded();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // CSRF double-submit: always include the token from the cookie
  const csrfMatch = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]*)/);
  if (csrfMatch) {
    headers['X-CSRF-Token'] = decodeURIComponent(csrfMatch[1]);
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (resp.status === 401) {
    clearTokens();
    window.location.href = '/user/login';
    throw new Error('Unauthorized');
  }

  if (resp.status === 403) {
    const body = await resp.text();
    try {
      const parsed = JSON.parse(body);
      if (parsed.mfaSetupRequired && !window.location.pathname.includes('/mfa-setup')) {
        localStorage.setItem('mfaSetupRequired', 'true');
        window.location.href = '/user/mfa-setup';
        throw new Error('MFA setup required');
      }
      if (parsed.requiresStepUp) {
        const err = new Error(parsed.error || 'MFA re-verification required') as any;
        err.requiresStepUp = true;
        throw err;
      }
    } catch (e) {
      if (e instanceof Error && (e.message === 'MFA setup required' || (e as any).requiresStepUp)) throw e;
      // Not a JSON body or not MFA-related, fall through to normal error handling
    }
    const message = body || `HTTP ${resp.status}`;
    throw new Error(message);
  }

  if (!resp.ok) {
    const errorBody = await resp.text();
    let message = `HTTP ${resp.status}`;
    if (errorBody) {
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.errors) {
          // ASP.NET validation error format: { errors: { field: ["msg"] } }
          const details = Object.entries(parsed.errors)
            .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(', ')}`)
            .join('; ');
          message = parsed.title ? `${parsed.title} — ${details}` : details;
        } else {
          message = parsed.error || parsed.message || parsed.title || errorBody;
        }
      } catch {
        message = errorBody;
      }
    }
    globalToast('error', message);
    throw new Error(message);
  }

  const text = await resp.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export function apiGet<T = any>(path: string): Promise<T> {
  return api<T>(path, { method: 'GET' });
}

export function apiPost<T = any>(path: string, body?: object): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T = any>(path: string, body?: object): Promise<T> {
  return api<T>(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete(path: string): Promise<void> {
  return api<void>(path, { method: 'DELETE' });
}

/**
 * Blob-aware request helper for downloads (PEM, DER, PFX, etc.) and for
 * endpoints that return non-JSON bodies. Handles auth + CSRF + token refresh
 * in exactly the same way as api(), exposes the raw Response for header access
 * (e.g. Content-Disposition), and forces same-origin credentials.
 */
export async function apiBlob(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  await refreshIfNeeded();

  const headers = buildAuthHeaders(options.headers as Record<string, string> | undefined);
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  if (resp.status === 401) {
    clearTokens();
    window.location.href = '/user/login';
    throw new Error('Unauthorized');
  }

  if (resp.status === 403) {
    const body = await resp.text();
    try {
      const parsed = JSON.parse(body);
      if (parsed.requiresStepUp) {
        const err = new Error(parsed.error || 'MFA re-verification required') as any;
        err.requiresStepUp = true;
        throw err;
      }
    } catch (e) {
      if (e instanceof Error && (e as any).requiresStepUp) throw e;
    }
    throw new Error(body || `HTTP ${resp.status}`);
  }

  if (!resp.ok) {
    let message = `HTTP ${resp.status}`;
    try {
      const text = await resp.clone().text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          message = parsed.error || parsed.message || parsed.title || text;
        } catch {
          message = text;
        }
      }
    } catch {
      // fall through with HTTP status
    }
    globalToast('error', message);
    throw new Error(message);
  }

  return resp;
}

/// Blob variant of apiWithMfa: retries the download with an X-MFA-Token header
/// if the first attempt returns a 403 with requiresStepUp.
export async function apiBlobWithMfa(
  path: string,
  options: RequestInit,
  stepUpFn: (operation: string, targetId?: string) => Promise<string>,
  operation: string,
  targetId?: string,
): Promise<Response> {
  try {
    return await apiBlob(path, options);
  } catch (err: any) {
    if (isStepUpRequired(err)) {
      const mfaToken = await stepUpFn(operation, targetId);
      const headers = {
        ...(options.headers as Record<string, string> || {}),
        'X-MFA-Token': mfaToken,
      };
      return await apiBlob(path, { ...options, headers });
    }
    throw err;
  }
}

export interface LoginResponse {
  token?: string;
  expiresAt?: string;
  refreshToken?: string;
  mfaSetupRequired?: boolean;
  requiresMfa?: boolean;
  requirePasswordChange?: boolean;
  mfaToken?: string;
  method?: string;
  availableMethods?: string[];
}

export async function apiLogin(username: string, password: string): Promise<LoginResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const csrfMatch = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]*)/);
  if (csrfMatch) {
    headers['X-CSRF-Token'] = decodeURIComponent(csrfMatch[1]);
  }

  const resp = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password }),
  });

  // Handle 403 with requirePasswordChange — not a fatal error, return it to the caller
  if (resp.status === 403) {
    const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    if (body.requirePasswordChange) {
      return { requirePasswordChange: true } as LoginResponse;
    }
    throw new Error(body.error || body.message || `Login failed (${resp.status})`);
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(err.error || err.message || `Login failed (${resp.status})`);
  }

  const data: LoginResponse = await resp.json();

  // Only store tokens when a JWT is present
  if (data.token && data.expiresAt && data.refreshToken) {
    setTokens(data.token, data.expiresAt, data.refreshToken);
  }

  // Sync the MFA setup flag with the backend response
  if (data.mfaSetupRequired) {
    localStorage.setItem('mfaSetupRequired', 'true');
  } else {
    localStorage.removeItem('mfaSetupRequired');
  }

  return data;
}

/// Calls the pre-JWT password change endpoint for forced password resets.
export async function apiChangePassword(
  username: string,
  oldPassword: string,
  newPassword: string,
  confirmNewPassword: string,
): Promise<{ message: string }> {
  const cpHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  const cpCsrf = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]*)/);
  if (cpCsrf) {
    cpHeaders['X-CSRF-Token'] = decodeURIComponent(cpCsrf[1]);
  }

  const resp = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: cpHeaders,
    body: JSON.stringify({ username, oldPassword, newPassword, confirmNewPassword }),
  });

  const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));

  if (!resp.ok) {
    const message = body.details
      ? `${body.error}: ${body.details.join(', ')}`
      : body.error || body.message || `Password change failed (${resp.status})`;
    throw new Error(message);
  }

  return body;
}

export function apiLogout() {
  clearTokens();
  window.location.href = '/user/login';
}

/// Checks whether an error indicates that step-up MFA is required.
export function isStepUpRequired(err: any): boolean {
  return err?.requiresStepUp === true;
}

/// Wraps an API call with automatic step-up MFA handling.
/// If the initial request returns a 403 with requiresStepUp, it invokes
/// stepUpFn to obtain an MFA token, then retries the request with the
/// X-MFA-Token header.
export async function apiWithMfa<T = any>(
  path: string,
  options: RequestInit,
  stepUpFn: (operation: string, targetId?: string) => Promise<string>,
  operation: string,
  targetId?: string,
): Promise<T> {
  try {
    return await api<T>(path, options);
  } catch (err: any) {
    if (isStepUpRequired(err)) {
      const mfaToken = await stepUpFn(operation, targetId);
      const headers = {
        ...(options.headers as Record<string, string> || {}),
        'X-MFA-Token': mfaToken,
      };
      return api<T>(path, { ...options, headers });
    }
    throw err;
  }
}

/// Step-up-aware POST helper.
export function apiPostWithMfa<T = any>(
  path: string,
  body: object | undefined,
  stepUpFn: (operation: string, targetId?: string) => Promise<string>,
  operation: string,
  targetId?: string,
): Promise<T> {
  return apiWithMfa<T>(
    path,
    { method: 'POST', body: body ? JSON.stringify(body) : undefined },
    stepUpFn,
    operation,
    targetId,
  );
}

/// Step-up-aware PUT helper.
export function apiPutWithMfa<T = any>(
  path: string,
  body: object | undefined,
  stepUpFn: (operation: string, targetId?: string) => Promise<string>,
  operation: string,
  targetId?: string,
): Promise<T> {
  return apiWithMfa<T>(
    path,
    { method: 'PUT', body: body ? JSON.stringify(body) : undefined },
    stepUpFn,
    operation,
    targetId,
  );
}

/// Step-up-aware DELETE helper.
export function apiDeleteWithMfa(
  path: string,
  stepUpFn: (operation: string, targetId?: string) => Promise<string>,
  operation: string,
  targetId?: string,
): Promise<void> {
  return apiWithMfa<void>(path, { method: 'DELETE' }, stepUpFn, operation, targetId);
}

export { API_BASE };
