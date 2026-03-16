import { parseBloodhoundResults } from '../services/bloodhoundParser';
import { parseUserNotes } from '../services/notesParser';
import { adcsCommands } from '../data/adcs';
import { mssqlCommands } from '../data/mssql';
import { kerberosCommands } from '../data/kerberos';
import { lateralMovementCommands } from '../data/lateral';
import { fillTemplates } from './commandTemplates';
import { engagementService } from '../services/engagementService';

export { parseBloodhoundResults };
export { parseUserNotes };

export const suggestCommands = (technique: string): string[] => {
    const engagement = engagementService.getEngagement();
    const vars = engagement ? engagementService.getTemplateVars(engagement) : {};

    const fill = (cmds: string[]) =>
        engagement ? fillTemplates(cmds, vars) : cmds;

    switch (technique) {
        case 'adcs':
            return fill([
                ...adcsCommands.enumeration.commands,
                ...adcsCommands.exploitation.commands,
            ]);
        case 'mssql':
            return fill([
                ...mssqlCommands.enumeration,
                ...mssqlCommands.privilegeEscalation,
            ]);
        case 'kerberos':
            return fill(kerberosCommands.commands.map(c => c.command));
        case 'lateral':
            return fill(lateralMovementCommands.techniques.flatMap(t => t.commands));
        default:
            return [];
    }
};