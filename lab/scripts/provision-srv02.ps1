# =============================================================================
# SRV02 — Child Domain Member Server
#
# - Joins child.turbo.lab domain
# - Installs IIS with Windows Authentication (NTLM relay target)
# - Enables Print Spooler (PrinterBug / SpoolSample)
# - Disables SMB signing (enables relay attacks)
# - Enables WinRM (Evil-WinRM target)
# - Stores cross-domain credentials in DPAPI vault (parent domain creds)
# - Creates world-readable share with sensitive notes
#
# TURBO USE ONLY
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

$childDomain = $env:CHILD_DOMAIN   # child.turbo.lab
$childShort  = $env:CHILD_SHORT    # CHILD
$adminPass   = $env:ADMIN_PASS     # Vagrant123!
$dc02Ip      = $env:DC02_IP        # 192.168.56.11
$srv01Ip     = $env:SRV01_IP       # 192.168.56.20
$srv02Ip     = $env:SRV02_IP       # 192.168.56.21

# ── Configure lab network adapter ─────────────────────────────────────────────
# Sort by ifIndex: lowest = Vagrant NAT adapter (leave it alone)
Write-Host "[*] Configuring lab network adapter..."
$adapters = Get-NetAdapter | Sort-Object ifIndex
$labIface = $adapters | Where-Object {
    $gw = Get-NetRoute -InterfaceAlias $_.Name -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue
    -not $gw
} | Select-Object -First 1
if ($null -eq $labIface) {
    $labIface = $adapters | Select-Object -Skip 1 | Select-Object -First 1
}
if ($null -ne $labIface) {
    if ($labIface.Status -ne "Up") {
        Enable-NetAdapter -Name $labIface.Name -Confirm:$false -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
    $currentIp = (Get-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
    if ($currentIp -ne $srv02Ip) {
        Remove-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
        New-NetIPAddress -InterfaceAlias $labIface.Name -IPAddress $srv02Ip -PrefixLength 24 -ErrorAction SilentlyContinue
    }
    Set-DnsClientServerAddress -InterfaceAlias $labIface.Name -ServerAddresses $dc02Ip, "8.8.8.8"
    Write-Host "[+] Lab IP: $srv02Ip on $($labIface.Name)"
} else {
    Write-Host "[!] No secondary adapter found - configure IP manually"
}

# ── Wait for DC02 (child domain) to be reachable ──────────────────────────────
Write-Host "[*] Waiting for DC02 ($dc02Ip) and $childDomain DNS..."
$deadline = (Get-Date).AddMinutes(25)
while ((Get-Date) -lt $deadline) {
    if (Test-Connection -ComputerName $dc02Ip -Count 1 -Quiet) {
        try {
            Resolve-DnsName $childDomain -Server $dc02Ip -ErrorAction Stop | Out-Null
            Write-Host "[+] DC02 reachable — $childDomain resolves."
            break
        } catch {
            Write-Host "  [*] DNS not ready on DC02 yet, retrying in 15s..."
        }
    } else {
        Write-Host "  [*] DC02 not reachable at $dc02Ip yet, retrying in 15s..."
    }
    Start-Sleep -Seconds 15
}

# ── Join child domain ──────────────────────────────────────────────────────────
Write-Host "[*] Joining domain $childDomain..."
$cred = New-Object PSCredential(
    "$childShort\Administrator",
    (ConvertTo-SecureString $adminPass -AsPlainText -Force)
)
try {
    Add-Computer -DomainName $childDomain -Credential $cred -Force -ErrorAction Stop
    Write-Host "[+] Joined domain $childDomain"
} catch {
    Write-Host "[!] Domain join failed: $_"
}

# ── Install IIS with Windows Authentication (NTLM relay target) ───────────────
# [VULN] Portal requiring Windows Auth = valid NTLM relay target
# Attack: Responder coerce → relay to LDAP/SMB/ADCS (ntlmrelayx)
Write-Host "[*] Installing IIS with Windows Authentication..."
Install-WindowsFeature -Name `
    Web-Server, Web-WebServer, Web-Common-Http, Web-Default-Doc, Web-Http-Errors, `
    Web-Static-Content, Web-Windows-Auth, Web-Net-Ext45, Web-Asp-Net45, `
    Web-ISAPI-Ext, Web-ISAPI-Filter, Web-Mgmt-Console `
    -IncludeManagementTools -ErrorAction SilentlyContinue

$sitePath = "C:\inetpub\intranet"
New-Item -ItemType Directory -Path $sitePath -Force | Out-Null
@"
<!DOCTYPE html>
<html><body>
<h1>CHILD Domain Intranet — SRV02</h1>
<p>Internal portal. Windows Authentication required.</p>
<p>Server: SRV02.$childDomain | IP: $srv02Ip</p>
</body></html>
"@ | Set-Content -Path "$sitePath\index.html"

Import-Module WebAdministration -ErrorAction SilentlyContinue
try {
    New-Website -Name "Intranet" -Port 80 -PhysicalPath $sitePath `
        -ApplicationPool "DefaultAppPool" -Force | Out-Null
    Set-WebConfigurationProperty -Filter "//security/authentication/anonymousAuthentication" `
        -Name "enabled" -Value $false -PSPath "IIS:\Sites\Intranet" -ErrorAction SilentlyContinue
    Set-WebConfigurationProperty -Filter "//security/authentication/windowsAuthentication" `
        -Name "enabled" -Value $true  -PSPath "IIS:\Sites\Intranet" -ErrorAction SilentlyContinue
    Write-Host "  [VULN] IIS on port 80 with Windows Auth (NTLM relay target)"
    Write-Host "         Attack: ntlmrelayx -t ldap://DC02 --escalate-user svc_child_web"
} catch {
    Write-Host "  [!] IIS site setup failed: $_"
}

# ── [VULN] Enable Print Spooler (PrinterBug) ──────────────────────────────────
# SpoolSample / PetitPotam → force SRV02 to authenticate to attacker
# Combined with unconstrained delegation: excellent coercion target
Write-Host "[*] Enabling Print Spooler (PrinterBug target)..."
Set-Service  -Name Spooler -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service -Name Spooler -ErrorAction SilentlyContinue
Write-Host "  [VULN] Print Spooler running — SpoolSample / MS-RPRN coercion target"

# ── [VULN] Disable SMB signing ─────────────────────────────────────────────────
Write-Host "[*] Disabling SMB signing..."
Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" -Name "RequireSecuritySignature" -Value 0
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" -Name "EnableSecuritySignature"  -Value 0
Write-Host "  [VULN] SMB signing disabled (NTLM relay possible)"

# ── Enable WinRM ───────────────────────────────────────────────────────────────
Write-Host "[*] Enabling WinRM..."
Enable-PSRemoting -Force -SkipNetworkProfileCheck -ErrorAction SilentlyContinue
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force -ErrorAction SilentlyContinue
Set-Service WinRM -StartupType Automatic
netsh advfirewall firewall add rule name="WinRM HTTP" protocol=TCP dir=in localport=5985 action=allow | Out-Null
Write-Host "  [VULN] WinRM enabled on 5985 — Evil-WinRM target"

# ── [VULN] Store cross-domain credentials in DPAPI vault ──────────────────────
# Parent domain (LAB) creds cached here — extractable via Mimikatz dpapi::cred
Write-Host "[*] Storing cross-domain credentials in Credential Manager..."
cmdkey /add:"TERMSRV/SRV01.turbo.lab"  /user:"LAB\svc_backup"    /pass:"Backup123!"  | Out-Null
cmdkey /add:"TERMSRV/DC01.turbo.lab"   /user:"LAB\Administrator"  /pass:"Vagrant123!" | Out-Null
Write-Host "  [VULN] Cross-domain parent creds in DPAPI vault:"
Write-Host "         LAB\svc_backup    for TERMSRV/SRV01.turbo.lab"
Write-Host "         LAB\Administrator for TERMSRV/DC01.turbo.lab"

# ── [VULN] World-readable share with sensitive notes ──────────────────────────
Write-Host "[*] Creating IT-Child share..."
$sharePath = "C:\IT-Child"
New-Item -ItemType Directory -Path $sharePath -Force | Out-Null
@"
== CHILD Domain IT Notes ==
Updated: 2026-01-20

DC02 DSRM password:              Vagrant123!
Child domain krbtgt last reset:  NEVER (target for trust ticket attack)
Parent domain linked SQL:        sa_lab / Lab12345 on SRV01.turbo.lab
frank.admin password hint:       Admin123!
"@ | Set-Content -Path "$sharePath\notes.txt"
New-SmbShare -Name "IT-Child" -Path $sharePath -FullAccess "Everyone" -ErrorAction SilentlyContinue
Write-Host "  [VULN] Share \\SRV02\IT-Child created (DSRM + krbtgt notes exposed)"

Write-Host "[+] SRV02 provisioning complete. Rebooting to finalize domain join..."
Restart-Computer -Force
