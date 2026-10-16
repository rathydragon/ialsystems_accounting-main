/**
 * Production Deduplication & Unique Constraint Enforcement
 * Target: tbl_collection_items & tbl_medicine_items on Hostinger MariaDB
 * Authoritative Master Database: u112951411_iale_api
 */

import { getMySQLPool } from '../api/remote-mysql.js';

async function executeDeduplication() {
  console.log('====================================================');
  console.log('🚀 Executing Deduplication on Hostinger MariaDB Production');
  console.log('====================================================');

  const pool = getMySQLPool();
  const conn = await pool.getConnection();

  try {
    // Phase 1: Pre-cleanup Verification
    const [collPre] = await conn.query('SELECT COUNT(*) as cnt FROM tbl_collection_items');
    const [medPre] = await conn.query('SELECT COUNT(*) as cnt FROM tbl_medicine_items');
    const [collDistinct] = await conn.query('SELECT COUNT(DISTINCT batch_id, tracking) as cnt FROM tbl_collection_items');
    const [medDistinct] = await conn.query('SELECT COUNT(DISTINCT batch_id, tracking) as cnt FROM tbl_medicine_items');

    const collPreCount = collPre[0].cnt;
    const medPreCount = medPre[0].cnt;
    const collExpectedKeep = collDistinct[0].cnt;
    const medExpectedKeep = medDistinct[0].cnt;
    const collExpectedDelete = collPreCount - collExpectedKeep;
    const medExpectedDelete = medPreCount - medExpectedKeep;

    console.log(`[Pre-Check] tbl_collection_items: Total=${collPreCount}, Unique=${collExpectedKeep}, Expected Deletions=${collExpectedDelete}`);
    console.log(`[Pre-Check] tbl_medicine_items:   Total=${medPreCount}, Unique=${medExpectedKeep}, Expected Deletions=${medExpectedDelete}`);

    // Phase 2: Transactional Deletion
    await conn.beginTransaction();

    console.log('\n--- Executing Deletion of Duplicate Rows ---');

    // Delete duplicates in tbl_collection_items (keeping MIN(id))
    const [collDelResult] = await conn.query(`
      DELETE FROM tbl_collection_items
      WHERE id NOT IN (
        SELECT min_id FROM (
          SELECT MIN(id) AS min_id
          FROM tbl_collection_items
          GROUP BY batch_id, tracking
        ) AS keep_rows
      )
    `);
    const collActualDeleted = collDelResult.affectedRows;
    console.log(`✓ tbl_collection_items: Deleted ${collActualDeleted} duplicate rows (Expected: ${collExpectedDelete})`);

    // Delete duplicates in tbl_medicine_items (keeping MIN(id))
    const [medDelResult] = await conn.query(`
      DELETE FROM tbl_medicine_items
      WHERE id NOT IN (
        SELECT min_id FROM (
          SELECT MIN(id) AS min_id
          FROM tbl_medicine_items
          GROUP BY batch_id, tracking
        ) AS keep_rows
      )
    `);
    const medActualDeleted = medDelResult.affectedRows;
    console.log(`✓ tbl_medicine_items:   Deleted ${medActualDeleted} duplicate rows (Expected: ${medExpectedDelete})`);

    // Phase 3: Post-deletion Integrity Verification
    const [collPost] = await conn.query('SELECT COUNT(*) as cnt FROM tbl_collection_items');
    const [medPost] = await conn.query('SELECT COUNT(*) as cnt FROM tbl_medicine_items');
    const collPostCount = collPost[0].cnt;
    const medPostCount = medPost[0].cnt;

    const [collRemainingDups] = await conn.query(`
      SELECT batch_id, tracking, COUNT(*) as c
      FROM tbl_collection_items
      GROUP BY batch_id, tracking
      HAVING c > 1
    `);

    const [medRemainingDups] = await conn.query(`
      SELECT batch_id, tracking, COUNT(*) as c
      FROM tbl_medicine_items
      GROUP BY batch_id, tracking
      HAVING c > 1
    `);

    if (collRemainingDups.length > 0 || medRemainingDups.length > 0) {
      throw new Error(`Integrity check failed: Residual duplicates found after deletion! Coll: ${collRemainingDups.length}, Med: ${medRemainingDups.length}`);
    }

    if (collPostCount !== collExpectedKeep || medPostCount !== medExpectedKeep) {
      throw new Error(`Count mismatch after deletion! Coll: actual=${collPostCount} vs expected=${collExpectedKeep}; Med: actual=${medPostCount} vs expected=${medExpectedKeep}`);
    }

    // Commit Transaction
    await conn.commit();
    console.log('✓ Transaction committed successfully.');

    // Phase 4: Enforce UNIQUE Constraints
    console.log('\n--- Enforcing UNIQUE Constraints ---');

    // Check existing indexes on tbl_collection_items
    const [collIndexes] = await conn.query('SHOW INDEX FROM tbl_collection_items WHERE Key_name = "uq_collection_batch_tracking"');
    if (collIndexes.length === 0) {
      console.log('Applying UNIQUE constraint: uq_collection_batch_tracking on tbl_collection_items(batch_id, tracking)...');
      await conn.query('ALTER TABLE tbl_collection_items ADD CONSTRAINT uq_collection_batch_tracking UNIQUE (batch_id, tracking)');
      console.log('✓ UNIQUE constraint uq_collection_batch_tracking applied.');
    } else {
      console.log('uq_collection_batch_tracking constraint already exists.');
    }

    // Check existing indexes on tbl_medicine_items
    const [medIndexes] = await conn.query('SHOW INDEX FROM tbl_medicine_items WHERE Key_name = "uq_medicine_batch_tracking"');
    if (medIndexes.length === 0) {
      console.log('Applying UNIQUE constraint: uq_medicine_batch_tracking on tbl_medicine_items(batch_id, tracking)...');
      await conn.query('ALTER TABLE tbl_medicine_items ADD CONSTRAINT uq_medicine_batch_tracking UNIQUE (batch_id, tracking)');
      console.log('✓ UNIQUE constraint uq_medicine_batch_tracking applied.');
    } else {
      console.log('uq_medicine_batch_tracking constraint already exists.');
    }

    // Phase 5: Financial Reconciliation Check
    console.log('\n--- Financial Reconciliation Check ---');
    const [collFin] = await conn.query(`
      SELECT 
        b.batch_id,
        b.total_items AS batch_total_items,
        COUNT(i.id) AS actual_items_count,
        ROUND(b.total_usd, 2) AS batch_usd,
        ROUND(COALESCE(SUM(i.usd), 0), 2) AS items_usd,
        ROUND(b.total_khr, 2) AS batch_khr,
        ROUND(COALESCE(SUM(i.khm), 0), 2) AS items_khr
      FROM tbl_batches b
      LEFT JOIN tbl_collection_items i ON b.batch_id = i.batch_id
      GROUP BY b.batch_id, b.total_items, b.total_usd, b.total_khr
      HAVING batch_total_items != actual_items_count OR batch_usd != items_usd OR batch_khr != items_khr
    `);

    const [medFin] = await conn.query(`
      SELECT 
        b.batch_id,
        b.total_items AS batch_total_items,
        COUNT(i.id) AS actual_items_count,
        ROUND(b.total_usd, 2) AS batch_usd,
        ROUND(COALESCE(SUM(i.usd), 0), 2) AS items_usd,
        ROUND(b.total_khr, 2) AS batch_khr,
        ROUND(COALESCE(SUM(i.khm), 0), 2) AS items_khr
      FROM tbl_medicine_batches b
      LEFT JOIN tbl_medicine_items i ON b.batch_id = i.batch_id
      GROUP BY b.batch_id, b.total_items, b.total_usd, b.total_khr
      HAVING batch_total_items != actual_items_count OR batch_usd != items_usd OR batch_khr != items_khr
    `);

    console.log('====================================================');
    console.log('📊 FINAL RECONCILIATION REPORT:');
    console.log(`tbl_collection_items: Pre=${collPreCount}, Deleted=${collActualDeleted}, Post=${collPostCount}`);
    console.log(`tbl_medicine_items:   Pre=${medPreCount}, Deleted=${medActualDeleted}, Post=${medPostCount}`);
    console.log(`Collection Batches Discrepancies: ${collFin.length} batches`);
    console.log(`Medicine Batches Discrepancies:   ${medFin.length} batches`);
    if (collFin.length === 0 && medFin.length === 0) {
      console.log('🎉 100% PERFECT FINANCIAL AND COUNT MATCH ACROSS ALL BATCHES!');
    } else {
      console.log('Discrepant Collection Batches:', collFin);
      console.log('Discrepant Medicine Batches:', medFin);
    }
    console.log('====================================================');

  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('❌ Deduplication failed and was rolled back:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

executeDeduplication().catch((e) => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
