/**
 * Batch B / H07 regression: the device-wide SQLite cache and queue must be
 * account-owned. Runs on Node's built-in SQLite through an expo-sqlite mock,
 * so no emulator is required. Run with: npm test (mobile/).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test, mock } from 'node:test';

class NodeSqliteAdapter {
  private db = new DatabaseSync(':memory:');

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowId: number }> {
    const info = this.db.prepare(sql).run(...(params as (string | number | null)[]));
    return { changes: Number(info.changes), lastInsertRowId: Number(info.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.db.prepare(sql).get(...(params as (string | number | null)[])) as T) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as (string | number | null)[])) as T[];
  }
  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await fn();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

const adapter = new NodeSqliteAdapter();

mock.module('expo-sqlite', {
  namedExports: { openDatabaseAsync: async () => adapter },
});
mock.module('expo-crypto', {
  namedExports: { randomUUID },
});

const db = await import('../src/db/database.ts');

function animal(id: string) {
  return { id, name: `animal-${id}`, tag_code: `TAG-${id}` } as never;
}

test('H07: cache and queue are scoped to the active account', async () => {
  await db.initDatabase();

  await db.setActiveAccount('account-a');
  const opA = await db.enqueueOperation({
    entityType: 'animal',
    entityId: 'animal-a1',
    payload: { name: 'A owned animal' },
  });
  await db.saveAnimalCache([animal('a1')]);
  await db.saveCaseCache([{ id: 'case-a' } as never]);
  await db.saveScheduleCache([{ animal_id: 'a1', vaccine_id: 'v1' } as never]);
  await db.enqueuePhoto('a1', 'file://photo-a.jpg');

  assert.equal(await db.pendingCount(), 1);
  assert.equal((await db.loadAnimalCache()).length, 1);
  assert.equal((await db.loadCaseCache()).length, 1);
  assert.equal((await db.loadScheduleCache()).length, 1);
  assert.equal((await db.listPendingPhotos()).length, 1);

  // Account B logs in on the same device: none of A's data may be visible or syncable.
  await db.setActiveAccount('account-b');
  assert.equal(await db.getActiveAccount(), 'account-b');
  assert.equal(await db.pendingCount(), 0, "B must not see A's queued operations");
  assert.deepEqual(await db.listPendingOperations(), []);
  assert.deepEqual(await db.loadAnimalCache(), [], "B must not read A's cached animals");
  assert.deepEqual(await db.loadCaseCache(), []);
  assert.deepEqual(await db.loadScheduleCache(), []);
  assert.deepEqual(await db.listPendingPhotos(), []);

  await db.enqueueOperation({
    entityType: 'animal',
    entityId: 'animal-b1',
    payload: { name: 'B owned animal' },
  });
  assert.equal(await db.pendingCount(), 1);

  // Switching back to A shows only A's queue entry, never B's.
  await db.setActiveAccount('account-a');
  const pendingA = await db.listPendingOperations();
  assert.equal(pendingA.length, 1);
  assert.equal(pendingA[0].id, opA);
  assert.equal(pendingA[0].entity_id, 'animal-a1');

  // Logout clears the active account's cache, queue and photos.
  await db.clearActiveAccount();
  assert.equal(await db.getActiveAccount(), null);
  assert.equal(await db.pendingCount(), 0);
  assert.deepEqual(await db.loadAnimalCache(), []);
  assert.deepEqual(await db.loadCaseCache(), []);
  assert.deepEqual(await db.loadScheduleCache(), []);
  assert.deepEqual(await db.listPendingPhotos(), []);
  await assert.rejects(
    () => db.enqueueOperation({ entityType: 'animal', entityId: 'x', payload: {} }),
    /account/i,
    'queueing without an active account must fail',
  );

  // B's data survives A's logout and is still owned by B.
  await db.setActiveAccount('account-b');
  const pendingB = await db.listPendingOperations();
  assert.equal(pendingB.length, 1);
  assert.equal(pendingB[0].entity_id, 'animal-b1');
});