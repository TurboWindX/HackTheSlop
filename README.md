# TurboPentest Helper

AI-assisted internal penetration testing tool.  
Guides you through AD engagements, generates ready-to-run commands filled with your real credentials, and analyzes BloodHound output — all powered by a local LM Studio instance (no data leaves your machine).

---

## Quick Start

### Prerequisites (one-time installs)

| Tool | Download | Notes |
|---|---|---|
| Node.js 18+ | https://nodejs.org | for the pentest helper |
| LM Studio | https://lmstudio.ai | runs the AI model locally |
| VirtualBox | https://virtualbox.org | only if using the lab |
| Vagrant | https://vagrantup.com | only if using the lab |

---

### 1 — Start LM Studio (do this first)

1. Open **LM Studio**
2. Download **dolphin-2.9-llama3-8b** (search for it in the Discover tab)
   - Q8_0 quantization fits comfortably in 12GB VRAM
3. Load the model → go to **Local Server** tab → click **Start Server**
   - Default port: `1234` — leave it as-is
4. *(Optional)* On your second machine: do the same, note its IP address

---

### 2 — Launch the Pentest Helper

```powershell
# From the pentest-helper folder:
npm install        # first time only — installs dependencies
npm run dev        # starts the dev server
```

Then open **http://localhost:5173** in your browser.

**First thing to do in the UI:**
1. Go to the **Setup** tab
2. Enter your engagement credentials, DC IP, and scope
3. Set the LM Studio URL to `http://localhost:1234` (already defaulted)
4. If you have a second machine running LM Studio, add its IP as the Secondary URL
5. Click **Save Engagement**
6. Switch to the **AI Guide** tab — select a phase to get started

---

### 3 — Start the Lab (optional — for practice)

The `lab/` folder contains a 3-VM Active Directory environment with intentional
vulnerabilities for practicing the attacks your pentest helper suggests.

```powershell
# Install VirtualBox and Vagrant first, then:
cd lab
vagrant up          # first run: ~30-40 min (downloads Windows boxes once)
```

VMs come up in order: DC01 first (domain controller), then SRV01 (SQL server), then WS01 (workstation).  
DC01 must finish before SRV01/WS01 can join the domain — Vagrant handles this automatically.

**After first successful build — take a snapshot so you can reset instantly:**
```powershell
vagrant snapshot save clean_lab
# restore any time with:
vagrant snapshot restore clean_lab
```

**Lab credentials to enter in the Setup tab:**
```
Username:   Administrator
Password:   Vagrant123!
Domain:     lab.local
DC IP:      192.168.56.10
Scope:      192.168.56.0/24
```

**Common lab commands:**
```powershell
vagrant up          # start all VMs
vagrant halt        # shut down all VMs (saves state)
vagrant destroy -f  # wipe everything and start fresh
vagrant ssh dc01    # SSH into DC01 (or srv01 / ws01)
vagrant status      # check which VMs are running
```

**RAM usage:** ~7.5GB total for all 3 VMs (fine on 64GB)

---

### Lab — Built-in Vulnerabilities

| Vulnerability | Account / Target | Tool to practice with |
|---|---|---|
| AS-REP Roasting | `alice.jones` | `GetNPUsers.py` |
| Kerberoasting | `svc_sql`, `svc_backup`, `svc_iis` | `GetUserSPNs.py` |
| Password in AD Description | `dave.brown` | `ldapdomaindump` / BloodHound |
| ADCS ESC1 | `VulnTemplate` on DC01 | `certipy find -vulnerable` |
| GenericAll ACL | `carol.white` → `svc_sql` | BloodHound abuse path |
| NTLM Relay | All VMs (SMB signing off) | `Responder` + `ntlmrelayx` |
| Creds in file share | `\\SRV01\IT\it-creds.txt` | `crackmapexec smb --shares` |
| DPAPI vault | WS01 Credential Manager | `mimikatz dpapi` |
| xp_cmdshell enabled | SQL Express on SRV01 | `mssqlclient.py` |

---

## Features

## Project Structure
```
pentest-helper
├── src
│   ├── app.ts
│   ├── components
│   │   ├── BloodhoundAnalyzer.tsx
│   │   ├── CommandSuggester.tsx
│   │   ├── NotesViewer.tsx
│   │   └── TechniqueSelector.tsx
│   ├── pages
│   │   ├── Dashboard.tsx
│   │   ├── BloodhoundResults.tsx
│   │   ├── Notes.tsx
│   │   └── Suggestions.tsx
│   ├── services
│   │   ├── aiService.ts
│   │   ├── bloodhoundParser.ts
│   │   └── notesParser.ts
│   ├── data
│   │   ├── adcs.ts
│   │   ├── mssql.ts
│   │   ├── kerberos.ts
│   │   └── lateral.ts
│   ├── types
│   │   └── index.ts
│   └── utils
│       └── index.ts
├── public
│   └── index.html
├── package.json
├── tsconfig.json
└── README.md
```

## Security Note

Credentials are stored in browser `localStorage` and never leave your machine — all AI calls go directly to your local LM Studio instance.  
At the end of an engagement, click **Clear Session** in the Setup tab, or run `localStorage.clear()` in browser devtools.

## License
Internal use only.