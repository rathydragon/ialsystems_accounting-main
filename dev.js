import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\x1b[36m%s\x1b[0m', '════════════════════════════════════════════════════════');
console.log('\x1b[36m%s\x1b[0m', '   🚀 Starting IAL Systems (Frontend + Backend) ...     ');
console.log('\x1b[36m%s\x1b[0m', '════════════════════════════════════════════════════════');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const prodMode = process.argv.includes('--prod');

// 1. Start Backend (Express API on Port 5000)
//    In --prod mode the backend runs as production (stack traces hidden, rate limits on) and
//    listens on 127.0.0.1 only: other devices reach it through the port-3000 /api proxy,
//    so port 5000 is never open to the network.
const backendEnv = prodMode
  ? { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1' }
  : process.env;
const backendProcess = spawn('node', ['server.js'], {
  cwd: path.resolve(__dirname, 'backend'),
  stdio: 'inherit',
  shell: true,
  env: backendEnv
});

// 2. Start Frontend on Port 3000.
//    `node dev.js --prod` (npm run start:fast) builds the app first and serves the optimized build:
//    page switches are many times faster than in dev mode, but code edits need a restart.
const frontendProcess = spawn(prodMode ? `${npmCmd} run build && ${npmCmd} run preview` : `${npmCmd} run dev`, [], {
  cwd: path.resolve(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true
});

const cleanup = () => {
  console.log('\n\x1b[33m%s\x1b[0m', '🛑 Shutting down services...');
  try { backendProcess.kill('SIGTERM'); } catch {}
  try { frontendProcess.kill('SIGTERM'); } catch {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
