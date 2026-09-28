import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ApiErrorBody, ApiSuccess, PaginationMeta } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export class ApiClientError extends Error {
  status: number;
  errors?: Array<{ field?: string; message: string }>;
  retryAfter?: number;

  constructor(
    message: string,
    status: number,
    errors?: Array<{ field?: string; message: string }>,
    retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.errors = errors;
    this.retryAfter = retryAfter;
  }
}

type TokenGetter = () => string | null;
type TokenSetter = (access: string, refresh: string) => void;
type LogoutHandler = () => void;

let getAccessToken: TokenGetter = () => null;
let getRefreshToken: TokenGetter = () => null;
let setTokens: TokenSetter = () => undefined;
let onLogout: LogoutHandler = () => undefined;

export function bindAuthHandlers(handlers: {
  getAccessToken: TokenGetter;
  getRefreshToken: TokenGetter;
  setTokens: TokenSetter;
  onLogout: LogoutHandler;
}) {
  getAccessToken = handlers.getAccessToken;
  getRefreshToken = handlers.getRefreshToken;
  setTokens = handlers.setTokens;
  onLogout = handlers.onLogout;
}

const raw: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await axios.post<ApiSuccess<{ accessToken: string; refreshToken: string }>>(
      `${API_BASE}/auth/refresh`,
      { refreshToken },
    );
    if (!res.data.success || !res.data.data) return false;
    setTokens(res.data.data.accessToken, res.data.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

raw.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

raw.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    if (status === 401 && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const ok = await refreshPromise;
      if (ok) return raw(original);
      onLogout();
    }

    const body = error.response?.data;
    const retryAfterHeader = error.response?.headers?.['retry-after'];
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    throw new ApiClientError(
      body?.message || error.message || `Erreur HTTP ${status ?? 'réseau'}`,
      status ?? 0,
      body?.errors,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  },
);

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await raw.get<ApiSuccess<T>>(url, config);
  return res.data.data;
}

export async function apiGetPage<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ data: T; meta?: PaginationMeta; message: string }> {
  const res = await raw.get<ApiSuccess<T>>(url, config);
  return { data: res.data.data, meta: res.data.meta, message: res.data.message };
}

export async function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await raw.post<ApiSuccess<T>>(url, body, config);
  return res.data.data;
}

export async function apiPatch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await raw.patch<ApiSuccess<T>>(url, body, config);
  return res.data.data;
}

export async function apiDelete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await raw.delete<ApiSuccess<T> | ''>(url, config);
  if (res.status === 204 || res.data === '') return undefined as T;
  return (res.data as ApiSuccess<T>).data;
}

export async function apiBlob(url: string, body?: unknown, method: 'GET' | 'POST' = 'POST') {
  const res = await raw.request<Blob>({
    url,
    method,
    data: body,
    responseType: 'blob',
  });
  return res.data;
}

export { raw as axiosInstance };
