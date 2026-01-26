# Agentic Prompt Template

Use this template when you want Claude Code to work autonomously through multiple tasks without stopping for approval every step.

---

## The Prompt

```markdown
# AUTONOMOUS SESSION: [Feature Name]

## Mission
Implement [FEATURE] completely. Do not stop until all acceptance criteria pass or you've documented why you're blocked.

## Context
[Brief description of the system - Claude Code has no memory of past sessions]

Tech stack: Next.js 14, TypeScript, Tailwind, SQLite
UI style: Brutalist spreadsheet aesthetic (no rounded corners, no dark themes)
Money handling: Integers only (cents) or Decimal.js

## Acceptance Criteria (All Must Pass)
- [ ] Criterion 1 - specific and testable
- [ ] Criterion 2 - specific and testable  
- [ ] Criterion 3 - specific and testable

## Implementation Plan
Work through these in order. After each step, verify it works before proceeding.

### Step 1: [Name]
- Files: `src/path/to/file.ts`
- Do: [specific change]
- Verify: `npm run test && npm run typecheck`
- Expected: All tests pass, no type errors

### Step 2: [Name]
- Files: `src/path/to/file.ts`
- Do: [specific change]
- Verify: [how to verify]
- Expected: [what success looks like]

### Step 3: [Name]
...continue pattern...

## Self-Verification Protocol
After ALL steps complete:
1. `npm run typecheck` - must pass
2. `npm run lint` - must pass
3. `npm run test` - must pass
4. Manual test: [specific steps to verify feature works]
5. Edge case: [specific edge case to test]

## Boundaries (DO NOT)
- Do NOT modify files in [protected directories]
- Do NOT refactor unrelated code
- Do NOT change the UI aesthetic
- Do NOT use floats for money calculations

## If Blocked
If you hit an error you can't resolve after 3 attempts:
1. Document the exact error and what you tried
2. Commit working progress with message: "WIP: [feature] - blocked on [issue]"
3. Move to next independent task if one exists
4. Report blocker at end of session

## Completion
When all acceptance criteria pass:
1. Commit with message: "feat: [description]"
2. Report: "✅ [Feature] complete. All acceptance criteria verified."
3. List any issues encountered and how they were resolved
```

---

## Example: Real Agentic Prompt

```markdown
# AUTONOMOUS SESSION: Live P&L Dashboard

## Mission
Add real-time P&L updates to the positions dashboard. Do not stop until the dashboard shows live profit/loss that updates when prices change via WebSocket.

## Context
This is a Polymarket trading dashboard. It shows open positions and their current value. Currently, P&L only updates on page refresh. We need it to update live via WebSocket price feeds.

Tech stack: Next.js 14, TypeScript, Tailwind, SQLite
Existing WebSocket: `src/services/websocket.ts` (already connects to Polymarket)
Position data: `src/hooks/usePositions.ts`

## Acceptance Criteria (All Must Pass)
- [ ] P&L column updates within 1 second of price change
- [ ] No full page re-renders (only P&L cells update)
- [ ] Shows + green for profit, - red for loss
- [ ] Handles WebSocket disconnection gracefully (shows stale indicator)

## Implementation Plan

### Step 1: Create price subscription hook
- Files: `src/hooks/useLivePrices.ts` (new file)
- Do: Create hook that subscribes to WebSocket price updates for given market IDs
- Verify: Console log shows price updates when WebSocket sends data
- Expected: `{ marketId: "abc", price: 0.65 }` logs every few seconds

### Step 2: Integrate with positions table
- Files: `src/components/PositionsTable.tsx`
- Do: Use `useLivePrices` hook, recalculate P&L when prices update
- Verify: Change a mock price in dev tools, see P&L update
- Expected: P&L cell value changes without page refresh

### Step 3: Add visual feedback
- Files: `src/components/PositionsTable.tsx`
- Do: Green text + prefix for positive, red text - prefix for negative
- Verify: Visual inspection in browser
- Expected: Profitable positions show green, losing show red

### Step 4: Handle disconnection
- Files: `src/hooks/useLivePrices.ts`, `src/components/PositionsTable.tsx`
- Do: Track connection state, show "STALE" badge if disconnected >5 seconds
- Verify: Kill WebSocket server, see STALE indicator appear
- Expected: Yellow "STALE" badge appears next to prices

## Self-Verification Protocol
1. `npm run typecheck` - must pass
2. `npm run test` - must pass
3. Manual test: Open dashboard, watch P&L column, verify it updates live
4. Edge case: Disconnect network, verify STALE indicator appears
5. Edge case: Reconnect network, verify STALE clears and updates resume

## Boundaries (DO NOT)
- Do NOT modify `src/lib/polymarket-auth/` - auth is fragile
- Do NOT change the WebSocket connection logic in `src/services/websocket.ts`
- Do NOT add any rounded corners or dark theme
- Do NOT use floats for money - use Decimal.js

## If Blocked
After 3 failed attempts on any step:
1. Commit working progress
2. Document: "Blocked on [X] because [Y]. Tried [A, B, C]."
3. Continue to next independent step if possible

## Completion
When all criteria pass:
1. `git commit -m "feat(dashboard): add real-time P&L updates via WebSocket"`
2. Report completion status and any issues encountered
```

---

## Key Differences from Your Current Approach

| Before (Micro-prompts) | After (Agentic) |
|------------------------|-----------------|
| "Fix the WebSocket" | Full feature with 4-5 steps |
| Stop after each change | Continue until all criteria pass |
| You verify manually | Claude Code verifies with tests |
| No clear "done" state | Explicit acceptance criteria |
| No autonomy | Permission to iterate and debug |
