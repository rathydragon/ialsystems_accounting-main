const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL
  });
  await client.connect();

  console.log('Altering batches table...');
  await client.query(`
    ALTER TABLE public.batches 
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT;
  `);

  console.log('Creating medicine_batches table...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.medicine_batches (
      id VARCHAR(255) PRIMARY KEY,
      batch_number VARCHAR(255),
      operator VARCHAR(255),
      operator_email VARCHAR(255),
      date VARCHAR(50),
      total_items INTEGER DEFAULT 0,
      cash_khr NUMERIC(15,2) DEFAULT 0,
      cash_usd NUMERIC(15,2) DEFAULT 0,
      bank_khr NUMERIC(15,2) DEFAULT 0,
      bank_usd NUMERIC(15,2) DEFAULT 0,
      total_khr NUMERIC(15,2) DEFAULT 0,
      total_usd NUMERIC(15,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'COMPLETED',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      items JSONB DEFAULT '[]'::jsonb,
      raw_data JSONB DEFAULT '{}'::jsonb,
      is_deleted BOOLEAN DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_medicine_batches_created_at ON public.medicine_batches(created_at DESC);
    ALTER TABLE public.medicine_batches ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow public full access on medicine_batches" ON public.medicine_batches;
    CREATE POLICY "Allow public full access on medicine_batches" ON public.medicine_batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  `);

  try {
    await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE public.medicine_batches;');
    console.log('Added medicine_batches to publication supabase_realtime');
  } catch (e) {
    console.log('Publication notice:', e.message);
  }

  // Populate medicine_batches from firestore_backups
  const medBackups = await client.query("SELECT * FROM firestore_backups WHERE collection_name = 'medicine_batches'");
  console.log(`Found ${medBackups.rows.length} medicine_batches in backup`);
  for (const row of medBackups.rows) {
    const d = row.data;
    await client.query(`
      INSERT INTO public.medicine_batches (
        id, batch_number, operator, operator_email, date, total_items,
        cash_khr, cash_usd, bank_khr, bank_usd, total_khr, total_usd,
        status, created_at, updated_at, items, raw_data, is_deleted, deleted_at, deleted_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), raw_data = EXCLUDED.raw_data
    `, [
      row.doc_id,
      d.batchNumber || row.doc_id,
      d.operator || null,
      d.operatorEmail || null,
      d.date || null,
      d.totalItems || (Array.isArray(d.items) ? d.items.length : 0),
      Number(d.cashKHR || 0),
      Number(d.cashUSD || 0),
      Number(d.bankKHR || 0),
      Number(d.bankUSD || 0),
      Number(d.totalKHR || 0),
      Number(d.totalUSD || 0),
      d.status || 'COMPLETED',
      d.createdAt || row.created_at,
      d.updatedAt || new Date().toISOString(),
      JSON.stringify(d.items || []),
      JSON.stringify(d),
      d.isDeleted === true,
      d.deletedAt || null,
      d.deletedBy || null
    ]);
  }

  console.log('Successfully configured batches and medicine_batches tables!');
  await client.end();
}

main().catch(console.error);
