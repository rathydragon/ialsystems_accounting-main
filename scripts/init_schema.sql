-- ====================================================================
-- PostgreSQL Schema Setup for Firebase Firestore Backup
-- ប្រព័ន្ធរក្សាទុកទិន្នន័យ Backup ពី Firebase Firestore ចូល PostgreSQL
-- ====================================================================

-- ១. តារាងមេរក្សាទុក Document ទាំងអស់ពី Firestore ជាទម្រង់ JSONB
CREATE TABLE IF NOT EXISTS firestore_backups (
    collection_name VARCHAR(100) NOT NULL,
    doc_id VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    firestore_created_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_name, doc_id)
);

-- ២. បង្កើត Indexes ដើម្បីបង្កើនល្បឿន Query
CREATE INDEX IF NOT EXISTS idx_firestore_backups_coll ON firestore_backups(collection_name);
CREATE INDEX IF NOT EXISTS idx_firestore_backups_synced ON firestore_backups(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_firestore_backups_data_gin ON firestore_backups USING GIN (data);

-- ៣. តារាងកត់ត្រាប្រវត្តិការ Backup (Backup History Logs)
CREATE TABLE IF NOT EXISTS backup_history_logs (
    id SERIAL PRIMARY KEY,
    collection_name VARCHAR(100) NOT NULL,
    records_synced INT NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'SUCCESS' ឬ 'FAILED'
    message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ៤. Views ពិសេសសម្រាប់ Query មើលទិន្នន័យ Batches ដូចជា Table ធម្មតា
DROP VIEW IF EXISTS view_batches_summary CASCADE;
CREATE VIEW view_batches_summary AS
SELECT 
    doc_id,
    data->>'id' AS batch_id,
    data->>'operator' AS operator,
    (data->>'totalItems')::INT AS total_items,
    (data->>'cashKHR')::NUMERIC AS cash_khr,
    (data->>'cashUSD')::NUMERIC AS cash_usd,
    (data->>'bankKHR')::NUMERIC AS bank_khr,
    (data->>'bankUSD')::NUMERIC AS bank_usd,
    (data->>'totalKHR')::NUMERIC AS total_khr,
    (data->>'totalUSD')::NUMERIC AS total_usd,
    data->>'createdAt' AS created_at,
    synced_at
FROM firestore_backups
WHERE collection_name = 'batches';

-- ៥. View សម្រាប់ទិន្នន័យថ្នាំពេទ្យ (Medicine Batches - Data_BM)
CREATE OR REPLACE VIEW view_medicine_batches_summary AS
SELECT 
    doc_id,
    data->>'batchId' AS batch_id,
    data->>'collector' AS collector,
    data->>'date' AS batch_date,
    (data->>'grandTotal')::NUMERIC AS grand_total,
    synced_at
FROM firestore_backups
WHERE collection_name = 'medicine_batches';

-- ៦. View សម្រាប់របាយការណ៍ចែកចាយ (Distribution Alert Reports)
DROP VIEW IF EXISTS view_distribution_reports_summary CASCADE;
CREATE VIEW view_distribution_reports_summary AS
SELECT 
    doc_id,
    data->>'barcode' AS barcode,
    data->>'name' AS recipient_or_driver_name,
    data->>'date' AS report_date,
    data->>'remarks' AS remarks,
    data->>'operatorEmail' AS operator_email,
    data->>'createdBy' AS created_by,
    data->>'createdAt' AS created_at,
    data->>'updatedAt' AS updated_at,
    synced_at
FROM firestore_backups
WHERE collection_name = 'distribution_reports';
