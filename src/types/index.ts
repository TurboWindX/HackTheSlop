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

// Engagement context — credentials and scope for the active pentest
export type Engagement = {
    id: string;
    name: string;
    username: string;       // e.g. alex
    domain: string;         // e.g. mydomain.local
    password: string;
    ntlmHash?: string;      // optional — populate after obtaining hash
    dcIp?: string;          // primary domain controller IP
    scope: string[];        // CIDRs and individual IPs in scope
    notes?: string;         // freeform engagement notes
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
    engagement: Engagement;
    phase?: string;
    userMessage: string;
    bloodhoundFindings?: BloodhoundResult[];
    conversationHistory?: AIMessage[];
};