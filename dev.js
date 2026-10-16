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

// 1. Start Backend (Express API on Port 5000)
const backendProcess = spawn('node', ['server.js'], {
  cwd: path.resolve(__dirname, 'backend'),
  stdio: 'inherit',
  shell: true
});

// 2. Start Frontend (Vite Client on Port 3000)
const frontendProcess = spawn(npmCmd, ['run', 'dev'], {
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
