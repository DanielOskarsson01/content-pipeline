# Content-Pipeline Code Repository

**Code location:** `~/Dropbox/content-pipeline/`
**Docs/Strategy location:** `~/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/`

---

## MANDATORY: Read These First

Before any work in this repo, read:

1. **WORKFLOW.md** - `~/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/WORKFLOW.md`
   - Zombie process cleanup
   - Infrastructure check
   - 3-strike debugging rule
   - Coworker testing pattern

2. **INFRASTRUCTURE.md** - `~/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/INFRASTRUCTURE.md`
   - Port registry (3000 = API, 5173 = React dev)
   - Service locations
   - Deployment commands

3. **GLOBAL_AGENT_INSTRUCTIONS.md** - `~/Library/CloudStorage/Dropbox/Projects/GLOBAL_AGENT_INSTRUCTIONS.md`
   - Architecture Change Protocol
   - CTO oversight checks

---

## Quick Start

```bash
# 1. Kill zombie processes
pkill -f "content-pipeline" 2>/dev/null
pkill -f "vite" 2>/dev/null

# 2. Start unified dev server
npm run dev

# 3. Access app at http://localhost:5173 (NOT 3000)
```

---

## Key Commands

| Command | What It Does |
|---------|--------------|
| `npm run dev` | Start API (3000) + React (5173) together |
| `npm run dev:api` | API only |
| `npm run dev:client` | React only |
| `npm run build` | Build React for production |
| `npm test` | Run API tests (Jest) |
| `npm run test:e2e` | Run E2E tests (Playwright) |

---

## Architecture

```
content-pipeline/
├── server.js           # Express API (port 3000)
├── routes/             # API endpoints
├── modules/            # Submodules (sitemap, etc.)
├── workers/            # BullMQ workers
├── client/             # React app (Vite, port 5173)
│   ├── src/
│   │   ├── components/
│   │   ├── stores/     # Zustand stores
│   │   ├── api/        # API client
│   │   └── hooks/
│   └── dist/           # Built output (served by Express in prod)
└── sql/                # Database migrations
```

---

## After Architecture Changes

Per GLOBAL_AGENT_INSTRUCTIONS.md Architecture Change Protocol:

1. Update `INFRASTRUCTURE.md`
2. Update `WORKFLOW.md`
3. Update this file's session log
4. Kill old processes before starting new ones

---

## Session Log

### Session: 2026-02-04 - Server Architecture Cleanup
**Accomplished:**
- Removed old Alpine.js dashboard (archived to `public-legacy-dashboard/`)
- Added unified `npm run dev` command (runs API + React together)
- Updated server.js to serve React build from `client/dist/`
- Added SPA fallback for React Router
- Updated all workflow documents with new architecture

**Key Change:**
- **Access the app at localhost:5173** (not 3000)
- Port 3000 is API-only in dev mode, serves built React in production

**Files Changed:**
- `server.js` - Now serves `client/dist/` instead of `public/`
- `package.json` - Added `concurrently`, unified dev script
- `client/package.json` - Fixed build script

---

*Last updated: 2026-02-04*
