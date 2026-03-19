export type BloodhoundResult = {
    id: string;
    name: string;
    type: string;
    details: string;
};

export type Note = {
    id: string;
    content: string;
    createdAt: Date;
};

export type CommandSuggestion = {
    technique: string;
    command: string;
    description: string;
};

export type Technique = {
    name: string;
    description: string;
    commands: CommandSuggestion[];
};

// A single captured credential entry
export type CredEntry = {
    id: string;
    username?: string;
    domain?: string;
    password?: string;
    note?: string;         // e.g. "found in share", "DA"
};

// A single captured hash entry
export type HashEntry = {
    id: string;
    username?: string;
    domain?: string;
    hash: string;
    hashType: string;      // e.g. "NTLM", "NetNTLMv2", "Kerberos 5 TGS-REP" etc.
    hashcatMode?: string;  // e.g. "1000", "5600", "13100"
    note?: string;
};

// Engagement context — credentials and scope for the active pentest
export type Engagement = {
    id: string;
    name: string;
    domain?: string;        // primary domain
    dcIp?: string;          // primary domain controller IP
    // legacy single-cred fields kept for backward compat (used by AI context)
    username?: string;
    password?: string;
    ntlmHash?: string;
    // structured loot
    creds: CredEntry[];
    hashes: HashEntry[];
    scope: string[];        // CIDRs and individual IPs in scope
    notes?: string;
    createdAt: Date;
};

export type PentestPhase = {
    id: string;
    name: string;
    description: string;
    techniques: string[];   // technique IDs relevant to this phase
};

export type LMStudioConfig = {
    primaryUrl: string;     // e.g. http://localhost:1234
    secondaryUrl?: string;  // second machine IP
    model?: string;         // loaded model name (optional — LM Studio uses whatever is loaded)
    maxTokens: number;      // max response tokens — recommend 2048
    temperature: number;
    contextWindow?: number; // total context window size set in LM Studio — default 8192
};

export type AIMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

export type GuidanceRequest = {
    engagement: Engagement | null;
    phase?: string;
    userMessage: string;
    bloodhoundFindings?: BloodhoundResult[];
    conversationHistory?: AIMessage[];
};