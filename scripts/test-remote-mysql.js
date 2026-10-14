import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { testMySQLConnection } from '../api/remote-mysql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('====================================================');
console.log('🔍 កំពុងសាកល្បងភ្ជាប់ទៅកាន់ Remote MySQL Database...');
console.log(`🌐 Host: ${process.env.REMOTE_DB_HOST || 'មិនទាន់កំណត់'}`);
console.log(`🔌 Port: ${process.env.REMOTE_DB_PORT || '3306'}`);
console.log(`👤 User: ${process.env.REMOTE_DB_USER || 'មិនទាន់កំណត់'}`);
console.log(`🗄️  Database: ${process.env.REMOTE_DB_NAME || 'មិនទាន់កំណត់'}`);
console.log('====================================================\n');

if (!process.env.REMOTE_DB_USER || process.env.REMOTE_DB_USER.includes('username_')) {
  console.log('⚠️ សូមបញ្ចូល Username ពិតប្រាកដក្នុងឯកសារ .env ជាមុនសិន (REMOTE_DB_USER)');
}
if (!process.env.REMOTE_DB_PASSWORD || process.env.REMOTE_DB_PASSWORD.includes('password_')) {
  console.log('⚠️ សូមបញ្ចូល Password ពិតប្រាកដក្នុងឯកសារ .env ជាមុនសិន (REMOTE_DB_PASSWORD)\n');
}

const result = await testMySQLConnection();

if (result.ok) {
  console.log('🎉 ' + result.message);
  console.log(`⏱️  ល្បឿនឆ្លើយតប: ${result.durationMs}ms`);
  console.log(`📌 MySQL Version: ${result.details?.mysql_version}`);
  console.log(`🇰🇭 Timezone: ${result.details?.time_zone} (Cambodia Local Time: ${result.details?.db_time})`);
  console.log(`📊 តារាងទាំងអស់ដែលមានក្នុង Database (${result.tables?.length || 0} តារាង):`);
  console.log(result.tables);
} else {
  console.error(result.message);
  if (result.code) console.error(`Error Code: ${result.code}`);
  if (result.hint) console.error(`\n💡 ដំណោះស្រាយ: ${result.hint}`);
}

console.log('\n====================================================');
process.exit(result.ok ? 0 : 1);
