import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('🚀 Building frontend...');
execSync('npm run build --prefix frontend', { stdio: 'inherit' });

const srcDist = path.resolve('frontend', 'dist');
const destDist = path.resolve('dist');

if (fs.existsSync(srcDist)) {
  console.log('📦 Copying build output to dist/...');
  fs.cpSync(srcDist, destDist, { recursive: true });
  // Hostinger may look for the entry file inside the output directory (dist/), so put one there too.
  fs.writeFileSync(
    path.join(destDist, 'server.js'),
    "process.env.NODE_ENV ||= 'production';\nawait import('../backend/server.js');\n"
  );
  fs.writeFileSync(path.join(destDist, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
  console.log('✅ Build output ready in dist/');
} else {
  console.error('❌ Error: frontend/dist not found after build!');
  process.exit(1);
}
