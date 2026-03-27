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

$ErrorActionPreference = "Continue"

# ── Sentinel guard: skip if already completed ─────────────────────────────────
if (Test-Path "C:\vagrant-step1-done") {
    Write-Host "[*] Step 1 already complete, skipping."
    exit 0
}

$domain      = $env:DOMAIN       # turbo.lab
$domainShort = $env:DOMAIN_SHORT  # TURBO
$adminPass   = $env:ADMIN_PASS    # vagrant (box default; kept consistent across reboots)
$dcIp        = $env:DC_IP         # 192.168.56.10

# Give the network stack a moment to settle after the reboot
Start-Sleep -Seconds 10

$secPass = ConvertTo-SecureString $adminPass -AsPlainText -Force

Write-Host "[*] Installing AD DS + DNS roles..."
Install-WindowsFeature -Name AD-Domain-Services, DNS -IncludeManagementTools | Out-Null

# Cancel any pending restart that Install-WindowsFeature may have queued
try { & "$env:SystemRoot\System32\shutdown.exe" /a 2>&1 | Out-Null } catch {}
Start-Sleep -Seconds 3

# Flush DNS client cache before promotion
Clear-DnsClientCache -ErrorAction SilentlyContinue

# Watchdog: keep aborting pending restarts every 5 s while DCPromo runs
$watchdog = Start-Job -ScriptBlock {
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 5
        try { & "$env:SystemRoot\System32\shutdown.exe" /a 2>&1 | Out-Null } catch {}
    }
}

Write-Host "[*] Promoting to Domain Controller for domain: $domain..."

Install-ADDSForest `
    -DomainName                    $domain `
    -DomainNetbiosName             $domainShort `
    -SafeModeAdministratorPassword $secPass `
    -InstallDns `
    -CreateDnsDelegation:$false `
    -Force `
    -NoRebootOnCompletion | Out-Null

Stop-Job    $watchdog -ErrorAction SilentlyContinue
Remove-Job  $watchdog -ErrorAction SilentlyContinue
# One final abort in case DCPromo queued a restart at its very end
try { & "$env:SystemRoot\System32\shutdown.exe" /a 2>&1 | Out-Null } catch {}

# Register a one-shot SYSTEM startup task that creates a 'vagrant' domain user after the
# DCPromo reboot. Vagrant reconnects with box-default vagrant/vagrant — on a DC, local SAM
# accounts don't work for network auth, but a domain 'vagrant' user will.
$taskScript = @'
$ErrorActionPreference = "SilentlyContinue"
$deadline = (Get-Date).AddMinutes(15)
while ((Get-Date) -lt $deadline) {
    try { Get-ADDomain | Out-Null; break } catch { Start-Sleep -Seconds 15 }
}
try {
    New-ADUser -Name "vagrant" -SamAccountName "vagrant" `
        -AccountPassword (ConvertTo-SecureString "vagrant" -AsPlainText -Force) `
        -Enabled $true -PasswordNeverExpires $true -ChangePasswordAtLogon $false
    Add-ADGroupMember -Identity "Domain Admins" -Members "vagrant"
} catch {}
Unregister-ScheduledTask -TaskName "Vagrant-DomainUser-Setup" -Confirm:$false
'@
$enc       = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($taskScript))
$action    = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NonInteractive -EncodedCommand $enc"
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "Vagrant-DomainUser-Setup" -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Write-Host "[*] Registered startup task: will create 'vagrant' domain user after reboot."

New-Item -Path "C:\vagrant-step1-done" -ItemType File -Force | Out-Null
Write-Host "[+] DC promotion complete. Rebooting in 5s..."
& "$env:SystemRoot\System32\shutdown.exe" /r /t 5
exit 0
