# CLAUDE.md - Polymarket US Scalping Dashboard

## 🎯 Current Sprint Goal
Fix trade history bugs, implement unified history view, and ensure P&L calculations handle all edge cases including positions held to resolution.

---

## ⚠️ CRITICAL: This is Polymarket US, NOT Polymarket.com

**Polymarket US** (polymarket.us) = CFTC-regulated, fiat USD, iOS app, US-only
**Polymarket.com** = International, crypto/USDC, blockchain on Polygon

These are COMPLETELY DIFFERENT products with DIFFERENT APIs. 
- API Base URL: `https://api.polymarket.us`
- Auth: Ed25519 signatures
- Currency: USD (not USDC, not crypto)

**NEVER reference docs.polymarket.com - only use docs.polymarket.us**

---

## 📋 Project Overview

### What This Is
A web-based dashboard for tracking Polymarket US sports betting positions and trades. Users buy/sell contracts on sports outcomes (team wins), aiming to scalp profits from price movements before games resolve.

### Who Uses It
A single user (John) who actively trades on Polymarket US beta. He needs instant visual feedback on:
1. Current positions and real-time P&L
2. Trade history with accurate profit/loss per game
3. Performance analytics

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + React 18 + TypeScript
- **Styling**: Tailwind CSS - BRUTALIST aesthetic (no rounded corners, no polish)
- **State**: React hooks + localStorage for persistence
- **Data**: Polymarket US REST API + WebSocket for real-time prices
- **Auth**: Ed25519 signatures for Polymarket US API

---

## 🔌 Polymarket US API Reference

### Base URL
```
https://api.polymarket.us
```

### Positions Endpoint
```
GET /v1/portfolio/positions

Response:
{
  "positions": {
    "market-slug-here": {
      "netPosition": "100",        // Net qty (positive=long, negative=short)
      "qtyBought": "100",          // Total bought
      "qtySold": "0",              // Total sold
      "cost": { "value": "50.00", "currency": "USD" },
      "realized": { "value": "0", "currency": "USD" },
      "cashValue": { "value": "65.00", "currency": "USD" },  // ACTUAL VALUE IF SOLD NOW
      "qtyAvailable": "100",
      "expired": false,
      "marketMetadata": {
        "slug": "market-slug",
        "title": "Team A vs Team B",
        "outcome": "Team A"
      }
    }
  },
  "nextCursor": "abc123",
  "eof": false
}
```

### Activities Endpoint (Trade History)
```
GET /v1/portfolio/activities
GET /v1/portfolio/activities?types=ACTIVITY_TYPE_TRADE&marketSlug=market-slug

Response:
{
  "activities": [
    {
      "type": "ACTIVITY_TYPE_TRADE",
      "trade": {
        "id": "trade-123",
        "marketSlug": "lakers-vs-celtics",
        "state": "CLEARED",
        "price": { "value": "0.65", "currency": "USD" },
        "qty": "100",
        "isAggressor": true,
        "costBasis": { "value": "65.00", "currency": "USD" },
        "realizedPnl": { "value": "0", "currency": "USD" },
        "createTime": "2025-01-25T21:30:00Z",
        "updateTime": "2025-01-25T21:30:00Z"
      }
    },
    {
      "type": "ACTIVITY_TYPE_POSITION_RESOLUTION",
      "positionResolution": {
        "marketSlug": "lakers-vs-celtics",
        "beforePosition": { ... },
        "afterPosition": { ... },
        "side": "LONG",           // LONG, SHORT, or NEUTRAL
        "tradeId": "resolution-456",
        "updateTime": "2025-01-26T03:00:00Z"
      }
    }
  ],
  "nextCursor": "xyz789",
  "eof": false
}
```

### Activity Types
| Type | Description |
|------|-------------|
| ACTIVITY_TYPE_TRADE | Buy or sell execution |
| ACTIVITY_TYPE_POSITION_RESOLUTION | Market settled, position resolved |
| ACTIVITY_TYPE_ACCOUNT_DEPOSIT | Deposit |
| ACTIVITY_TYPE_ACCOUNT_WITHDRAWAL | Withdrawal |

### Account Balances
```
GET /v1/account/balances

Response:
{
  "balances": [{
    "currentBalance": 1000.00,
    "currency": "USD",
    "buyingPower": 850.00,
    "assetNotional": 500.00,
    "openOrders": 400.00
  }]
}
```

### Pagination
All endpoints use cursor-based pagination:
- `nextCursor` in response → pass as `cursor` param for next page
- `eof: true` means no more results

### ⚠️ NO Historical Price Data Endpoint
Polymarket US Retail API does NOT have a `/prices-history` endpoint.
Price charts must be built from:
1. Real-time WebSocket data collected while app is running
2. Your own trade timestamps and prices from activities endpoint

---

## ⚠️ Critical Domain Knowledge

### Polymarket US Basics
- Users buy "contracts" on outcomes (e.g., "Lakers win") priced $0.01-$1.00
- Price = implied probability (65¢ = 65% chance)
- If your team wins, each contract pays $1.00
- If your team loses, contracts worth $0.00
- You can sell early at market price (scalping)
- All values in USD (not crypto)

### Two Ways to Exit a Position
1. **Sell early (scalp)**: You get `qty × sellPrice` immediately
2. **Hold to resolution**: If you win → `qty × $1.00`. If you lose → $0.

### P&L Calculation
```
For scalped positions (sold before resolution):
  P&L = sellProceeds - buyCost

For positions held to resolution:
  If won:  P&L = qty × $1.00 - buyCost
  If lost: P&L = $0 - buyCost = -buyCost

Total P&L = realized (from sells) + resolution payout (if resolved)
```

### The Bid-Ask Spread Problem
Polymarket shows two different prices in the app:
- **"Current"** = mid-market or last trade price
- **"Buy more"** = ask price (what you'd actually pay)

When liquidity is low, these can differ by 20-30+ cents!
**ALWAYS use `cashValue` from API for accurate position value**

### Detecting Resolution in Activities
When `ACTIVITY_TYPE_POSITION_RESOLUTION` appears:
- `side: "LONG"` and you won → you got $1 per contract
- `side: "LONG"` and you lost → you got $0
- Check `afterPosition` to see the payout

---

## 🐛 Known Bugs to Fix

### BUG 1: Only Showing 4 Trades
**Symptom**: Trade history shows only last 4 trades instead of full history
**Likely cause**: Not handling pagination (`nextCursor`/`eof`)
**Fix**: Loop until `eof: true`, concatenating all activities

### BUG 2: Positions Held to Resolution Not Counted in P&L
**Symptom**: Seahawks trade shows +$7.37 but should show +$32.03
**Root cause**: P&L only counts ACTIVITY_TYPE_TRADE, ignores ACTIVITY_TYPE_POSITION_RESOLUTION
**Fix**: Include resolution payouts in P&L calculation

### BUG 3: History vs Trade History Confusion
**Symptom**: Two separate sections showing overlapping data
**Fix**: Merge into single unified history view

### BUG 4: Missing Timestamps on Recent Trades
**Symptom**: Recent trades panel shows no time
**Fix**: Display `createTime` from trade object

### BUG 5: Position Value Using Wrong Price
**Symptom**: Shows wildly inaccurate P&L (58¢ vs 23¢)
**Root cause**: Using ask price instead of cashValue
**Fix**: Use `cashValue` from positions API

---

## 🚫 DO NOT TOUCH

1. **Auth code** - Ed25519 signing is fragile
2. **WebSocket connection logic** - only fix if specifically asked
3. **UI aesthetic** - keep brutalist, no rounded corners, no dark theme changes
4. **Never reference docs.polymarket.com** - wrong product entirely

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
- [ ] Fix trade history pagination (show ALL trades via cursor)
- [ ] Fix P&L calculation for positions held to resolution (use ACTIVITY_TYPE_POSITION_RESOLUTION)
- [ ] Use cashValue for accurate current position value

### Phase 2: Unified History View
- [ ] Merge "History" and "Trade History" into single view
- [ ] Add timestamps to all trade displays
- [ ] Add visual entry→exit bar (0-100¢ scale)
- [ ] Show which side was bet explicitly
- [ ] Add hold duration calculation

### Phase 3: Opportunity Detection
- [ ] Flip Feasibility Score (comeback probability vs market price)
- [ ] Live scores integration
- [ ] Price alerts

### Phase 4: Arbitrage (Future)
- [ ] Compare Polymarket US odds vs sportsbooks
- [ ] Arb calculator
