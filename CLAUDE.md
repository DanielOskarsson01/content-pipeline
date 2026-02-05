# Content-Pipeline Code Repository

## Start Development
```bash
./dev.sh   # Kills zombies, starts API + React
```
**Access app at http://localhost:5173** (not 3000)

---

## Project Structure
```
content-pipeline/
├── server.js           # Express API (port 3000)
├── routes/             # API endpoints
├── services/           # Business logic
├── modules/            # Pipeline submodules
├── workers/            # BullMQ workers
├── client/             # React app (Vite, port 5173)
│   ├── src/
│   │   ├── components/ # UI components (NO fetch here)
│   │   ├── stores/     # Zustand (UI state ONLY)
│   │   ├── hooks/      # TanStack Query (data fetching)
│   │   └── api/        # API client
│   └── dist/           # Built output
├── sql/                # Database migrations
└── tests/              # Jest + Playwright tests
```

**Docs location:** `~/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/`

---

## Architecture Rules

### Stores = UI State Only
Zustand stores: `activeTab`, `toast`, `sidebarOpen`, `isLoading`
**NEVER:** `projects`, `entities`, `runs`, `selectedProjectId`, `INITIAL_*`

### Data Fetching = TanStack Query
All server data via hooks in `client/src/hooks/`
**NEVER in components:** `fetch()`, `axios`

### Before Coding — Run Checks
```bash
grep -rE "entities|projects:|selectedProjectId|INITIAL_" client/src/stores/
grep -rE "fetch\(|axios" client/src/components/
```
Both should return nothing.

---

## Ports

| Port | Service |
|------|---------|
| 3000 | Express API (backend only) |
| 5173 | **Vite React (USE THIS)** |

---

## When Debugging

**If a fix fails, run `/debug` before trying again.**

The debug skill loads WORKFLOW.md with:
- 3-strike rule
- Infrastructure checks
- SSH troubleshooting
- Common pitfalls

---

## Pre-commit Hook Active
Blocks commits with architecture violations.

---

*Last updated: 2026-02-05*
