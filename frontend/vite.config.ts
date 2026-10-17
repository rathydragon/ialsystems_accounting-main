import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

// Every VITE_* variable is inlined into the public JS bundle, so secrets must never use
// that prefix. Keep bot tokens / API keys in the backend env (TELEGRAM_*_BOT_TOKEN,
// GEMINI_API_KEY) where /api/telegram-alert and /api/gemini-proxy use them.
const SENSITIVE_VITE_VAR = /^VITE_\w*(TOKEN|SECRET|API_KEY|PASSWORD|PASS|PIN)$/;

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_BACKEND_URL || 'http://localhost:5000';

  const leakedSecrets = Object.keys(env).filter((k) => SENSITIVE_VITE_VAR.test(k) && env[k].trim());
  if (leakedSecrets.length > 0) {
    const message =
      `Refusing to expose secrets to the browser bundle: ${leakedSecrets.join(', ')}. ` +
      'Remove these VITE_* variables (from .env and the hosting provider) and set the ' +
      'server-side equivalents (e.g. TELEGRAM_BOT_TOKEN, GEMINI_API_KEY) on the backend instead.';
    if (command === 'build') throw new Error(message);
    console.warn(`\n[security] ${message}\n`);
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/*.json', '**/*.sql', '**/.git/**']
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
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
          },
        },
      },
    },
  };
});
