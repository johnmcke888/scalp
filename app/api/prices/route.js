import { NextResponse } from 'next/server';
import { validatePin } from '@/lib/polymarket';

// Public endpoint - no authentication needed for price data
const POLYMARKET_PUBLIC_API = 'https://clob.polymarket.com';

export async function GET(request) {
  // Check PIN
  if (!validatePin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const tokenIds = url.searchParams.get('token_ids');

  if (!tokenIds) {
    return NextResponse.json(
      { error: 'token_ids query parameter required' },
      { status: 400 }
    );
  }

  try {
    // Polymarket's public CLOB API for price data
    // The /prices endpoint takes comma-separated token IDs
    const priceUrl = `${POLYMARKET_PUBLIC_API}/prices?token_ids=${encodeURIComponent(tokenIds)}`;

    const response = await fetch(priceUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Price API error: ${response.status} - ${errorText}`);
    }

    const prices = await response.json();
    return NextResponse.json(prices);
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch prices' },
      { status: 500 }
    );
  }
}
