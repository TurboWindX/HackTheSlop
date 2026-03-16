/**
 * Pentest phases with ordered steps and associated techniques.
 * The AI uses these to guide the analyst through a structured engagement.
 */
export type PhaseStep = {
    id: string;
    name: string;
    description: string;
    techniques: string[];   // maps to technique IDs in data files
    tools: string[];        // required tools
    promptHint: string;     // injected into the AI prompt for this step
};

export const pentestPhases: PhaseStep[] = [
    {
        id: 'recon',
        name: '1. Initial Recon',
        description: 'Discover live hosts, open ports, and services within scope.',
        techniques: ['nmap', 'enum4linux', 'netdiscover'],
        tools: ['nmap', 'enum4linux-ng', 'crackmapexec'],
        promptHint: 'Focus on discovering live hosts, identifying domain controllers, and enumerating services on the defined scope.',
    },
    {
        id: 'ad_enum',
        name: '2. Active Directory Enumeration',
        description: 'Enumerate users, groups, GPOs, trusts, and gather BloodHound data.',
        techniques: ['ldap', 'bloodhound', 'smb'],
        tools: ['BloodHound', 'SharpHound', 'ldapdomaindump', 'crackmapexec'],
        promptHint: 'Enumerate AD objects: users, groups, computers, GPOs, ACLs, and trust relationships. Prioritize running BloodHound collection.',
    },
    {
        id: 'cred_attacks',
        name: '3. Credential Attacks',
        description: 'Kerberoasting, AS-REP Roasting, password spraying, hash capture.',
        techniques: ['kerberos', 'spray', 'responder'],
        tools: ['Impacket', 'Rubeus', 'Hashcat', 'Responder', 'CrackMapExec'],
        promptHint: 'Look for Kerberoastable accounts, AS-REP roastable users (no pre-auth), and opportunities for password spraying. Check for LLMNR/NBT-NS poisoning opportunities.',
    },
    {
        id: 'adcs',
        name: '4. ADCS Attacks',
        description: 'Certificate Services misconfigurations (ESC1–ESC13).',
        techniques: ['adcs'],
        tools: ['Certipy', 'Certify', 'PKINIT'],
        promptHint: 'Enumerate certificate templates for ESC1–ESC8 vulnerabilities. Focus on misconfigured enrollment rights and template attributes that allow privilege escalation.',
    },
    {
        id: 'lateral',
        name: '5. Lateral Movement',
        description: 'Move between hosts using harvested credentials or tickets.',
        techniques: ['lateral', 'pth', 'ptt', 'wmi', 'psexec'],
        tools: ['Impacket (psexec/wmiexec/smbexec)', 'CrackMapExec', 'Evil-WinRM'],
        promptHint: 'Use obtained credentials or hashes to move laterally. Suggest WMIExec, SMBExec, or Evil-WinRM based on available access. Always stay within scope.',
    },
    {
        id: 'mssql',
        name: '6. MSSQL Attacks',
        description: 'Enumerate and exploit SQL Server instances.',
        techniques: ['mssql'],
        tools: ['PowerUpSQL', 'Impacket mssqlclient', 'CrackMapExec mssql'],
        promptHint: 'Find SQL Server instances, check for linked servers, xp_cmdshell access, and SQL-based privilege escalation paths.',
    },
    {
        id: 'postexploit',
        name: '7. Post-Exploitation',
        description: 'Credential dumping, persistence, and escalation after initial access.',
        techniques: ['dcsync', 'lsass', 'sam', 'dpapi'],
        tools: ['Mimikatz', 'Impacket secretsdump', 'SharpDPAPI'],
        promptHint: 'Document all escalation paths found. Suggest credential dumping techniques appropriate to the current privilege level. Note: confirm this is within ROE before proceeding.',
    },
];
