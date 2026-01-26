# Model Selection Policy - Content Pipeline

## Purpose
Define clear guidelines for when to use Opus 4.5 vs Sonnet 4.5 to prevent wasted time and ensure efficient development.

---

## Default Model Strategy

### Use Opus 4.5 By Default For:
1. **Complex Debugging** - Issues that aren't immediately obvious
2. **Visual Analysis** - Screenshot comparisons, character recognition, UI validation
3. **Architecture Decisions** - System design, technology selection, trade-off analysis
4. **Critical Blockers** - Anything preventing forward progress
5. **Multi-Session Issues** - Problems that have persisted across sessions
6. **User Request** - When user explicitly asks for Opus

### Use Sonnet 4.5 For:
1. **Straightforward Implementation** - Writing code with clear requirements
2. **Documentation Updates** - Routine session logs, status updates
3. **Simple File Operations** - Reading files, basic edits
4. **Routine Tasks** - Package installation, server commands with known outcomes

---

## Escalation Triggers

**Automatic escalation to Opus 4.5 if ANY of these occur:**

1. ✋ **3-Round Rule**: Same issue discussed for 3+ back-and-forth exchanges without resolution
2. ✋ **Contradiction Detection**: Agent provides conflicting information between turns
3. ✋ **User Frustration Indicators**: "This isn't working", "We tried this already", "How many times..."
4. ✋ **Visual Verification Needed**: Comparing screenshots, terminal output, character-level accuracy
5. ✋ **Time Threshold**: >30 minutes on single issue without progress
6. ✋ **User Override**: User requests Opus - no pushback, immediate switch

---

## Cost vs Time Analysis

**Real Example (2026-01-23 SSH Issue):**
- Sonnet 4.5: 5 hours wasted, ~$2-3 saved
- Opus 4.5: Problem solved in 5 minutes, ~$2-3 extra cost
- **Net Loss with Sonnet**: 5 hours of user time + accumulated frustration

**Principle**: User time is worth far more than marginal model cost differences.

---

## Implementation

### For Claude Code Agent:
When you detect an escalation trigger, proactively state:

> "This issue has persisted for [X rounds/minutes]. I'm going to use the Task tool to spawn an Opus 4.5 agent to resolve this more efficiently."

### For User:
Feel empowered to request Opus 4.5 at any time. If agent suggests Sonnet is sufficient, override that suggestion.

---

## Monitoring

Track in LESSONS_LEARNED.md:
- Instances where Opus solved what Sonnet couldn't
- False escalations (Opus wasn't needed)
- Time/cost savings from proper model selection
- Update this policy based on patterns

---

*Established: 2026-01-23*
*After 5-hour SSH debugging incident*
