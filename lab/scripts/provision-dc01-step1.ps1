# =============================================================================
# DC01 — Step 1: Install AD DS and promote to Domain Controller
#
# Runs BEFORE the mandatory reboot. Vagrant triggers reboot: true after this.
# Step 2 (users, ADCS, vulns) runs after the reboot.
#
# TURBO USE ONLY
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$domain      = $env:DOMAIN       # turbo.lab
$domainShort = $env:DOMAIN_SHORT  # TURBO
$adminPass   = $env:ADMIN_PASS    # Vagrant123!
$dcIp        = $env:DC_IP         # 192.168.56.10

# ── Disable IPv6 globally via registry ────────────────────────────────────────
# NetAdapterBinding is unreliable on Server 2019 in VMware; registry is the only
# guaranteed method. 0xFF = disable on all adapters + loopback + tunnel interfaces.
# DCPromo.General.54 ("A general network error") is almost always caused by IPv6
# remaining active and confusing the DNS validation step of AD DS promotion.
Write-Host "[*] Disabling IPv6 globally via registry..."
$tcpip6Path = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters"
if (-not (Test-Path $tcpip6Path)) { New-Item -Path $tcpip6Path -Force | Out-Null }
Set-ItemProperty -Path $tcpip6Path -Name "DisabledComponents" -Value 0xFF -Type DWord

# Also kill binding on each adapter just in case
Get-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue |
    Disable-NetAdapterBinding -ComponentID ms_tcpip6 -PassThru -ErrorAction SilentlyContinue | Out-Null

Write-Host "[*] Setting static IP to $dcIp..."
# Sort adapters by ifIndex: the lowest (Vagrant NAT/WinRM) is index 0 — skip it.
$adapters = Get-NetAdapter | Where-Object { $_.Status -ne 'Disabled' } | Sort-Object ifIndex
$labIface = $adapters | Select-Object -Skip 1 | Select-Object -First 1
if ($null -ne $labIface) {
    if ($labIface.Status -ne "Up") {
        Enable-NetAdapter -Name $labIface.Name -Confirm:$false -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
    }
    $currentIp = (Get-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
    if ($currentIp -ne $dcIp) {
        Remove-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
        New-NetIPAddress -InterfaceAlias $labIface.Name -IPAddress $dcIp -PrefixLength 24 -ErrorAction SilentlyContinue
    }
    # Point DNS at itself by static IP (not 127.0.0.1) — resolves DCPromo DNS validation
    Set-DnsClientServerAddress -InterfaceAlias $labIface.Name -ServerAddresses $dcIp, "8.8.8.8"
    Write-Host "[+] Lab IP set: $dcIp on $($labIface.Name)"
} else {
    Write-Host "[!] No secondary adapter found - skipping static IP"
}

# Give the network stack a moment to settle after the IPv6 + IP changes
Start-Sleep -Seconds 8

Write-Host "[*] Setting local Administrator password (required before DC promotion)..."
$secPass = ConvertTo-SecureString $adminPass -AsPlainText -Force
Set-LocalUser -Name "Administrator" -Password $secPass -ErrorAction SilentlyContinue

Write-Host "[*] Installing AD DS + DNS roles..."
Install-WindowsFeature -Name AD-Domain-Services, DNS -IncludeManagementTools | Out-Null

# Flush DNS client cache before promotion
Clear-DnsClientCache -ErrorAction SilentlyContinue

Write-Host "[*] Promoting to Domain Controller for domain: $domain..."

Install-ADDSForest `
    -DomainName                    $domain `
    -DomainNetbiosName             $domainShort `
    -SafeModeAdministratorPassword $secPass `
    -InstallDns `
    -CreateDnsDelegation:$false `
    -Force `
    -NoRebootOnCompletion | Out-Null

Write-Host "[+] DC promotion complete. Vagrant will now reboot..."
