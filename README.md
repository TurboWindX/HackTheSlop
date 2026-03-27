# HackTheSlop

> *Sloppy, hacky vibey*

**HackTheSlop** is an all-in-one Active Directory pentesting companion — loot manager, lab builder, AI guide, and attack path finder. It tracks your engagement data, generates ready-to-run attack commands pre-filled with your real credentials, visualizes BloodHound attack paths, and ships with five intentionally vulnerable AD lab scenarios to practice on. All AI runs locally via LM Studio — no data leaves your machine.

---

## What It Does

| Pillar | Description |
|---|---|
| **AI Guide** | Phase-aware chat assistant walks you through Recon → Foothold → Lateral Movement → Domain Admin |
| **Attack Path Finder** | Drop in a BloodHound ZIP or JSON — get an interactive graph and pre-built attack-path queries |
| **Command Generator** | Every attack command auto-filled with your engagement creds — no manual substitution |
| **Loot Manager** | Track notes, findings, and credentials across the engagement in one place |
| **Lab Builder** | Five self-contained Vagrant/VirtualBox AD labs to spin up and practice against |
| **Technique Browser** | AD attack techniques by category with tool references and OPSEC notes |

---

## Screenshots

**🎯 Loot**
![Loot](https://github.com/user-attachments/assets/878edfe1-a95c-47a5-ae88-2f98494ecd82)

**🧙 Sherpa**
![Sherpa](https://github.com/user-attachments/assets/f2b6a1bf-b2ea-4287-8ff7-d2a027352aac)

**🩸 BloodHound**
![BloodHound](https://github.com/user-attachments/assets/b382eb6d-d7a0-402c-b56b-c743e9172c8d)

**⚡ Commands**
![Commands](https://github.com/user-attachments/assets/99e5e78d-4812-4d16-b642-8903565d674d)

**🖥️ Lab**
![Lab](https://github.com/user-attachments/assets/f7e498ed-351c-4016-8a38-99674ca00297)

---

## Quick Start

### Prerequisites (one-time installs)

| Tool | Download | Notes |
|---|---|---|
| Node.js 18+ | https://nodejs.org | runs the app |
| LM Studio | https://lmstudio.ai | runs the AI model locally |
| VirtualBox | https://virtualbox.org | only needed for lab scenarios |
| Vagrant | https://vagrantup.com | only needed for lab scenarios |

---

### 1 — Start LM Studio (do this first)

1. Open **LM Studio**
2. Download **dolphin-2.9-llama3-8b** (or better) (search for it in the Discover tab) 
   - Q8_0 quantization is perfect but Q6 is great, q4 is bare minimum 
3. Load the model → go to **Local Server** tab → click **Start Server**
   - Default port: `1234` — leave it as-is
4. *(Optional)* On a second machine: do the same and note its IP

---

### 2 — Launch HackTheSlop

```powershell
# From the HackTheSlop folder:
npm install        # first time only
npm run dev        # starts the Vite dev server
```

Open **http://localhost:5173** in your browser.

**First-time setup:**
1. Go to the **Setup** tab
2. Enter engagement credentials, DC IP, domain, and scope
3. Set the LM Studio URL to `http://localhost:1234` (already the default)
4. If you have a second machine running LM Studio, add it as the Secondary URL
5. Click **Save Engagement**
6. Go to the **AI Guide** tab and select a phase to start

---

## Lab Scenarios

Five standalone Vagrant-based Active Directory environments, each focused on a different attack category. Pick one, `vagrant up`, and practice.

| Scenario | Folder | Focus | RAM |
|---|---|---|---|
| **Ticket Forge** | `kerberos-basics` | AS-REP Roasting, Kerberoasting, delegation, Golden/Silver tickets | ~6 GB |
| **Certifried** | `adcs-deep-dive` | ADCS ESC1–ESC8, PKINIT, certificate theft, enrollment agent abuse | ~6 GB |
| **Inherited Sins** | `acl-abuse` | GenericAll, DCSync, AdminSDHolder, ForceChangePwd, GPO abuse, RBCD | ~6 GB |
| **Ghost Walk** | `lateral-movement` | PTH, PTT, Evil-WinRM, DCOM, WMI, MSSQL, DPAPI, creds in shares | ~7.5 GB |
| **Bloodline** | `forest-trust` | Parent-child trust, ExtraSids, trust ticket, cross-domain Kerberos | ~9 GB |

### Starting a scenario

```powershell
cd lab/scenarios/<scenario-folder>
vagrant up          # first run: 25–50 min depending on scenario
```

Or use the **Lab Scenarios** tab in the UI to browse scenario details and copy launch commands.

**Snapshot after first build so you can reset instantly:**
```powershell
vagrant snapshot save clean_lab
vagrant snapshot restore clean_lab   # reset any time
```

**Common Vagrant commands:**
```powershell
vagrant up          # start VMs
vagrant halt        # shut down (saves state)
vagrant destroy -f  # wipe and start fresh
vagrant status      # see which VMs are running
vagrant ssh dc01    # shell into a VM (dc01 / dc02 / srv01 / ws01)
```

---

## Project Structure

```
hacktheslop/
├── src/
│   ├── main.tsx
│   ├── app.ts
│   ├── index.css
│   ├── components/
│   │   ├── BloodhoundAnalyzer.tsx    # ZIP/JSON upload + analysis UI
│   │   ├── BloodHoundGraph.tsx       # interactive force-graph
│   │   ├── BloodHoundQueries.tsx     # pre-built attack-path queries
│   │   ├── CommandSuggester.tsx      # cred-filled command generator
│   │   ├── EngagementSetup.tsx       # engagement config form
│   │   ├── GuidanceChat.tsx          # AI chat interface
│   │   ├── LabScenarios.tsx          # scenario browser
│   │   ├── NotesViewer.tsx           # notes parser/viewer
│   │   └── TechniqueSelector.tsx     # AD technique browser
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── BloodhoundResults.tsx
│   │   ├── Notes.tsx
│   │   └── Suggestions.tsx
│   ├── services/
│   │   ├── aiService.ts              # LM Studio API client
│   │   ├── bloodhoundParser.ts       # BloodHound JSON parser
│   │   ├── engagementService.ts      # engagement state management
│   │   ├── notesParser.ts            # notes parsing
│   │   └── webSearchService.ts
│   ├── data/
│   │   ├── adcs.ts
│   │   ├── kerberos.ts
│   │   ├── labScenarios.ts           # all five lab scenario definitions
│   │   ├── lateral.ts
│   │   ├── mssql.ts
│   │   ├── phases.ts
│   │   └── toolSyntax.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── commandTemplates.ts
│   │   ├── graphQueries.ts
│   │   └── index.ts
│   └── workers/
│       └── bhParser.worker.ts        # Web Worker for large BH files
├── lab/
│   ├── Vagrantfile
│   ├── launch.ps1
│   ├── scenarios/
│   │   ├── acl-abuse/
│   │   ├── adcs-deep-dive/
│   │   ├── forest-trust/
│   │   ├── kerberos-basics/
│   │   └── lateral-movement/
│   └── scripts/                      # VM provisioning scripts
├── public/
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Security Note

Credentials are stored in browser `localStorage` and never transmitted anywhere — all AI calls go directly to your local LM Studio instance.  
At the end of an engagement, click **Clear Session** in the Setup tab or run `localStorage.clear()` in browser devtools.

---

## License

Internal use only.