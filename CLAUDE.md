# CLAUDE.md - Polymarket Scalping Dashboard

## 🎯 Current Sprint Goal
Fix trade history bugs, implement unified history view, and ensure P&L calculations handle all edge cases (including positions held to resolution).

---

## 📋 Project Overview

### What This Is
A web-based dashboard for tracking Polymarket sports betting positions and trades. Users buy/sell shares on sports outcomes (team wins), aiming to scalp profits from price movements before games resolve.

### Who Uses It
A single user (John) who actively trades on Polymarket's beta. He needs instant visual feedback on:
1. Current positions and real-time P&L
2. Trade history with accurate profit/loss per game
3. Performance analytics

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + React 18 + TypeScript
- **Styling**: Tailwind CSS - BRUTALIST aesthetic (no rounded corners, no polish)
- **State**: React hooks + localStorage for persistence
- **Data**: Polymarket REST API + WebSocket for real-time prices
- **Auth**: Ed25519 signatures for Polymarket API

### Directory Structure (expected)
```
src/
├── app/                    # Next.js pages
│   ├── api/               # API routes (proxy to Polymarket)
│   └── page.tsx           # Main dashboard
├── components/            # React components
│   ├── PositionsPanel/    # Current positions display
│   ├── TradeHistory/      # Historical trades
│   └── Performance/       # Stats and analytics
├── lib/                   # Utilities
│   ├── polymarket/        # API client, WebSocket, auth
│   └── utils/             # Helpers, calculations
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript interfaces
```

---

## ⚠️ Critical Domain Knowledge

### Polymarket Basics
- Users buy "shares" in outcomes (e.g., "Lakers win") priced 0-100 cents
- Price = implied probability (65¢ = 65% chance)
- If your team wins, each share pays $1.00
- If your team loses, shares worth $0.00
- You can sell early at market price (scalping)

### Two Ways to Exit a Position
1. **Sell early (scalp)**: You get `shares × sellPrice` immediately
2. **Hold to resolution**: If you win, you get `shares × $1.00`. If you lose, you get $0.

### P&L Calculation
```
For scalped positions:
  P&L = sellProceeds - buyCost

For positions held to resolution:
  If won:  P&L = shares × $1.00 - buyCost
  If lost: P&L = $0 - buyCost = -buyCost
```

### The Bid-Ask Spread Problem
Polymarket shows two different prices:
- **Mid/Last price**: What the UI shows as "current price"
- **Ask price**: What you'd actually pay to buy more
- **Bid price**: What you'd actually get if you sold now

When liquidity is low, these can differ by 20-30+ cents!
**ALWAYS use `cashValue` from API for accurate position value, not `midPrice × shares`**

### Which Side Did I Bet?
Each trade has an `outcome` field that says which side (e.g., "Lakers" or "Celtics").
The `asset` field is the token ID for that specific side.
A game has TWO tokens: one for each team. Prices are complementary (if Lakers = 65¢, Celtics = 35¢).

---

## 🔌 Polymarket API Reference

### Get Historical Price Chart (for ANY market, even closed)
```
GET https://clob.polymarket.com/prices-history
  ?market={tokenId}
  &interval=max        # or: 1h, 6h, 1d, 1w, max
  &fidelity=60         # resolution in minutes

Response: { "history": [{ "t": 1697875200, "p": 0.65 }, ...] }
```

### Get User Trade History
```
GET https://data-api.polymarket.com/activity
  ?user={walletAddress}

Response: [{
  "timestamp": 1723772457,
  "conditionId": "0x...",
  "type": "TRADE",
  "size": 600,           # shares
  "usdcSize": 354,       # cost in USDC (cents)
  "price": 0.59,         # price per share
  "asset": "10783614...", # token ID (use this for price history!)
  "side": "BUY",         # or "SELL"
  "outcome": "Lakers",   # which team/side
  "title": "Lakers vs Celtics",
  ...
}]
```

### Get Current Positions
```
GET https://data-api.polymarket.com/positions
  ?user={walletAddress}

Response includes `cashValue` - the ACTUAL value if sold now (accounts for bid-ask spread)
```

---

## 🐛 Known Bugs to Fix

### BUG 1: Only Showing 4 Trades
**Symptom**: Trade history shows only last 4 trades instead of full history
**Likely cause**: Missing pagination, API returns paginated results
**Fix**: Check for `nextCursor` in response, fetch all pages

### BUG 2: Positions Held to Resolution Not Counted
**Symptom**: Seahawks trade shows +$7.37 but should show +$32.03
**Root cause**: P&L calculation only counts buy/sell trades, ignores resolution payouts
**Example**:
```
Buys: -$51.52, -$49.77, -$108.34 = -$209.63
Sells: +$108.66
Resolution: +$131.00 (team won, 131 shares × $1)
Correct P&L: -209.63 + 108.66 + 131 = +$30.03
Current bug: -209.63 + 108.66 = -$100.97 (or only partial)
```
**Fix**: Detect resolved positions, add resolution payout to P&L

### BUG 3: History vs Trade History Confusion
**Symptom**: Two separate sections showing overlapping data
**Fix**: Merge into single unified history view

### BUG 4: Missing Timestamps on Recent Trades
**Symptom**: Recent trades panel shows no time
**Fix**: Add timestamp display

### BUG 5: Price Display Using Wrong Value
**Symptom**: Shows wildly inaccurate P&L (58¢ vs 23¢ difference)
**Root cause**: Using ask/buy price instead of cashValue for current value
**Fix**: Use `cashValue` from positions API for accurate valuation

---

## ✅ Acceptance Criteria for Unified History View

```
┌─────────────────────────────────────────────────────────────┐
│ TRADE HISTORY                                    ↻ Refresh  │
├─────────────────────────────────────────────────────────────┤
│ Miami vs Phoenix                         NBA · CLOSED · WON │
│ HEAT (bought)    87¢ ──████████████──▶ 96¢        +$16.93  │
│ 184 shares · held 2h 14m · 10:15 PM Jan 25                  │
│ [+ show trades] [+ show chart]                              │
├─────────────────────────────────────────────────────────────┤
│ San Antonio vs Houston                   NBA · CLOSED · LOSS│
│ SPURS (bought)   70¢ ────────────▶ 0¢           -$135.60  │
│ 200 shares · HELD TO RESOLUTION                             │
│ ⚠️ Hindsight: If held to win, would be +$200               │
│ [+ show trades] [+ show chart]                              │
└─────────────────────────────────────────────────────────────┘
```

Requirements:
- [ ] Shows ALL trades, not just last 4
- [ ] Each row shows: teams, league, status (OPEN/CLOSED), outcome (WON/LOSS)
- [ ] Shows WHICH SIDE was bet (e.g., "HEAT (bought)")
- [ ] Visual bar showing entry→exit on 0-100¢ scale
- [ ] Accurate P&L including resolution payouts
- [ ] Hold duration and timestamp
- [ ] Expandable trade details
- [ ] Price chart available (fetched via /prices-history)

---

## 🚫 DO NOT TOUCH

1. **Auth code** in `src/lib/polymarket/auth.ts` - Ed25519 signing is fragile
2. **WebSocket connection** logic - only fix if specifically asked
3. **UI aesthetic** - keep brutalist, no rounded corners, no dark theme changes

---

## ⚡ Autonomous Work Mode

### When given a task, Claude MUST:
1. **Read this file first** - understand the domain
2. **Explore the codebase** - find existing patterns
3. **Plan the fix** - list files to modify
4. **Implement incrementally** - one change at a time
5. **Test after each change** - `npm run dev`, check browser
6. **Verify the fix** - does it actually work?
7. **Continue or document blockers** - if stuck after 3 tries, document and move on

### Verification Commands
```bash
npm run typecheck     # Must pass
npm run lint          # Must pass
npm run dev           # Start server, check browser at localhost:3000
```

### Definition of Done
- [ ] TypeScript compiles with no errors
- [ ] Feature matches spec exactly
- [ ] No console errors in browser
- [ ] Verified manually in browser
- [ ] Code committed with conventional commit message

---

## 📝 Task Queue (Work Top to Bottom)

### Phase 1: Fix Core Bugs
- [ ] Fix trade history pagination (show ALL trades)
- [ ] Fix P&L calculation for positions held to resolution
- [ ] Use cashValue for accurate current position value

### Phase 2: Unified History View
- [ ] Merge "History" and "Trade History" into single view
- [ ] Add timestamps to all trade displays
- [ ] Add visual entry→exit bar (0-100¢ scale)
- [ ] Show which side was bet explicitly
- [ ] Add hold duration calculation

### Phase 3: Price Charts for Closed Positions
- [ ] Fetch historical prices using /prices-history endpoint
- [ ] Store token IDs (asset) from trades for later lookup
- [ ] Display price chart in expanded trade detail view

### Phase 4: Edge Detection (Future)
- [ ] Flip Feasibility Score
- [ ] Arbitrage detection
- [ ] Price alerts
