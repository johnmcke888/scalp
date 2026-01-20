# Polymarket Scalper

A position tracking and P&L tool for Polymarket US.

## Features

- Track open positions with real-time P&L
- Log manual buys and sells
- Sync positions from Polymarket API
- "Hindsight tracker" - see if you made more or less by scalping vs holding
- PIN protection for private access
- Data persisted to localStorage

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` with your credentials:
```
POLYMARKET_API_KEY=your-api-key-uuid
POLYMARKET_PRIVATE_KEY=your-base64-private-key
APP_PIN=your-pin
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

## API Routes

- `GET /api/positions` - Fetch positions from Polymarket
- `GET /api/balance` - Fetch cash balance
- `GET /api/prices?token_ids=...` - Fetch current prices

All routes require PIN via `?pin=` query param or `x-app-pin` header.

## Tech Stack

- Next.js 14 (App Router)
- @noble/ed25519 for API authentication
- Vercel for deployment
