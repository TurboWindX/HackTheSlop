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
     * Return UPN-style username (user@domain) from the engagement.
     */
    getUpn(engagement: Engagement): string {
        const user = engagement.username.includes('@')
            ? engagement.username
            : engagement.username;
        const domain = engagement.domain.toLowerCase();
        return user.includes('@') ? user : `${user}@${domain}`;
    },

    /**
     * Build a flat variable map for command template substitution.
     */
    getTemplateVars(engagement: Engagement): Record<string, string> {
        const upn = engagementService.getUpn(engagement);
        const shortUser = engagement.username.split('@')[0];
        return {
            USERNAME:    shortUser,
            UPN:         upn,
            PASSWORD:    engagement.password,
            DOMAIN:      engagement.domain,
            DOMAIN_UPPER: engagement.domain.toUpperCase(),
            // Convert domain to DN format: mydomain.local → DC=mydomain,DC=local
            DOMAIN_DN:   engagement.domain.split('.').map(p => `DC=${p}`).join(','),
            DC_IP:       engagement.dcIp ?? '<DC_IP>',
            NTLM_HASH:   engagement.ntlmHash ?? '<NTLM_HASH>',
        };
    },
};
