# =============================================================================
# DC02 — Step 1: Install AD DS and promote as child domain controller
#
# Creates child.lab.local as a child domain of lab.local.
# Vagrant triggers reboot: true after this script completes.
# Step 2 (users, vulns) runs after the reboot.
#
# Prerequisites: DC01 must be fully provisioned and reachable at DC01_IP.
#
# LAB USE ONLY
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$parentDomain = $env:PARENT_DOMAIN  # lab.local
$childDomain  = $env:CHILD_DOMAIN   # child.lab.local
$childShort   = $env:CHILD_SHORT    # CHILD
$adminPass    = $env:ADMIN_PASS     # Vagrant123!
$dc02Ip       = $env:DC02_IP        # 192.168.56.11
$dc01Ip       = $env:DC01_IP        # 192.168.56.10

Write-Host "[*] Disabling IPv6..."
Get-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue |
    Disable-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue

Write-Host "[*] Setting static IP to $dc02Ip..."
# Sort by ifIndex — lowest is the Vagrant NAT adapter, skip it
$adapters = Get-NetAdapter | Sort-Object ifIndex
$labIface = $adapters | Select-Object -Skip 1 | Select-Object -First 1
if ($null -ne $labIface) {
    if ($labIface.Status -ne "Up") {
        Enable-NetAdapter -Name $labIface.Name -Confirm:$false -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
    $currentIp = (Get-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
    if ($currentIp -ne $dc02Ip) {
        Remove-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
        New-NetIPAddress -InterfaceAlias $labIface.Name -IPAddress $dc02Ip -PrefixLength 24 -ErrorAction SilentlyContinue
    }
    # Point DNS at DC01 during promotion so parent domain is resolvable
    Set-DnsClientServerAddress -InterfaceAlias $labIface.Name -ServerAddresses $dc01Ip, "8.8.8.8"
    Write-Host "[+] Lab IP set: $dc02Ip on $($labIface.Name)"
} else {
    Write-Host "[!] No secondary adapter found - skipping static IP"
}

Write-Host "[*] Setting local Administrator password (required before DC promotion)..."
$secPass = ConvertTo-SecureString $adminPass -AsPlainText -Force
Set-LocalUser -Name "Administrator" -Password $secPass -ErrorAction SilentlyContinue

# ── Wait for DC01 (parent domain) to be fully up ──────────────────────────────
Write-Host "[*] Waiting for DC01 ($dc01Ip) and parent domain '$parentDomain' to be ready..."
$deadline = (Get-Date).AddMinutes(25)
while ((Get-Date) -lt $deadline) {
    if (Test-Connection -ComputerName $dc01Ip -Count 1 -Quiet) {
        try {
            Resolve-DnsName $parentDomain -Server $dc01Ip -ErrorAction Stop | Out-Null
            Write-Host "[+] DC01 reachable — $parentDomain resolves."
            break
        } catch {
            Write-Host "  [*] DNS not ready on DC01 yet, retrying in 15s..."
        }
    } else {
        Write-Host "  [*] DC01 not yet reachable at $dc01Ip, retrying in 15s..."
    }
    Start-Sleep -Seconds 15
}

Write-Host "[*] Installing AD DS + DNS roles..."
Install-WindowsFeature -Name AD-Domain-Services, DNS -IncludeManagementTools | Out-Null

Write-Host "[*] Promoting as child domain controller: $childDomain (child of $parentDomain)..."
$safeModePass = ConvertTo-SecureString $adminPass -AsPlainText -Force
$parentCred   = New-Object PSCredential(
    "LAB\Administrator",
    (ConvertTo-SecureString $adminPass -AsPlainText -Force)
)

Install-ADDSDomain `
    -NewDomainName                 "child" `
    -ParentDomainName              $parentDomain `
    -DomainType                    ChildDomain `
    -NewDomainNetbiosName          $childShort `
    -ReplicationSourceDC           "DC01.$parentDomain" `
    -SafeModeAdministratorPassword $safeModePass `
    -Credential                    $parentCred `
    -InstallDns `
    -CreateDnsDelegation           $true `
    -DNSDelegationCredential       $parentCred `
    -Force `
    -NoRebootOnCompletion | Out-Null

Write-Host "[+] Child DC promotion complete ($childDomain). Vagrant will now reboot..."
