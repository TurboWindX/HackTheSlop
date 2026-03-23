# =============================================================================
# DC01 — Step 1: Install AD DS and promote to Domain Controller.
#
# Runs AFTER the step0 reboot (IPv6 already disabled, static IP already set).
# Vagrant triggers reboot: true after this so AD DS changes take effect.
# Step 2 (users, ADCS, vulns) runs after that reboot.
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

# Give the network stack a moment to settle after the reboot
Start-Sleep -Seconds 10

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
