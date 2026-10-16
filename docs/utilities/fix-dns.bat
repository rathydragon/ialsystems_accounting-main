@echo off
title IAL Systems - Fix DNS for Google Apps Script
:: Check for permissions
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"

if '%errorlevel%' NEQ '0' (
    echo Requesting Administrator privileges to update Wi-Fi DNS...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~dpnx0\"' -Verb RunAs"
    exit /b
)

echo =========================================================================
echo   Fixing net::ERR_NAME_NOT_RESOLVED for script.googleusercontent.com
echo =========================================================================
echo.
echo 1. Setting Wi-Fi Primary DNS to Cloudflare: 1.1.1.1 ...
netsh interface ipv4 set dns name="Wi-Fi" static 1.1.1.1 primary

echo 2. Setting Wi-Fi Secondary DNS to Google: 8.8.8.8 ...
netsh interface ipv4 add dns name="Wi-Fi" 8.8.8.8 index=2

echo 3. Flushing Windows DNS Cache...
ipconfig /flushdns

echo.
echo =========================================================================
echo   SUCCESS! DNS is now configured to 1.1.1.1 and 8.8.8.8.
echo   script.googleusercontent.com will now resolve instantly without error!
echo =========================================================================
echo.
pause
