# =============================================================================
# DC02 — Step 2: Configure child domain users and vulnerabilities
#
# Runs AFTER the post-DC-promotion reboot.
#
# Intentional misconfigurations (all deliberate for pentest practice):
#   - AS-REP roastable account    (grace.temp)
#   - Kerberoastable + unconstrained delegation (svc_child_web)
#   - Child domain admin          (frank.admin)
#   - Print Spooler enabled       (cross-domain PrinterBug)
#   - SMB signing disabled
#   - DNS conditional forwarder   (child → parent resolution)
#
# Trust: child.lab.local is a child domain of lab.local
# Forest attack paths: ExtraSids, trust ticket forging, SID history escalation
#
# LAB USE ONLY — Never run on a real domain.
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

$parentDomain = $env:PARENT_DOMAIN   # lab.local
$childDomain  = $env:CHILD_DOMAIN    # child.lab.local
$childShort   = $env:CHILD_SHORT     # CHILD
$adminPass    = $env:ADMIN_PASS      # Vagrant123!
$dc01Ip       = $env:DC01_IP         # 192.168.56.10
$domainDN     = ($childDomain -split '\.' | ForEach-Object { "DC=$_" }) -join ','

Import-Module ActiveDirectory

# ── Wait for AD to be fully ready ─────────────────────────────────────────────
Write-Host "[*] Waiting for child domain AD services..."
$deadline = (Get-Date).AddMinutes(10)
while ((Get-Date) -lt $deadline) {
    try {
        Get-ADDomain | Out-Null
        Write-Host "[+] Child domain AD is ready."
        break
    } catch {
        Start-Sleep -Seconds 10
    }
}

# ── 1. Create OUs ──────────────────────────────────────────────────────────────
Write-Host "[*] Creating OUs..."
$ous = @(
    @{ Name = "Corp";            Path = $domainDN },
    @{ Name = "Users";           Path = "OU=Corp,$domainDN" },
    @{ Name = "Computers";       Path = "OU=Corp,$domainDN" },
    @{ Name = "ServiceAccounts"; Path = "OU=Corp,$domainDN" }
)
foreach ($ou in $ous) {
    New-ADOrganizationalUnit -Name $ou.Name -Path $ou.Path -ErrorAction SilentlyContinue
}

$userOU = "OU=Users,OU=Corp,$domainDN"
$svcOU  = "OU=ServiceAccounts,OU=Corp,$domainDN"

# ── 2. Create users ────────────────────────────────────────────────────────────
Write-Host "[*] Creating child domain users..."
$users = @(
    [pscustomobject]@{
        Sam  = "eve.child"; Pass = "Password123!"; Path = $userOU
        Desc = "Child Domain User"; ASREP = $false; SPN = $null
    },
    # Child domain admin — path to ExtraSids forest escalation
    [pscustomobject]@{
        Sam  = "frank.admin"; Pass = "Admin123!"; Path = $userOU
        Desc = "Child Domain IT Admin"; ASREP = $false; SPN = $null
    },
    # [VULN] AS-REP roastable
    [pscustomobject]@{
        Sam  = "grace.temp"; Pass = "Summer2024!"; Path = $userOU
        Desc = "Temp contractor — Kerberos pre-auth disabled"; ASREP = $true; SPN = $null
    },
    # [VULN] Kerberoastable + unconstrained delegation
    # Attack: compromise this account → PrinterBug → steal DC TGT → DCSync
    [pscustomobject]@{
        Sam  = "svc_child_web"; Pass = "Webservice1!"; Path = $svcOU
        Desc = "Child Web Service — unconstrained delegation"; ASREP = $false
        SPN  = "HTTP/SRV02.$childDomain"
    }
)

foreach ($u in $users) {
    $secPass = ConvertTo-SecureString $u.Pass -AsPlainText -Force
    try {
        New-ADUser `
            -Name                 $u.Sam `
            -SamAccountName       $u.Sam `
            -UserPrincipalName    "$($u.Sam)@$childDomain" `
            -Path                 $u.Path `
            -AccountPassword      $secPass `
            -Enabled              $true `
            -Description          $u.Desc `
            -PasswordNeverExpires $true `
            -ErrorAction Stop
        Write-Host "  [+] Created: $($u.Sam)@$childDomain"
    } catch {
        Write-Host "  [!] $($u.Sam) may already exist — skipping."
    }
    if ($u.ASREP) {
        Set-ADAccountControl -Identity $u.Sam -DoesNotRequirePreAuth $true
        Write-Host "  [VULN] AS-REP roastable: $($u.Sam)"
    }
    if ($u.SPN) {
        Set-ADUser -Identity $u.Sam -ServicePrincipalNames @{ Add = $u.SPN }
        Write-Host "  [VULN] Kerberoastable SPN: $($u.Sam) -> $($u.SPN)"
    }
}

# Add frank.admin to Domain Admins in the child domain
Add-ADGroupMember -Identity "Domain Admins" -Members "frank.admin" -ErrorAction SilentlyContinue
Write-Host "  [+] frank.admin added to Domain Admins ($childDomain)"

# ── 3. Relax password policy ───────────────────────────────────────────────────
Set-ADDefaultDomainPasswordPolicy -Identity $childDomain `
    -PasswordHistoryCount 0 -MaxPasswordAge 0 -MinPasswordAge 0 `
    -MinPasswordLength 4 -ComplexityEnabled $false -ErrorAction SilentlyContinue

# ── 4. [VULN] Unconstrained delegation on svc_child_web ───────────────────────
# Attack path:
#   1. Get code exec on a host running as svc_child_web
#   2. Trigger PrinterBug (SpoolSample) against DC01 or DC02
#   3. DC authenticates to the unconstrained deleg host → TGT captured
#   4. Pass-the-ticket as DC → DCSync → all hashes
Write-Host "[*] Setting unconstrained delegation on svc_child_web..."
try {
    Set-ADUser -Identity "svc_child_web" -TrustedForDelegation $true
    Write-Host "  [VULN] Unconstrained delegation: svc_child_web"
    Write-Host "         Attack: PrinterBug → capture DC01/DC02 TGT → DCSync"
} catch {
    Write-Host "  [!] Unconstrained delegation failed: $_"
}

# ── 5. [VULN] Disable SMB signing ─────────────────────────────────────────────
Write-Host "[*] Disabling SMB signing on DC02..."
Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" -Name "RequireSecuritySignature" -Value 0
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" -Name "EnableSecuritySignature"  -Value 0
Write-Host "  [VULN] SMB signing disabled (NTLM relay possible)"

# ── 6. [VULN] Enable Print Spooler (cross-domain PrinterBug) ──────────────────
# MS-RPRN coercion: SpoolSample forces DC01 or DC02 to authenticate to attacker
Write-Host "[*] Enabling Print Spooler (PrinterBug target)..."
Set-Service -Name Spooler -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service -Name Spooler -ErrorAction SilentlyContinue
Write-Host "  [VULN] Print Spooler running on DC02 — PrinterBug / SpoolSample target"

# ── 7. DNS conditional forwarder for parent domain ────────────────────────────
# In a child domain, delegation is auto-created in the parent zone.
# This forwarder ensures cross-domain resolution works immediately from DC02.
Write-Host "[*] Adding conditional forwarder: $parentDomain → $dc01Ip..."
try {
    Add-DnsServerConditionalForwarderZone `
        -Name            $parentDomain `
        -MasterServers   $dc01Ip `
        -ReplicationScope "Domain" `
        -ErrorAction SilentlyContinue
    Write-Host "  [+] Forwarder set: $parentDomain → $dc01Ip"
} catch {
    Write-Host "  [*] Forwarder may already exist (DNS delegation auto-created) — OK"
}

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================================"
Write-Host "  DC02 — Child Domain Fully Provisioned"
Write-Host "================================================================"
Write-Host "  Child Domain:  $childDomain  (CHILD)"
Write-Host "  Parent Domain: $parentDomain  (LAB)"
Write-Host "  DC IP:         192.168.56.11"
Write-Host "  Trust:         Automatic parent-child (bidirectional, transitive)"
Write-Host ""
Write-Host "  Administrator:     Vagrant123!"
Write-Host "  eve.child:         Password123!"
Write-Host "  frank.admin:       Admin123!     [Child Domain Admin]"
Write-Host "  grace.temp:        Summer2024!   [AS-REP roastable]"
Write-Host "  svc_child_web:     Webservice1!  [Kerberoastable | Unconstrained Deleg]"
Write-Host ""
Write-Host "  Cross-domain attack paths:"
Write-Host "    1. Compromise frank.admin (Child DA)"
Write-Host "       Get child krbtgt hash → forge ticket with ParentDomain SID"
Write-Host "       ExtraSids = Enterprise Admins in lab.local"
Write-Host "    2. PrinterBug (DC01/DC02) + svc_child_web unconstrained delegation"
Write-Host "       Capture DC TGT → pass-the-ticket → DCSync"
Write-Host "    3. Trust ticket: child krbtgt → inter-realm TGT → Enterprise Admin"
Write-Host "================================================================"
