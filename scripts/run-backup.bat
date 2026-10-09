@echo off
chcp 65001 > nul
echo ===================================================
echo   IAL Systems - Supabase Cloud to PostgreSQL Backup Task
echo ===================================================
cd /d "%~dp0\.."
node scripts/backup-to-postgres.js
echo.
echo Backup task completed.
pause
