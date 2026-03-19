# =============================================================================
# TurboPentest Lab Launcher
#
# Interactive scenario picker for the AD lab.
# Run this from the lab/ directory:   .\launch.ps1
# =============================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$scenarios = @(
    [pscustomobject]@{
        Id          = 1
        Name        = "Kerberos Basics"
        Dir         = "scenarios\kerberos-basics"
        VMs         = "DC01 + WS01"
        RAM         = "~6 GB"
        Time        = "~25 min"
        Description = "AS-REP roasting, Kerberoasting, unconstrained/constrained delegation, S4U2Self, Golden/Silver tickets"
        Color       = "Cyan"
    },
    [pscustomobject]@{
        Id          = 2
        Name        = "ADCS Deep Dive"
        Dir         = "scenarios\adcs-deep-dive"
        VMs         = "DC01 + WS01"
        RAM         = "~6 GB"
        Time        = "~30 min"
        Description = "ESC1 through ESC8 - all major ADCS misconfigurations, cert theft, PKINIT"
        Color       = "Yellow"
    },
    [pscustomobject]@{
        Id          = 3
        Name        = "ACL Abuse"
        Dir         = "scenarios\acl-abuse"
        VMs         = "DC01 + WS01"
        RAM         = "~6 GB"
        Time        = "~25 min"
        Description = "GenericAll, DCSync, AdminSDHolder, ForceChangePassword, GPO abuse, RBCD"
        Color       = "Magenta"
    },
    [pscustomobject]@{
        Id          = 4
        Name        = "Lateral Movement"
        Dir         = "scenarios\lateral-movement"
        VMs         = "DC01 + SRV01 + WS01"
        RAM         = "~9 GB"
        Time        = "~45 min"
        Description = "PTH, PTT, Evil-WinRM, DCOM, WMI, MSSQL xp_cmdshell, DPAPI, AutoLogon, creds in shares"
        Color       = "Green"
    },
    [pscustomobject]@{
        Id          = 5
        Name        = "Forest Trust Attacks"
        Dir         = "scenarios\forest-trust"
        VMs         = "DC01 + DC02 + WS01"
        RAM         = "~9 GB"
        Time        = "~50 min"
        Description = "Parent-child trust, ExtraSids, trust ticket forging, SID history, cross-domain Kerberos"
        Color       = "Red"
    },
    [pscustomobject]@{
        Id          = 6
        Name        = "Full Lab (Everything)"
        Dir         = "."
        VMs         = "DC01 + DC02 + SRV01 + SRV02 + WS01"
        RAM         = "~15 GB"
        Time        = "~70 min"
        Description = "All 5 VMs, all scenarios combined - the complete GOAD-style environment"
        Color       = "White"
    }
)

function Show-Menu {
    Clear-Host
    Write-Host ""
    Write-Host "  ████████╗██╗   ██╗██████╗ ██████╗  ██████╗ " -ForegroundColor DarkCyan
    Write-Host "     ██╔══╝██║   ██║██╔══██╗██╔══██╗██╔═══██╗" -ForegroundColor DarkCyan
    Write-Host "     ██║   ██║   ██║██████╔╝██████╔╝██║   ██║" -ForegroundColor DarkCyan
    Write-Host "     ██║   ██║   ██║██╔══██╗██╔══██╗██║   ██║" -ForegroundColor DarkCyan
    Write-Host "     ██║   ╚██████╔╝██║  ██║██████╔╝╚██████╔╝" -ForegroundColor DarkCyan
    Write-Host "     ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═════╝  ╚═════╝ " -ForegroundColor DarkCyan
    Write-Host "     TurboPentest AD Lab — Scenario Launcher" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  ─────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host ""

    foreach ($s in $scenarios) {
        Write-Host ("  [{0}]  " -f $s.Id) -NoNewline -ForegroundColor DarkGray
        Write-Host ("{0,-24}" -f $s.Name) -NoNewline -ForegroundColor $s.Color
        Write-Host ("  {0,-22}" -f $s.VMs) -NoNewline -ForegroundColor Gray
        Write-Host ("  RAM: {0,-8}" -f $s.RAM)   -NoNewline -ForegroundColor DarkGray
        Write-Host ("  {0}" -f $s.Time)            -ForegroundColor DarkGray
        Write-Host ("       {0}" -f $s.Description) -ForegroundColor DarkGray
        Write-Host ""
    }

    Write-Host "  ─────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  [D]  Destroy all running lab VMs (vagrant destroy -f everywhere)"  -ForegroundColor DarkRed
    Write-Host "  [S]  Status of all lab VMs"                                         -ForegroundColor DarkYellow
    Write-Host "  [Q]  Quit"                                                           -ForegroundColor DarkGray
    Write-Host ""
}

function Get-ActiveScenario {
    $lockFile = Join-Path $ScriptDir ".active-scenario"
    if (Test-Path $lockFile) {
        return Get-Content $lockFile -Raw
    }
    return $null
}

function Set-ActiveScenario {
    param([string]$scenarioName)
    $lockFile = Join-Path $ScriptDir ".active-scenario"
    $scenarioName | Set-Content $lockFile
}

function Destroy-AllScenarios {
    Write-Host ""
    Write-Host "  [*] Destroying VMs in all scenario directories..." -ForegroundColor DarkRed

    # Destroy in main lab dir
    if (Test-Path (Join-Path $ScriptDir "Vagrantfile")) {
        Write-Host "  [*] Destroying full lab VMs..." -ForegroundColor DarkGray
        Push-Location $ScriptDir
        vagrant destroy -f 2>&1 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
        Pop-Location
    }

    # Destroy in each scenario dir
    foreach ($s in $scenarios) {
        if ($s.Dir -ne ".") {
            $scenarioPath = Join-Path $ScriptDir $s.Dir
            if (Test-Path $scenarioPath) {
                $vf = Join-Path $scenarioPath "Vagrantfile"
                if (Test-Path $vf) {
                    $dotVagrant = Join-Path $scenarioPath ".vagrant"
                    if (Test-Path $dotVagrant) {
                        Write-Host "  [*] Destroying: $($s.Name)..." -ForegroundColor DarkGray
                        Push-Location $scenarioPath
                        vagrant destroy -f 2>&1 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
                        Pop-Location
                    }
                }
            }
        }
    }

    # Clear active scenario
    $lockFile = Join-Path $ScriptDir ".active-scenario"
    if (Test-Path $lockFile) { Remove-Item $lockFile }

    Write-Host "  [+] All VMs destroyed." -ForegroundColor DarkGreen
}

function Show-Status {
    Write-Host ""
    Write-Host "  [*] Checking status of all lab VMs..." -ForegroundColor Cyan

    foreach ($s in $scenarios) {
        $targetDir = if ($s.Dir -eq ".") { $ScriptDir } else { Join-Path $ScriptDir $s.Dir }
        $dotVagrant = Join-Path $targetDir ".vagrant"
        if (Test-Path $dotVagrant) {
            Write-Host ""
            Write-Host ("  [{0}] {1}" -f $s.Id, $s.Name) -ForegroundColor $s.Color
            Push-Location $targetDir
            vagrant status 2>&1 | Where-Object { $_ -match "dc0|srv0|ws0|running|saved|poweroff" } |
                ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
            Pop-Location
        }
    }
    Write-Host ""
}

function Launch-Scenario {
    param($scenario)

    $targetDir = if ($scenario.Dir -eq ".") { $ScriptDir } else { Join-Path $ScriptDir $scenario.Dir }

    Write-Host ""
    Write-Host "  [*] Selected: $($scenario.Name)" -ForegroundColor $scenario.Color
    Write-Host "      VMs:  $($scenario.VMs)"       -ForegroundColor DarkGray
    Write-Host "      RAM:  $($scenario.RAM)"        -ForegroundColor DarkGray
    Write-Host "      Time: $($scenario.Time)"       -ForegroundColor DarkGray
    Write-Host ""

    # Check if any other scenario has running VMs
    $active = Get-ActiveScenario
    if ($active -and $active.Trim() -ne $scenario.Name) {
        Write-Host "  [!] Another scenario may be running: $($active.Trim())" -ForegroundColor DarkYellow
        $confirm = Read-Host "      Destroy it first? (y/N)"
        if ($confirm -match "^[yY]") {
            Destroy-AllScenarios
        }
    }

    Write-Host "  [*] Launching $($scenario.Name)..." -ForegroundColor $scenario.Color
    Write-Host "      Directory: $targetDir" -ForegroundColor DarkGray
    Write-Host ""

    Set-ActiveScenario $scenario.Name

    Push-Location $targetDir
    vagrant up
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "  [+] Lab ready: $($scenario.Name)" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Network:" -ForegroundColor DarkGray
        Write-Host "    DC01:  192.168.56.10  (turbo.lab DC)"         -ForegroundColor DarkGray
        if ($scenario.VMs -match "DC02")  { Write-Host "    DC02:  192.168.56.11  (child.turbo.lab DC)" -ForegroundColor DarkGray }
        if ($scenario.VMs -match "SRV01") { Write-Host "    SRV01: 192.168.56.20  (member server)"      -ForegroundColor DarkGray }
        if ($scenario.VMs -match "SRV02") { Write-Host "    SRV02: 192.168.56.21  (child member server)" -ForegroundColor DarkGray }
        if ($scenario.VMs -match "WS01")  { Write-Host "    WS01:  192.168.56.30  (workstation)"        -ForegroundColor DarkGray }
        Write-Host ""
        Write-Host "  Creds: Administrator / Vagrant123!" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "  Tip: Take a snapshot now!" -ForegroundColor DarkYellow
        Write-Host "       Push-Location '$targetDir'; vagrant snapshot save clean_base; Pop-Location"
        Write-Host ""
    } else {
        Write-Host "  [!] vagrant up exited with code $exitCode — check output above for errors." -ForegroundColor DarkRed
    }
}

# ── Main loop ─────────────────────────────────────────────────────────────────
if (-not (Get-Command vagrant -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "  [!] 'vagrant' not found in PATH." -ForegroundColor Red
    Write-Host "      Install from: https://developer.hashicorp.com/vagrant/install" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

while ($true) {
    Show-Menu

    $active = Get-ActiveScenario
    if ($active) {
        Write-Host "  Active scenario: $($active.Trim())" -ForegroundColor DarkGreen
        Write-Host ""
    }

    $choice = Read-Host "  Select scenario"

    switch ($choice.ToUpper()) {
        "Q" { exit 0 }
        "D" {
            $confirm = Read-Host "  Destroy ALL VMs in ALL scenarios? (y/N)"
            if ($confirm -match "^[yY]") {
                Destroy-AllScenarios
            }
            Read-Host "  Press Enter to continue"
        }
        "S" {
            Show-Status
            Read-Host "  Press Enter to continue"
        }
        default {
            $num = $null
            if ([int]::TryParse($choice, [ref]$num)) {
                $selected = $scenarios | Where-Object { $_.Id -eq $num }
                if ($selected) {
                    Launch-Scenario $selected
                    Read-Host "  Press Enter to return to menu"
                } else {
                    Write-Host "  Invalid selection." -ForegroundColor DarkRed
                    Start-Sleep 1
                }
            } else {
                Write-Host "  Invalid selection." -ForegroundColor DarkRed
                Start-Sleep 1
            }
        }
    }
}
