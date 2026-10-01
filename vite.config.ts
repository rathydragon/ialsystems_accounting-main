import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function postgresBackupPlugin() {
  return {
    name: 'postgres-backup-api',
    configureServer(server: any) {
      server.middlewares.use('/api/backup-postgres', async (req: any, res: any) => {
        if (req.method === 'POST') {
          const { exec } = await import('child_process');
          exec('node scripts/backup-to-postgres.js', (error: any, stdout: any, stderr: any) => {
            res.setHeader('Content-Type', 'application/json');
            if (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, message: error.message, output: stderr || stdout }));
              return;
            }
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, output: stdout }));
          });
        } else if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, status: 'ready' }));
        } else {
          res.statusCode = 405;
          res.end();
        }
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
            firebase: ['firebase/app', 'firebase/firestore'],
          },
        },
      },
    },
  };
});
