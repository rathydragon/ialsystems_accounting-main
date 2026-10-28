-- ==============================================================================
-- 🚀 MySQL/MariaDB DDL Schema សម្រាប់ Migration ទាំង ១៥ Tables ទៅកាន់ Hostinger
-- Host: srv1366.hstgr.io | Database: u112951411_iale_api
-- Encoding: UTF-8 (utf8mb4_unicode_ci) គាំទ្រអក្សរខ្មែរ ១០០%
-- ==============================================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00'; -- 🇰🇭 Cambodia Local Timezone (Asia/Phnom_Penh, UTC+7)
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- ១. តារាង Batches (កញ្ចប់ប្រមូលប្រាក់ទូទៅ)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_batches` (
  `batch_id` VARCHAR(100) NOT NULL,
  `batch_date` VARCHAR(50) DEFAULT NULL,
  `operator` VARCHAR(150) DEFAULT NULL,
  `total_items` INT DEFAULT 0,
  `total_usd` DECIMAL(15, 2) DEFAULT 0.00,
  `total_khr` DECIMAL(18, 2) DEFAULT 0.00,
  `bank_usd` DECIMAL(15, 2) DEFAULT 0.00,
  `bank_khr` DECIMAL(18, 2) DEFAULT 0.00,
  `cash_usd` DECIMAL(15, 2) DEFAULT 0.00,
  `cash_khr` DECIMAL(18, 2) DEFAULT 0.00,
  `reconciliation` VARCHAR(100) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`batch_id`),
  INDEX `idx_batches_date` (`batch_date`),
  INDEX `idx_batches_operator` (`operator`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ២. តារាង Collection_Items (មុខទំនិញលម្អិតក្នុងកញ្ចប់ប្រមូលប្រាក់)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_collection_items` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `batch_id` VARCHAR(100) NOT NULL,
  `tracking` VARCHAR(100) NOT NULL,
  `customer_name` VARCHAR(255) DEFAULT NULL,
  `payment` VARCHAR(50) DEFAULT 'CASH',
  `usd` DECIMAL(15, 2) DEFAULT 0.00,
  `khm` DECIMAL(18, 2) DEFAULT 0.00,
  `item_date` VARCHAR(50) DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_items_batch` (`batch_id`),
  INDEX `idx_items_tracking` (`tracking`),
  INDEX `idx_items_customer` (`customer_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ៣. តារាង Medicine_Batches (កញ្ចប់ប្រមូលប្រាក់ថ្លៃថ្នាំពេទ្យ)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_medicine_batches` (
  `batch_id` VARCHAR(100) NOT NULL,
  `batch_date` VARCHAR(50) DEFAULT NULL,
  `operator` VARCHAR(150) DEFAULT NULL,
  `total_items` INT DEFAULT 0,
  `total_usd` DECIMAL(15, 2) DEFAULT 0.00,
  `total_khr` DECIMAL(18, 2) DEFAULT 0.00,
  `bank_usd` DECIMAL(15, 2) DEFAULT 0.00,
  `bank_khr` DECIMAL(18, 2) DEFAULT 0.00,
  `cash_usd` DECIMAL(15, 2) DEFAULT 0.00,
  `cash_khr` DECIMAL(18, 2) DEFAULT 0.00,
  `reconciliation` VARCHAR(100) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`batch_id`),
  INDEX `idx_med_batches_date` (`batch_date`),
  INDEX `idx_med_batches_operator` (`operator`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ៤. តារាង Medicine_Items (មុខទំនិញថ្នាំពេទ្យលម្អិតក្នុងកញ្ចប់)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_medicine_items` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `batch_id` VARCHAR(100) NOT NULL,
  `tracking` VARCHAR(100) NOT NULL,
  `customer_name` VARCHAR(255) DEFAULT NULL,
  `payment` VARCHAR(50) DEFAULT 'CASH',
  `usd` DECIMAL(15, 2) DEFAULT 0.00,
  `khm` DECIMAL(18, 2) DEFAULT 0.00,
  `item_date` VARCHAR(50) DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_med_items_batch` (`batch_id`),
  INDEX `idx_med_items_tracking` (`tracking`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ៤.១. តារាង COD_Collections (ទិន្នន័យទទួលប្រាក់ COD Flat Table)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_cod_collections` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `batch_id` VARCHAR(100) NOT NULL,
  `tracking` VARCHAR(100) NOT NULL,
  `customer_name` VARCHAR(255) DEFAULT NULL,
  `payment` VARCHAR(50) DEFAULT 'COD',
  `usd` DECIMAL(15, 2) DEFAULT 0.00,
  `khm` DECIMAL(18, 2) DEFAULT 0.00,
  `item_date` VARCHAR(50) DEFAULT NULL,
  `operator` VARCHAR(150) DEFAULT NULL,
  `operator_email` VARCHAR(150) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cod_batch` (`batch_id`),
  INDEX `idx_cod_tracking` (`tracking`),
  INDEX `idx_cod_date` (`item_date`),
  INDEX `idx_cod_customer` (`customer_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ៥. តារាង List_Name (បញ្ជីឈ្មោះអ្នកទូទាត់/បុគ្គលិក/Riders/សាខា)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_list_name` (
  `id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(100) DEFAULT NULL,
  `category` VARCHAR(100) DEFAULT NULL,
  `area` VARCHAR(255) DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'ACTIVE',
  `notes` TEXT DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_list_name_name` (`name`),
  INDEX `idx_list_name_category` (`category`),
  INDEX `idx_list_name_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ៦. តារាង Distribution_Reports (របាយការណ៍ចែកចាយទំនិញ)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_distribution_reports` (
  `id` VARCHAR(100) NOT NULL,
  `barcode` VARCHAR(100) DEFAULT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `report_date` VARCHAR(50) DEFAULT NULL,
  `remarks` TEXT DEFAULT NULL,
  `operator_email` VARCHAR(150) DEFAULT NULL,
  `created_by` VARCHAR(150) DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_dist_barcode` (`barcode`),
  INDEX `idx_dist_date` (`report_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ៧. តារាង Bank_Slips (បង្កាន់ដៃ/វិក្កយបត្រធនាគារ)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_bank_slips` (
  `id` VARCHAR(100) NOT NULL,
  `awbn` VARCHAR(100) DEFAULT NULL,
  `category` VARCHAR(100) DEFAULT NULL,
  `receiver_name` VARCHAR(255) DEFAULT NULL,
  `operator` VARCHAR(150) DEFAULT NULL,
  `operator_email` VARCHAR(150) DEFAULT NULL,
  `drive_image_link` TEXT DEFAULT NULL,
  `drive_file_id` VARCHAR(150) DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_slip_awbn` (`awbn`),
  INDEX `idx_slip_operator` (`operator`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ៨. តារាង Permissions (សិទ្ធិអ្នកប្រើប្រាស់ និងតួនាទី)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_permissions` (
  `user_id` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `role` VARCHAR(100) DEFAULT 'USER',
  `status` VARCHAR(50) DEFAULT 'ACTIVE',
  `data_scope` VARCHAR(100) DEFAULT 'ALL',
  `can_create` TINYINT(1) DEFAULT 0,
  `can_edit` TINYINT(1) DEFAULT 0,
  `can_delete` TINYINT(1) DEFAULT 0,
  `allowed_pages` TEXT DEFAULT NULL,
  `allowed_locations` TEXT DEFAULT NULL, -- JSON list of Destination/ខេត្ត the user receives at (Arrived Hub)
  `team` VARCHAR(100) DEFAULT NULL, -- ក្រុម: All Data users with a team only see their team's records
  `created_at` VARCHAR(50) DEFAULT NULL,
  `last_login` VARCHAR(50) DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uniq_perm_email` (`email`),
  INDEX `idx_perm_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ៩. តារាង User_Logs (កំណត់ត្រាសកម្មភាព Audit / Activity Logs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_user_logs` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `log_id` VARCHAR(100) DEFAULT NULL,
  `timestamp` VARCHAR(50) DEFAULT NULL,
  `operator` VARCHAR(150) DEFAULT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `role` VARCHAR(100) DEFAULT NULL,
  `action` VARCHAR(100) DEFAULT NULL,
  `details` TEXT DEFAULT NULL,
  `batch_number` VARCHAR(100) DEFAULT NULL,
  `amount_usd` DECIMAL(15, 2) DEFAULT 0.00,
  `amount_khr` DECIMAL(18, 2) DEFAULT 0.00,
  `items_count` INT DEFAULT 0,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_log_operator` (`operator`),
  INDEX `idx_log_action` (`action`),
  INDEX `idx_log_batch` (`batch_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ១០. តារាង Scan_In (ប្រតិបត្តិការស្កេនទំនិញចូលឃ្លាំង)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_scan_in` (
  `id` VARCHAR(100) NOT NULL,
  `barcode` VARCHAR(100) NOT NULL,
  `tracking` VARCHAR(100) DEFAULT NULL,
  `origin` VARCHAR(255) DEFAULT NULL,
  `destination` VARCHAR(255) DEFAULT NULL,
  `driver_name` VARCHAR(150) DEFAULT NULL,
  `truck_no` VARCHAR(100) DEFAULT NULL,
  `operator_email` VARCHAR(150) DEFAULT NULL,
  `created_by` VARCHAR(150) DEFAULT NULL,
  `scan_date` VARCHAR(50) DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `operation_code` VARCHAR(100) DEFAULT NULL,
  `batch_id` VARCHAR(100) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_scan_in_barcode` (`barcode`),
  INDEX `idx_scan_in_date` (`scan_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ១១. តារាង Scan_Out (ប្រតិបត្តិការស្កេនទំនិញចេញពីឃ្លាំង)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_scan_out` (
  `id` VARCHAR(100) NOT NULL,
  `barcode` VARCHAR(100) NOT NULL,
  `tracking` VARCHAR(100) DEFAULT NULL,
  `origin` VARCHAR(255) DEFAULT NULL,
  `destination` VARCHAR(255) DEFAULT NULL,
  `driver_name` VARCHAR(150) DEFAULT NULL,
  `truck_no` VARCHAR(100) DEFAULT NULL,
  `operator_email` VARCHAR(150) DEFAULT NULL,
  `created_by` VARCHAR(150) DEFAULT NULL,
  `scan_date` VARCHAR(50) DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `operation_code` VARCHAR(100) DEFAULT NULL,
  `batch_id` VARCHAR(100) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_scan_out_barcode` (`barcode`),
  INDEX `idx_scan_out_date` (`scan_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- តារាង Arrived_Hub (ទទួលចូលឃ្លាំង — ផ្ទៀងផ្ទាត់ជាមួយប្រតិបត្តិការ ScanOut)
-- Also created automatically by ensureWarehouseScanColumns() in mysql-master-handlers.js
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_arrived_hub` (
  `id` VARCHAR(100) NOT NULL,
  `barcode` VARCHAR(100) NOT NULL,
  `tracking` VARCHAR(100) DEFAULT NULL,
  `origin` VARCHAR(255) DEFAULT NULL,
  `destination` VARCHAR(255) DEFAULT NULL,
  `driver_name` VARCHAR(150) DEFAULT NULL,
  `truck_no` VARCHAR(100) DEFAULT NULL,
  `source_operation_code` VARCHAR(100) DEFAULT NULL,
  `arrival_status` VARCHAR(30) DEFAULT NULL,
  `remarks` TEXT DEFAULT NULL,
  `operator_email` VARCHAR(150) DEFAULT NULL,
  `created_by` VARCHAR(150) DEFAULT NULL,
  `scan_date` VARCHAR(50) DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `operation_code` VARCHAR(100) DEFAULT NULL,
  `batch_id` VARCHAR(100) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_arrived_hub_barcode` (`barcode`),
  INDEX `idx_arrived_hub_date` (`scan_date`),
  INDEX `idx_arrived_hub_source_op` (`source_operation_code`),
  INDEX `idx_tbl_arrived_hub_opcode` (`operation_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ១២. តារាង Out_Of_Delivery (ទំនិញចេញចែកចាយតាម Rider)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_out_of_delivery` (
  `id` VARCHAR(100) NOT NULL,
  `barcode` VARCHAR(100) NOT NULL,
  `tracking` VARCHAR(100) DEFAULT NULL,
  `rider_name` VARCHAR(150) DEFAULT NULL,
  `delivery_zone` VARCHAR(150) DEFAULT NULL,
  `cod_amount` DECIMAL(15, 2) DEFAULT 0.00,
  `currency` VARCHAR(20) DEFAULT 'KHR',
  `operator_email` VARCHAR(150) DEFAULT NULL,
  `created_by` VARCHAR(150) DEFAULT NULL,
  `scan_date` VARCHAR(50) DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `operation_code` VARCHAR(100) DEFAULT NULL,
  `batch_id` VARCHAR(100) DEFAULT NULL,
  `remarks` TEXT DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ood_barcode` (`barcode`),
  INDEX `idx_ood_rider` (`rider_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ១៣. តារាង Hold_Remaining (ទំនិញនៅសេសសល់ / Hold ក្នុងឃ្លាំង)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_hold_remaining` (
  `id` VARCHAR(100) NOT NULL,
  `barcode` VARCHAR(100) NOT NULL,
  `tracking` VARCHAR(100) DEFAULT NULL,
  `destination` VARCHAR(255) DEFAULT NULL,
  `hold_reason` TEXT DEFAULT NULL,
  `shelf_location` VARCHAR(100) DEFAULT NULL,
  `operator_email` VARCHAR(150) DEFAULT NULL,
  `created_by` VARCHAR(150) DEFAULT NULL,
  `scan_date` VARCHAR(50) DEFAULT NULL,
  `created_at` VARCHAR(50) DEFAULT NULL,
  `operation_code` VARCHAR(100) DEFAULT NULL,
  `batch_id` VARCHAR(100) DEFAULT NULL,
  `remarks` TEXT DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_hold_barcode` (`barcode`),
  INDEX `idx_hold_location` (`shelf_location`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ១៤. តារាង Settings (ការកំណត់ប្រព័ន្ធទូទៅ)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_settings` (
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `updated_at` VARCHAR(50) DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- ១៥. តារាង Data (ទិន្នន័យ Master Tracking / Sort Pending)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tbl_data` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `barcode` VARCHAR(100) NOT NULL,
  `payment` VARCHAR(50) DEFAULT 'CASH',
  `usd` DECIMAL(15, 2) DEFAULT 0.00,
  `khm` DECIMAL(18, 2) DEFAULT 0.00,
  `delivery_date` VARCHAR(50) DEFAULT NULL,
  `raw_details` TEXT DEFAULT NULL,
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_data_barcode` (`barcode`),
  INDEX `idx_data_date` (`delivery_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
