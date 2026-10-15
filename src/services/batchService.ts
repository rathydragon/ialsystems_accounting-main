import { CollectionBatch } from '../types';
import {
  saveBatch as saveBatchToDb,
  deleteBatch as deleteBatchFromDb,
  restoreBatch as restoreBatchFromDb,
  deleteAllBatches as deleteAllBatchesFromDb,
  subscribeToBatches as subscribeToBatchesDb,
  subscribeToDeletedBatches as subscribeToDeletedBatchesDb
} from './localDbService';
import { 
  saveBatchToMaster, 
  deleteBatchFromMaster, 
  saveCodBatchToMaster, 
  deleteCodBatchFromMaster,
  deleteAllBatchesFromMaster,
  deleteAllCodBatchesFromMaster
} from './mysqlMasterService';

export const BATCHES_TABLE = 'batches';
export const MEDICINE_BATCHES_TABLE = 'medicine_batches';
export const COD_BATCHES_TABLE = 'cod_batches';

function resolveTableName(tableName?: string): 'batches' | 'medicine_batches' | 'cod_batches' {
  if (tableName === 'medicine_batches' || tableName === MEDICINE_BATCHES_TABLE) {
    return 'medicine_batches';
  }
  if (tableName === 'cod_batches' || tableName === COD_BATCHES_TABLE) {
    return 'cod_batches';
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
 * Save or update a Collection Batch (Awaits Hostinger MySQL Master first, then syncs local cache)
 */
export async function saveBatch(
  batch: CollectionBatch,
  tableName: string = BATCHES_TABLE
): Promise<boolean> {
  const table = resolveTableName(tableName);
  const isMedicine = table === 'medicine_batches';
  const isCod = table === 'cod_batches';

  // 1. Authoritative Primary Database write (Hostinger MariaDB Master)
  let masterOk = false;
  if (isCod) {
    masterOk = await saveCodBatchToMaster(batch);
  } else {
    masterOk = await saveBatchToMaster(batch, isMedicine);
  }

  if (!masterOk) {
    throw new Error('បរាជ័យក្នុងការរក្សាទុកទៅកាន់ Hostinger MariaDB Master! សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត។');
  }

  // 2. Only after Primary commits: update local cache (IndexedDB & LocalStorage)
  await saveBatchToDb(batch, table);
  return true;
}

/**
 * Delete a specific Collection Batch (Awaits Hostinger MySQL Master first, then updates local cache)
 */
export async function deleteBatch(
  idOrBatchNumber: string,
  tableName: string = BATCHES_TABLE,
  softDelete: boolean = true,
  deletedBy?: string
): Promise<boolean> {
  const table = resolveTableName(tableName);
  const isMedicine = table === 'medicine_batches';
  const isCod = table === 'cod_batches';

  // 1. Authoritative Primary Database delete (Hostinger MariaDB Master)
  let masterOk = false;
  if (isCod) {
    masterOk = await deleteCodBatchFromMaster(idOrBatchNumber);
  } else {
    masterOk = await deleteBatchFromMaster(idOrBatchNumber, isMedicine);
  }

  if (!masterOk) {
    throw new Error('បរាជ័យក្នុងការលុបពី Hostinger MariaDB Master! សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត។');
  }

  // 2. Only after Primary confirms deletion: update local cache
  await deleteBatchFromDb(idOrBatchNumber, table, softDelete, deletedBy);
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
  const isMedicine = table === 'medicine_batches';
  const isCod = table === 'cod_batches';

  // 1. Authoritative Primary delete from Hostinger MariaDB Master
  let masterOk = false;
  if (isCod) {
    masterOk = await deleteAllCodBatchesFromMaster();
  } else {
    masterOk = await deleteAllBatchesFromMaster(isMedicine);
  }

  if (!masterOk) {
    throw new Error('បរាជ័យក្នុងការលុបពី Hostinger MariaDB Master! សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត។');
  }

  // 2. Only after Primary confirms: clear local cache
  await deleteAllBatchesFromDb(table);
  return true;
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

// Dedicated COD Batches Helpers
export const subscribeToCodBatches = (
  onUpdate: (batches: CollectionBatch[]) => void,
  onError?: (error: any) => void,
  fetchLimit: number = 300
) => subscribeToBatches(onUpdate, onError, COD_BATCHES_TABLE, fetchLimit);

export const saveCodBatch = (batch: CollectionBatch) =>
  saveBatch(batch, COD_BATCHES_TABLE);

export const deleteCodBatch = (
  idOrBatchNumber: string,
  softDelete: boolean = true,
  deletedBy?: string
) => deleteBatch(idOrBatchNumber, COD_BATCHES_TABLE, softDelete, deletedBy);

export const restoreCodBatch = (idOrBatchNumber: string) =>
  restoreBatch(idOrBatchNumber, COD_BATCHES_TABLE);

export const deleteAllCodBatches = () =>
  deleteAllBatches(COD_BATCHES_TABLE);

// Backwards-compatible aliases
export const saveBatchToFirestore = saveBatch;
export const deleteBatchFromFirestore = deleteBatch;
export const restoreBatchFromFirestore = restoreBatch;
export const deleteAllBatchesFromFirestore = deleteAllBatches;
export const saveMedicineBatchToFirestore = saveMedicineBatch;
export const deleteMedicineBatchFromFirestore = deleteMedicineBatch;
export const restoreMedicineBatchFromFirestore = restoreMedicineBatch;
export const deleteAllMedicineBatchesFromFirestore = deleteAllMedicineBatches;
export const saveCodBatchToFirestore = saveCodBatch;
export const deleteCodBatchFromFirestore = deleteCodBatch;

