@echo off
chcp 65001 > nul
echo ==============================================================
echo   IAL Systems - ដំឡើងកាលវិភាគ Backup ស្វ័យប្រវត្តិតាមម៉ោង
echo ==============================================================
echo.

set TASK_NAME=IALSystems_Postgres_AutoBackup
set VBS_PATH=%~dp0run-backup-silent.vbs

:: Read mode and time from backup-schedule.json via node
for /f "delims=" %%i in ('node -e "try{const d=require('./scripts/backup-schedule.json');console.log(d.mode+'|'+(d.time||'18:00')+'|'+(d.intervalHours||1));}catch{console.log('DAILY_TIME|18:00|1');}"') do set SCHED_INFO=%%i

for /f "tokens=1,2,3 delims=|" %%a in ("%SCHED_INFO%") do (
    set MODE=%%a
    set BKP_TIME=%%b
    set INT_HOURS=%%c
)

if "%MODE%"=="INTERVAL" (
    echo [ℹ] កាលវិភាគ៖ តាមចន្លោះពេល រៀងរាល់ %INT_HOURS% ម៉ោងម្តង
    echo កំពុងចុះឈ្មោះ Task Scheduler ក្នុង Windows...
    schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%VBS_PATH%\"" /sc hourly /mo %INT_HOURS% /f /rl highest
) else (
    echo [ℹ] កាលវិភាគ៖ តាមម៉ោងកំណត់ប្រចាំថ្ងៃ ម៉ោង %BKP_TIME%
    echo កំពុងចុះឈ្មោះ Task Scheduler ក្នុង Windows...
    schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%VBS_PATH%\"" /sc daily /st %BKP_TIME% /f /rl highest
)

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [✓] ជោគជ័យ! ប្រព័ន្ធបានកំណត់ Backup ស្វ័យប្រវត្តិតាម Windows Task Scheduler រួចរាល់។
    echo [ℹ] Task នេះដំណើរការស្ងាត់ (Silent) ដោយមិនរំខាន ឬលោតផ្ទាំងខ្មៅឡើយ។
) else (
    echo.
    echo [X] បរាជ័យក្នុងការចុះឈ្មោះ Task! សូមសាកល្បង Right-Click លើ file នេះ រួចជ្រើសរើស "Run as administrator"។
)

echo.
pause
