import { NextResponse } from 'next/server';
import { validatePin } from '@/lib/polymarket';

// Polymarket US public gateway for market listings
const GATEWAY_URL = 'https://gateway.polymarket.us/v1/markets';

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch active sports markets
    // The gateway returns markets with current prices and event data
    const response = await fetch(`${GATEWAY_URL}?active=true&limit=100`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const markets = data.markets || (Array.isArray(data) ? data : []);

    // Transform and filter to sports markets only
    const sportsMarkets = markets
      .filter(market => {
        // Filter to sports categories
        const category = (market.category || '').toLowerCase();
        const tags = (market.tags || []).map(t => t.toLowerCase());
        const isSports = category.includes('sport') || 
                        tags.some(t => ['nba', 'nfl', 'mlb', 'nhl', 'ncaa', 'soccer', 'sports'].includes(t));
        
        // Must have two sides (binary market)
        const hasTwoSides = market.marketSides?.length === 2;
        
        return isSports && hasTwoSides;
      })
      .map(market => {
        // Extract prices for each side
        const sides = {};
        let team1 = null;
        let team2 = null;
        
        if (market.marketSides && market.marketSides.length >= 2) {
          team1 = {
            name: market.marketSides[0].description,
            price: parseFloat(market.marketSides[0].price) || 0,
            color: market.marketSides[0].metadata?.team?.colorPrimary || null,
          };
          team2 = {
            name: market.marketSides[1].description,
            price: parseFloat(market.marketSides[1].price) || 0,
            color: market.marketSides[1].metadata?.team?.colorPrimary || null,
          };
          sides[team1.name] = team1.price;
          sides[team2.name] = team2.price;
        }

        // Extract event/game data
        const eventData = market.events?.[0] || {};
        
        // Parse score if available (format: "45 - 42" or "45-42")
        let homeScore = null;
        let awayScore = null;
        if (eventData.score) {
          const scoreMatch = eventData.score.match(/(\d+)\s*-\s*(\d+)/);
          if (scoreMatch) {
            homeScore = parseInt(scoreMatch[1], 10);
            awayScore = parseInt(scoreMatch[2], 10);
          }
        }

        // Determine sport type from tags or title
        const tags = market.tags || [];
        let sport = 'unknown';
        if (tags.some(t => ['nba', 'basketball'].includes(t.toLowerCase()))) sport = 'nba';
        else if (tags.some(t => ['ncaa', 'college basketball', 'ncaab'].includes(t.toLowerCase()))) sport = 'ncaa';
        else if (tags.some(t => ['nfl', 'football'].includes(t.toLowerCase()))) sport = 'nfl';
        else if (tags.some(t => ['nhl', 'hockey'].includes(t.toLowerCase()))) sport = 'nhl';
        else if (tags.some(t => ['mlb', 'baseball'].includes(t.toLowerCase()))) sport = 'mlb';

        return {
          slug: market.slug,
          title: market.title || market.question,
          team1,
          team2,
          sides,
          sport,
          event: {
            score: eventData.score || null,
            homeScore,
            awayScore,
            period: eventData.period || null,
            elapsed: eventData.elapsed || null,
            live: eventData.live || false,
            ended: eventData.ended || false,
            startTime: eventData.startTime || market.startTime || null,
          },
          volume: market.volume || 0,
          liquidity: market.liquidity || 0,
          createdAt: market.createdAt,
        };
      });

    return NextResponse.json({
      markets: sportsMarkets,
      _meta: {
        total: sportsMarkets.length,
        fetchedAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error('Failed to fetch markets:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch markets' },
      { status: 500 }
    );
  }
}