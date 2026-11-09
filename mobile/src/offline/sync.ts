import { ApiError, apiFetch, uploadAnimalPhoto } from '../api/client';
import {
  deleteOperation,
  deletePhoto,
  getClientId,
  listPendingOperations,
  listPendingPhotos,
  setMeta,
  updateOperation,
} from '../db/database';
import type { SyncBatchResponse, SyncResult } from '../types';

export interface SyncSummary {
  applied: number;
  duplicates: number;
  conflicts: number;
  errors: number;
  photosUploaded: number;
  results: SyncResult[];
}

export async function syncPendingOperations(): Promise<SyncSummary> {
  const clientId = await getClientId();
  const operations = await listPendingOperations();
  const summary: SyncSummary = {
    applied: 0,
    duplicates: 0,
    conflicts: 0,
    errors: 0,
    photosUploaded: 0,
    results: [],
  };

  if (operations.length > 0) {
    const response = await apiFetch<SyncBatchResponse>('/sync/batch', {
      method: 'POST',
      body: {
        client_id: clientId,
        operations: operations.map((operation) => ({
          client_id: operation.client_id,
          entity_type: operation.entity_type,
          entity_id: operation.entity_id,
          operation: operation.operation,
          idempotency_key: operation.idempotency_key,
          payload: JSON.parse(operation.payload) as Record<string, unknown>,
        })),
      },
      timeoutMs: 45000,
    });

    const byKey = new Map(response.results.map((result) => [result.idempotency_key, result]));
    for (const operation of operations) {
      const result = byKey.get(operation.idempotency_key);
      if (!result) continue;
      summary.results.push(result);
      if (result.status === 'applied' || result.status === 'duplicate') {
        await deleteOperation(operation.id);
      } else {
        await updateOperation(operation.id, result.status, result.message ?? null);
      }
    }
    summary.applied = response.applied;
    summary.duplicates = response.duplicates;
    summary.conflicts = response.conflicts;
    summary.errors = response.errors;
  }

  summary.photosUploaded = await syncPendingPhotos();
  await setMeta('last_sync_at', new Date().toISOString());
  return summary;
}

export async function syncPendingPhotos(): Promise<number> {
  const photos = await listPendingPhotos();
  let uploaded = 0;
  for (const photo of photos) {
    try {
      await uploadAnimalPhoto(photo.animal_id, photo.uri);
      await deletePhoto(photo.id);
      uploaded += 1;
    } catch (error) {
      if (error instanceof ApiError && error.network) break;
      if (error instanceof ApiError && error.status === 404) continue;
      if (error instanceof ApiError && error.status === 403) {
        await deletePhoto(photo.id);
      }
    }
  }
  return uploaded;
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.network;
}
