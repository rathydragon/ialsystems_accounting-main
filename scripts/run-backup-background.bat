@echo off
if exist "%~dp0..\backend\scripts\run-backup-background.bat" (
    call "%~dp0..\backend\scripts\run-backup-background.bat"
) else (
    cd /d "%~dp0..\backend"
    >> "%~dp0..\backend\backup.log" 2>&1 node scripts/backup-to-postgres.js
)
