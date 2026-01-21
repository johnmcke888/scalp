import { NextResponse } from 'next/server';
import { validatePin } from '@/lib/polymarket';

// Polymarket US gateway for market data including bid/ask
const POLYMARKET_GATEWAY = 'https://gateway.polymarket.us/v1/markets';

// Simple in-memory cache (5 second TTL)
let priceCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5000;

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const slugs = url.searchParams.get('slugs');

  if (!slugs) {
    return NextResponse.json(
      { error: 'slugs query parameter required (comma-separated)' },
      { status: 400 }
    );
  }

  const slugList = slugs.split(',').map(s => s.trim()).filter(Boolean);

  if (slugList.length === 0) {
    return NextResponse.json(
      { error: 'At least one slug is required' },
      { status: 400 }
    );
  }

  // Create cache key from sorted slugs
  const cacheKey = slugList.sort().join(',');
  const now = Date.now();

  // Return cached data if still valid
  if (priceCache.data && priceCache.key === cacheKey && (now - priceCache.timestamp) < CACHE_TTL) {
    return NextResponse.json(priceCache.data);
  }

  try {
    // Build URL with multiple slug params: ?slug=X&slug=Y&slug=Z
    const gatewayUrl = new URL(POLYMARKET_GATEWAY);
    slugList.forEach(slug => gatewayUrl.searchParams.append('slug', slug));

    // Try without auth first - this is a public endpoint
    const response = await fetch(gatewayUrl.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway API error: ${response.status} - ${errorText}`);
    }

    const markets = await response.json();

    // Transform response to map of slug -> price data
    // The API returns an array of market objects
    const prices = {};

    if (Array.isArray(markets)) {
      markets.forEach(market => {
        if (market.slug) {
          prices[market.slug] = {
            bestBid: parseFloat(market.bestBid) || null,
            bestAsk: parseFloat(market.bestAsk) || null,
            spread: parseFloat(market.spread) || null,
            lastTradePrice: parseFloat(market.lastTradePrice) || null,
          };
        }
      });
    }

    const result = { prices };

    // Update cache
    priceCache = { data: result, key: cacheKey, timestamp: now };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch prices' },
      { status: 500 }
    );
  }
}
