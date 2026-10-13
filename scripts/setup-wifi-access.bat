@echo off
chcp 65001 >nul
echo ========================================================
echo   កំពុងរៀបចំការបើក Port Firewall សម្រាប់ Wi-Fi / LAN...
echo ========================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] កំពុងទាមទារសិទ្ធិ Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [+] 1. កំពុងបើក Firewall សម្រាប់ Port 3000 (Web App)...
netsh advfirewall firewall delete rule name="Accounting Web App (Port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="Accounting Web App (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul
echo [OK] បើក Port 3000 រួចរាល់!

echo [+] 2. កំពុងបើក Firewall សម្រាប់ Port 5432 (PostgreSQL)...
netsh advfirewall firewall delete rule name="PostgreSQL (Port 5432)" >nul 2>&1
netsh advfirewall firewall add rule name="PostgreSQL (Port 5432)" dir=in action=allow protocol=TCP localport=5432 profile=any >nul
echo [OK] បើក Port 5432 រួចរាល់!

echo [+] 3. កំពុងត្រួតពិនិត្យ pg_hba.conf សម្រាប់ PostgreSQL...
set "PG_HBA=C:\Program Files\PostgreSQL\18\data\pg_hba.conf"
if exist "%PG_HBA%" (
    findstr /C:"192.168.0.0/24" "%PG_HBA%" >nul
    if %errorLevel% neq 0 (
        echo host    all             all             192.168.0.0/24          scram-sha-256 >> "%PG_HBA%"
        echo host    all             all             192.168.1.0/24          scram-sha-256 >> "%PG_HBA%"
        echo [OK] បានបន្ថែម LAN Subnet ចូល pg_hba.conf!
        
        echo [+] 4. កំពុង Restart PostgreSQL Service...
        net stop postgresql-x64-18 >nul 2>&1
        net start postgresql-x64-18 >nul 2>&1
        echo [OK] Restart PostgreSQL រួចរាល់!
    ) else (
        echo [OK] pg_hba.conf ត្រូវបានអនុញ្ញាតរួចរាល់ហើយ!
    )
)

echo.
echo ========================================================
echo  ជោគជ័យ! អ្នកអាចប្រើប្រាស់តាម Wi-Fi បានហើយ៖
echo  👉 ចូល Web App តាមទូរស័ព្ទ/កុំព្យូទ័រផ្សេង: http://192.168.0.205:3000
echo ========================================================
echo.
pause
