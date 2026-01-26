# Content Pipeline

Automated content generation pipeline for iGaming company profiles. Built with Express.js, BullMQ, and Supabase.

## Quick Start

### Prerequisites

- Node.js 20+
- Redis 7+
- Supabase account (for database)

### Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# - SUPABASE_URL
# - SUPABASE_ANON_KEY
# - REDIS_URL (default: redis://localhost:6379)

# Start Redis (if not running)
redis-server

# Start the server
npm start

# Start the worker (separate terminal)
npm run worker
```

Dashboard available at: http://localhost:3000

### Production Deployment (Hetzner)

```bash
# SSH to server
ssh root@188.245.110.34

# Navigate to app directory
cd /opt/content-pipeline

# Pull latest changes
git pull origin main

# Install dependencies
npm install --production

# Restart with PM2
pm2 restart ecosystem.config.js
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Dashboard  │────▶│  Express    │────▶│  Supabase   │
│  (public/)  │     │  API        │     │  Database   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │   BullMQ    │
                   │   Queue     │
                   └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
                   │   Worker    │
                   │ (stageWorker)│
                   └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  Modules    │
                   │ (discovery, │
                   │  etc.)      │
                   └─────────────┘
```

### Key Components

- **server.js** - Express API + WebSocket for real-time updates
- **services/orchestrator.js** - Pipeline lifecycle management with approval gates
- **workers/stageWorker.js** - BullMQ job processor
- **modules/** - Pluggable pipeline operations
- **public/index.html** - Dashboard UI

### Entity-Level Processing

Each entity (company) is processed independently through all pipeline stages. Failed entities don't block others.

### Approval Gates

Stages can require manual approval before proceeding. Configure with `requires_approval: true` in stage config.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET, POST | List/create projects |
| `/api/projects/:id/start` | POST | Start pipeline run |
| `/api/runs` | GET | List all runs |
| `/api/runs/:id` | GET, PATCH | Get/update run |
| `/api/runs/:id/stages/:idx/approve` | POST | Approve stage |
| `/health` | GET | Health check |

## Database

Schema files in `sql/`. Run `create_tables.sql` to set up Supabase.

## Documentation

See `docs/` for:
- Architecture documentation
- BullMQ worker design
- Module development guide

## Environment Variables

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
REDIS_URL=redis://localhost:6379
PORT=3000
NODE_ENV=development
```

## License

Private - OnlyiGaming
