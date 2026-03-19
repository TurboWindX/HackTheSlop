// Lab scenario definitions for the TurboPentest AD lab
// Each scenario corresponds to a Vagrantfile in lab/scenarios/<id>/

export type ScenarioVM = {
  name: string;
  ip: string;
  role: string;
};

export type ScenarioTechnique = {
  category: string;
  items: string[];
};

export type ScenarioAccount = {
  user: string;
  pass: string;
  vuln: string;
};

export type AssumedBreach = {
  user: string;
  pass: string;
  domain: string;
  note: string;
};

export type Scope = {
  description: string;   // e.g. "192.168.56.0/24 (host-only)"
  ranges: string[];      // individual hosts/ranges with labels
};

export type LabScenario = {
  id: string;
  name: string;
  tagline: string;
  color: string;           // CSS color token
  vms: ScenarioVM[];
  ramGB: number;
  provisionMinutes: number;
  techniques: ScenarioTechnique[];
  accounts: ScenarioAccount[];
  assumedBreach: AssumedBreach;  // starting creds for assumed-breach scenario
  scope: Scope;                  // IP scope for the engagement
  launchDir: string;             // relative to lab/ dir
  tools: string[];               // recommended attack tools
};

export const labScenarios: LabScenario[] = [
  {
    id: 'kerberos-basics',
    name: 'Ticket Forge',
    tagline: 'AS-REP Roasting, Kerberoasting, delegation chains, Golden/Silver tickets',
    color: 'var(--blue)',
    vms: [
      { name: 'DC01', ip: '192.168.56.10', role: 'Domain Controller / DNS' },
      { name: 'WS01', ip: '192.168.56.30', role: 'Domain Workstation (foothold)' },
    ],
    ramGB: 6,
    provisionMinutes: 25,
    techniques: [
      {
        category: 'Roasting',
        items: [
          'AS-REP Roasting — alice.jones (pre-auth disabled)',
          'Kerberoasting — svc_sql, svc_iis, svc_web, svc_unconstrained',
        ],
      },
      {
        category: 'Delegation',
        items: [
          'Unconstrained delegation — svc_unconstrained + PrinterBug → steal DC01 TGT',
          'Constrained delegation — svc_iis → CIFS/SRV01',
          'S4U2Self + S4U2Proxy — svc_web → impersonate any user → CIFS/SRV01',
        ],
      },
      {
        category: 'Ticket Attacks',
        items: [
          'Golden Ticket — forge TGT with krbtgt NTLM hash',
          'Silver Ticket — forge TGS for specific service SPN',
          'Pass-the-Ticket — inject TGT/TGS, move laterally',
        ],
      },
    ],
    accounts: [
      { user: 'alice.jones', pass: 'Password123!', vuln: 'AS-REP roastable' },
      { user: 'svc_sql', pass: 'Sqlpass1!', vuln: 'Kerberoastable (MSSQLSvc SPN)' },
      { user: 'svc_unconstrained', pass: 'Uncon1!', vuln: 'Unconstrained delegation' },
      { user: 'svc_web', pass: 'Webpass1!', vuln: 'S4U2Self+Proxy' },
      { user: 'Administrator', pass: 'Vagrant123!', vuln: 'Domain Admin' },
    ],
    launchDir: 'scenarios/kerberos-basics',
    tools: ['Rubeus', 'Impacket', 'certipy', 'BloodHound', 'hashcat / john'],
    assumedBreach: {
      user: 'dave.brown',
      pass: 'Password123!',
      domain: 'TURBO',
      note: 'Low-priv domain user. Password found in their AD Description field — classic IT mistake.',
    },
    scope: {
      description: '192.168.56.0/24 (host-only)',
      ranges: ['192.168.56.10 — DC01 (turbo.lab)', '192.168.56.30 — WS01'],
    },
  },

  {
    id: 'adcs-deep-dive',
    name: 'Certifried',
    tagline: 'ESC1–ESC8, certificate theft, PKINIT, enrollment agent abuse',
    color: 'var(--yellow)',
    vms: [
      { name: 'DC01', ip: '192.168.56.10', role: 'Domain Controller + CA (LAB-CA)' },
      { name: 'WS01', ip: '192.168.56.30', role: 'Domain Workstation' },
    ],
    ramGB: 6,
    provisionMinutes: 30,
    techniques: [
      {
        category: 'Template Abuse',
        items: [
          'ESC1 — VulnTemplate: ENROLLEE_SUPPLIES_SUBJECT, any user → admin cert',
          'ESC2 — AnyPurposeTemplate: no EKU restriction, usable as sub-CA',
          'ESC3 — EnrollmentAgentTemplate: request cert on behalf of any principal',
          'ESC4 — WritableCertTemplate: Domain Users have GenericWrite → modify to ESC1',
        ],
      },
      {
        category: 'CA Misconfiguration',
        items: [
          'ESC6 — EDITF_ATTRIBUTESUBJECTALTNAME2 flag: ALL templates accept attacker SAN',
          'ESC7 — carol.white has Manage CA + Manage Certificates rights',
          'ESC8 — Web Enrollment NTLM relay endpoint (http://DC01/certsrv/)',
        ],
      },
      {
        category: 'Post-Cert Exploitation',
        items: [
          'Cert theft — export certs with private keys (certutil, SharpDPAPI)',
          'PKINIT auth — use cert to get TGT without password',
          'Shadow Credentials — write msDS-KeyCredentialLink → PKINIT as any user',
        ],
      },
    ],
    accounts: [
      { user: 'carol.white', pass: 'Summer2024!', vuln: 'Manage CA (ESC7)' },
      { user: 'alice.jones', pass: 'Password123!', vuln: 'Domain User — can enroll all templates' },
      { user: 'Administrator', pass: 'Vagrant123!', vuln: 'Target for cert impersonation' },
    ],
    launchDir: 'scenarios/adcs-deep-dive',
    tools: ['certipy', 'Certify', 'Rubeus (asktgt)', 'ntlmrelayx', 'BloodHound'],
    assumedBreach: {
      user: 'alice.jones',
      pass: 'Password123!',
      domain: 'TURBO',
      note: 'Domain user with default enrollment rights on all ADCS templates — start here to abuse ESC1+.',
    },
    scope: {
      description: '192.168.56.0/24 (host-only)',
      ranges: ['192.168.56.10 — DC01 (turbo.lab + LAB-CA)', '192.168.56.30 — WS01'],
    },
  },

  {
    id: 'acl-abuse',
    name: 'Inherited Sins',
    tagline: 'GenericAll, DCSync, AdminSDHolder, ForceChangePwd, GPO abuse, RBCD',
    color: 'var(--purple, #bc8cff)',
    vms: [
      { name: 'DC01', ip: '192.168.56.10', role: 'Domain Controller (target)' },
      { name: 'WS01', ip: '192.168.56.30', role: 'Domain Workstation (foothold)' },
    ],
    ramGB: 6,
    provisionMinutes: 25,
    techniques: [
      {
        category: 'Object-Level ACLs',
        items: [
          'GenericAll — carol.white → svc_sql (reset pass, modify SPNs)',
          'ForceChangePassword — helpdesk → alice.jones, bob.smith',
          'DCSync — bob.smith (DS-Replication-Get-Changes*) → all hashes',
        ],
      },
      {
        category: 'Domain-Level ACLs',
        items: [
          'AdminSDHolder — carol.white GenericAll; SDProp propagates to all DA-protected objects',
          'WriteDACL escalation — modify domain root DACL → grant own DCSync',
          'GPO abuse — carol.white (IT Admins) GenericWrite on LabSecurityPolicy → code exec on OU=Corp',
        ],
      },
      {
        category: 'Computer-Level ACLs',
        items: [
          'RBCD — SRV01$ has msDS-AllowedToActOnBehalfOfOtherIdentity on WS01',
          'Relay/coerce to WS01 → RBCD → impersonate DA to CIFS/WS01',
        ],
      },
    ],
    accounts: [
      { user: 'carol.white', pass: 'Summer2024!', vuln: 'GenericAll→svc_sql | AdminSDHolder | GPO write' },
      { user: 'bob.smith', pass: 'Password123!', vuln: 'DCSync rights' },
      { user: 'helpdesk', pass: 'Helpdesk1!', vuln: 'ForceChangePassword on alice + bob' },
      { user: 'dave.brown', pass: 'Password123!', vuln: 'Real pass in Description field' },
    ],
    launchDir: 'scenarios/acl-abuse',
    tools: ['PowerView', 'BloodHound', 'Impacket secretsdump', 'dacledit.py', 'pywhisker'],
    assumedBreach: {
      user: 'carol.white',
      pass: 'Summer2024!',
      domain: 'TURBO',
      note: 'User with GenericAll over svc_sql and AdminSDHolder rights — pull the ACL chain from here.',
    },
    scope: {
      description: '192.168.56.0/24 (host-only)',
      ranges: ['192.168.56.10 — DC01 (turbo.lab)', '192.168.56.30 — WS01'],
    },
  },

  {
    id: 'lateral-movement',
    name: 'Ghost Walk',
    tagline: 'PTH, PTT, Evil-WinRM, DCOM, WMI, MSSQL, DPAPI, creds in shares',
    color: 'var(--green)',
    vms: [
      { name: 'DC01', ip: '192.168.56.10', role: 'Domain Controller' },
      { name: 'SRV01', ip: '192.168.56.20', role: 'SQL Express + IIS + file share' },
      { name: 'WS01', ip: '192.168.56.30', role: 'Workstation (AutoLogon + DPAPI)' },
    ],
    ramGB: 9,
    provisionMinutes: 45,
    techniques: [
      {
        category: 'Auth Relay / Reuse',
        items: [
          'Pass-the-Hash — wmiexec, smbexec, psexec with NT hash',
          'Pass-the-Ticket — inject TGT/TGS via Rubeus / mimikatz',
          'NTLM relay — coerce via IIS/PrinterBug → relay to LDAP/SMB',
        ],
      },
      {
        category: 'Remote Execution',
        items: [
          'Evil-WinRM — WinRM on WS01:5985 and SRV01:5985',
          'DCOM — MMC20.Application / ShellWindows lateral',
          'WMI exec — Win32_Process.Create via wmiexec.py',
          'Scheduled Tasks — schtasks /s \\\\target',
          'Remote Services — sc \\\\target',
        ],
      },
      {
        category: 'Credential Hunting',
        items: [
          'DPAPI vault — WS01: LAB\\svc_backup + LAB\\carol.white certs',
          'AutoLogon — WS01 registry: LAB\\bob.smith plaintext',
          'Creds in share — \\\\SRV01\\IT\\it-creds.txt (sa_lab, svc_backup)',
          'MSSQL xp_cmdshell — sa_lab:Lab12345 → SYSTEM on SRV01',
        ],
      },
    ],
    accounts: [
      { user: 'bob.smith', pass: 'Password123!', vuln: 'AutoLogon cleartext in WS01 registry' },
      { user: 'svc_backup', pass: 'Backup123!', vuln: 'DPAPI vault on WS01' },
      { user: 'sa_lab', pass: 'Lab12345', vuln: 'MSSQL sysadmin login (xp_cmdshell)' },
    ],
    launchDir: 'scenarios/lateral-movement',
    tools: ['Evil-WinRM', 'Impacket', 'NetExec', 'Mimikatz', 'SharpDPAPI'],
    assumedBreach: {
      user: 'bob.smith',
      pass: 'Password123!',
      domain: 'TURBO',
      note: 'AutoLogon user on WS01 — creds found in registry. Simulates initial access via phishing or physical access.',
    },
    scope: {
      description: '192.168.56.0/24 (host-only)',
      ranges: ['192.168.56.10 — DC01', '192.168.56.20 — SRV01 (SQL + IIS)', '192.168.56.30 — WS01'],
    },
  },

  {
    id: 'forest-trust',
    name: 'Bloodline',
    tagline: 'Parent-child + ExtraSids + trust ticket + cross-domain Kerberos',
    color: 'var(--red, #ff7b72)',
    vms: [
      { name: 'DC01', ip: '192.168.56.10', role: 'turbo.lab — Parent DC' },
      { name: 'DC02', ip: '192.168.56.11', role: 'child.turbo.lab — Child DC' },
      { name: 'WS01', ip: '192.168.56.30', role: 'turbo.lab workstation (foothold)' },
    ],
    ramGB: 9,
    provisionMinutes: 50,
    techniques: [
      {
        category: 'Trust Enumeration',
        items: [
          'BloodHound cross-domain — enumerate trust paths, foreign group members',
          'nltest /domain_trusts — trust direction and type',
          'Get-ADTrust — trust attributes, SID filtering status',
        ],
      },
      {
        category: 'Trust Exploitation',
        items: [
          'ExtraSids attack — child krbtgt hash + parent Enterprise Admin SID → forest admin',
          'Trust ticket forging — inter-realm TGT with forged PAC',
          'SID history abuse — inject parent domain SID into child user object',
          'Cross-domain Kerberoasting — SPNs readable across trust',
        ],
      },
      {
        category: 'Child → Parent Escalation Path',
        items: [
          '1. Compromise frank.admin (Child DA)',
          '2. DCSync child domain → child krbtgt NTLM hash',
          '3. ticketer.py: forge inter-realm ticket with Enterprise Admin extra SID',
          '4. Access DC01 / all turbo.lab resources as Enterprise Admin',
        ],
      },
    ],
    accounts: [
      { user: 'frank.admin', pass: 'Admin123!', vuln: 'Child Domain Admin — trust escalation entry point' },
      { user: 'grace.temp', pass: 'Summer2024!', vuln: 'AS-REP roastable in child domain' },
      { user: 'svc_child_web', pass: 'Webservice1!', vuln: 'Unconstrained delegation in child domain' },
      { user: 'Administrator (LAB)', pass: 'Vagrant123!', vuln: 'End goal via ExtraSids' },
    ],
    launchDir: 'scenarios/forest-trust',
    tools: ['Impacket ticketer.py', 'Rubeus', 'BloodHound', 'PowerView', 'mimikatz lsadump::trust'],
    assumedBreach: {
      user: 'dave.brown',
      pass: 'Password123!',
      domain: 'TURBO',
      note: 'Low-priv user in the parent domain — enumerate cross-domain trust, escalate child->parent via ExtraSids.',
    },
    scope: {
      description: '192.168.56.0/24 (host-only)',
      ranges: ['192.168.56.10 — DC01 (turbo.lab)', '192.168.56.11 — DC02 (child.turbo.lab)', '192.168.56.30 — WS01'],
    },
  },

  {
    id: 'full-lab',
    name: 'Pandemonium',
    tagline: 'Everything — all 5 VMs, all attack categories, GOAD-style',
    color: 'var(--fg)',
    vms: [
      { name: 'DC01', ip: '192.168.56.10', role: 'turbo.lab DC + ADCS' },
      { name: 'DC02', ip: '192.168.56.11', role: 'child.turbo.lab DC' },
      { name: 'SRV01', ip: '192.168.56.20', role: 'SQL Express + IIS + share' },
      { name: 'SRV02', ip: '192.168.56.21', role: 'Child IIS + PrinterBug' },
      { name: 'WS01', ip: '192.168.56.30', role: 'Workstation' },
    ],
    ramGB: 15,
    provisionMinutes: 70,
    techniques: [
      { category: 'All Kerberos', items: ['AS-REP, Kerberoast, Unconstrained, Constrained, S4U2Self, Golden, Silver'] },
      { category: 'All ADCS', items: ['ESC1, ESC2, ESC3, ESC4, ESC6, ESC7, ESC8'] },
      { category: 'All ACL', items: ['GenericAll, ForceChangePwd, DCSync, AdminSDHolder, GPO abuse, RBCD'] },
      { category: 'All Lateral', items: ['PTH, PTT, Evil-WinRM, DCOM, WMI, MSSQL, DPAPI, AutoLogon'] },
      { category: 'All Trust', items: ['ExtraSids, trust ticket, SID history, cross-domain Kerberoast'] },
    ],
    accounts: [
      { user: 'dave.brown', pass: 'Password123!', vuln: 'Low-priv starting user (pass in AD Description)' },
      { user: 'Administrator', pass: 'Vagrant123!', vuln: 'Domain Admin — end goal' },
    ],
    assumedBreach: {
      user: 'dave.brown',
      pass: 'Password123!',
      domain: 'TURBO',
      note: 'Starting point across all attack chains. Escalate through Kerberos, ADCS, ACLs, lateral movement, and trust attacks.',
    },
    scope: {
      description: '192.168.56.0/24 (host-only)',
      ranges: ['192.168.56.10 — DC01 (turbo.lab)', '192.168.56.11 — DC02 (child.turbo.lab)', '192.168.56.20 — SRV01', '192.168.56.21 — SRV02', '192.168.56.30 — WS01'],
    },
    launchDir: '.',
    tools: ['Everything'],
  },
];
