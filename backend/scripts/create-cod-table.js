import { getMySQLPool } from '../api/remote-mysql.js';

async function createCodTable() {
  const pool = getMySQLPool();
  console.log('Creating tbl_cod_collections on Hostinger Primary Database...');
  
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS \`tbl_cod_collections\` (
      \`id\` INT AUTO_INCREMENT NOT NULL,
      \`batch_id\` VARCHAR(100) NOT NULL,
      \`tracking\` VARCHAR(100) NOT NULL,
      \`customer_name\` VARCHAR(255) DEFAULT NULL,
      \`payment\` VARCHAR(50) DEFAULT 'COD',
      \`usd\` DECIMAL(15, 2) DEFAULT 0.00,
      \`khm\` DECIMAL(18, 2) DEFAULT 0.00,
      \`item_date\` VARCHAR(50) DEFAULT NULL,
      \`operator\` VARCHAR(150) DEFAULT NULL,
      \`operator_email\` VARCHAR(150) DEFAULT NULL,
      \`notes\` TEXT DEFAULT NULL,
      \`created_at\` VARCHAR(50) DEFAULT NULL,
      \`synced_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_cod_batch\` (\`batch_id\`),
      INDEX \`idx_cod_tracking\` (\`tracking\`),
      INDEX \`idx_cod_date\` (\`item_date\`),
      INDEX \`idx_cod_customer\` (\`customer_name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  try {
    const conn = await pool.getConnection();
    await conn.query(createTableSql);
    console.log('✓ Successfully created `tbl_cod_collections` table!');

    const [cols] = await conn.query('DESCRIBE `tbl_cod_collections`');
    console.log('Table structure:', cols.map(c => `${c.Field} (${c.Type})`));

    conn.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create table:', err);
    process.exit(1);
  }
}

createCodTable();
