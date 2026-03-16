/**
 * Command template engine.
 * Templates use {{VAR_NAME}} syntax.
 * Variables are sourced from engagementService.getTemplateVars().
 *
 * Example:
 *   "GetUserSPNs.py {{DOMAIN}}/{{USERNAME}}:{{PASSWORD}} -dc-ip {{DC_IP}} -request"
 *   → "GetUserSPNs.py mydomain.local/alex:Testpass123 -dc-ip 10.10.10.1 -request"
 */

export function fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
        return vars[key] !== undefined ? vars[key] : match;
    });
}

export function fillTemplates(templates: string[], vars: Record<string, string>): string[] {
    return templates.map(t => fillTemplate(t, vars));
}
