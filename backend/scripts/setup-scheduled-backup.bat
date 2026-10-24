@echo off
chcp 65001 > nul
echo ==============================================================
echo   IAL Systems - ដំឡើងកាលវិភាគ Backup ស្វ័យប្រវត្តិ (Windows Task Scheduler)
echo ==============================================================
echo.
:: One task that checks every 15 minutes. The backup itself runs only when the schedule
:: saved in Settings (scripts\backup-schedule.json) says it is due.

set TASK_NAME=IALSystems_Postgres_Hourly_Backup
set VBS_PATH=%~dp0..\..\scripts\run-backup-silent.vbs
if not exist "%VBS_PATH%" set VBS_PATH=%~dp0run-backup-silent.vbs

:: Remove the older duplicate task name if it exists
schtasks /delete /tn "IALSystems_Postgres_AutoBackup" /f > nul 2>&1

schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%VBS_PATH%\"" /sc minute /mo 15 /f /rl highest

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] បានកំណត់រួចរាល់។ Task ពិនិត្យរៀងរាល់ 15 នាទី ហើយ Backup តាមកាលវិភាគក្នុង Settings។
) else (
    echo.
    echo [X] បរាជ័យ! សូម Right-Click លើ file នេះ ហើយជ្រើស "Run as administrator"។
)

echo.
pause
