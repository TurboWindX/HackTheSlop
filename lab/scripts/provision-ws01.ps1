# =============================================================================
# WS01  -  Windows 10 Workstation
#
# - Joins the lab domain
# - Disables Windows Defender (so pentest tools work without AV evasion needed)
# - Disables SMB signing (enables relay attacks from this workstation)
# - Enables WinRM (for Evil-WinRM testing)
# - Stores credentials in Credential Manager (for DPAPI attack practice)
#
# TURBO USE ONLY
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

$domain      = $env:DOMAIN       # turbo.lab
$domainShort = $env:DOMAIN_SHORT  # TURBO
$adminPass   = $env:ADMIN_PASS    # vagrant
$dcIp        = $env:DC_IP         # 192.168.56.10

# ── Rename computer (takes effect at the Restart-Computer at end of this script) ──
if ($env:COMPUTERNAME -ne "WS01") {
    Write-Host "[*] Renaming computer to WS01..."
    Rename-Computer -NewName "WS01" -Force -ErrorAction SilentlyContinue
}

# ── Configure lab network adapter (static IP + DNS) ─────────────────────────
# Sort by ifIndex: lowest = Vagrant NAT adapter (leave it alone).
# Skip it and configure the second NIC as the lab network interface.
Write-Host "[*] Configuring lab network adapter..."
$wsIp     = $env:WS_IP    # 192.168.56.30
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
    if ($currentIp -ne $wsIp) {
        Remove-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
        New-NetIPAddress -InterfaceAlias $labIface.Name -IPAddress $wsIp -PrefixLength 24 -ErrorAction SilentlyContinue
    }
    Set-DnsClientServerAddress -InterfaceAlias $labIface.Name -ServerAddresses $dcIp, "8.8.8.8"
    Write-Host "[+] Lab IP set: $wsIp on $($labIface.Name)"
} else {
    Write-Host "[!] No secondary adapter found - configure manually"
}
Write-Host "[*] DNS pointed at DC ($dcIp)..."

# ── Wait for DC ───────────────────────────────────────────────────────────────
Write-Host "[*] Waiting for DC to be reachable..."
$deadline = (Get-Date).AddMinutes(60)
while ((Get-Date) -lt $deadline) {
    if (Test-Connection -ComputerName $dcIp -Count 1 -Quiet) {
        try {
            Resolve-DnsName $domain -Server $dcIp -ErrorAction Stop | Out-Null
            Write-Host "[+] DC reachable and DNS responding."
            break
        } catch {
            Write-Host "  [*] DC ping OK but DNS not ready yet ($dcIp)... $(Get-Date -Format 'HH:mm:ss')"
        }
    } else {
        Write-Host "  [*] DC not pingable yet ($dcIp)... $(Get-Date -Format 'HH:mm:ss')"
    }
    Start-Sleep -Seconds 15
}

# ── Disable Windows Defender ──────────────────────────────────────────────────
# [LAB] Disabling so pentest tools (Mimikatz, Rubeus, etc.) run without evasion
Write-Host "[*] Disabling Windows Defender (lab  -  so tools run without evasion)..."
try {
    Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction SilentlyContinue
    Set-MpPreference -DisableIOAVProtection     $true -ErrorAction SilentlyContinue
    Set-MpPreference -DisableScriptScanning     $true -ErrorAction SilentlyContinue
    New-Item -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender" -Force | Out-Null
    Set-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender" -Name "DisableAntiSpyware" -Value 1 -Type DWord
    Write-Host "  [+] Defender disabled"
} catch {
    Write-Host "  [!] Defender disable failed (may need GPO): $_"
}

# ── [VULN] AutoLogon  -  cleartext domain credentials in registry ────────────────
# Credentials stored in HKLM under Winlogon in plaintext.
# Attack: reg query / post/windows/gather/credentials/credential_collector
Write-Host "[*] Configuring AutoLogon (cleartext creds in registry)..."
$winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
try {
    Set-ItemProperty $winlogon -Name "AutoAdminLogon"   -Value "1"            -Type String
    Set-ItemProperty $winlogon -Name "DefaultDomainName" -Value $domainShort    -Type String
    Set-ItemProperty $winlogon -Name "DefaultUserName"   -Value "bob.smith"   -Type String
    Set-ItemProperty $winlogon -Name "DefaultPassword"   -Value "Password123!" -Type String
    Write-Host "  [VULN] AutoLogon set: LAB\bob.smith / Password123! (cleartext in registry)"
    Write-Host "         Attack: reg query 'HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'"
} catch {
    Write-Host "  [!] AutoLogon config failed: $_"
}

# ── Disable SMB signing ───────────────────────────────────────────────────────
# [VULN] Workstation without SMB signing = valid relay target
Write-Host "[*] Disabling SMB signing..."
Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" -Name "RequireSecuritySignature" -Value 0
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters"      -Name "RequireSecuritySignature" -Value 0
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters"      -Name "EnableSecuritySignature"  -Value 0

# ── Enable WinRM ──────────────────────────────────────────────────────────────
# Allows Evil-WinRM connections from the attack machine
Write-Host "[*] Enabling WinRM..."
Enable-PSRemoting -Force -SkipNetworkProfileCheck -ErrorAction SilentlyContinue
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force -ErrorAction SilentlyContinue
Set-Service WinRM -StartupType Automatic
Start-Service WinRM -ErrorAction SilentlyContinue
netsh advfirewall firewall add rule name="WinRM HTTP" protocol=TCP dir=in localport=5985 action=allow | Out-Null
Write-Host "  [+] WinRM enabled on port 5985"

# ── Join domain ───────────────────────────────────────────────────────────────
Write-Host "[*] Joining domain $domain..."
$cred = New-Object PSCredential(
    "$domainShort\Administrator",
    (ConvertTo-SecureString $adminPass -AsPlainText -Force)
)
try {
    Add-Computer -DomainName $domain -Credential $cred -Force -ErrorAction Stop
    Write-Host "[+] Joined domain $domain"
} catch {
    Write-Host "[!] Domain join failed: $_"
}

# ── Store credentials in Windows Credential Manager ──────────────────────────
# [VULN] Credentials stored here are extractable via DPAPI / Mimikatz dpapi module
Write-Host "[*] Storing lab creds in Credential Manager (DPAPI practice)..."
$credSplat = @{
    Target   = "TERMSRV/SRV01.$domain"
    UserName = "$domainShort\svc_backup"
    Password = "Backup123!"
    Type     = "Generic"
}
try {
    # Use cmdkey.exe  -  available on all Windows versions
    cmdkey /add:"TERMSRV/SRV01.$domain" /user:"$domainShort\svc_backup" /pass:"Backup123!" | Out-Null
    cmdkey /add:"TERMSRV/DC01.$domain"  /user:"$domainShort\carol.white" /pass:"Summer2024!" | Out-Null
    Write-Host "  [VULN] Credential stored: $domainShort\svc_backup for SRV01 in DPAPI vault"
    Write-Host "  [VULN] Credential stored: $domainShort\carol.white  for DC01  in DPAPI vault"
    Write-Host "         Attack: mimikatz dpapi::cred /unprotect (or sekurlsa::wdigest)"
} catch { }

Write-Host "[+] WS01 provisioning complete. Rebooting in 5s to finalize domain join..."
& "$env:SystemRoot\System32\shutdown.exe" /r /t 5
exit 0
