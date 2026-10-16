-- ====================================================================
-- IAL Systems Accounting - PostgreSQL Backup Views & Columnar Tables
-- ====================================================================

-- ១. View សម្រាប់ របាយការណ៍ចែកចាយ (Distribution Reports)
DROP VIEW IF EXISTS view_distribution_reports CASCADE;
CREATE OR REPLACE VIEW view_distribution_reports AS
SELECT 
    record_id AS id,
    COALESCE(data->>'barcode', data->'raw_data'->>'barcode') AS barcode,
    COALESCE(data->>'name', data->>'recipient_or_driver_name', data->'raw_data'->>'name') AS recipient_or_driver_name,
    COALESCE(data->>'date', data->'raw_data'->>'date') AS report_date,
    COALESCE(data->>'remarks', data->'raw_data'->>'remarks') AS remarks,
    COALESCE(data->>'operator_email', data->>'operatorEmail', data->'raw_data'->>'operatorEmail') AS operator_email,
    COALESCE(data->>'created_by', data->>'createdBy', data->'raw_data'->>'createdBy') AS created_by,
    COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
    synced_at
FROM local_offline_backups
WHERE table_name = 'distribution_reports';

-- ២. View សម្រាប់ ប្រតិបត្តិការឃ្លាំង (Warehouse Scans)
DROP VIEW IF EXISTS view_warehouse_scans CASCADE;
CREATE OR REPLACE VIEW view_warehouse_scans AS
SELECT 
    record_id AS id,
    COALESCE(data->>'scan_type', data->>'scanType', data->'raw_data'->>'scanType') AS scan_type,
    COALESCE(data->>'barcode', data->'raw_data'->>'barcode') AS barcode,
    COALESCE(data->>'tracking', data->'raw_data'->>'tracking') AS tracking,
    COALESCE(data->>'customer_name', data->>'customerName', data->'raw_data'->>'customerName') AS customer_name,
    COALESCE(data->>'customer_phone', data->>'customerPhone', data->'raw_data'->>'customerPhone') AS customer_phone,
    COALESCE(data->>'destination', data->'raw_data'->>'destination') AS destination,
    COALESCE(data->>'driver_name', data->>'driverName', data->'raw_data'->>'driverName') AS driver_name,
    COALESCE(data->>'truck_no', data->>'truckNo', data->'raw_data'->>'truckNo') AS truck_no,
    (COALESCE(data->>'cod_amount', data->>'codAmount', data->'raw_data'->>'codAmount'))::NUMERIC AS cod_amount,
    COALESCE(data->>'currency', data->'raw_data'->>'currency') AS currency,
    COALESCE(data->>'shelf_location', data->>'location', data->'raw_data'->>'location') AS shelf_location,
    COALESCE(data->>'rider_name', data->>'riderName', data->'raw_data'->>'riderName') AS rider_name,
    COALESCE(data->>'rider_phone', data->>'riderPhone', data->'raw_data'->>'riderPhone') AS rider_phone,
    COALESCE(data->>'delivery_zone', data->>'deliveryZone', data->'raw_data'->>'deliveryZone') AS delivery_zone,
    COALESCE(data->>'out_reason', data->>'outReason', data->'raw_data'->>'outReason') AS out_reason,
    COALESCE(data->>'hold_reason', data->>'holdReason', data->'raw_data'->>'holdReason') AS hold_reason,
    COALESCE(data->>'remarks', data->'raw_data'->>'remarks') AS remarks,
    COALESCE(data->>'date', data->'raw_data'->>'date') AS scan_date,
    COALESCE(data->>'operator_email', data->>'operatorEmail', data->'raw_data'->>'operatorEmail') AS operator_email,
    COALESCE(data->>'created_by', data->>'createdBy', data->'raw_data'->>'createdBy') AS created_by,
    COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
    synced_at
FROM local_offline_backups
WHERE table_name = 'warehouse_scans';

-- ៣. View សម្រាប់ កញ្ចប់ប្រាក់ (Batches - General & Medicine)
DROP VIEW IF EXISTS view_batches CASCADE;
CREATE OR REPLACE VIEW view_batches AS
SELECT 
    record_id AS id,
    COALESCE(data->>'batch_number', data->>'batchNumber', data->'raw_data'->>'batchNumber') AS batch_number,
    COALESCE((data->>'total_items')::INT, (data->>'totalItems')::INT, (data->'raw_data'->>'totalItems')::INT) AS total_items,
    COALESCE((data->>'total_usd')::NUMERIC, (data->>'totalUSD')::NUMERIC, (data->'raw_data'->>'totalUSD')::NUMERIC) AS total_usd,
    COALESCE((data->>'total_khr')::NUMERIC, (data->>'totalKHR')::NUMERIC, (data->'raw_data'->>'totalKHR')::NUMERIC) AS total_khr,
    COALESCE((data->>'cash_usd')::NUMERIC, (data->>'cashUSD')::NUMERIC, (data->'raw_data'->>'cashUSD')::NUMERIC) AS cash_usd,
    COALESCE((data->>'cash_khr')::NUMERIC, (data->>'cashKHR')::NUMERIC, (data->'raw_data'->>'cashKHR')::NUMERIC) AS cash_khr,
    COALESCE((data->>'bank_usd')::NUMERIC, (data->>'bankUSD')::NUMERIC, (data->'raw_data'->>'bankUSD')::NUMERIC) AS bank_usd,
    COALESCE((data->>'bank_khr')::NUMERIC, (data->>'bankKHR')::NUMERIC, (data->'raw_data'->>'bankKHR')::NUMERIC) AS bank_khr,
    COALESCE(data->>'operator', data->'raw_data'->>'operator') AS operator,
    COALESCE(data->>'operator_email', data->>'operatorEmail', data->'raw_data'->>'operatorEmail') AS operator_email,
    COALESCE(data->>'notes', data->'raw_data'->>'notes') AS notes,
    COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
    synced_at
FROM local_offline_backups
WHERE table_name IN ('batches', 'medicine_batches');

-- ៤. View សម្រាប់ សិទ្ធិអ្នកប្រើប្រាស់ (User Permissions)
DROP VIEW IF EXISTS view_user_permissions CASCADE;
CREATE OR REPLACE VIEW view_user_permissions AS
SELECT DISTINCT ON (COALESCE(data->>'email', data->'raw_data'->>'email', record_id))
    record_id AS id,
    COALESCE(data->>'email', data->'raw_data'->>'email') AS email,
    COALESCE(data->>'name', data->>'full_name', data->'raw_data'->>'name') AS full_name,
    COALESCE(data->>'role', data->'raw_data'->>'role') AS role,
    COALESCE(data->>'status', data->'raw_data'->>'status') AS status,
    COALESCE((data->>'can_create')::BOOLEAN, (data->>'canCreate')::BOOLEAN, (data->'raw_data'->>'canCreate')::BOOLEAN) AS can_create,
    COALESCE((data->>'can_edit')::BOOLEAN, (data->>'canEdit')::BOOLEAN, (data->'raw_data'->>'canEdit')::BOOLEAN) AS can_edit,
    COALESCE((data->>'can_delete')::BOOLEAN, (data->>'canDelete')::BOOLEAN, (data->'raw_data'->>'canDelete')::BOOLEAN) AS can_delete,
    COALESCE((data->>'view_only_own')::BOOLEAN, (data->>'viewOnlyOwn')::BOOLEAN, (data->'raw_data'->>'viewOnlyOwn')::BOOLEAN) AS view_only_own,
    COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
    synced_at
FROM local_offline_backups
WHERE table_name IN ('user_permissions', 'permissions');

-- ៥. View សម្រាប់ កំណត់ត្រាសកម្មភាព (User Activity Logs)
DROP VIEW IF EXISTS view_activity_logs CASCADE;
CREATE OR REPLACE VIEW view_activity_logs AS
SELECT 
    record_id AS id,
    COALESCE(data->>'action', data->>'action_type', data->'raw_data'->>'action') AS action_type,
    COALESCE(data->>'operator', data->>'operator_name', data->'raw_data'->>'operator') AS operator_name,
    COALESCE(data->>'operator_email', data->>'operatorEmail', data->'raw_data'->>'operatorEmail') AS operator_email,
    COALESCE(data->>'title', data->'raw_data'->>'title') AS title,
    COALESCE(data->>'description', data->'raw_data'->>'description') AS description,
    COALESCE(data->>'timestamp', data->>'action_timestamp', data->>'createdAt', data->>'created_at', data->'raw_data'->>'timestamp') AS action_timestamp,
    synced_at
FROM local_offline_backups
WHERE table_name = 'activity_logs';

-- ៦. View សម្រាប់ បញ្ជីឈ្មោះ (List Name / Payers)
DROP VIEW IF EXISTS view_list_name CASCADE;
CREATE OR REPLACE VIEW view_list_name AS
SELECT 
    record_id AS id,
    COALESCE(data->>'name', data->'raw_data'->>'name') AS name,
    COALESCE(data->>'phone', data->'raw_data'->>'phone') AS phone,
    COALESCE(data->>'category', data->'raw_data'->>'category') AS category,
    COALESCE(data->>'area', data->'raw_data'->>'area') AS area,
    COALESCE(data->>'status', data->'raw_data'->>'status') AS status,
    COALESCE(data->>'notes', data->'raw_data'->>'notes') AS notes,
    COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
    COALESCE(data->>'updated_at', data->>'updatedAt', data->'raw_data'->>'updatedAt') AS updated_at,
    synced_at
FROM local_offline_backups
WHERE table_name IN ('list_name', 'payers');
