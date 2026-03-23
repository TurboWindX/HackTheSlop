# =============================================================================
# DC01 — Step 0: Disable IPv6 + set static IP, then reboot.
#
# Must run BEFORE DCPromo (step1). The registry IPv6 disable requires a full
# reboot to take effect — DCPromo.General.54 happens when IPv6 is still active
# during AD DS promotion.
#
# TURBO USE ONLY
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

$dcIp = $env:DC_IP   # 192.168.56.10

# ── Disable IPv6 globally via registry ────────────────────────────────────────
Write-Host "[*] Disabling IPv6 globally via registry..."
$tcpip6Path = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters"
if (-not (Test-Path $tcpip6Path)) { New-Item -Path $tcpip6Path -Force | Out-Null }
Set-ItemProperty -Path $tcpip6Path -Name "DisabledComponents" -Value 0xFF -Type DWord

Get-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue |
    Disable-NetAdapterBinding -ComponentID ms_tcpip6 -PassThru -ErrorAction SilentlyContinue | Out-Null

# ── Set static IP on the lab (host-only) adapter ──────────────────────────────
Write-Host "[*] Setting static IP to $dcIp..."
$adapters  = Get-NetAdapter | Where-Object { $_.Status -ne 'Disabled' } | Sort-Object ifIndex
$labIface  = $adapters | Where-Object {
    $gw = Get-NetRoute -InterfaceAlias $_.Name -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue
    -not $gw
} | Select-Object -First 1
if ($null -eq $labIface) {
    $labIface = $adapters | Select-Object -Skip 1 | Select-Object -First 1
}

if ($null -ne $labIface) {
    if ($labIface.Status -ne "Up") {
        Enable-NetAdapter -Name $labIface.Name -Confirm:$false -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
    }
    $currentIp = (Get-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
    if ($currentIp -ne $dcIp) {
        Remove-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
        New-NetIPAddress -InterfaceAlias $labIface.Name -IPAddress $dcIp -PrefixLength 24 -ErrorAction SilentlyContinue | Out-Null
    }
    Set-DnsClientServerAddress -InterfaceAlias $labIface.Name -ServerAddresses $dcIp, "8.8.8.8"
    Write-Host "[+] Lab IP set: $dcIp on $($labIface.Name)"
} else {
    Write-Host "[!] No secondary adapter found - skipping static IP"
}

Write-Host "[+] Step 0 complete. Vagrant will reboot now..."
