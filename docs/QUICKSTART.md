# Content Pipeline - Quick Start

**🚀 Fast access guide for humans and AI agents**

---

## 📂 Instant Access

```bash
# Navigate to project
cd /Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline

# Or use launcher (if configured)
work-on content-pipeline
```

---

## 🎯 Current Priority

**Phase**: Application Development
**Next Task**: Build Express API server + BullMQ workers
**Blocker**: None - infrastructure ready

---

## 🤖 Which Agent to Use?

| Task | Agent/Model | How |
|------|-------------|-----|
| **General coding** | Claude Code (Sonnet) | Work normally |
| **Complex debugging** | Opus 4.5 | Say "use Opus" or trigger 3-round rule |
| **Visual verification** | Opus 4.5 | Screenshots, character recognition |
| **Project updates** | project-context-manager | Spawn with Task tool |
| **Content writing** | content-writer | Spawn with Task tool |
| **Strategic planning** | strategic-thinker | Spawn with Task tool |
| **Code review** | brutal-critic | Spawn with Task tool |

---

## 🔗 Quick Links

**Must-Read Context:**
- [CLAUDE.md](file:///Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/CLAUDE.md) - Full project context
- [AGENTS.md](file:///Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/AGENTS.md) - Agent-specific notes
- [GLOBAL_AGENT_INSTRUCTIONS.md](file:///Users/danieloskarsson/Dropbox/Projects/GLOBAL_AGENT_INSTRUCTIONS.md) - Universal standards

**Process Docs:**
- [ROADMAP.md](file:///Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/ROADMAP.md) - Phase breakdown
- [PROJECT_STATUS.md](file:///Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/PROJECT_STATUS.md) - Current state
- [LESSONS_LEARNED.md](file:///Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/LESSONS_LEARNED.md) - Past mistakes

**Technical Specs:**
- [bullmq_architecture_doc.md](file:///Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/Content-Pipeline/docs/bullmq_architecture_doc.md) - BullMQ design

---

## 🖥️ Server Access

```bash
# SSH to Hetzner server
ssh -i ~/.ssh/hetzner_key root@188.245.110.34

# Verify Redis
redis-cli -a Danne2025 ping

# Check Node.js
node --version

# Project directory on server
cd /opt/company-pipeline
```

---

## 📋 Common Commands

```bash
# On local machine
cat CLAUDE.md | head -20              # Quick status
grep "Current Status" CLAUDE.md      # See phase
grep "Blockers" CLAUDE.md            # Check blockers

# On server
systemctl status redis-server        # Check Redis
systemctl status ssh                 # Check SSH
npm install                          # Install dependencies
npm start                            # Run application
```

---

## 🎬 Typical Session Flow

1. **Start**: Read CLAUDE.md current status
2. **Check**: Any blockers or priority tasks?
3. **Work**: Make changes, test locally
4. **Deploy**: Push to server if needed
5. **Update**: Use project-context-manager to update docs
6. **Log**: Session accomplishments go in CLAUDE.md

---

## 🆘 If Stuck

1. **Check**: LESSONS_LEARNED.md - has this happened before?
2. **Escalate**: Use Opus 4.5 if issue persists >3 rounds
3. **Ask**: spawn strategic-thinker for high-level guidance
4. **Review**: brutal-critic to identify what's wrong

---

*Updated: 2026-01-23*
