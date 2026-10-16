@echo off
chcp 65001 > nul
echo ==============================================================
echo   IAL Systems - ដំឡើងកាលវិភាគ Backup រៀងរាល់ ១ ម៉ោងម្តង
echo ==============================================================
echo.

set TASK_NAME=IALSystems_Postgres_Hourly_Backup
set VBS_PATH=%~dp0run-backup-silent.vbs

echo កំពុងចុះឈ្មោះ Task Scheduler ក្នុង Windows...
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%VBS_PATH%\"" /sc hourly /mo 1 /f /rl highest

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [✓] ជោគជ័យ! ប្រព័ន្ធបានកំណត់ Backup រៀងរាល់ ១ ម៉ោងម្តងស្វ័យប្រវត្តិតាម Windows Task Scheduler។
    echo [ℹ] Task នេះដំណើរការស្ងាត់ (Silent) ដោយមិនរំខាន ឬលោតផ្ទាំងខ្មៅឡើយ។
) else (
    echo.
    echo [X] បរាជ័យក្នុងការចុះឈ្មោះ Task! សូមសាកល្បង Right-Click លើ file នេះ រួចជ្រើសរើស "Run as administrator"។
)

echo.
pause
