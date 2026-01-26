# Claude Code Autonomous Mode - Quick Reference

## 🚀 The Command
```bash
# Full autonomy (no permission prompts)
claude --dangerously-skip-permissions

# Or start normally and type:
/permissions
# Then select "Allow all" or configure specific permissions
```

## 📁 Project Setup (Do Once)

### 1. Create CLAUDE.md in your repo root
Claude Code reads this automatically every session. Include:
- Architecture overview
- Current sprint goals  
- Critical rules ("never modify X")
- Verification commands
- Debugging playbook

### 2. Create .claude/settings.json
```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(npx *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(curl *)",
      "Read(*)",
      "Write(src/**)"
    ],
    "deny": [
      "Write(src/lib/polymarket-auth/**)",
      "Bash(rm -rf *)"
    ]
  }
}
```

## 📝 Prompt Structure for Autonomy

```
# AUTONOMOUS SESSION: [Feature Name]

## Mission
[One sentence: what to build, when to stop]

## Context  
[Tech stack, relevant architecture, what Claude needs to know]

## Acceptance Criteria (All Must Pass)
- [ ] Criterion 1
- [ ] Criterion 2

## Implementation Plan
### Step 1: [Name]
- Files: [paths]
- Do: [action]
- Verify: [command]
- Expected: [output]

[Repeat for each step]

## Self-Verification Protocol
[Commands to run, manual tests to perform]

## Boundaries (DO NOT)
[Protected files, forbidden patterns]

## If Blocked
[What to do after 3 failed attempts]
```

## 🎯 Key Mindset Shifts

### Before: Micro-management
```
You: "Fix the WebSocket"
Claude: [makes change]
You: [checks] "It's not working, try this..."
Claude: [makes change]
[repeat 10x]
```

### After: Mission-based
```
You: "Build feature X. Here's the spec, verification steps, and boundaries. 
      Don't stop until all acceptance criteria pass."
Claude: [works through plan, tests, iterates, reports completion]
```

## ⚠️ Common Mistakes

### ❌ Too Vague
```
"Make the dashboard update in real-time"
```

### ✅ Specific and Verifiable
```
"P&L column must update within 1 second of WebSocket price message.
Verify: open browser console, see price update log, then see P&L cell change.
Expected: new P&L = shares × newPrice - costBasis"
```

### ❌ No Verification
```
"Add a loading spinner"
```

### ✅ With Verification
```
"Add loading spinner to PositionsTable.
Verify: Throttle network to Slow 3G in DevTools, refresh page.
Expected: Spinner visible for 2+ seconds, then data appears, spinner gone."
```

## 🔧 Useful Slash Commands

Inside Claude Code:
- `/permissions` - Configure what Claude can do without asking
- `/memory` - See what Claude remembers about your project
- `/clear` - Start fresh (keeps CLAUDE.md context)
- `/cost` - See token usage

## 📊 When to Use Agentic vs Micro-prompts

| Scenario | Approach |
|----------|----------|
| New feature with 3+ files | Agentic |
| Single bug with known fix | Micro-prompt |
| Refactoring a module | Agentic |
| "Why isn't this working?" | Micro-prompt to diagnose, then agentic to fix |
| Exploratory/learning | Micro-prompt |
| Sprint backlog | Agentic with task queue |

## 💡 Pro Tips

1. **Front-load context**: Claude Code has no memory between sessions. CLAUDE.md is your persistent context.

2. **Acceptance criteria are sacred**: If you can't write a test for it, Claude can't verify it.

3. **Boundaries prevent disasters**: Explicitly say what NOT to touch.

4. **Plan verification commands upfront**: "Run npm test" isn't enough. "Run npm test, expect 47 tests pass, 0 fail" is.

5. **Use conventional commits**: Claude Code can commit as it goes if you tell it the format.

6. **Let it fail forward**: "If blocked after 3 attempts, document and move on" prevents infinite loops.
