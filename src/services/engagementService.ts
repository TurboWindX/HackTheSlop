import { Engagement } from '../types';

const STORAGE_KEY = 'pentest_engagement';

// In-memory cache — source of truth is localStorage so creds survive page refresh
let activeEngagement: Engagement | null = null;

export const engagementService = {
    /**
     * Save the current engagement context to localStorage.
     * Credentials persist until you explicitly call clearEngagement() or wipe the machine.
     */
    setEngagement(engagement: Engagement): void {
        activeEngagement = engagement;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(engagement));
        } catch {
            // localStorage unavailable (e.g. unit tests) — in-memory only
        }
    },

    getEngagement(): Engagement | null {
        if (activeEngagement) return activeEngagement;
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                activeEngagement = JSON.parse(stored) as Engagement;
                return activeEngagement;
            }
        } catch {
            // ignore parse errors
        }
        return null;
    },

    clearEngagement(): void {
        activeEngagement = null;
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    },

    /**
     * Parse a raw scope string (newline or comma separated) into an array of
     * individual IPs and CIDR ranges.
     */
    parseScope(raw: string): string[] {
        return raw
            .split(/[\n,]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    },

    /**
     * Return UPN-style username from the engagement (uses first cred entry or legacy field).
     */
    getUpn(engagement: Engagement): string {
        const user   = engagement.username ?? engagement.creds[0]?.username ?? '';
        const domain = engagement.domain ?? engagement.creds[0]?.domain ?? '';
        if (!user) return domain || '';
        return user.includes('@') ? user : domain ? `${user}@${domain}` : user;
    },

    /**
     * Build a flat variable map for command template substitution.
     * Prefers first cred/hash entry when specific fields not set.
     */
    getTemplateVars(engagement: Engagement | null): Record<string, string> {
        const firstCred = engagement?.creds[0];
        const firstHash = engagement?.hashes[0];
        const user   = engagement?.username ?? firstCred?.username ?? '';
        const domain = engagement?.domain   ?? firstCred?.domain   ?? '';
        const pass   = engagement?.password ?? firstCred?.password ?? '';
        const hash   = engagement?.ntlmHash ?? firstHash?.hash     ?? '';
        const upn    = user.includes('@') ? user : domain ? `${user}@${domain}` : user;
        return {
            USERNAME:     user.split('@')[0] || '<USERNAME>',
            UPN:          upn || '<UPN>',
            PASSWORD:     pass || '<PASSWORD>',
            DOMAIN:       domain || '<DOMAIN>',
            DOMAIN_UPPER: (domain || '<DOMAIN>').toUpperCase(),
            DOMAIN_DN:    domain ? domain.split('.').map((p: string) => `DC=${p}`).join(',') : '<DOMAIN_DN>',
            DC_IP:        engagement?.dcIp ?? '<DC_IP>',
            NTLM_HASH:    hash || '<NTLM_HASH>',
        };
    },
};
