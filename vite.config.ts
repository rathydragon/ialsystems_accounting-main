import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function postgresBackupPlugin() {
  return {
    name: 'postgres-backup-api',
    configureServer(server: any) {
      // Background auto-backup scheduler inside the server process
      let lastAutoRunTime = 0;
      let lastDailyRunDate = '';

      const checkAndRunAutoBackup = async () => {
        try {
          const fs = await import('fs');
          const schedFile = path.resolve(process.cwd(), 'scripts/backup-schedule.json');
          if (!fs.existsSync(schedFile)) return;
          const config = JSON.parse(fs.readFileSync(schedFile, 'utf8'));
          if (config.enabled === false) return;

          const now = new Date();
          const currentHour = now.getHours();
          const currentMin = now.getMinutes();
          const todayDateStr = now.toISOString().slice(0, 10);

          let shouldRun = false;
          if (config.mode === 'INTERVAL') {
            const totalMinutes = ((parseInt(config.intervalHours, 10) || 0) * 60) + (parseInt(config.intervalMinutes, 10) || 0);
            const intervalMs = Math.max(totalMinutes, 1) * 60 * 1000;
            const lastRun = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0;
            const effectiveLast = Math.max(lastRun, lastAutoRunTime);
            if (Date.now() - effectiveLast >= intervalMs) {
              shouldRun = true;
            }
          } else {
            // DAILY_TIME mode (default)
            const targetTimeStr = config.time || '18:00';
            const [tH, tM] = targetTimeStr.split(':').map((n: string) => parseInt(n, 10) || 0);
            const isMatch = (currentHour === tH && currentMin === tM) || (currentHour > tH && lastDailyRunDate !== todayDateStr && (!config.lastBackupAt || !config.lastBackupAt.startsWith(todayDateStr)));
            if (isMatch && lastDailyRunDate !== todayDateStr && Date.now() - lastAutoRunTime > 10 * 60 * 1000) {
              shouldRun = true;
            }
          }

          if (shouldRun) {
            lastAutoRunTime = Date.now();
            lastDailyRunDate = todayDateStr;
            console.log(`[Auto-Backup] 🚀 កំពុងដំណើរការ Backup ស្វ័យប្រវត្តិតាមកាលវិភាគ (${now.toLocaleTimeString('km-KH')})...`);
            const { exec } = await import('child_process');
            exec('node scripts/backup-to-postgres.js', (err: any, stdout: any, stderr: any) => {
              if (err) {
                console.error('[Auto-Backup] ❌ កំហុសពេល Backup:', err.message);
              } else {
                console.log('[Auto-Backup] ✓ បានបញ្ចប់ការ Backup ស្វ័យប្រវត្តិចូល Database ជោគជ័យ!');
                try {
                  config.lastBackupAt = new Date().toISOString();
                  fs.writeFileSync(schedFile, JSON.stringify(config, null, 2), 'utf8');
                } catch {}
              }
            });
          }
        } catch (e) {
          // ignore timer check error
        }
      };

      // Check schedule every 45 seconds
      const timer = setInterval(checkAndRunAutoBackup, 45000);
      server.httpServer?.on('close', () => clearInterval(timer));

      // 1. Endpoint: /api/backup-schedule (GET/POST)
      server.middlewares.use('/api/backup-schedule', async (req: any, res: any) => {
        const fs = await import('fs');
        const schedFile = path.resolve(process.cwd(), 'scripts/backup-schedule.json');

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            if (fs.existsSync(schedFile)) {
              const data = JSON.parse(fs.readFileSync(schedFile, 'utf8'));
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, schedule: data }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, schedule: { enabled: true, mode: 'DAILY_TIME', time: '18:00', intervalHours: 1, intervalMinutes: 0 } }));
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, message: e.message }));
          }
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              let existing = { enabled: true, mode: 'DAILY_TIME', time: '18:00', intervalHours: 1, intervalMinutes: 0 };
              if (fs.existsSync(schedFile)) {
                try { existing = JSON.parse(fs.readFileSync(schedFile, 'utf8')); } catch {}
              }
              const updated = {
                ...existing,
                ...parsed,
                updatedAt: new Date().toISOString()
              };
              fs.writeFileSync(schedFile, JSON.stringify(updated, null, 2), 'utf8');
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, schedule: updated, message: 'បានរក្សាទុកកាលវិភាគ Backup ស្វ័យប្រវត្តជោគជ័យ!' }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, message: err.message }));
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end();
      });

      // 2. Endpoint: /api/backup-postgres (GET/POST)
      server.middlewares.use('/api/backup-postgres', async (req: any, res: any) => {
        if (req.method === 'POST') {
          const { exec } = await import('child_process');
          exec('node scripts/backup-to-postgres.js', async (error: any, stdout: any, stderr: any) => {
            res.setHeader('Content-Type', 'application/json');
            if (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, message: error.message, output: stderr || stdout }));
              return;
            }
            try {
              const { getLatestBackupStatus } = await import('./scripts/get-backup-status.js');
              const status = await getLatestBackupStatus();
              res.statusCode = 200;
              res.end(JSON.stringify({ 
                ok: true, 
                status: 'success', 
                destinations: status.destinations,
                records: status.totalRecords,
                lastBackup: status,
                message: `✓ បាន Backup ជោគជ័យចូល ${status.destinations.join(' & ')}! (សរុប ${status.totalRecords} ឯកសារ)`
              }));
            } catch {
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, status: 'success', output: stdout }));
            }
          });
        } else if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { getLatestBackupStatus } = await import('./scripts/get-backup-status.js');
            const status = await getLatestBackupStatus();
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, status: 'ready', lastBackup: status }));
          } catch (err: any) {
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, status: 'ready', error: err?.message }));
          }
        } else {
          res.statusCode = 405;
          res.end();
        }
      });

      // 3. Endpoint: /api/permissions (Supabase User Permissions Local & Cloud API)
      server.middlewares.use('/api/permissions', async (req: any, res: any) => {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', async () => {
          try {
            if (body) {
              try { req.body = JSON.parse(body); } catch { req.body = body; }
            }
            const { default: permissionsHandler } = await import('./api/permissions.js');
            await permissionsHandler(req, res);
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 500;
            res.end(JSON.stringify({ status: 'error', message: e?.message }));
          }
        });
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), postgresBackupPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      modulePreload: false,
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            icons: ['lucide-react'],
            scanner: ['html5-qrcode'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
