# =============================================================================
# DC01 â€” Bootstrap: single-provisioner entry point.
#
# Vagrant calls this ONCE. It handles reboots via scheduled startup tasks
# so the WinRM session is never dropped mid-provisioner (which crashes the
# VMware Vagrant provider between provisioners).
#
# Flow:
#   1. (In Vagrant WinRM session) Stage 0: disable IPv6, static IP, rename,
#      register stage-1 startup task, issue shutdown /r /t 5, exit 0.
#      Vagrant WinRM session ends cleanly, VM reboots.
#
#   2. (After reboot, SYSTEM startup task) Stage 1: Install AD DS + DCPromo,
#      register stage-2 startup task, shutdown /r /t 5.
#
#   3. (After DCPromo reboot, SYSTEM startup task) Stage 2: wait for AD,
#      create vagrant domain user, write C:\vagrant-bootstrap-done.
#
#   Vagrant retries WinRM after step 0's reboot. Once it reconnects (as
#   domain vagrant user), it runs step2.ps1 which waits for
#   C:\vagrant-bootstrap-done before doing anything. This polling wait is the
#   only synchronization needed.
#
# TURBO USE ONLY
# =============================================================================
[CmdletBinding()]
param(
    [string]$Stage = "0"
)

$ErrorActionPreference = "Continue"

# Env vars (set by Vagrant for stage 0; embedded into task script for stages 1+2)
$domain      = $env:DOMAIN
$domainShort = $env:DOMAIN_SHORT
$adminPass   = $env:ADMIN_PASS
$dcIp        = $env:DC_IP

# Stable path this script is copied to so startup tasks can always find it
$stablePath = "C:\Windows\Temp\provision-dc01-bootstrap.ps1"

function Register-NextStage {
    param([string]$NextStage)
    $envBlock = @"
`$env:DOMAIN       = '$domain'
`$env:DOMAIN_SHORT = '$domainShort'
`$env:ADMIN_PASS   = '$adminPass'
`$env:DC_IP        = '$dcIp'
"@
    $launcher = "C:\Windows\Temp\dc01-stage${NextStage}-launcher.ps1"
    Set-Content -Path $launcher -Value ($envBlock + "`n& '$stablePath' -Stage $NextStage`n") -Encoding UTF8
    $action    = New-ScheduledTaskAction -Execute "powershell.exe" `
                     -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$launcher`""
    $trigger   = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName "Vagrant-DC01-Stage$NextStage" `
        -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host "[*] Registered startup task: Vagrant-DC01-Stage$NextStage"
}

# =============================================================================
# STAGE 0  (runs in Vagrant WinRM session)
# =============================================================================
if ($Stage -eq "0") {
    if (Test-Path "C:\vagrant-stage0-done") {
        Write-Host "[*] Stage 0 already done."
        exit 0
    }

    Write-Host "[*] Stage 0: Disabling IPv6..."
    $p = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters"
    if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }
    Set-ItemProperty -Path $p -Name "DisabledComponents" -Value 0xFF -Type DWord
    Get-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue |
        Disable-NetAdapterBinding -ComponentID ms_tcpip6 -PassThru -ErrorAction SilentlyContinue | Out-Null

    Write-Host "[*] Stage 0: Setting static IP $dcIp..."
    $adapters = Get-NetAdapter | Where-Object { $_.Status -ne 'Disabled' } | Sort-Object ifIndex
    $labIface = $adapters | Where-Object {
        -not (Get-NetRoute -InterfaceAlias $_.Name -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue)
    } | Select-Object -First 1
    if ($null -eq $labIface) { $labIface = $adapters | Select-Object -Skip 1 | Select-Object -First 1 }
    if ($null -ne $labIface) {
        if ($labIface.Status -ne "Up") { Enable-NetAdapter -Name $labIface.Name -Confirm:$false -ErrorAction SilentlyContinue; Start-Sleep 5 }
        $cur = (Get-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
        if ($cur -ne $dcIp) {
            Remove-NetIPAddress -InterfaceAlias $labIface.Name -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
            New-NetIPAddress -InterfaceAlias $labIface.Name -IPAddress $dcIp -PrefixLength 24 -ErrorAction SilentlyContinue | Out-Null
        }
        Set-DnsClientServerAddress -InterfaceAlias $labIface.Name -ServerAddresses $dcIp,"8.8.8.8"
        Write-Host "[+] Lab IP: $dcIp on $($labIface.Name)"
    }

    if ($env:COMPUTERNAME -ne "DC01") {
        Write-Host "[*] Renaming to DC01..."
        Rename-Computer -NewName "DC01" -Force -ErrorAction SilentlyContinue
    }

    Copy-Item $PSCommandPath $stablePath -Force -ErrorAction SilentlyContinue
    Register-NextStage -NextStage "1"
    New-Item -Path "C:\vagrant-stage0-done" -ItemType File -Force | Out-Null
    Write-Host "[+] Stage 0 done. Rebooting in 5s..."
    & "$env:SystemRoot\System32\shutdown.exe" /r /t 5
    exit 0
}

# =============================================================================
# STAGE 1  (SYSTEM startup task â€” after stage-0 reboot)
# =============================================================================
if ($Stage -eq "1") {
    Start-Sleep -Seconds 20
    if (Test-Path "C:\vagrant-stage1-done") { Write-Host "[*] Stage 1 already done."; exit 0 }

    Write-Host "[*] Stage 1: Setting Administrator password..."
    $secPass = ConvertTo-SecureString $adminPass -AsPlainText -Force
    Set-LocalUser -Name "Administrator" -Password $secPass -ErrorAction SilentlyContinue

    Write-Host "[*] Stage 1: Installing AD DS + DNS..."
    Install-WindowsFeature -Name AD-Domain-Services, DNS -IncludeManagementTools | Out-Null
    try { & "$env:SystemRoot\System32\shutdown.exe" /a 2>&1 | Out-Null } catch {}
    Start-Sleep -Seconds 3
    Clear-DnsClientCache -ErrorAction SilentlyContinue

    $watchdog = Start-Job -ScriptBlock {
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 5
            try { & "$env:SystemRoot\System32\shutdown.exe" /a 2>&1 | Out-Null } catch {}
        }
    }

    Write-Host "[*] Stage 1: DCPromo ($domain)..."
    Install-ADDSForest `
        -DomainName                    $domain `
        -DomainNetbiosName             $domainShort `
        -SafeModeAdministratorPassword $secPass `
        -InstallDns -CreateDnsDelegation:$false -Force -NoRebootOnCompletion | Out-Null

    Stop-Job   $watchdog -ErrorAction SilentlyContinue
    Remove-Job $watchdog -ErrorAction SilentlyContinue
    try { & "$env:SystemRoot\System32\shutdown.exe" /a 2>&1 | Out-Null } catch {}

    Register-NextStage -NextStage "2"
    New-Item -Path "C:\vagrant-stage1-done" -ItemType File -Force | Out-Null
    Write-Host "[+] Stage 1 done. Rebooting in 5s..."
    & "$env:SystemRoot\System32\shutdown.exe" /r /t 5
    exit 0
}

# =============================================================================
# STAGE 2  (SYSTEM startup task â€” after DCPromo reboot)
# =============================================================================
if ($Stage -eq "2") {
    Start-Sleep -Seconds 30
    if (Test-Path "C:\vagrant-bootstrap-done") { Write-Host "[*] Stage 2 already done."; exit 0 }

    Write-Host "[*] Stage 2: Waiting for AD..."
    $deadline = (Get-Date).AddMinutes(15)
    while ((Get-Date) -lt $deadline) {
        try { Get-ADDomain | Out-Null; Write-Host "[+] AD ready."; break }
        catch { Start-Sleep -Seconds 15 }
    }

    Write-Host "[*] Stage 2: Creating vagrant domain user..."
    try {
        New-ADUser -Name "vagrant" -SamAccountName "vagrant" `
            -AccountPassword (ConvertTo-SecureString "vagrant" -AsPlainText -Force) `
            -Enabled $true -PasswordNeverExpires $true -ChangePasswordAtLogon $false -ErrorAction Stop
        Add-ADGroupMember -Identity "Domain Admins" -Members "vagrant"
        Write-Host "[+] Domain user vagrant/vagrant created and added to Domain Admins."
    } catch { Write-Host "[!] vagrant user error (may exist): $_" }

    # Run scenario-specific provisioning scripts uploaded by Vagrant file provisioners
    foreach ($step in @("provision-dc01-step2.ps1", "provision-adcs-extra.ps1")) {
        $stepPath = "C:\Windows\Temp\$step"
        if (Test-Path $stepPath) {
            Write-Host "[*] Stage 2: Running $step..."
            & $stepPath
            Write-Host "[*] Stage 2: $step complete."
        }
    }

    Unregister-ScheduledTask -TaskName "Vagrant-DC01-Stage1" -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName "Vagrant-DC01-Stage2" -Confirm:$false -ErrorAction SilentlyContinue

    New-Item -Path "C:\vagrant-bootstrap-done" -ItemType File -Force | Out-Null
    Write-Host "[+] Bootstrap complete. DC01 is fully promoted and ready."
    exit 0
}
