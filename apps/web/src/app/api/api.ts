import type {
  CreatePairingCodeRequest,
  CreatePairingCodeResponse,
  CreatePlantRequest,
  ForgotPasswordRequest,
  GatewayDto,
  LoginRequest,
  Metric,
  PairingStatusResponse,
  PlanterDetailDto,
  PlanterDto,
  PlantDto,
  ReadingBucket,
  ReadingsResponse,
  RegisterRequest,
  ResetPasswordRequest,
  UpdatePlantRequest,
  UserDto,
} from '@org/shared';
import { request } from './client';

/** One function per endpoint, typed with the contracts from `@org/shared`. */

export const auth = {
  me: (signal?: AbortSignal) => request<UserDto>('/auth/me', { signal }),
  login: (body: LoginRequest) =>
    request<UserDto>('/auth/login', { method: 'POST', body }),
  register: (body: RegisterRequest) =>
    request<UserDto>('/auth/register', { method: 'POST', body }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  forgotPassword: (body: ForgotPasswordRequest) =>
    request<void>('/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body: ResetPasswordRequest) =>
    request<void>('/auth/reset-password', { method: 'POST', body }),
};

export const gateways = {
  list: (signal?: AbortSignal) =>
    request<GatewayDto[]>('/gateways', { signal }),
  remove: (id: string) =>
    request<void>(`/gateways/${id}`, { method: 'DELETE' }),
};

export const pairing = {
  start: (body: CreatePairingCodeRequest) =>
    request<CreatePairingCodeResponse>('/pairing-codes', {
      method: 'POST',
      body,
    }),
  status: (id: string, signal?: AbortSignal) =>
    request<PairingStatusResponse>(`/pairing-codes/${id}`, { signal }),
};

export type ReadingsParams = {
  metric: Metric;
  from?: Date;
  to?: Date;
  bucket?: ReadingBucket;
};

export const planters = {
  list: (signal?: AbortSignal) =>
    request<PlanterDto[]>('/planters', { signal }),
  get: (id: string, signal?: AbortSignal) =>
    request<PlanterDetailDto>(`/planters/${id}`, { signal }),
  rename: (id: string, name: string) =>
    request<PlanterDto>(`/planters/${id}`, { method: 'PATCH', body: { name } }),
  remove: (id: string) =>
    request<void>(`/planters/${id}`, { method: 'DELETE' }),
  readings: (id: string, params: ReadingsParams, signal?: AbortSignal) => {
    const query = new URLSearchParams({ metric: params.metric });
    if (params.from) query.set('from', params.from.toISOString());
    if (params.to) query.set('to', params.to.toISOString());
    if (params.bucket) query.set('bucket', params.bucket);
    return request<ReadingsResponse>(`/planters/${id}/readings?${query}`, {
      signal,
    });
  },
};

export const plants = {
  create: (planterId: string, body: CreatePlantRequest) =>
    request<PlantDto>(`/planters/${planterId}/plants`, {
      method: 'POST',
      body,
    }),
  update: (id: string, body: UpdatePlantRequest) =>
    request<PlantDto>(`/plants/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<void>(`/plants/${id}`, { method: 'DELETE' }),
};
