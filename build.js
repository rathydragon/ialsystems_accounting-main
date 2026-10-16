import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('🚀 Building frontend...');
execSync('npm run build --prefix frontend', { stdio: 'inherit' });

const srcDist = path.resolve('frontend', 'dist');
const destDist = path.resolve('dist');

if (fs.existsSync(srcDist)) {
  console.log('📦 Copying build output to dist/ for Vercel deployment...');
  fs.cpSync(srcDist, destDist, { recursive: true });
  console.log('✅ Build output ready in dist/');
} else {
  console.error('❌ Error: frontend/dist not found after build!');
  process.exit(1);
}
