const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const normalizeBase = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return trimTrailingSlash(trimmed);
};

const explicitApiBase = normalizeBase(import.meta.env.VITE_API_BASE_URL);
const explicitSocketUrl = normalizeBase(import.meta.env.VITE_SOCKET_URL);
const localBackendBase = 'http://localhost:4000';

export const apiBaseUrl = explicitApiBase || localBackendBase;
export const socketBaseUrl = explicitSocketUrl || apiBaseUrl;
export const backendDownloadUrl = normalizeBase(import.meta.env.VITE_BACKEND_DOWNLOAD_URL);

export function buildApiUrl(path) {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with '/': ${path}`);
  }
  return `${apiBaseUrl}${path}`;
}

export async function apiJson(path, options = {}) {
  const res = await fetch(buildApiUrl(path), {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || res.statusText);
  return data;
}
