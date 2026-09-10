import {
  apiGet,
  apiGetPage,
  apiPost,
  apiPatch,
  apiDelete,
  apiBlob,
} from "./client";
import type {
  AlertListRow,
  AuthTokens,
  CommuneDetail,
  CommuneListItem,
  DashboardSummary,
  DistrictListItem,
  EventListItem,
  EventsTimelineEntry,
  ExposedCommuneRow,
  PriorityCommune,
  RiskAssessment,
  RiskDistribution,
  SanitizedUser,
  TerritorySearchResult,
  WeatherForecastData,
  WeatherObservation,
} from "@/types";
import type { WeatherMapLayerMeta } from "@/types/weather";
import type { FeatureCollection } from "geojson";

export const authApi = {
  login: (email: string, password: string) =>
    apiPost<AuthTokens>("/auth/login", { email, password }),
  register: (body: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => apiPost("/auth/register", body),
  me: () => apiGet<SanitizedUser>("/auth/me"),
  logout: (refreshToken: string) => apiPost("/auth/logout", { refreshToken }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiPatch("/users/me/password", { currentPassword, newPassword }),
};

export const dashboardApi = {
  summary: (params?: { eventId?: string }) =>
    apiGet<DashboardSummary>("/dashboard/summary", { params }),
  riskDistribution: (params?: { eventId?: string }) =>
    apiGet<RiskDistribution>("/dashboard/risk-distribution", { params }),
  eventsTimeline: (params?: {
    eventId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => apiGet<EventsTimelineEntry[]>("/dashboard/events-timeline", { params }),
  priorityCommunes: (limit = 10, eventId?: string) =>
    apiGet<PriorityCommune[]>("/dashboard/priority-communes", {
      params: { limit, ...(eventId ? { eventId } : {}) },
    }),
};

export const territoriesApi = {
  districts: (params?: Record<string, string | number | undefined>) =>
    apiGetPage<DistrictListItem[]>("/territories/districts", { params }),
  communes: (params?: Record<string, string | number | undefined>) =>
    apiGetPage<CommuneListItem[]>("/territories/communes", { params }),
  district: (id: string) => apiGet(`/territories/districts/${id}`),
  commune: (id: string) => apiGet<CommuneDetail>(`/territories/communes/${id}`),
  search: (q: string, limit = 20) =>
    apiGet<TerritorySearchResult[]>("/territories/search", {
      params: { q, limit },
    }),
  mapDistricts: (params?: Record<string, string | undefined>) =>
    apiGet<FeatureCollection>("/territories/map/districts", { params }),
  mapCommunes: (params?: Record<string, string | undefined>) =>
    apiGet<FeatureCollection>("/territories/map/communes", { params }),
};

export const eventsApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    apiGetPage<EventListItem[]>("/events", { params }),
  get: (id: string) => apiGet(`/events/${id}`),
  create: (body: unknown) => apiPost<EventListItem>("/events", body),
  update: (id: string, body: unknown) =>
    apiPatch<EventListItem>(`/events/${id}`, body),
  updateStatus: (id: string, status: string) =>
    apiPatch(`/events/${id}/status`, { status }),
  remove: (id: string) => apiDelete(`/events/${id}`),
  tracks: (id: string) => apiGet(`/events/${id}/tracks`),
  trackGeoJson: (id: string) =>
    apiGet<FeatureCollection>(`/events/${id}/track-geojson`),
  addTrack: (id: string, body: unknown) =>
    apiPost(`/events/${id}/tracks`, body),
  areas: (id: string) => apiGet<FeatureCollection>(`/events/${id}/areas`),
  calculateArea: (id: string, body: unknown) =>
    apiPost(`/events/${id}/areas/calculate`, body),
  createPolygonArea: (id: string, body: unknown) =>
    apiPost(`/events/${id}/areas/polygon`, body),
  calculateExposure: (
    id: string,
    params?: Record<string, string | undefined>,
  ) => apiPost(`/events/${id}/exposure/calculate`, undefined, { params }),
  recalculateRisks: (id: string, body: unknown) =>
    apiPost(`/events/${id}/risks/recalculate`, body),
  exposedCommunes: (
    id: string,
    params?: Record<string, string | number | undefined>,
  ) =>
    apiGetPage<ExposedCommuneRow[]>(`/events/${id}/exposed-communes`, {
      params,
    }),
  exposedCommunesIds: async (id: string): Promise<Set<string>> => {
    const res = await apiGetPage<ExposedCommuneRow[]>(
      `/events/${id}/exposed-communes`,
      {
        params: { page: 1, limit: 10000 },
      },
    );
    return new Set(res.data.map((r) => r.communeId));
  },
};

export const alertsApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    apiGetPage<AlertListRow[]>("/alerts", { params }),
  get: (id: string) => apiGet<AlertListRow>(`/alerts/${id}`),
  create: (body: unknown) => apiPost<AlertListRow>("/alerts", body),
  update: (id: string, body: unknown) =>
    apiPatch<AlertListRow>(`/alerts/${id}`, body),
  publish: (id: string) => apiPost(`/alerts/${id}/publish`),
  archive: (id: string) => apiPost(`/alerts/${id}/archive`),
};

export const weatherApi = {
  latest: (communeId: string) =>
    apiGet<WeatherObservation>(`/weather/communes/${communeId}/latest`),
  forecast: (communeId: string) =>
    apiGet<WeatherForecastData>(`/weather/communes/${communeId}/forecast`),
  history: (
    communeId: string,
    params?: Record<string, string | number | undefined>,
  ) => apiGetPage(`/weather/communes/${communeId}/history`, { params }),
  mapLayer: (params?: Record<string, string | undefined>) =>
    apiGet<FeatureCollection>("/weather/map-layer", { params }),
  mapLayerDetailed: async (
    params?: Record<string, string | undefined>,
  ): Promise<{
    data: FeatureCollection;
    meta: WeatherMapLayerMeta | undefined;
  }> => {
    const res = await apiGetPage<FeatureCollection>("/weather/map-layer", {
      params,
    });
    return {
      data: res.data,
      meta: res.meta as WeatherMapLayerMeta | undefined,
    };
  },
  refresh: (body: unknown) => apiPost("/weather/refresh/communes", body),
};

export const risksApi = {
  commune: (
    communeId: string,
    params?: Record<string, string | boolean | undefined>,
  ) =>
    apiGet<RiskAssessment | null>(`/risks/communes/${communeId}`, { params }),
  priority: (params?: Record<string, string | number | undefined>) =>
    apiGet<PriorityCommune[]>("/risks/priority-communes", { params }),
  mapLayer: (params?: Record<string, string | undefined>) =>
    apiGet<FeatureCollection>("/risks/map-layer", { params }),
  recalculate: (body: unknown) => apiPost("/risks/recalculate", body),
  configurations: () => apiGet("/risk-configurations"),
  configuration: (id: string) => apiGet(`/risk-configurations/${id}`),
  createConfiguration: (body: unknown) => apiPost("/risk-configurations", body),
  updateConfiguration: (id: string, body: unknown) =>
    apiPatch(`/risk-configurations/${id}`, body),
};

export const importsApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    apiGetPage("/imports", { params }),
  get: (id: string) => apiGet(`/imports/${id}`),
  errors: (id: string, params?: Record<string, string | number | undefined>) =>
    apiGetPage(`/imports/${id}/errors`, { params }),
  upload: (form: FormData) => apiPost("/imports", form),
};

export const matchingApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    apiGetPage("/matching", { params }),
  statistics: () => apiGet("/matching/statistics"),
  run: (importId: string) => apiPost(`/matching/run/${importId}`),
  approve: (id: string, notes?: string) =>
    apiPost(`/matching/${id}/approve`, { notes }),
  reject: (id: string, notes: string) =>
    apiPost(`/matching/${id}/reject`, { notes }),
  manualLink: (body: unknown) => apiPost("/matching/manual-link", body),
};

export const reportsApi = {
  dashboard: (params?: Record<string, string | undefined>) =>
    apiGet("/reports/dashboard", { params }),
  event: (eventId: string) => apiGet(`/reports/events/${eventId}`),
  list: (params?: Record<string, string | number | undefined>) =>
    apiGetPage("/reports", { params }),
  exportCsv: (body: unknown) => apiBlob("/reports/export/csv", body),
  exportGeoJson: (body: unknown) => apiBlob("/reports/export/geojson", body),
  exportPdf: (body: unknown) => apiBlob("/reports/export/pdf", body),
  download: (id: string) =>
    apiBlob(`/reports/${id}/download`, undefined, "GET"),
};

export const aiApi = {
  chat: (message: string, conversationId?: string) =>
    apiPost<{ conversationId: string; answer: string }>("/ai/chat", {
      message,
      conversationId,
    }),
  conversations: (params?: Record<string, number | undefined>) =>
    apiGetPage("/ai/conversations", { params }),
  conversation: (id: string) => apiGet(`/ai/conversations/${id}`),
  remove: (id: string) => apiDelete(`/ai/conversations/${id}`),
};

export const usersApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) =>
    apiGetPage<SanitizedUser[]>("/users", { params }),
  get: (id: string) => apiGet<SanitizedUser>(`/users/${id}`),
  create: (body: unknown) => apiPost<SanitizedUser>("/users", body),
  update: (id: string, body: unknown) =>
    apiPatch<SanitizedUser>(`/users/${id}`, body),
  setStatus: (id: string, isActive: boolean) =>
    apiPatch(`/users/${id}/status`, { isActive }),
};

export const systemApi = {
  databaseStatus: () => apiGet("/system/database-status"),
  health: () => apiGet("/health"),
};
