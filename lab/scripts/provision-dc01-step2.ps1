# =============================================================================
# DC01 — Step 2: Configure lab users, intentional vulnerabilities, and ADCS
#
# Runs AFTER the post-DC-promotion reboot.
#
# Intentional misconfigurations (all deliberate for pentest practice):
#   - AS-REP roastable account    (alice.jones)
#   - Kerberoastable accounts     (svc_sql, svc_backup, svc_iis)
#   - Password in Description     (dave.brown)
#   - SMB signing disabled        (enables relay attacks)
#   - ADCS ESC1 vulnerable template
#   - GenericAll ACL: carol.white -> svc_sql
#
# LAB USE ONLY — Never run on a real domain.
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

$domain      = $env:DOMAIN       # lab.local
$domainShort = $env:DOMAIN_SHORT  # LAB
$adminPass   = $env:ADMIN_PASS    # Vagrant123!
$domainDN    = ($domain -split '\.' | ForEach-Object { "DC=$_" }) -join ','  # DC=lab,DC=local

Import-Module ActiveDirectory

# ── Wait for AD to be fully ready ─────────────────────────────────────────────
Write-Host "[*] Waiting for AD services to be ready..."
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
    try {
        Get-ADDomain | Out-Null
        Write-Host "[+] AD is ready."
        break
    } catch {
        Start-Sleep -Seconds 10
    }
}

# ── 1. Create Organisational Units ────────────────────────────────────────────
Write-Host "[*] Creating OUs..."
$ous = @(
    @{ Name = "Corp";            Path = $domainDN },
    @{ Name = "Users";           Path = "OU=Corp,$domainDN" },
    @{ Name = "Computers";       Path = "OU=Corp,$domainDN" },
    @{ Name = "ServiceAccounts"; Path = "OU=Corp,$domainDN" },
    @{ Name = "Groups";          Path = "OU=Corp,$domainDN" }
)
foreach ($ou in $ous) {
    New-ADOrganizationalUnit -Name $ou.Name -Path $ou.Path -ErrorAction SilentlyContinue
}

$userOU = "OU=Users,OU=Corp,$domainDN"
$svcOU  = "OU=ServiceAccounts,OU=Corp,$domainDN"
$grpOU  = "OU=Groups,OU=Corp,$domainDN"

# ── 2. Create users ────────────────────────────────────────────────────────────
Write-Host "[*] Creating lab users..."

# [VULN] alice.jones — AS-REP roastable (Kerberos pre-auth disabled)
# [VULN] dave.brown  — password visible in Description field
# [VULN] svc_*       — all have SPNs set (Kerberoastable)
$users = @(
    [pscustomobject]@{
        Sam  = "alice.jones"; Pass = "Password123!"; Path = $userOU
        Desc = "Finance Manager"; ASREP = $true; SPN = $null
    },
    [pscustomobject]@{
        Sam  = "bob.smith"; Pass = "Password123!"; Path = $userOU
        Desc = "IT Support"; ASREP = $false; SPN = $null
    },
    [pscustomobject]@{
        Sam  = "carol.white"; Pass = "Summer2024!"; Path = $userOU
        Desc = "Senior Sysadmin"; ASREP = $false; SPN = $null
    },
    [pscustomobject]@{
        # [VULN] Password stored in Description — discovered via LDAP enum
        Sam  = "dave.brown"; Pass = "Password123!"; Path = $userOU
        Desc = "Dev temp pass:Dave2024!"; ASREP = $false; SPN = $null
    },
    [pscustomobject]@{
        Sam  = "svc_sql"; Pass = "Sqlpass1!"; Path = $svcOU
        Desc = "SQL Server Service Account"; ASREP = $false
        SPN  = "MSSQLSvc/SRV01.$($domain):1433"
    },
    [pscustomobject]@{
        Sam  = "svc_backup"; Pass = "Backup123!"; Path = $svcOU
        Desc = "Backup Service Account"; ASREP = $false
        SPN  = "BackupSvc/SRV01.$($domain)"
    },
    [pscustomobject]@{
        Sam  = "svc_iis"; Pass = "IISservice1!"; Path = $svcOU
        Desc = "IIS Application Pool Identity"; ASREP = $false
        SPN  = "HTTP/SRV01.$($domain)"
    },
    # [VULN] helpdesk — ForceChangePassword over standard users
    [pscustomobject]@{
        Sam  = "helpdesk"; Pass = "Helpdesk1!"; Path = $userOU
        Desc = "IT Helpdesk - resets user passwords"; ASREP = $false; SPN = $null
    },
    # [VULN] svc_web — constrained delegation + protocol transition (S4U2Self)
    # Attack: control svc_web → S4U2Self any user → S4U2Proxy to CIFS/SRV01
    [pscustomobject]@{
        Sam  = "svc_web"; Pass = "Webpass1!"; Path = $svcOU
        Desc = "Web Application Pool — constrained delegation to SRV01"; ASREP = $false
        SPN  = "HTTP/WS01.$($domain)"
    },
    # [VULN] svc_unconstrained — UNCONSTRAINED delegation
    # Any user/computer that authenticates to this service sends their full TGT.
    # Attack path:
    #   1. Get code exec as svc_unconstrained (via cred spray, abuse, etc.)
    #   2. Trigger PrinterBug/PetitPotam against DC01 → DC01 sends TGT to this host
    #   3. Harvest TGT with Rubeus monitor → pass-the-ticket as DC01$ → DCSync
    [pscustomobject]@{
        Sam  = "svc_unconstrained"; Pass = "Uncon1!"; Path = $svcOU
        Desc = "Legacy integration service — do not modify delegation"; ASREP = $false
        SPN  = "HOST/SRV01.$($domain)"
    }
)

foreach ($u in $users) {
    $secPass = ConvertTo-SecureString $u.Pass -AsPlainText -Force
    try {
        New-ADUser `
            -Name                 $u.Sam `
            -SamAccountName       $u.Sam `
            -UserPrincipalName    "$($u.Sam)@$domain" `
            -Path                 $u.Path `
            -AccountPassword      $secPass `
            -Enabled              $true `
            -Description          $u.Desc `
            -PasswordNeverExpires $true `
            -ErrorAction Stop
        Write-Host "  [+] Created: $($u.Sam)"
    } catch {
        Write-Host "  [!] $($u.Sam) may already exist — skipping."
    }

    # [VULN] AS-REP roasting: disable Kerberos pre-authentication
    if ($u.ASREP) {
        Set-ADAccountControl -Identity $u.Sam -DoesNotRequirePreAuth $true
        Write-Host "  [VULN] AS-REP roastable: $($u.Sam)"
    }

    # [VULN] Kerberoasting: set SPN on service accounts
    if ($u.SPN) {
        Set-ADUser -Identity $u.Sam -ServicePrincipalNames @{ Add = $u.SPN }
        Write-Host "  [VULN] Kerberoastable SPN: $($u.Sam) -> $($u.SPN)"
    }
}

# IT Admins group — carol.white is a member
New-ADGroup -Name "IT Admins" -GroupScope Global -Path $grpOU -ErrorAction SilentlyContinue
Add-ADGroupMember -Identity "IT Admins" -Members "carol.white" -ErrorAction SilentlyContinue
Write-Host "  [+] IT Admins group created, carol.white added"

# ── 3. Disable password complexity for easy lab passwords ─────────────────────
Write-Host "[*] Relaxing domain password policy for lab..."
Set-ADDefaultDomainPasswordPolicy -Identity $domain `
    -PasswordHistoryCount 0 `
    -MaxPasswordAge 0 `
    -MinPasswordAge 0 `
    -MinPasswordLength 4 `
    -ComplexityEnabled $false `
    -ErrorAction SilentlyContinue

# ── 4. Disable SMB signing ─────────────────────────────────────────────────────
# [VULN] Enables NTLM relay attacks (Responder, ntlmrelayx)
Write-Host "[*] Disabling SMB signing (enables relay attacks)..."
Set-SmbServerConfiguration -RequireSecuritySignature $false -EnableSecuritySignature $false -Force -ErrorAction SilentlyContinue
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" -Name "RequireSecuritySignature" -Value 0
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" -Name "EnableSecuritySignature"  -Value 0

# ── 5. Install ADCS with ESC1-vulnerable template ──────────────────────────────
Write-Host "[*] Installing Active Directory Certificate Services (ADCS)..."
Install-WindowsFeature -Name ADCS-Cert-Authority, ADCS-Web-Enrollment -IncludeManagementTools | Out-Null

$caName = "$domainShort-CA"
try {
    Install-AdcsCertificationAuthority `
        -CAType              EnterpriseRootCA `
        -CACommonName        $caName `
        -KeyLength           2048 `
        -HashAlgorithmName   SHA256 `
        -ValidityPeriod      Years `
        -ValidityPeriodUnits 10 `
        -Force `
        -WarningAction SilentlyContinue | Out-Null
    Write-Host "  [+] CA installed: $caName"
} catch {
    Write-Host "  [!] CA install error (may already exist): $_"
}

try {
    Install-AdcsWebEnrollment -Force -WarningAction SilentlyContinue | Out-Null
    Write-Host "  [+] Web Enrollment installed"
} catch { }

# [VULN] Create ESC1 vulnerable template:
#   - CT_FLAG_ENROLLEE_SUPPLIES_SUBJECT (msPKI-Certificate-Name-Flag = 1)
#   - Domain Users have Enroll permission
#   → Allows any domain user to request a cert for Administrator
Write-Host "[*] Creating ESC1-vulnerable certificate template..."

$configCtx   = (Get-ADRootDSE).configurationNamingContext
$templatesDN = "CN=Certificate Templates,CN=Public Key Services,CN=Services,$configCtx"
$srcDN       = "CN=User,$templatesDN"
$vulnName    = "VulnTemplate"
$vulnDN      = "CN=$vulnName,$templatesDN"

if (-not ([adsi]::Exists("LDAP://$vulnDN"))) {
    try {
        $srcEntry = [adsi]"LDAP://$srcDN"
        $parent   = [adsi]"LDAP://$templatesDN"
        $newEntry = $parent.Create("pKICertificateTemplate", "CN=$vulnName")

        # Copy base attributes from the User template
        foreach ($attr in @(
            "flags", "revision", "pKIDefaultKeySpec", "pKIKeyUsage",
            "pKIMaxIssuingDepth", "pKICriticalExtensions", "pKIExtendedKeyUsage",
            "pKIDefaultCSPs", "msPKI-RA-Signature", "msPKI-Enrollment-Flag",
            "msPKI-Private-Key-Flag", "msPKI-Certificate-Application-Policy",
            "msPKI-Minimal-Key-Size"
        )) {
            $val = $srcEntry.Properties[$attr].Value
            if ($null -ne $val) { $newEntry.Put($attr, $val) }
        }

        $newEntry.Put("displayName",                  $vulnName)
        $newEntry.Put("cn",                           $vulnName)
        # [VULN] ESC1: ENROLLEE_SUPPLIES_SUBJECT lets the requester specify any SAN
        $newEntry.Put("msPKI-Certificate-Name-Flag",  1)
        # Validity 1 year
        $newEntry.Put("pKIExpirationPeriod", [byte[]](0, 64, 57, 135, 46, 225, 254, 255))
        $newEntry.Put("pKIOverlapPeriod",    [byte[]](0, 128, 166, 10, 255, 222, 255, 255))
        $newEntry.SetInfo()

        # Grant Domain Users the Enroll extended right
        $domainSid     = (Get-ADDomain).DomainSID
        $domUsersSid   = New-Object System.Security.Principal.SecurityIdentifier(
            [System.Security.Principal.WellKnownSidType]::AccountDomainUsersSid, $domainSid)
        $enrollGuid    = [guid]"0e10c968-78fb-11d2-90d4-00c04f79dc55"
        $ace           = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
            $domUsersSid,
            [System.DirectoryServices.ActiveDirectoryRights]"ExtendedRight",
            [System.Security.AccessControl.AccessControlType]"Allow",
            $enrollGuid)

        $newEntry.ObjectSecurity.AddAccessRule($ace)
        $newEntry.CommitChanges()
        Write-Host "  [VULN] ESC1 template created: $vulnName"

        # Publish the template to the CA
        $caEntry = [adsi]"LDAP://CN=$caName,CN=Enrollment Services,CN=Public Key Services,CN=Services,$configCtx"
        $caEntry.Properties["certificateTemplates"].Add($vulnName) | Out-Null
        $caEntry.CommitChanges()
        Write-Host "  [+] Template published to CA"
    } catch {
        Write-Host "  [!] Template creation failed: $_"
    }
} else {
    Write-Host "  [*] VulnTemplate already exists — skipping."
}

# ── 6. ACL misconfiguration: carol.white has GenericAll over svc_sql ──────────
# [VULN] carol.white can reset svc_sql password, add SPNs, etc.
Write-Host "[*] Adding ACL misconfiguration (carol.white GenericAll -> svc_sql)..."
try {
    $carolSid  = (Get-ADUser "carol.white").SID
    $svcSqlDN  = (Get-ADUser "svc_sql").DistinguishedName
    $svcSqlObj = [adsi]"LDAP://$svcSqlDN"
    $identity  = New-Object System.Security.Principal.SecurityIdentifier($carolSid)
    $ace       = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
        $identity,
        [System.DirectoryServices.ActiveDirectoryRights]"GenericAll",
        [System.Security.AccessControl.AccessControlType]"Allow")
    $svcSqlObj.ObjectSecurity.AddAccessRule($ace)
    $svcSqlObj.CommitChanges()
    Write-Host "  [VULN] carol.white now has GenericAll over svc_sql"
} catch {
    Write-Host "  [!] ACL misconfiguration failed: $_"
}

# ── 7. Unconstrained delegation ───────────────────────────────────────────────────────────
Write-Host "[*] Setting unconstrained delegation on svc_unconstrained..."
try {
    Set-ADUser -Identity "svc_unconstrained" -TrustedForDelegation $true
    Write-Host "  [VULN] svc_unconstrained: TrustedForDelegation = True"
    Write-Host "         Attack: PrinterBug/PetitPotam coerce DC01 auth → steal DC TGT → DCSync"
} catch {
    Write-Host "  [!] svc_unconstrained delegation failed: $_"
}

# Also set unconstrained delegation on the SRV01 computer account
# (Realistic: older servers often have this set for legacy app compatibility)
Write-Host "[*] Setting unconstrained delegation on SRV01 computer account..."
try {
    $srv01 = Get-ADComputer "SRV01" -ErrorAction SilentlyContinue
    if ($srv01) {
        Set-ADComputer -Identity "SRV01" -TrustedForDelegation $true
        Write-Host "  [VULN] SRV01$: TrustedForDelegation = True (computer account)"
        Write-Host "         Attack: any auth to any service on SRV01 → TGT cached → impersonate"
    } else {
        Write-Host "  [*] SRV01 not yet in AD — skipping (will be set once SRV01 joins)"
    }
} catch {
    Write-Host "  [!] SRV01 unconstrained delegation failed: $_"
}

# ── 8. helpdesk — ForceChangePassword over alice.jones and bob.smith ──────────
# [VULN] helpdesk account can reset passwords without knowing current password
Write-Host "[*] Granting helpdesk ForceChangePassword over alice.jones and bob.smith..."
try {
    $hdSid    = (Get-ADUser "helpdesk").SID
    $identity = New-Object System.Security.Principal.SecurityIdentifier($hdSid)
    # ForceChangePassword extended right GUID
    $resetPwdGuid = [guid]"00299570-246d-11d0-a768-00aa006e0529"
    foreach ($targetUser in @("alice.jones", "bob.smith")) {
        $targetDN  = (Get-ADUser $targetUser).DistinguishedName
        $targetObj = [adsi]"LDAP://$targetDN"
        $ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
            $identity,
            [System.DirectoryServices.ActiveDirectoryRights]"ExtendedRight",
            [System.Security.AccessControl.AccessControlType]"Allow",
            $resetPwdGuid)
        $targetObj.ObjectSecurity.AddAccessRule($ace)
        $targetObj.CommitChanges()
        Write-Host "  [VULN] helpdesk → ForceChangePassword on $targetUser"
    }
} catch {
    Write-Host "  [!] ForceChangePassword ACL failed: $_"
}

# ── 8. Constrained delegation ─────────────────────────────────────────────────
# [VULN] svc_iis: constrained delegation (no protocol transition)
# Attack: TGT for svc_iis → S4U2Proxy → TGS for CIFS/SRV01 as any user
Write-Host "[*] Configuring constrained delegation: svc_iis → CIFS/SRV01..."
try {
    Set-ADUser -Identity "svc_iis" `
        -Add @{ "msDS-AllowedToDelegateTo" = "cifs/SRV01.$domain", "cifs/SRV01" }
    Set-ADAccountControl -Identity "svc_iis" -TrustedToAuthForDelegation $false
    Write-Host "  [VULN] svc_iis constrained delegation → cifs/SRV01.$domain"
} catch {
    Write-Host "  [!] svc_iis constrained delegation failed: $_"
}

# [VULN] svc_web: constrained delegation + protocol transition (S4U2Self)
# TrustedToAuthForDelegation = protocol transition: svc_web gets ticket for ANY user
Write-Host "[*] Configuring svc_web constrained delegation with protocol transition (S4U2Self)..."
try {
    Set-ADUser -Identity "svc_web" `
        -Add @{ "msDS-AllowedToDelegateTo" = "cifs/SRV01.$domain", "cifs/SRV01" }
    Set-ADAccountControl -Identity "svc_web" -TrustedToAuthForDelegation $true
    Write-Host "  [VULN] svc_web: S4U2Self + S4U2Proxy → cifs/SRV01.$domain (any user)"
} catch {
    Write-Host "  [!] svc_web delegation failed: $_"
}

# ── 9. DCSync rights for bob.smith ────────────────────────────────────────────
# [VULN] bob.smith can replicate directory changes → full DCSync without Domain Admin
# Attack: secretsdump.py -just-dc LAB/bob.smith@DC01
Write-Host "[*] Granting bob.smith DCSync rights..."
try {
    $domainRoot = "AD:\$domainDN"
    $domainAcl  = Get-Acl -Path $domainRoot
    $bobSid     = (Get-ADUser "bob.smith").SID
    $identity   = New-Object System.Security.Principal.SecurityIdentifier($bobSid)
    # DS-Replication-Get-Changes
    $ace1 = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
        $identity, "ExtendedRight", "Allow",
        [guid]"1131f6aa-9c07-11d1-f79f-00c04fc2dcd2")
    # DS-Replication-Get-Changes-All
    $ace2 = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
        $identity, "ExtendedRight", "Allow",
        [guid]"1131f6ad-9c07-11d1-f79f-00c04fc2dcd2")
    $domainAcl.AddAccessRule($ace1)
    $domainAcl.AddAccessRule($ace2)
    Set-Acl -Path $domainRoot -AclObject $domainAcl
    Write-Host "  [VULN] bob.smith → DCSync (DS-Replication-Get-Changes + Get-Changes-All)"
    Write-Host "         Attack: secretsdump.py 'LAB/bob.smith:Password123!@192.168.56.10'"
} catch {
    Write-Host "  [!] DCSync rights failed: $_"
}

# ── 10. AdminSDHolder ACL — carol.white ───────────────────────────────────────
# [VULN] carol.white gets GenericAll on AdminSDHolder container.
# SDProp runs every 60 min → propagates her rights to ALL protected objects
# (Domain Admins, Administrator, Schema Admins, Backup Operators, etc.)
Write-Host "[*] Adding carol.white GenericAll to AdminSDHolder..."
try {
    $adminSDHolderDN  = "CN=AdminSDHolder,CN=System,$domainDN"
    $adminSDHolderObj = [adsi]"LDAP://$adminSDHolderDN"
    $carolSid  = (Get-ADUser "carol.white").SID
    $identity  = New-Object System.Security.Principal.SecurityIdentifier($carolSid)
    $ace       = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
        $identity,
        [System.DirectoryServices.ActiveDirectoryRights]"GenericAll",
        [System.Security.AccessControl.AccessControlType]"Allow")
    $adminSDHolderObj.ObjectSecurity.AddAccessRule($ace)
    $adminSDHolderObj.CommitChanges()
    Write-Host "  [VULN] carol.white → GenericAll on AdminSDHolder"
    Write-Host "         Wait 60 min (or Invoke-SDPropagator) for rights to hit Domain Admins"
} catch {
    Write-Host "  [!] AdminSDHolder ACL failed: $_"
}

# ── 11. ADCS ESC4 — writeable template ────────────────────────────────────────
# [VULN] Domain Users have GenericWrite on this template
# Attack: modify template to add ENROLLEE_SUPPLIES_SUBJECT → becomes ESC1
Write-Host "[*] Creating ADCS ESC4 vulnerable template (WritableCertTemplate)..."
$configCtx   = (Get-ADRootDSE).configurationNamingContext
$templatesDN = "CN=Certificate Templates,CN=Public Key Services,CN=Services,$configCtx"
$caName      = "$domainShort-CA"
$esc4Name    = "WritableCertTemplate"
$esc4DN      = "CN=$esc4Name,$templatesDN"
if (-not ([adsi]::Exists("LDAP://$esc4DN"))) {
    try {
        $srcEntry = [adsi]"LDAP://CN=User,$templatesDN"
        $parent   = [adsi]"LDAP://$templatesDN"
        $newEntry = $parent.Create("pKICertificateTemplate", "CN=$esc4Name")
        foreach ($attr in @(
            "flags","revision","pKIDefaultKeySpec","pKIKeyUsage","pKIMaxIssuingDepth",
            "pKICriticalExtensions","pKIExtendedKeyUsage","pKIDefaultCSPs",
            "msPKI-RA-Signature","msPKI-Enrollment-Flag","msPKI-Private-Key-Flag",
            "msPKI-Certificate-Application-Policy","msPKI-Minimal-Key-Size"
        )) {
            $val = $srcEntry.Properties[$attr].Value
            if ($null -ne $val) { $newEntry.Put($attr, $val) }
        }
        $newEntry.Put("displayName",                 $esc4Name)
        $newEntry.Put("cn",                          $esc4Name)
        $newEntry.Put("msPKI-Certificate-Name-Flag", 0)   # NOT ESC1 by default
        $newEntry.Put("pKIExpirationPeriod", [byte[]](0, 64, 57, 135, 46, 225, 254, 255))
        $newEntry.Put("pKIOverlapPeriod",    [byte[]](0, 128, 166, 10, 255, 222, 255, 255))
        $newEntry.SetInfo()
        # Grant Domain Users GenericWrite — they can now modify the template to ESC1
        $domainSid   = (Get-ADDomain).DomainSID
        $domUsersSid = New-Object System.Security.Principal.SecurityIdentifier(
            [System.Security.Principal.WellKnownSidType]::AccountDomainUsersSid, $domainSid)
        $aceWrite = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
            $domUsersSid,
            [System.DirectoryServices.ActiveDirectoryRights]"GenericWrite",
            [System.Security.AccessControl.AccessControlType]"Allow")
        $aceEnroll = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
            $domUsersSid,
            [System.DirectoryServices.ActiveDirectoryRights]"ExtendedRight",
            [System.Security.AccessControl.AccessControlType]"Allow",
            [guid]"0e10c968-78fb-11d2-90d4-00c04f79dc55")
        $newEntry.ObjectSecurity.AddAccessRule($aceWrite)
        $newEntry.ObjectSecurity.AddAccessRule($aceEnroll)
        $newEntry.CommitChanges()
        # Publish the template to the CA
        $caEntry = [adsi]"LDAP://CN=$caName,CN=Enrollment Services,CN=Public Key Services,CN=Services,$configCtx"
        $caEntry.Properties["certificateTemplates"].Add($esc4Name) | Out-Null
        $caEntry.CommitChanges()
        Write-Host "  [VULN] ESC4 template: $esc4Name — Domain Users have GenericWrite"
        Write-Host "         Attack: modify template to set ENROLLEE_SUPPLIES_SUBJECT → ESC1"
    } catch {
        Write-Host "  [!] ESC4 template creation failed: $_"
    }
} else {
    Write-Host "  [*] WritableCertTemplate already exists — skipping."
}

# ── 12. ADCS ESC6 — CA flag EDITF_ATTRIBUTESUBJECTALTNAME2 ───────────────────
# [VULN] This flag makes ALL templates effectively ESC1-vulnerable
# Any user who can enroll can specify an arbitrary SAN (impersonate anyone)
Write-Host "[*] Enabling EDITF_ATTRIBUTESUBJECTALTNAME2 on CA (ESC6)..."
try {
    certutil -setreg "CA\EditFlags" +EDITF_ATTRIBUTESUBJECTALTNAME2 2>&1 | Out-Null
    Restart-Service CertSvc -ErrorAction SilentlyContinue
    Write-Host "  [VULN] ESC6: EDITF_ATTRIBUTESUBJECTALTNAME2 enabled on $domainShort-CA"
    Write-Host "         Any enrollable template accepts attacker-supplied SAN now"
} catch {
    Write-Host "  [!] ESC6 flag failed: $_"
}

# ── 13. GPO abuse — IT Admins have GenericWrite on domain GPO ─────────────────
# [VULN] carol.white (IT Admins) can modify the GPO → code exec on all OUs=Corp machines
Write-Host "[*] Creating GPO with IT Admins write access..."
try {
    Import-Module GroupPolicy -ErrorAction SilentlyContinue
    $gpo = New-GPO -Name "LabSecurityPolicy" -ErrorAction Stop
    New-GPLink -Name "LabSecurityPolicy" -Target "OU=Corp,$domainDN" -ErrorAction SilentlyContinue
    $gpoPath  = "AD:\CN={$($gpo.Id)},CN=Policies,CN=System,$domainDN"
    $gpoAcl   = Get-Acl -Path $gpoPath -ErrorAction SilentlyContinue
    $itAdmSid = (Get-ADGroup "IT Admins").SID
    $identity = New-Object System.Security.Principal.SecurityIdentifier($itAdmSid)
    $ace      = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
        $identity, "GenericWrite", "Allow")
    if ($gpoAcl) {
        $gpoAcl.AddAccessRule($ace)
        Set-Acl -Path $gpoPath -AclObject $gpoAcl -ErrorAction SilentlyContinue
        Write-Host "  [VULN] IT Admins → GenericWrite on LabSecurityPolicy GPO (linked OU=Corp)"
        Write-Host "         Attack: carol.white modifies GPO → immediate-start script → SYSTEM"
    }
} catch {
    Write-Host "  [!] GPO abuse setup failed: $_"
}

# ── 14. RBCD on WS01 — SRV01 machine account can delegate ────────────────────
# [VULN] Resource-Based Constrained Delegation
# msDS-AllowedToActOnBehalfOfOtherIdentity on WS01 set for SRV01$
# Attack: relay or coerce → abuse RBCD → impersonate Domain Admin to WS01 CIFS
# NOTE: Only works after SRV01 and WS01 have completed domain join.
Write-Host "[*] Configuring RBCD: SRV01 machine account can delegate to WS01..."
try {
    $srv01Acct = Get-ADComputer "SRV01" -ErrorAction SilentlyContinue
    $ws01Acct  = Get-ADComputer "WS01"  -ErrorAction SilentlyContinue
    if ($srv01Acct -and $ws01Acct) {
        $rawSD = New-Object Security.AccessControl.RawSecurityDescriptor(
            "O:BAD:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;$($srv01Acct.SID))")
        $descriptor = New-Object byte[] ($rawSD.BinaryLength)
        $rawSD.GetBinaryForm($descriptor, 0)
        Set-ADComputer -Identity "WS01" `
            -Replace @{ "msDS-AllowedToActOnBehalfOfOtherIdentity" = $descriptor }
        Write-Host "  [VULN] RBCD: SRV01$ → WS01 — impersonate any user to CIFS/WS01"
    } else {
        Write-Host "  [*] SRV01 and/or WS01 not yet in AD — RBCD will be set once they join"
        Write-Host "      Re-run after all VMs are up: vagrant provision dc01 --provision-with post"
    }
} catch {
    Write-Host "  [!] RBCD configuration failed: $_"
}

# ── 15. Print Spooler running on DC01 ─────────────────────────────────────────
# [VULN] PrinterBug / SpoolSample → coerce DC01 to authenticate to attacker
# Combined with unconstrained delegation: capture DC TGT → Golden Ticket
Write-Host "[*] Ensuring Print Spooler is running on DC01 (PrinterBug)..."
Set-Service  -Name Spooler -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service -Name Spooler -ErrorAction SilentlyContinue
Write-Host "  [VULN] Print Spooler running on DC01 — PrinterBug / SpoolSample target"

# ── 16. Conditional DNS forwarder for child.lab.local → DC02 ─────────────────
# Pre-configured so DC01 resolves child.lab.local from the moment DC02 is up
Write-Host "[*] Adding conditional forwarder: child.lab.local → 192.168.56.11..."
try {
    Add-DnsServerConditionalForwarderZone `
        -Name             "child.lab.local" `
        -MasterServers    "192.168.56.11" `
        -ReplicationScope "Forest" `
        -ErrorAction SilentlyContinue
    Write-Host "  [+] Forwarder set: child.lab.local → 192.168.56.11 (DC02)"
} catch {
    Write-Host "  [*] Forwarder may already exist (DNS delegation) — OK"
}

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================================"
Write-Host "  DC01 — Lab Fully Provisioned (Extended)"
Write-Host "================================================================"
Write-Host "  Domain:  $domain   DC IP: 192.168.56.10"
Write-Host ""
Write-Host "  === Accounts ==="
Write-Host "  Administrator:  Vagrant123!"
Write-Host "  alice.jones:    Password123!   [AS-REP roastable]"
Write-Host "  bob.smith:      Password123!   [DCSync rights]"
Write-Host "  carol.white:    Summer2024!    [IT Admin | GenericAll svc_sql | AdminSDHolder | GPO write]"
Write-Host "  dave.brown:     Password123!   [password in Description]"
Write-Host "  helpdesk:       Helpdesk1!     [ForceChangePassword over alice + bob]"
Write-Host "  svc_sql:        Sqlpass1!      [Kerberoastable — MSSQLSvc SPN]"
Write-Host "  svc_backup:     Backup123!     [Kerberoastable]"
Write-Host "  svc_iis:        IISservice1!   [Kerberoastable | Constrained Deleg → CIFS/SRV01]"
Write-Host "  svc_web:        Webpass1!      [Kerberoastable | S4U2Self+Proxy → CIFS/SRV01]"
Write-Host "  svc_unconstrained: Uncon1!     [Kerberoastable | UNCONSTRAINED delegation]"
Write-Host "  SRV01$:                        [Computer account | UNCONSTRAINED delegation]"
Write-Host ""
Write-Host "  === ADCS (http://192.168.56.10/certsrv/) ==="
Write-Host "  ESC1: VulnTemplate          — Domain Users specify arbitrary SAN"
Write-Host "  ESC4: WritableCertTemplate  — Domain Users have GenericWrite"
Write-Host "  ESC6: EDITF_ATTRIBUTESUBJECTALTNAME2 enabled on CA"
Write-Host "  ESC8: Web Enrollment NTLM relay endpoint active"
Write-Host ""
Write-Host "  === AD Attack Paths ==="
Write-Host "  DCSync:         bob.smith (secretsdump without DA)"
Write-Host "  AdminSDHolder:  carol.white GenericAll → wait 60min → control DA group"
Write-Host "  GenericAll ACL: carol.white → svc_sql"
Write-Host "  ForceChangePwd: helpdesk → alice.jones, bob.smith"
Write-Host "  Constrained:    svc_iis → CIFS/SRV01 | svc_web → CIFS/SRV01 (S4U)"
Write-Host "  RBCD:           SRV01$ → WS01 (impersonate DA to CIFS/WS01)"
Write-Host "  PrinterBug:     DC01 spooler running — coerce auth to attacker"
Write-Host "  GPO Abuse:      carol.white GenericWrite on LabSecurityPolicy (OU=Corp)"
Write-Host "  SMB signing:    DISABLED"
Write-Host "================================================================"
