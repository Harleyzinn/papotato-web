// Only public URLs belong in VITE_* variables. Never put server or media secrets here.
const configured = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const API_BASE = configured;
export const APP_BASE = import.meta.env.BASE_URL;
export const needsBackend = import.meta.env.VITE_REQUIRE_BACKEND === 'true' && !configured;
const tokenKey = 'papotato-session';
export const getToken = () => sessionStorage.getItem(tokenKey);
export const clearToken = () => sessionStorage.removeItem(tokenKey);
export function apiUrl(path) {
  return API_BASE + '/api' + path;
}
export function asset(path) {
  return APP_BASE + path.replace(/^\//, '');
}
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 20000);
  const headers = new Headers(options.headers);
  headers.set('X-Papotato-Auth', 'bearer');
  const token = getToken();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  try {
    return await fetch(apiUrl(path), {
      ...options,
      headers,
      credentials: 'omit',
      signal: options.signal || controller.signal,
    });
  } catch (e) {
    throw new ApiError(
      e.name === 'AbortError'
        ? 'O servidor demorou para responder. Tente novamente.'
        : 'Não foi possível alcançar o servidor. Verifique sua conexão e tente novamente.',
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}
export async function api(path, method = 'GET', body) {
  const response = await apiFetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      'O endereço configurado não respondeu como uma API Papotato.',
      response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401) clearToken();
    throw new ApiError(data.error || 'Não foi possível concluir esta ação.', response.status);
  }
  if (data.sessionToken) {
    sessionStorage.setItem(tokenKey, data.sessionToken);
    delete data.sessionToken;
  }
  return data;
}
