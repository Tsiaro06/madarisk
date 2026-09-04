export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: ApiErrorDetail[];
}

export function successResponse<T>(
  data: T,
  message = 'Opération réussie',
  meta?: PaginationMeta,
): ApiResponse<T> {
  const response: ApiResponse<T> = { success: true, message, data };
  if (meta) response.meta = meta;
  return response;
}

export function createdResponse<T>(data: T, message = 'Ressource créée'): ApiResponse<T> {
  return { success: true, message, data };
}

export function noContentResponse(): null {
  return null;
}

export function errorResponse(
  message = 'Erreur serveur',
  errors?: ApiErrorDetail[],
): ApiErrorResponse {
  const response: ApiErrorResponse = { success: false, message };
  if (errors && errors.length > 0) response.errors = errors;
  return response;
}

export function paginate(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
