# Windows Firewall rules for the IAL Systems server PC.
# Run once in PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\firewall-setup.ps1
# Remove the rules again:
#   powershell -ExecutionPolicy Bypass -File scripts\firewall-setup.ps1 -Remove
#
# - Port 5000 (backend API) is blocked from every other device. The app still works because
#   the browser talks to port 3000, which forwards /api to the backend on this PC (loopback
#   traffic is not filtered by Windows Firewall).
# - Port 3000 (the app) is blocked on Public networks (cafe / hotel Wi-Fi) and stays open on
#   Private networks (office Wi-Fi, Tailscale).
param([switch]$Remove)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Please run this script in PowerShell opened with "Run as administrator".' -ForegroundColor Red
  exit 1
}

$group = 'IAL Systems'
Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Remove) {
  Write-Host 'IAL Systems firewall rules removed.' -ForegroundColor Yellow
  exit 0
}

New-NetFirewallRule -Group $group -DisplayName 'IAL - Block backend API 5000 from network' `
  -Direction Inbound -Action Block -Protocol TCP -LocalPort 5000 -Profile Any | Out-Null

New-NetFirewallRule -Group $group -DisplayName 'IAL - Block app 3000 on Public networks' `
  -Direction Inbound -Action Block -Protocol TCP -LocalPort 3000 -Profile Public | Out-Null

New-NetFirewallRule -Group $group -DisplayName 'IAL - Allow app 3000 on Private networks' `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private, Domain | Out-Null

Write-Host 'Done. Current IAL Systems rules:' -ForegroundColor Green
Get-NetFirewallRule -Group $group | Format-Table DisplayName, Action, Profile, Enabled -AutoSize
