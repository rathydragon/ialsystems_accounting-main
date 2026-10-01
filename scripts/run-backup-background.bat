@echo off
cd /d "%~dp0\.."
>> "%~dp0..\backup.log" 2>&1 node scripts/backup-to-postgres.js
