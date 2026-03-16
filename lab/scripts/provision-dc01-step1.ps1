# =============================================================================
# DC01 — Step 1: Install AD DS and promote to Domain Controller
#
# Runs BEFORE the mandatory reboot. Vagrant triggers reboot: true after this.
# Step 2 (users, ADCS, vulns) runs after the reboot.
#
# LAB USE ONLY
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$domain      = $env:DOMAIN       # lab.local
$domainShort = $env:DOMAIN_SHORT  # LAB
$adminPass   = $env:ADMIN_PASS    # Vagrant123!
$dcIp        = $env:DC_IP         # 192.168.56.10

Write-Host "[*] Disabling IPv6..."
Get-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue |
    Disable-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue

Write-Host "[*] Setting static IP to $dcIp..."
# Sort adapters by ifIndex: index 0 is the Vagrant NAT/WinRM adapter — DO NOT TOUCH IT.
# The lab private-network adapter always has the next higher index.
$adapters = Get-NetAdapter | Sort-Object ifIndex
$labIface = $adapters | Select-Object -Skip 1 | Select-Object -First 1
if ($null -ne $labIface) {
    if ($labIface.Status -ne "Up") {
        Enable-NetAdapter -Name $labIface.Name -Confirm:$false -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
    $currentIp = (Get-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
    if ($currentIp -ne $dcIp) {
        Remove-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
        # No -DefaultGateway: the NAT adapter already has the internet gateway
        New-NetIPAddress -InterfaceAlias $labIface.Name -IPAddress $dcIp -PrefixLength 24 -ErrorAction SilentlyContinue
    }
    Set-DnsClientServerAddress -InterfaceAlias $labIface.Name -ServerAddresses "127.0.0.1", "8.8.8.8"
    Write-Host "[+] Lab IP set: $dcIp on $($labIface.Name)"
} else {
    Write-Host "[!] No secondary adapter found - skipping static IP"
}

Write-Host "[*] Setting local Administrator password (required before DC promotion)..."
$secPass = ConvertTo-SecureString $adminPass -AsPlainText -Force
Set-LocalUser -Name "Administrator" -Password $secPass -ErrorAction SilentlyContinue

Write-Host "[*] Installing AD DS + DNS roles..."
Install-WindowsFeature -Name AD-Domain-Services, DNS -IncludeManagementTools | Out-Null

Write-Host "[*] Promoting to Domain Controller for domain: $domain..."

Install-ADDSForest `
    -DomainName                    $domain `
    -DomainNetbiosName             $domainShort `
    -SafeModeAdministratorPassword $secPass `
    -InstallDns `
    -Force `
    -NoRebootOnCompletion | Out-Null

Write-Host "[+] DC promotion complete. Vagrant will now reboot..."
