# =============================================================================
# SRV01 — Member Server
#
# - Joins the lab domain
# - Installs SQL Server Express via Chocolatey (free, ~500MB download)
# - Enables xp_cmdshell (intentionally insecure — for MSSQL attack practice)
# - Disables SMB signing (enables relay attacks)
# - Creates a world-readable file share with a fake credentials file
#
# TURBO USE ONLY
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

$domain      = $env:DOMAIN       # turbo.lab
$domainShort = $env:DOMAIN_SHORT  # TURBO
$adminPass   = $env:ADMIN_PASS    # Vagrant123!
$dcIp        = $env:DC_IP         # 192.168.56.10

# ── Configure lab network adapter (static IP + DNS) ─────────────────────────
# Sort by ifIndex: lowest = Vagrant NAT adapter (leave it alone).
# Skip it and configure the second NIC as the lab network interface.
Write-Host "[*] Configuring lab network adapter..."
$srvIp    = $env:SRV_IP   # 192.168.56.20
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
    if ($currentIp -ne $srvIp) {
        Remove-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
        New-NetIPAddress -InterfaceAlias $labIface.Name -IPAddress $srvIp -PrefixLength 24 -ErrorAction SilentlyContinue
    }
    Set-DnsClientServerAddress -InterfaceAlias $labIface.Name -ServerAddresses $dcIp, "8.8.8.8"
    Write-Host "[+] Lab IP set: $srvIp on $($labIface.Name)"
} else {
    Write-Host "[!] No secondary adapter found - configure manually"
}
Write-Host "[*] DNS pointed at DC ($dcIp)..."

# ── Wait for DC to be reachable ───────────────────────────────────────────────
Write-Host "[*] Waiting for DC to be reachable and DNS to resolve $domain..."
$deadline = (Get-Date).AddMinutes(15)
while ((Get-Date) -lt $deadline) {
    if (Test-Connection -ComputerName $dcIp -Count 1 -Quiet) {
        try {
            Resolve-DnsName $domain -Server $dcIp -ErrorAction Stop | Out-Null
            Write-Host "[+] DC reachable and DNS resolves."
            break
        } catch {
            Write-Host "  [*] DNS not ready yet, retrying..."
        }
    }
    Start-Sleep -Seconds 15
}

# ── Join the domain ───────────────────────────────────────────────────────────
Write-Host "[*] Joining domain $domain..."
$cred = New-Object PSCredential(
    "$domainShort\Administrator",
    (ConvertTo-SecureString $adminPass -AsPlainText -Force)
)
try {
    Add-Computer -DomainName $domain -Credential $cred -Force -ErrorAction Stop
    Write-Host "[+] Successfully joined domain."
} catch {
    Write-Host "[!] Domain join failed: $_"
}

# ── Install Chocolatey ────────────────────────────────────────────────────────
Write-Host "[*] Installing Chocolatey..."
Set-ExecutionPolicy Bypass -Scope Process -Force
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
try {
    Invoke-Expression ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    Write-Host "[+] Chocolatey installed."
} catch {
    Write-Host "[!] Chocolatey install failed: $_"
}

# ── Install SQL Server Express ────────────────────────────────────────────────
# Free edition — ~500MB download. Runs as LAB\svc_sql.
Write-Host "[*] Installing SQL Server Express (this may take 5-10 minutes)..."
try {
    choco install sql-server-express --yes --no-progress 2>&1
    Write-Host "[+] SQL Server Express installed."
} catch {
    Write-Host "[!] SQL install failed: $_"
}

# ── Configure SQL Server ──────────────────────────────────────────────────────
# Wait for SQL service to start
Write-Host "[*] Waiting for SQL Server service..."
$sqlSvc = "MSSQL`$SQLEXPRESS"
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
    $svc = Get-Service -Name $sqlSvc -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") { Write-Host "[+] SQL running."; break }
    Start-Sleep -Seconds 10
}

# Find sqlcmd
$sqlcmdPath = Get-ChildItem "C:\Program Files\Microsoft SQL Server" -Recurse -Filter "SQLCMD.EXE" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName

if ($sqlcmdPath) {
    Write-Host "[*] Configuring SQL Server..."

    # [VULN] Enable xp_cmdshell — allows OS command execution from SQL
    # [VULN] Enable remote access
    $configSql = @"
EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
EXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;
EXEC sp_configure 'remote access', 1; RECONFIGURE;
EXEC sp_configure 'Ad Hoc Distributed Queries', 1; RECONFIGURE;
"@
    & $sqlcmdPath -S ".\SQLEXPRESS" -Q $configSql -E | Out-Null

    # Create a SQL login with a weak password for Mixed Mode auth testing
    $createLoginSql = @"
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'sa_lab')
BEGIN
    CREATE LOGIN [sa_lab] WITH PASSWORD = 'Lab12345', CHECK_POLICY = OFF;
    EXEC sp_addsrvrolemember 'sa_lab', 'sysadmin';
END
"@
    & $sqlcmdPath -S ".\SQLEXPRESS" -Q $createLoginSql -E | Out-Null
    Write-Host "  [VULN] SQL login created: sa_lab / Lab12345 (sysadmin)"
    Write-Host "  [VULN] xp_cmdshell enabled"

    # Enable Mixed Mode authentication (requires registry change + restart)
    $sqlServerHive = Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server" |
        Where-Object { $_.Name -match "MSSQL\d+\.SQLEXPRESS" } |
        Select-Object -Last 1
    if ($sqlServerHive) {
        Set-ItemProperty -Path "$($sqlServerHive.PSPath)\MSSQLServer" -Name LoginMode -Value 2
        Write-Host "  [+] Mixed Mode authentication enabled"
        Restart-Service $sqlSvc -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "[!] sqlcmd not found — SQL config skipped. SQL may not have installed correctly."
}

# ── Disable SMB signing ───────────────────────────────────────────────────────
# [VULN] Enables NTLM relay via ntlmrelayx
Write-Host "[*] Disabling SMB signing..."
Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" -Name "RequireSecuritySignature" -Value 0
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" -Name "EnableSecuritySignature"  -Value 0
# ── Install IIS with Windows Authentication (NTLM relay target) ───────────────
# [VULN] Any user or computer that hits this site triggers NTLM auth
# Attack: Responder MitM + ntlmrelayx → relay to LDAP/SMB/ADCS
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
<h1>LAB Corporate Intranet — SRV01</h1>
<p>Internal portal. Windows Authentication required.</p>
</body></html>
"@ | Set-Content -Path "$sitePath\index.html"

Import-Module WebAdministration -ErrorAction SilentlyContinue
try {
    New-Website -Name "Intranet" -Port 80 -PhysicalPath $sitePath `
        -ApplicationPool "DefaultAppPool" -Force | Out-Null
    Set-WebConfigurationProperty `
        -Filter "//security/authentication/anonymousAuthentication" `
        -Name "enabled" -Value $false `
        -PSPath "IIS:\Sites\Intranet" -ErrorAction SilentlyContinue
    Set-WebConfigurationProperty `
        -Filter "//security/authentication/windowsAuthentication" `
        -Name "enabled" -Value $true `
        -PSPath "IIS:\Sites\Intranet" -ErrorAction SilentlyContinue
    Write-Host "  [VULN] IIS on port 80 with Windows Auth — NTLM relay target"
    Write-Host "         Attack: ntlmrelayx -t ldap://192.168.56.10 --delegate-access"
} catch {
    Write-Host "  [!] IIS site setup failed: $_"
}

# ── Enable Print Spooler (PrinterBug) ───────────────────────────────────────
# [VULN] SpoolSample / MS-RPRN coercion: force SRV01 to auth to attacker machine
Write-Host "[*] Enabling Print Spooler (PrinterBug target)..."
Set-Service  -Name Spooler -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service -Name Spooler -ErrorAction SilentlyContinue
Write-Host "  [VULN] Print Spooler running — SpoolSample / MS-RPRN coercion target"
# ── Create a world-readable share with a fake creds file ─────────────────────
# [VULN] Common lab finding: credentials in accessible file shares
Write-Host "[*] Creating IT share with 'credentials' file..."
$sharePath = "C:\IT-Share"
New-Item -ItemType Directory -Path $sharePath -Force | Out-Null
@"
== IT Department Credentials Store ==
Updated: 2026-01-15

Backup Service:  svc_backup / Backup123!
SQL Monitoring:  sa_lab / Lab12345
"@ | Set-Content -Path "$sharePath\it-creds.txt"
New-SmbShare -Name "IT" -Path $sharePath -FullAccess "Everyone" -ErrorAction SilentlyContinue
Write-Host "  [VULN] Share \\SRV01\IT created with credentials file"

# ── Reboot to complete domain join ────────────────────────────────────────────
Write-Host "[+] SRV01 provisioning complete. Rebooting to finalize domain join..."
Restart-Computer -Force
