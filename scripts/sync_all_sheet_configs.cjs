const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const configs = [
    {
      id: 'followup_bm',
      data: {
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8/edit?gid=0#gid=0',
        sheetName: 'Data_BM',
        updatedAt: new Date().toISOString(),
        updatedBy: 'rathykim34@gmail.com'
      }
    },
    {
      id: 'data_bm',
      data: {
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8/edit#gid=764804833',
        sheetName: 'Sort_pending',
        updatedAt: new Date().toISOString(),
        updatedBy: 'rathykim34@gmail.com'
      }
    },
    {
      id: 'sokimex_postpaid',
      data: {
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1OQFwNcbajxsKLu6-y-Bi7tQaXQIn08lPfAog8LnwmXE/edit?gid=1104637417#gid=1104637417',
        sheetName: 'Data_Sokimic',
        updatedAt: new Date().toISOString(),
        updatedBy: 'rathykim34@gmail.com'
      }
    },
    {
      id: 'meterial_office',
      data: {
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1gOjRT40t9RVIIym0Y-Pv_jz0VSkt--icUDrtti-Ljd8/edit?gid=0#gid=0',
        sheetName: 'Truck_Tuk Tuk',
        updatedAt: new Date().toISOString(),
        updatedBy: 'KEUN RATHY'
      }
    },
    {
      id: 'data_report',
      data: {
        sheetUrl: '1yiKxEP7LnvIK2UjhrpnnI4YI4tMbMOFe8hF4dmSSKn8',
        sheetName: 'DATA',
        updatedAt: new Date().toISOString(),
        updatedBy: 'KEUN RATHY'
      }
    }
  ];

  for (const item of configs) {
    await pool.query(
      `INSERT INTO app_config (id, data, updated_at) 
       VALUES ($1, $2::jsonb, NOW()) 
       ON CONFLICT (id) 
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [item.id, JSON.stringify(item.data)]
    );
    console.log(`Saved config: ${item.id}`);
  }

  const res = await pool.query('SELECT id, data, updated_at FROM app_config ORDER BY id');
  console.log('\n--- Current app_config in Supabase ---');
  res.rows.forEach(r => console.log(r.id, '->', JSON.stringify(r.data)));
  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
});
