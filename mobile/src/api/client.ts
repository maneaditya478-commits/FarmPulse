import Constants from 'expo-constants';
import { Platform } from 'react-native';

const configured = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
const envUrl = process.env.EXPO_PUBLIC_API_URL;

export const API_BASE =
  envUrl?.replace(/\/$/, '') ||
  configured ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:8000/api/v1' : 'http://localhost:8000/api/v1');

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export class ApiError extends Error {
  status: number;
  code: string;
  network: boolean;

  constructor(message: string, status = 0, code = 'request_failed', network = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.network = network;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const message =
        data?.error?.message || data?.detail?.[0]?.msg || data?.detail || `Request failed (${response.status})`;
      throw new ApiError(String(message), response.status, data?.error?.code || 'request_failed');
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError('The server took too long to respond.', 0, 'timeout', true);
    }
    throw new ApiError('Cannot reach the server. Check your connection.', 0, 'network', true);
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadAnimalPhoto(animalId: string, uri: string): Promise<void> {
  const form = new FormData();
  form.append('file', {
    uri,
    name: `animal-${animalId}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob);
  const response = await fetch(`${API_BASE}/animals/${animalId}/photo`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(text || `Photo upload failed (${response.status})`, response.status, 'photo_upload_failed');
  }
}

export function mediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const root = API_BASE.replace(/\/api\/v1\/?$/, '');
  return `${root}${path.startsWith('/') ? '' : '/'}${path}`;
}
