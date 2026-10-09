import { CollectionBatch } from '../types';
import {
  saveBatchToSupabase,
  deleteBatchFromSupabase,
  restoreBatchFromSupabase,
  deleteAllBatchesFromSupabase,
  subscribeToBatchesFromSupabase,
  subscribeToDeletedBatchesFromSupabase
} from './supabaseDbService';

export const BATCHES_TABLE = 'batches';
export const MEDICINE_BATCHES_TABLE = 'medicine_batches';

function resolveTableName(tableName?: string): 'batches' | 'medicine_batches' {
  if (tableName === 'medicine_batches' || tableName === MEDICINE_BATCHES_TABLE) {
    return 'medicine_batches';
  }
  return 'batches';
}

/**
 * Subscribe to real-time changes in Batches & Collection Items from Supabase Realtime
 */
export function subscribeToBatches(
  onUpdate: (batches: CollectionBatch[]) => void,
  _onError?: (error: any) => void,
  tableName: string = BATCHES_TABLE,
  _fetchLimit: number = 300
): () => void {
  const table = resolveTableName(tableName);
  return subscribeToBatchesFromSupabase(onUpdate, table, true);
}

/**
 * Subscribe to soft-deleted Batches (Recycle Bin / ធុងសំរាម) from Supabase Realtime
 */
export function subscribeToDeletedBatches(
  onUpdate: (batches: CollectionBatch[]) => void,
  _onError?: (error: any) => void,
  tableName: string = BATCHES_TABLE
): () => void {
  const table = resolveTableName(tableName);
  return subscribeToDeletedBatchesFromSupabase(onUpdate, table);
}

/**
 * Save or update a Collection Batch in Supabase
 */
export async function saveBatch(
  batch: CollectionBatch,
  tableName: string = BATCHES_TABLE
): Promise<boolean> {
  const table = resolveTableName(tableName);
  return saveBatchToSupabase(batch, table);
}

/**
 * Delete a specific Collection Batch (Supports Soft Delete by default)
 */
export async function deleteBatch(
  idOrBatchNumber: string,
  tableName: string = BATCHES_TABLE,
  softDelete: boolean = true,
  deletedBy?: string
): Promise<boolean> {
  const table = resolveTableName(tableName);
  return deleteBatchFromSupabase(idOrBatchNumber, table, softDelete, deletedBy);
}

/**
 * Restore a soft-deleted batch from Recycle Bin
 */
export async function restoreBatch(
  idOrBatchNumber: string,
  tableName: string = BATCHES_TABLE
): Promise<boolean> {
  const table = resolveTableName(tableName);
  return restoreBatchFromSupabase(idOrBatchNumber, table);
}

/**
 * Delete all Collection Batches from Supabase (Admin only)
 */
export async function deleteAllBatches(
  tableName: string = BATCHES_TABLE
): Promise<boolean> {
  const table = resolveTableName(tableName);
  return deleteAllBatchesFromSupabase(table);
}

// Dedicated Medicine Batches Supabase Helpers
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
