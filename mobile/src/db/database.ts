import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import type { Animal, HealthCase, PendingOperation, VaccinationScheduleItem } from '../types';

const DB_NAME = 'livestock_guardian.db';

let database: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  if (!opening) {
    opening = SQLite.openDatabaseAsync(DB_NAME).then((db) => {
      database = db;
      return db;
    });
  }
  return opening;
}

export async function initDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_operations (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      message TEXT,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pending_photos (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      animal_id TEXT NOT NULL,
      uri TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cached_animals (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cached_schedule (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cached_cases (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  // Upgrade older device databases: rows without an owner cannot be attributed
  // to any account, so they are removed rather than synced under a new login.
  const ownedTables = ['pending_operations', 'pending_photos', 'cached_animals', 'cached_schedule', 'cached_cases'];
  for (const table of ownedTables) {
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!columns.some((column) => column.name === 'owner_id')) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';`);
      await db.runAsync(`DELETE FROM ${table} WHERE owner_id = ''`);
    }
  }
}

export function newId(): string {
  return Crypto.randomUUID();
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function getClientId(): Promise<string> {
  let clientId = await getMeta('client_id');
  if (!clientId) {
    clientId = `mobile-${newId()}`;
    await setMeta('client_id', clientId);
  }
  return clientId;
}

export async function getActiveAccount(): Promise<string | null> {
  const owner = await getMeta('account_owner');
  return owner || null;
}

export async function setActiveAccount(userId: string): Promise<void> {
  await setMeta('account_owner', userId);
}

async function requireAccount(): Promise<string> {
  const owner = await getActiveAccount();
  if (!owner) throw new Error('No active account; sign in before using offline data');
  return owner;
}

export async function clearAccountData(userId: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM pending_operations WHERE owner_id = ?', userId);
    await db.runAsync('DELETE FROM pending_photos WHERE owner_id = ?', userId);
    await db.runAsync('DELETE FROM cached_animals WHERE owner_id = ?', userId);
    await db.runAsync('DELETE FROM cached_schedule WHERE owner_id = ?', userId);
    await db.runAsync('DELETE FROM cached_cases WHERE owner_id = ?', userId);
  });
}

export async function clearActiveAccount(): Promise<void> {
  const owner = await getActiveAccount();
  if (owner) await clearAccountData(owner);
  const db = await getDatabase();
  await db.runAsync('DELETE FROM meta WHERE key = ?', 'account_owner');
}

export async function saveAnimalCache(animals: Animal[]): Promise<void> {
  const db = await getDatabase();
  const owner = await requireAccount();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const animal of animals) {
      await db.runAsync(
        'INSERT INTO cached_animals (id, owner_id, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, owner_id = excluded.owner_id',
        animal.id,
        owner,
        JSON.stringify(animal),
        now,
      );
    }
  });
  await setMeta('animals_cached_at', now);
}

export async function loadAnimalCache(): Promise<Animal[]> {
  const db = await getDatabase();
  const owner = await getActiveAccount();
  if (!owner) return [];
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM cached_animals WHERE owner_id = ? ORDER BY updated_at DESC',
    owner,
  );
  return rows.map((row) => JSON.parse(row.payload) as Animal);
}

export async function saveScheduleCache(items: VaccinationScheduleItem[]): Promise<void> {
  const db = await getDatabase();
  const owner = await requireAccount();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        'INSERT INTO cached_schedule (id, owner_id, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, owner_id = excluded.owner_id',
        `${item.animal_id}:${item.vaccine_id}`,
        owner,
        JSON.stringify(item),
        now,
      );
    }
  });
  await setMeta('schedule_cached_at', now);
}

export async function loadScheduleCache(): Promise<VaccinationScheduleItem[]> {
  const db = await getDatabase();
  const owner = await getActiveAccount();
  if (!owner) return [];
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM cached_schedule WHERE owner_id = ? ORDER BY updated_at DESC',
    owner,
  );
  return rows.map((row) => JSON.parse(row.payload) as VaccinationScheduleItem);
}

export async function saveCaseCache(cases: HealthCase[]): Promise<void> {
  const db = await getDatabase();
  const owner = await requireAccount();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const item of cases) {
      await db.runAsync(
        'INSERT INTO cached_cases (id, owner_id, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, owner_id = excluded.owner_id',
        item.id,
        owner,
        JSON.stringify(item),
        now,
      );
    }
  });
  await setMeta('cases_cached_at', now);
}

export async function loadCaseCache(): Promise<HealthCase[]> {
  const db = await getDatabase();
  const owner = await getActiveAccount();
  if (!owner) return [];
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM cached_cases WHERE owner_id = ? ORDER BY updated_at DESC',
    owner,
  );
  return rows.map((row) => JSON.parse(row.payload) as HealthCase);
}

export interface OperationInput {
  entityType: string;
  entityId: string;
  operation?: 'create' | 'update';
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export async function enqueueOperation(input: OperationInput): Promise<string> {
  const db = await getDatabase();
  const owner = await requireAccount();
  const clientId = await getClientId();
  const id = newId();
  await db.runAsync(
    `INSERT INTO pending_operations
      (id, owner_id, client_id, entity_type, entity_id, operation, idempotency_key, payload, created_at, status, attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
    id,
    owner,
    clientId,
    input.entityType,
    input.entityId,
    input.operation ?? 'create',
    input.idempotencyKey ?? newId(),
    JSON.stringify(input.payload),
    new Date().toISOString(),
  );
  return id;
}

export async function listPendingOperations(): Promise<PendingOperation[]> {
  const db = await getDatabase();
  const owner = await getActiveAccount();
  if (!owner) return [];
  return db.getAllAsync<PendingOperation>(
    "SELECT * FROM pending_operations WHERE owner_id = ? AND status IN ('pending', 'error', 'conflict') ORDER BY created_at ASC",
    owner,
  );
}

export async function pendingCount(): Promise<number> {
  const db = await getDatabase();
  const owner = await getActiveAccount();
  if (!owner) return 0;
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM pending_operations WHERE owner_id = ? AND status IN ('pending', 'error', 'conflict')",
    owner,
  );
  return row?.count ?? 0;
}

export async function updateOperation(
  id: string,
  status: 'pending' | 'error' | 'conflict',
  message?: string | null,
): Promise<void> {
  const db = await getDatabase();
  const owner = await requireAccount();
  await db.runAsync(
    'UPDATE pending_operations SET status = ?, message = ?, attempts = attempts + 1 WHERE id = ? AND owner_id = ?',
    status,
    message ?? null,
    id,
    owner,
  );
}

export async function deleteOperation(id: string): Promise<void> {
  const db = await getDatabase();
  const owner = await requireAccount();
  await db.runAsync('DELETE FROM pending_operations WHERE id = ? AND owner_id = ?', id, owner);
}

export async function enqueuePhoto(animalId: string, uri: string): Promise<void> {
  const db = await getDatabase();
  const owner = await requireAccount();
  await db.runAsync(
    'INSERT INTO pending_photos (id, owner_id, animal_id, uri, created_at) VALUES (?, ?, ?, ?, ?)',
    newId(),
    owner,
    animalId,
    uri,
    new Date().toISOString(),
  );
}

export async function listPendingPhotos(): Promise<{ id: string; animal_id: string; uri: string }[]> {
  const db = await getDatabase();
  const owner = await getActiveAccount();
  if (!owner) return [];
  return db.getAllAsync<{ id: string; animal_id: string; uri: string }>(
    'SELECT id, animal_id, uri FROM pending_photos WHERE owner_id = ? ORDER BY created_at ASC',
    owner,
  );
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDatabase();
  const owner = await requireAccount();
  await db.runAsync('DELETE FROM pending_photos WHERE id = ? AND owner_id = ?', id, owner);
}
