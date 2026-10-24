@echo off
cd /d "%~dp0\.."
:: Windows Task Scheduler runs this every 15 minutes; --if-due backs up only when the
:: schedule saved in Settings says it is time.
>> "%~dp0..\backup.log" 2>&1 node scripts/backup-to-postgres.js --if-due
