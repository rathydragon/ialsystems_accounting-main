@echo off
chcp 65001 > nul
echo ==============================================================
echo   IAL Systems - លុបកាលវិភាគ Backup រៀងរាល់ ១ ម៉ោងម្តង
echo ==============================================================
echo.

set TASK_NAME=IALSystems_Postgres_Hourly_Backup

schtasks /delete /tn "%TASK_NAME%" /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [✓] បានលុបកាលវិភាគ Backup ដោយជោគជ័យ!
) else (
    echo.
    echo [ℹ] មិនមាន Task ឈ្មោះ "%TASK_NAME%" នៅក្នុងប្រព័ន្ធឡើយ។
)

echo.
pause
