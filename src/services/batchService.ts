import { CollectionBatch } from '../types';
import {
  saveBatch as saveBatchToDb,
  deleteBatch as deleteBatchFromDb,
  restoreBatch as restoreBatchFromDb,
  deleteAllBatches as deleteAllBatchesFromDb,
  subscribeToBatches as subscribeToBatchesDb,
  subscribeToDeletedBatches as subscribeToDeletedBatchesDb
} from './localDbService';
import { saveBatchToMaster, deleteBatchFromMaster } from './mysqlMasterService';

export const BATCHES_TABLE = 'batches';
export const MEDICINE_BATCHES_TABLE = 'medicine_batches';

function resolveTableName(tableName?: string): 'batches' | 'medicine_batches' {
  if (tableName === 'medicine_batches' || tableName === MEDICINE_BATCHES_TABLE) {
    return 'medicine_batches';
  }
  return 'batches';
}

/**
 * Subscribe to real-time changes in Batches & Collection Items
 */
export function subscribeToBatches(
  onUpdate: (batches: CollectionBatch[]) => void,
  _onError?: (error: any) => void,
  tableName: string = BATCHES_TABLE,
  _fetchLimit: number = 300
): () => void {
  const table = resolveTableName(tableName);
  return subscribeToBatchesDb(onUpdate, table, true);
}

/**
 * Subscribe to soft-deleted Batches (Recycle Bin / ធុងសំរាម)
 */
export function subscribeToDeletedBatches(
  onUpdate: (batches: CollectionBatch[]) => void,
  _onError?: (error: any) => void,
  tableName: string = BATCHES_TABLE
): () => void {
  const table = resolveTableName(tableName);
  return subscribeToDeletedBatchesDb(onUpdate, table);
}

/**
 * Save or update a Collection Batch (Saves to Hostinger MySQL Master + Local Cache)
 */
export async function saveBatch(
  batch: CollectionBatch,
  tableName: string = BATCHES_TABLE
): Promise<boolean> {
  const table = resolveTableName(tableName);
  // 1. Immediate local in-memory & LocalStorage update
  await saveBatchToDb(batch, table);
  // 2. Real-time Master Database write (Hostinger MySQL)
  saveBatchToMaster(batch, table === 'medicine_batches').catch(err => {
    console.warn('[batchService] Master MySQL save warning:', err);
  });
  return true;
}

/**
 * Delete a specific Collection Batch (Hostinger MySQL Master + Local Cache)
 */
export async function deleteBatch(
  idOrBatchNumber: string,
  tableName: string = BATCHES_TABLE,
  softDelete: boolean = true,
  deletedBy?: string
): Promise<boolean> {
  const table = resolveTableName(tableName);
  await deleteBatchFromDb(idOrBatchNumber, table, softDelete, deletedBy);
  deleteBatchFromMaster(idOrBatchNumber, table === 'medicine_batches').catch(err => {
    console.warn('[batchService] Master MySQL delete warning:', err);
  });
  return true;
}

/**
 * Restore a soft-deleted batch from Recycle Bin
 */
export async function restoreBatch(
  idOrBatchNumber: string,
  tableName: string = BATCHES_TABLE
): Promise<boolean> {
  const table = resolveTableName(tableName);
  return restoreBatchFromDb(idOrBatchNumber, table);
}

/**
 * Delete all Collection Batches (Admin only)
 */
export async function deleteAllBatches(
  tableName: string = BATCHES_TABLE
): Promise<boolean> {
  const table = resolveTableName(tableName);
  return deleteAllBatchesFromDb(table);
}

// Dedicated Medicine Batches Helpers
export const subscribeToMedicineBatches = (
  onUpdate: (batches: CollectionBatch[]) => void,
  onError?: (error: any) => void,
  fetchLimit: number = 300
) => subscribeToBatches(onUpdate, onError, MEDICINE_BATCHES_TABLE, fetchLimit);

export const saveMedicineBatch = (batch: CollectionBatch) =>
  saveBatch(batch, MEDICINE_BATCHES_TABLE);

export const deleteMedicineBatch = (
  idOrBatchNumber: string,
  softDelete: boolean = true,
  deletedBy?: string
) => deleteBatch(idOrBatchNumber, MEDICINE_BATCHES_TABLE, softDelete, deletedBy);

export const restoreMedicineBatch = (idOrBatchNumber: string) =>
  restoreBatch(idOrBatchNumber, MEDICINE_BATCHES_TABLE);

export const deleteAllMedicineBatches = () =>
  deleteAllBatches(MEDICINE_BATCHES_TABLE);

// Backwards-compatible aliases
export const saveBatchToFirestore = saveBatch;
export const deleteBatchFromFirestore = deleteBatch;
export const restoreBatchFromFirestore = restoreBatch;
export const deleteAllBatchesFromFirestore = deleteAllBatches;
export const saveMedicineBatchToFirestore = saveMedicineBatch;
export const deleteMedicineBatchFromFirestore = deleteMedicineBatch;
export const restoreMedicineBatchFromFirestore = restoreMedicineBatch;
export const deleteAllMedicineBatchesFromFirestore = deleteAllMedicineBatches;
