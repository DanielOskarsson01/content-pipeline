# Content Pipeline - Lessons Learned

## Purpose
Track mistakes, inefficiencies, and process improvements to evolve our development approach and prevent repeated issues.

---

## Issue #1: Model Selection Caused 5-Hour Delay (2026-01-23)

### Problem
**Duration**: ~5 hours wasted
**Root Cause**: Claude Sonnet 4.5 made repeated visual recognition errors when comparing SSH keys via screenshots
**Impact**: SSH access blocker persisted across multiple sessions due to incorrect character comparisons

### What Went Wrong
1. Sonnet 4.5 repeatedly misidentified characters (Z vs 2, W vs X, A vs M) in terminal screenshots
2. Agent insisted multiple times that Sonnet 4.5 was "good enough" for the task
3. User had to explicitly request Opus 4.5 despite mounting evidence of issues
4. Once Opus 4.5 was used, issue was diagnosed instantly (passphrase-protected SSH key)

### What Worked
- Opus 4.5 immediately identified the actual problem (not a visual/typo issue at all)
- Hex dump comparison eliminated ambiguity
- User persistence in questioning model choice

### Actions Taken
- Created this LESSONS_LEARNED.md file
- Documented the 5-hour cost of using wrong model for the task

### Process Changes Needed
1. **Escalation Trigger**: If same issue persists for >3 rounds of back-and-forth, automatically suggest Opus 4.5
2. **Task-Based Selection**: Visual recognition tasks, complex debugging → default to Opus 4.5
3. **User Preference**: Never argue against user request for better model
4. **Cost vs Time**: 5 hours of user time >> cost difference between Sonnet/Opus

### Prevention for Future
- [ ] Add automatic escalation prompt after 3 failed attempts at same issue
- [ ] Create task-type heuristics (visual analysis, complex debugging → Opus)
- [ ] Document model selection reasoning in session logs
- [ ] Respect user judgment when they request model change

---

## Template for Future Issues

### Problem
**Duration**:
**Root Cause**:
**Impact**:

### What Went Wrong
-

### What Worked
-

### Actions Taken
-

### Process Changes Needed
-

### Prevention for Future
- [ ]

---

*Last Updated: 2026-01-23*
