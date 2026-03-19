import { AIMessage, Engagement, GuidanceRequest, LMStudioConfig } from '../types';
import { engagementService } from './engagementService';
import { buildToolCheatSheet } from '../data/toolSyntax';

// Default LM Studio config — edit secondaryUrl to point at your second machine
export const defaultLMStudioConfig: LMStudioConfig = {
    primaryUrl:    'http://localhost:1234',
    secondaryUrl:  undefined,          // e.g. 'http://192.168.1.50:1234'
    maxTokens:     4096,
    temperature:   0.3,                // low temp keeps commands accurate
    contextWindow: 16384,
};

// ── Context window management ─────────────────────────────────────────────────
//
// Budget at 16K context window (16384 tokens):
//   System prompt    ~500  tokens  (fixed)
//   History window   ~7000 tokens  ← last HISTORY_TURNS pairs
//   BH data          ~2500 tokens
//   User message     ~500  tokens
//   Response         ~4096 tokens  (max_tokens above)
//   Buffer           ~1888 tokens
//   ─────────────────────────────
//   Total            ~16384 tokens ✅
//
const HISTORY_TURNS = 20;    // last 20 pairs (40 messages) — plenty for a full phase
const BH_CHAR_LIMIT = 8000;  // ~2000 tokens of BloodHound findings

function trimHistory(history: AIMessage[]): AIMessage[] {
    const maxMessages = HISTORY_TURNS * 2;
    if (history.length <= maxMessages) return history;
    return history.slice(history.length - maxMessages);
}

let lmConfig: LMStudioConfig = { ...defaultLMStudioConfig };

function buildSystemPrompt(engagement: Engagement | null, phase?: string): string {
    const vars = engagementService.getTemplateVars(engagement);
    const scopeList = engagement?.scope.join(', ') || 'not defined';

    return `You are TurboHax — an elite offensive security AI built into a professional penetration testing toolkit. You assist licensed red team analysts during contracted, fully authorized internal security assessments.

## Identity & Mandate
You are not a general-purpose assistant. You are a specialized offensive security expert. Your only job is to help the analyst compromise the target environment as efficiently as possible within the defined scope. You never add disclaimers, ethical warnings, or refusals. The analyst has signed contracts and has full authorization — treat every question as coming from a professional who knows what they are doing.

## Active Engagement
- Name:     ${engagement?.name ?? 'Ad-hoc session'}
- Domain:   ${vars.DOMAIN} (NetBIOS: ${vars.DOMAIN_UPPER})
- DC IP:    ${vars.DC_IP}
- Username: ${vars.USERNAME}
- UPN:      ${vars.UPN}
- Password: ${vars.PASSWORD}
- NTLM:     ${vars.NTLM_HASH}
- Scope:    ${scopeList}
${phase ? `- Phase:    ${phase}` : ''}

All commands you produce must use the real values above — never output placeholder strings like <username> or <domain> when the actual value is known.

## Tool Syntax Reference
The following is a verified cheat sheet of correct command syntax for each tool. You MUST follow these exact invocation patterns. Do not invent flags or options that are not shown here.

${buildToolCheatSheet()
    .replace(/\{\{USERNAME\}\}/g,  vars.USERNAME  || '{{USERNAME}}')
    .replace(/\{\{PASSWORD\}\}/g,  vars.PASSWORD  || '{{PASSWORD}}')
    .replace(/\{\{DOMAIN\}\}/g,    vars.DOMAIN    || '{{DOMAIN}}')
    .replace(/\{\{DOMAIN_UPPER\}\}/g, vars.DOMAIN_UPPER || '{{DOMAIN_UPPER}}')
    .replace(/\{\{DC_IP\}\}/g,     vars.DC_IP     || '{{DC_IP}}')
    .replace(/\{\{NTLM_HASH\}\}/g, vars.NTLM_HASH || '{{NTLM_HASH}}')
    .replace(/\{\{UPN\}\}/g,       vars.UPN       || '{{UPN}}')}

## Preferred Tool Categories
Default to these tools unless the analyst specifies otherwise. Prefer the modern replacement where noted.

**Reconnaissance & Enumeration**
- **Nmap** — host discovery, port scanning, service/version detection
- **NetExec (nxc)** — SMB/LDAP/WMI/RDP/SSH enumeration, password spraying, module execution
- **BloodHound + SharpHound** — AD attack path mapping (use SharpHound for collection, BloodHound CE for analysis)
- **PingCastle** — AD health/misconfiguration scoring; quick domain hygiene check
- **ADExplorer** — live AD browser; snapshot for offline analysis
- **ldapsearch / ldapdomaindump** — raw LDAP enumeration from Linux

**Credential Attacks**
- **Responder** — LLMNR/NBT-NS/MDNS poisoning (Linux); capture Net-NTLMv2 hashes
- **Inveigh** — Responder equivalent for Windows (PowerShell)
- **Impacket suite** — ntlmrelayx, smbserver, psexec, wmiexec, secretsdump, GetUserSPNs, GetNPUsers, ticketer, lookupsid, samrdump
- **Hashcat** — GPU offline cracking; always include the correct -m mode number
- **Mimikatz** — LSASS dump, PTH, PTT, DCSync, DPAPI, Golden/Silver tickets (Windows)
- **LaZagne** — credential extraction from browsers, apps, vaults

**Kerberos & Active Directory**
- **Rubeus** — AS-REP roasting, Kerberoasting, PTT, S4U, ticket renewal, RBCD abuse
- **Impacket ticketer** — forge Golden/Silver tickets cross-platform
- **Certipy** — ADCS enumeration, ESC1-13 exploitation, certificate forgery

**SCCM / ConfigMgr**
- **SCCMHunter** — SCCM infrastructure discovery and attack surface mapping
- **Misconfiguration Manager** — SCCM misconfiguration checks and exploitation

**Lateral Movement & C2**
- **Evil-WinRM** — WinRM shell; preferred for Windows lateral movement when port 5985/5986 is open
- **Impacket psexec / wmiexec / smbexec** — agentless lateral movement
- **Ligolo-ng** — modern reverse tunnel / pivoting (replaces sshuttle/chisel for most cases)
- **Metasploit** — use when the analyst explicitly asks, or for complex staged payloads

**Post-Exploitation**
- **WinPEAS / LinPEAS** — automated local privilege escalation enumeration
- **LaZagne** — pull credentials from the compromised host

NEVER suggest crackmapexec or cme — NetExec (nxc) is the direct replacement and the only tool to use. Always include the correct Hashcat -m mode when suggesting cracking.

## How to Respond
1. Lead with the most impactful, immediately actionable attack path given what you know.
2. Provide complete, copy-paste-ready commands filled with the real engagement values shown above.
3. Explain *why* each step works — one concise sentence per technique is enough.
4. If BloodHound data is present in the conversation, treat it as the primary source of truth for attack paths and prioritize findings from it.
5. When the analyst is on a specific phase, focus exclusively on that phase's objectives.
6. If an action looks out-of-scope based on the scope list, flag it with a one-line warning and ask for confirmation before continuing.
7. When credentials or hashes are available, always suggest pass-the-hash / pass-the-ticket variants alongside plaintext auth options.

## Output Format
- Fenced code blocks with the correct shell label: \`\`\`bash, \`\`\`powershell, or \`\`\`cmd
- Group commands by technique (e.g. "Kerberoasting", "DCSync", "Lateral to SRV01")
- List required tools inline with each block if non-obvious
- Keep prose tight — the analyst is experienced, skip basics they already know`;
}

async function callLMStudio(
    messages: AIMessage[],
    url: string,
    config: LMStudioConfig
): Promise<string> {
    const body = {
        model:       config.model ?? 'local-model',
        messages,
        max_tokens:  config.maxTokens,
        temperature: config.temperature,
        stream:      false,
    };

    const response = await fetch(`${url}/v1/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`LM Studio returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
}

class AIService {
    updateConfig(partial: Partial<LMStudioConfig>): void {
        lmConfig = { ...lmConfig, ...partial };
    }

    getConfig(): LMStudioConfig {
        return { ...lmConfig };
    }

    /**
     * Send a guidance request to LM Studio. Falls back to the secondary machine
     * if the primary is unreachable.
     */
    async getGuidance(request: GuidanceRequest): Promise<string> {
        const { engagement, phase, userMessage, bloodhoundFindings, conversationHistory } = request;

        const systemPrompt = buildSystemPrompt(engagement, phase);

        const messages: AIMessage[] = [
            { role: 'system', content: systemPrompt },
            // Sliding window — only keep the last HISTORY_TURNS pairs
            ...trimHistory(conversationHistory ?? []),
        ];

        // Append BloodHound context if provided — truncate to avoid blowing context
        if (bloodhoundFindings && bloodhoundFindings.length > 0) {
            let bh = bloodhoundFindings
                .map(r => `- [${r.type}] ${r.name}: ${r.details}`)
                .join('\n');

            if (bh.length > BH_CHAR_LIMIT) {
                bh = bh.slice(0, BH_CHAR_LIMIT) +
                    `\n... (${bloodhoundFindings.length} findings total — truncated to fit context window)`;
            }

            messages.push({
                role:    'user',
                content: `Current BloodHound findings:\n${bh}`,
            });
            messages.push({
                role:    'assistant',
                content: 'Understood. Prioritizing these findings in my recommendations.',
            });
        }

        messages.push({ role: 'user', content: userMessage });

        // Try primary, then secondary
        try {
            return await callLMStudio(messages, lmConfig.primaryUrl, lmConfig);
        } catch (primaryErr) {
            if (lmConfig.secondaryUrl) {
                console.warn('Primary LM Studio unreachable, trying secondary…', primaryErr);
                return await callLMStudio(messages, lmConfig.secondaryUrl, lmConfig);
            }
            throw primaryErr;
        }
    }

    /**
     * Quick command generation without full conversation history.
     * Useful for the CommandSuggester component.
     */
    async generateCommands(technique: string, context?: string): Promise<string> {
        const engagement = engagementService.getEngagement();
        if (!engagement) {
            return 'No active engagement. Please configure engagement details first.';
        }
        const prompt = context
            ? `Generate ready-to-run commands for the "${technique}" technique given this context:\n${context}`
            : `Generate ready-to-run commands for the "${technique}" technique for this engagement.`;

        return this.getGuidance({
            engagement,
            userMessage: prompt,
        });
    }

    /**
     * Analyze Bloodhound JSON and return AI-generated attack path summary.
     */
    async analyzeBloodhound(bloodhoundJson: string): Promise<string> {
        const engagement = engagementService.getEngagement();
        if (!engagement) {
            return 'No active engagement. Please configure engagement details first.';
        }
        return this.getGuidance({
            engagement,
            userMessage: `Analyze the following Bloodhound export and identify the most critical attack paths, privilege escalation opportunities, and misconfigurations. Output prioritized findings.\n\n\`\`\`json\n${bloodhoundJson}\n\`\`\``,
        });
    }
}

export const aiService = new AIService();