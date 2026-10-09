const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL
  });
  await client.connect();
  console.log('Connected to Supabase PostgreSQL');

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.bank_slips (
      id TEXT PRIMARY KEY,
      awbn TEXT,
      category TEXT DEFAULT 'Buymed',
      amount NUMERIC,
      currency TEXT DEFAULT 'USD',
      bank_name TEXT,
      receiver_name TEXT,
      image_url TEXT,
      drive_file_id TEXT,
      drive_view_url TEXT,
      image_name TEXT,
      note TEXT,
      operator TEXT,
      operator_email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      raw_data JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_bank_slips_created_at ON public.bank_slips(created_at DESC);
    ALTER TABLE public.bank_slips ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow public full access on bank_slips" ON public.bank_slips;
    CREATE POLICY "Allow public full access on bank_slips" ON public.bank_slips FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  `);

  try {
    await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_slips;');
    console.log('Added bank_slips to publication supabase_realtime');
  } catch (pubErr) {
    console.log('Publication notice:', pubErr.message);
  }

  // Check if any bank_slips in firestore_backups
  const backupSlips = await client.query("SELECT * FROM firestore_backups WHERE collection_name = 'bank_slips'");
  console.log('Bank slips found in backup:', backupSlips.rows.length);
  for (const row of backupSlips.rows) {
    const d = row.data;
    await client.query(`
      INSERT INTO public.bank_slips (id, awbn, category, amount, currency, bank_name, receiver_name, image_url, drive_file_id, drive_view_url, image_name, note, operator, operator_email, created_at, raw_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), raw_data = EXCLUDED.raw_data
    `, [
      row.doc_id,
      d.awbn || null,
      d.category || 'Buymed',
      d.amount ? Number(d.amount) : null,
      d.currency || 'USD',
      d.bankName || null,
      d.receiverName || null,
      d.imageUrl || null,
      d.driveFileId || null,
      d.driveViewUrl || null,
      d.imageName || null,
      d.note || null,
      d.operator || null,
      d.operatorEmail || null,
      d.createdAt || row.created_at,
      d
    ]);
  }

  await client.end();
  console.log('Done setup bank_slips table!');
}

main().catch(console.error);
